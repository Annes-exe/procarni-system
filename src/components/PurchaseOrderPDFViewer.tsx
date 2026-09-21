import React, { useState, useEffect, useImperativeHandle } from 'react';
import { Button } from '@/components/ui/button';
import { showError, showLoading, dismissToast, showSuccess } from '@/utils/toast';
import { useSession } from '@/components/SessionContextProvider';
import PDFDownloadButton from './PDFDownloadButton'; // Importar el botón de descarga
import { purchaseOrderService } from '@/services/purchaseOrderService'; // Importar servicio para obtener detalles
import { calculateTotals } from '@/utils/calculations'; // Import calculateTotals
import { ExternalLink, FileText } from 'lucide-react';

interface PurchaseOrderPDFViewerProps {
  orderId: string;
  onClose: () => void;
  fileName: string; // Nuevo: Nombre de archivo para la descarga
}

export interface PurchaseOrderPDFViewerRef {
  handleClose: () => void;
}

const PurchaseOrderPDFViewer = React.forwardRef<PurchaseOrderPDFViewerRef, PurchaseOrderPDFViewerProps>(({ orderId, onClose, fileName }, ref) => {
  const { session } = useSession();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [loadingToastId, setLoadingToastId] = useState<string | number | null>(null);
  const [successToastId, setSuccessToastId] = useState<string | null>(null);
  const [orderData, setOrderData] = useState<any>(null); // State to hold order details for totals

  const fetchOrderDetails = async () => {
    try {
      const details = await purchaseOrderService.getById(orderId);
      setOrderData(details);
    } catch (e) {
      console.error("Error fetching order details for viewer:", e);
    }
  };

  const handleClose = () => {
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl); // Limpiar URL temporal
    }
    // Ensure all toasts are dismissed upon explicit close
    if (loadingToastId) {
      dismissToast(loadingToastId);
      setLoadingToastId(null);
    }
    if (successToastId) {
      dismissToast(successToastId);
      setSuccessToastId(null);
    }
    onClose();
  };

  // Expose handleClose function to the parent component via ref
  useImperativeHandle(ref, () => ({
    handleClose,
  }));

  const generatePdf = async () => {
    if (!session) {
      showError('No hay sesión activa para generar el PDF.');
      return;
    }

    // Dismiss any previous loading toast before starting a new one
    if (loadingToastId) dismissToast(loadingToastId);
    if (successToastId) dismissToast(successToastId);

    setIsLoadingPdf(true);
    const toastId = showLoading('Generando PDF de la Orden de Compra...');
    setLoadingToastId(toastId);

    try {
      // Usamos la función Edge para generar el PDF
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/generate-po-pdf`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderId: orderId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al generar el PDF.');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);

      // Dismiss loading toast and show success toast
      dismissToast(toastId);
      setLoadingToastId(null);

      const successId = showSuccess('PDF generado. Puedes previsualizarlo.');
      // Success toast auto-dismisses, no need to store ID or set timeout
      setSuccessToastId(null);

    } catch (error: any) {
      console.error('[PurchaseOrderPDFViewer] Error generating PDF:', error);
      dismissToast(toastId);
      setLoadingToastId(null);
      showError(error.message || 'Error desconocido al generar el PDF.');
    } finally {
      setIsLoadingPdf(false);
    }
  };

  useEffect(() => {
    fetchOrderDetails();
    generatePdf();

    // Cleanup function runs on unmount
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
      // Ensure toasts are dismissed on unmount
      if (loadingToastId) {
        dismissToast(loadingToastId);
      }
      if (successToastId) {
        dismissToast(successToastId);
      }
    };
  }, [orderId]); // Dependencia de orderId para regenerar si cambia

  const itemsForCalculation = orderData?.purchase_order_items.map((item: any) => ({
    quantity: item.quantity,
    unit_price: item.unit_price,
    tax_rate: item.tax_rate,
    is_exempt: item.is_exempt,
  })) || [];

  const totals = calculateTotals(itemsForCalculation);
  const totalInUSD = orderData?.currency === 'VES' && orderData.exchange_rate && orderData.exchange_rate > 0
    ? (totals.total / orderData.exchange_rate).toFixed(2)
    : null;

  return (
    <div className="flex flex-col h-full">
      {/* Totals & Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3 shrink-0">
        {orderData ? (
          <div className="flex items-center gap-3 text-xs sm:text-sm">
            <span className="font-semibold text-gray-700">Total: {orderData.currency} {totals.total.toFixed(2)}</span>
            {totalInUSD && (
              <span className="font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">USD {totalInUSD}</span>
            )}
          </div>
        ) : <div />}

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
          {pdfUrl && (
            <Button
              onClick={() => window.open(pdfUrl, '_blank')}
              className="bg-procarni-primary hover:bg-procarni-primary/90 text-white font-bold text-xs rounded-xl shadow-sm h-8"
              title="Abrir en visor del dispositivo para imprimir o compartir"
            >
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              Visor Nativo
            </Button>
          )}
          <PDFDownloadButton
            orderId={orderId}
            fileName={fileName}
            endpoint="generate-po-pdf"
            label="Descargar PDF"
            variant="outline"
            className="h-8 text-xs font-semibold rounded-xl"
            disabled={isLoadingPdf}
          />
          <Button onClick={handleClose} variant="outline" className="h-8 text-xs font-semibold rounded-xl">
            Cerrar
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden rounded-2xl bg-slate-900 border border-slate-800 flex flex-col min-h-0 relative">
        {isLoadingPdf && (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 p-6 gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
            <p className="text-xs">Cargando previsualización del PDF...</p>
          </div>
        )}
        {pdfUrl && !isLoadingPdf && (
          <div className="w-full flex-1 flex flex-col h-full min-h-0 relative">
            <iframe
              src={pdfUrl}
              className="w-full flex-1 border-none min-h-0 bg-white"
              title="PDF Preview"
            />
            {/* Quick action bar on mobile */}
            <div className="p-2 bg-gray-900 border-t border-gray-800 flex items-center justify-between sm:hidden shrink-0">
              <span className="text-[11px] text-gray-400">¿Deseas imprimir o compartir?</span>
              <Button
                size="sm"
                onClick={() => window.open(pdfUrl, '_blank')}
                className="h-7 text-xs bg-procarni-primary hover:bg-procarni-primary/90 text-white rounded-lg font-bold px-2.5"
              >
                <ExternalLink className="mr-1 h-3.5 w-3.5" />
                Visor Nativo
              </Button>
            </div>
          </div>
        )}
        {!pdfUrl && !isLoadingPdf && (
          <div className="flex items-center justify-center h-full text-red-400 p-6 text-sm">
            No se pudo generar la previsualización del PDF.
          </div>
        )}
      </div>
    </div>
  );
});

PurchaseOrderPDFViewer.displayName = "PurchaseOrderPDFViewer";

export default PurchaseOrderPDFViewer;