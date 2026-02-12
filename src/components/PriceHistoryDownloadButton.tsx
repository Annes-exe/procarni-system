import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { showError, showLoading, dismissToast, showSuccess } from '@/utils/toast';
import { useSession } from '@/components/SessionContextProvider';

interface PriceHistoryDownloadButtonProps {
  materialId: string;
  materialName: string;
  // baseCurrency: 'USD' | 'VES'; // Removed as PDF report is always USD
  disabled?: boolean;
}

const PriceHistoryDownloadButton: React.FC<PriceHistoryDownloadButtonProps> = ({
  materialId,
  materialName,
  // baseCurrency, // Removed
  disabled = false,
}) => {
  const { session } = useSession();
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    if (!session) {
      showError('No hay sesión activa para descargar el historial.');
      return;
    }
    if (!materialId) {
      showError('Material no seleccionado.');
      return;
    }

    setIsDownloading(true);
    const toastId = showLoading('Generando reporte PDF de historial de precios...');

    try {
      // Use the new PDF generation function
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-material-price-history-pdf`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ materialId, materialName }), // Removed baseCurrency
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al generar el reporte PDF de historial de precios.');
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get('Content-Disposition');
      const fileNameMatch = contentDisposition && contentDisposition.match(/filename="([^"]+)"/);
      const fileName = fileNameMatch ? fileNameMatch[1] : `historial_precios_${materialName}.pdf`;

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
      console.error('[PriceHistoryDownloadButton] Error downloading history:', error);
      dismissToast(toastId);
      showError(error.message || 'Error desconocido al descargar el reporte PDF.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Button
      onClick={handleDownload}
      disabled={isDownloading || disabled || !materialId}
      variant="outline"
      className="bg-procarni-secondary text-white hover:bg-green-700"
    >
      <Download className="mr-2 h-4 w-4" />
      {isDownloading ? 'Descargando...' : 'Descargar Reporte PDF'}
    </Button>
  );
};

export default PriceHistoryDownloadButton;