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
      {/* Totals Display */}
      <div className="flex justify-end items-center mb-4 gap-4 text-sm">
        {orderData && (
          <div className="flex flex-col items-end">
            <span className="font-semibold">Total: {orderData.currency} {totals.total.toFixed(2)}</span>
            {totalInUSD && (
              <span className="font-bold text-blue-600">USD {totalInUSD}</span>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap justify-end gap-2 mb-4">
        {pdfUrl && (
          <Button
            onClick={() => window.open(pdfUrl, '_blank')}
            className="bg-procarni-primary hover:bg-procarni-primary/90 text-white font-bold text-xs rounded-xl shadow-sm"
          >
            <ExternalLink className="mr-1.5 h-4 w-4" />
            Abrir en Visor Nativo
          </Button>
        )}
        <PDFDownloadButton
          orderId={orderId}
          fileName={fileName}
          endpoint="generate-po-pdf"
          label="Descargar PDF"
          variant="outline"
          disabled={isLoadingPdf}
        />
        <Button onClick={handleClose} variant="outline">
          Cerrar
        </Button>
      </div>

      <div className="flex-1 overflow-auto rounded-2xl bg-slate-50 border border-slate-100 flex flex-col">
        {isLoadingPdf && (
          <div className="flex items-center justify-center h-full text-muted-foreground p-6">
            Cargando previsualización del PDF...
          </div>
        )}
        {pdfUrl && !isLoadingPdf && (
          <>
            <iframe src={pdfUrl} className="hidden md:block w-full h-full border-none" title="PDF Preview"></iframe>
            <div className="flex md:hidden flex-col items-center justify-center p-6 text-center space-y-4 my-auto">
              <div className="w-16 h-16 rounded-2xl bg-procarni-primary/10 text-procarni-primary flex items-center justify-center shadow-sm">
                <FileText className="h-8 w-8" />
              </div>
              <div>
                <h4 className="text-base font-bold text-gray-900">Documento PDF Generado</h4>
                <p className="text-xs text-gray-500 max-w-xs mt-1">Haz clic para abrir el documento en el visor nativo de tu teléfono o descargarlo.</p>
              </div>
              <div className="flex flex-col w-full gap-2 pt-2">
                <Button
                  onClick={() => window.open(pdfUrl, '_blank')}
                  className="w-full h-11 bg-procarni-primary hover:bg-procarni-primary/90 text-white font-bold rounded-xl shadow-md"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Abrir en Visor Nativo
                </Button>
                <PDFDownloadButton
                  orderId={orderId}
                  fileName={fileName}
                  endpoint="generate-po-pdf"
                  label="Descargar Archivo PDF"
                  variant="outline"
                  className="w-full h-11 rounded-xl"
                  disabled={isLoadingPdf}
                />
              </div>
            </div>
          </>
        )}
        {!pdfUrl && !isLoadingPdf && (
          <div className="flex items-center justify-center h-full text-destructive p-6">
            No se pudo generar la previsualización del PDF.
          </div>
        )}
      </div>
    </div>
  );
});

PurchaseOrderPDFViewer.displayName = "PurchaseOrderPDFViewer";

export default PurchaseOrderPDFViewer;