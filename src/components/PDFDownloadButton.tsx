import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { showError, showLoading, dismissToast, showSuccess } from '@/utils/toast';
import { useSession } from '@/components/SessionContextProvider';
import { cn } from '@/lib/utils'; // Import cn for conditional class application

interface PDFDownloadButtonProps {
  requestId?: string; // For quote requests
  orderId?: string; // For purchase orders
  fileName?: string; // Optional static filename
  fileNameGenerator?: () => string; // Optional function to generate filename dynamically
  endpoint: string; // e.g., 'generate-qr-pdf' or 'generate-po-pdf'
  label?: string;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link' | null | undefined;
  disabled?: boolean; // Added disabled prop
  asChild?: boolean; // NEW: Added asChild prop
}

const PDFDownloadButton = React.forwardRef<HTMLButtonElement, PDFDownloadButtonProps>(({
  requestId,
  orderId,
  fileName,
  fileNameGenerator,
  endpoint,
  label = 'Descargar PDF',
  variant = 'outline',
  disabled = false,
  asChild = false, // Default to false
}, ref) => {
  const { session } = useSession();
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    if (!session) {
      showError('No hay sesión activa para descargar el PDF.');
      return;
    }

    const id = requestId || orderId;
    if (!id) {
      showError('No se encontró el ID del documento.');
      return;
    }

    // Determine the filename to use
    let finalFileName = fileName;
    if (fileNameGenerator) {
      finalFileName = fileNameGenerator();
    }
    if (!finalFileName) {
      showError('No se pudo determinar el nombre del archivo.');
      return;
    }

    setIsDownloading(true);
    const toastId = showLoading('Generando PDF para descarga...');

    try {
      const response = await fetch(`https://sbmwuttfblpwwwpifmza.supabase.co/functions/v1/${endpoint}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requestId: requestId, orderId: orderId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al generar el PDF.');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = finalFileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      dismissToast(toastId);
      showSuccess('PDF descargado exitosamente.');
    } catch (error: any) {
      console.error('[PDFDownloadButton] Error downloading PDF:', error);
      dismissToast(toastId);
      showError(error.message || 'Error desconocido al descargar el PDF.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Button
      onClick={handleDownload}
      disabled={isDownloading || disabled}
      variant={variant}
      asChild={asChild}
      // When asChild is true, the parent (DropdownMenuItem) handles the layout, 
      // but we keep the class here for when it's used as a standalone button (asChild=false)
      className={cn("flex items-center gap-2", asChild ? "w-full justify-start" : "")} 
      ref={ref} // Forward the ref to the Button component
    >
      {/* Wrap content in a single span element to ensure it's a single child element, 
          which satisfies the requirement of components using Radix Slot/asChild pattern. */}
      <span className="flex items-center gap-2">
        <Download className="h-4 w-4" />
        {isDownloading ? 'Descargando...' : label}
      </span>
    </Button>
  );
});

PDFDownloadButton.displayName = "PDFDownloadButton";

export default PDFDownloadButton;