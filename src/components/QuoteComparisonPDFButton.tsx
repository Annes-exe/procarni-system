import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { showError, showLoading, dismissToast, showSuccess } from '@/utils/toast';
import { useSession } from '@/components/SessionContextProvider';
import { cn } from '@/lib/utils';

interface QuoteEntry {
  supplierId: string;
  supplierName: string;
  unitPrice: number;
  currency: 'USD' | 'VES';
  exchangeRate?: number;
}

interface MaterialSearchResult {
  id: string;
  name: string;
  code: string;
}

interface ComparisonResult {
  material: MaterialSearchResult;
  results: (QuoteEntry & { convertedPrice: number | null; isValid: boolean; error: string | null })[];
  bestPrice: number | null;
}

interface QuoteComparisonPDFButtonProps {
  comparisonResults: ComparisonResult[];
  baseCurrency: 'USD' | 'VES';
  globalExchangeRate?: number;
  label?: string;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link' | null | undefined;
  isSingleMaterial?: boolean; // If true, uses a specific filename format
}

const QuoteComparisonPDFButton: React.FC<QuoteComparisonPDFButtonProps> = ({
  comparisonResults,
  baseCurrency,
  globalExchangeRate,
  label = 'Descargar Comparación PDF',
  variant = 'default',
  isSingleMaterial = false,
}) => {
  const { session } = useSession();
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    if (!session) {
      showError('No hay sesión activa para descargar el PDF.');
      return;
    }
    if (comparisonResults.length === 0) {
      showError('No hay datos para generar el PDF.');
      return;
    }

    setIsDownloading(true);
    const toastId = showLoading('Generando PDF de comparación...');

    try {
      const response = await fetch(`https://sbmwuttfblpwwwpifmza.supabase.co/functions/v1/generate-quote-comparison-pdf`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          comparisonResults, 
          baseCurrency, 
          globalExchangeRate,
          isSingleMaterial,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al generar el PDF de comparación.');
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get('Content-Disposition');
      const fileNameMatch = contentDisposition && contentDisposition.match(/filename="([^"]+)"/);
      const fileName = fileNameMatch ? fileNameMatch[1] : `comparacion_cotizaciones.pdf`;

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      dismissToast(toastId);
      showSuccess('PDF descargado exitosamente.');
    } catch (error: any) {
      console.error('[QuoteComparisonPDFButton] Error downloading PDF:', error);
      dismissToast(toastId);
      showError(error.message || 'Error desconocido al descargar el PDF.');
    } finally {
      setIsDownloading(false);
    }
  };

  const isDisabled = isDownloading || comparisonResults.length === 0;

  return (
    <Button
      onClick={handleDownload}
      disabled={isDisabled}
      variant={variant}
      className={cn("flex items-center gap-2", variant === 'default' ? 'bg-procarni-secondary hover:bg-green-700' : '')}
    >
      <Download className="h-4 w-4" />
      {isDownloading ? 'Generando...' : label}
    </Button>
  );
};

export default QuoteComparisonPDFButton;