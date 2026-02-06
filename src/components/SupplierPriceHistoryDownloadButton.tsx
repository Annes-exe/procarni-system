import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, DollarSign } from 'lucide-react';
import { showError, showLoading, dismissToast, showSuccess } from '@/utils/toast';
import { useSession } from '@/components/SessionContextProvider';
import { cn } from '@/lib/utils';

interface SupplierPriceHistoryDownloadButtonProps {
  supplierId: string;
  supplierName: string;
  disabled?: boolean;
  asChild?: boolean; // NEW: Added asChild prop
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link' | null | undefined; // NEW: Added variant prop
}

const SupplierPriceHistoryDownloadButton = React.forwardRef<HTMLButtonElement, SupplierPriceHistoryDownloadButtonProps>(({
  supplierId,
  supplierName,
  disabled = false,
  asChild = false, // Default to false
  variant = 'ghost', // Default variant changed to ghost for dropdown use
}, ref) => {
  const { session } = useSession();
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    if (!session) {
      showError('No hay sesión activa para descargar el historial.');
      return;
    }
    if (!supplierId) {
      showError('Proveedor no seleccionado.');
      return;
    }

    setIsDownloading(true);
    const toastId = showLoading('Generando reporte PDF de historial de precios del proveedor...');

    try {
      // NEW: Call the PDF generation function
      const response = await fetch(`https://sbmwuttfblpwwwpifmza.supabase.co/functions/v1/generate-supplier-price-history-pdf`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ supplierId, supplierName }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al generar el reporte PDF de historial de precios del proveedor.');
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get('Content-Disposition');
      const fileNameMatch = contentDisposition && contentDisposition.match(/filename="([^"]+)"/);
      // Expecting a PDF filename now
      const fileName = fileNameMatch ? fileNameMatch[1] : `historial_precios_proveedor_${supplierName}.pdf`;

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      dismissToast(toastId);
      showSuccess('Reporte PDF descargado exitosamente.');
    } catch (error: any) {
      console.error('[SupplierPriceHistoryDownloadButton] Error downloading history:', error);
      dismissToast(toastId);
      showError(error.message || 'Error desconocido al descargar el reporte PDF.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Button
      onClick={handleDownload}
      disabled={isDownloading || disabled || !supplierId}
      variant={variant}
      asChild={asChild}
      // Apply custom class only if not rendering as child (i.e., standalone button)
      className={cn("flex items-center gap-2", !asChild ? "bg-blue-600 text-white hover:bg-blue-700" : "w-full justify-start")}
      ref={ref}
    >
      {/* Wrap content in a single span element */}
      <span className="flex items-center gap-2">
        <Download className="mr-2 h-4 w-4" />
        {isDownloading ? 'Descargando...' : 'Historial de Precios'}
      </span>
    </Button>
  );
});

SupplierPriceHistoryDownloadButton.displayName = "SupplierPriceHistoryDownloadButton";

export default SupplierPriceHistoryDownloadButton;