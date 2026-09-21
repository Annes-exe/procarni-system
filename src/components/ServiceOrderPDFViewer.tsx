import React, { useState, useEffect, useImperativeHandle } from 'react';
import { Button } from '@/components/ui/button';
import { showError, showLoading, dismissToast, showSuccess } from '@/utils/toast';
import { useSession } from '@/components/SessionContextProvider';
import PDFDownloadButton from './PDFDownloadButton';
import { getServiceOrderDetails } from '@/integrations/supabase/data';
import { calculateTotals } from '@/utils/calculations';
import { ServiceOrder, ServiceOrderItem } from '@/integrations/supabase/types';
import { ExternalLink, FileText } from 'lucide-react';

interface ServiceOrderDetails extends ServiceOrder {
    service_order_items: ServiceOrderItem[];
}

interface ServiceOrderPDFViewerProps {
    orderId: string;
    onClose: () => void;
    fileName: string;
}

export interface ServiceOrderPDFViewerRef {
    handleClose: () => void;
}

const ServiceOrderPDFViewer = React.forwardRef<ServiceOrderPDFViewerRef, ServiceOrderPDFViewerProps>(({ orderId, onClose, fileName }, ref) => {
    const { session } = useSession();
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
    const [isLoadingPdf, setIsLoadingPdf] = useState(false);
    const [loadingToastId, setLoadingToastId] = useState<string | number | null>(null);
    const [successToastId, setSuccessToastId] = useState<string | number | null>(null);
    const [orderData, setOrderData] = useState<ServiceOrderDetails | null>(null);

    const fetchOrderDetails = async () => {
        try {
            const details = await getServiceOrderDetails(orderId);
            setOrderData(details as unknown as ServiceOrderDetails);
        } catch (e) {
            console.error("Error fetching order details for viewer:", e);
        }
    };

    const handleClose = () => {
        if (pdfUrl) {
            URL.revokeObjectURL(pdfUrl);
        }
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

    useImperativeHandle(ref, () => ({
        handleClose,
    }));

    const generatePdf = async () => {
        if (!session) {
            showError('No hay sesión activa para generar el PDF.');
            return;
        }

        if (loadingToastId) dismissToast(loadingToastId);
        if (successToastId) dismissToast(successToastId);

        setIsLoadingPdf(true);
        const toastId = showLoading('Generando PDF de la Orden de Servicio...');
        setLoadingToastId(toastId);

        try {
            // Use environment variable for Supabase URL
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            const response = await fetch(`${supabaseUrl}/functions/v1/generate-so-pdf`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ orderId: orderId }),
            });

            if (!response.ok) {
                // Fallback for missing endpoint during dev
                if (response.status === 404) {
                    throw new Error('La función de generación de PDF para Órdenes de Servicio no está desplegada (404).');
                }
                const errorData = await response.json();
                throw new Error(errorData.error || 'Error al generar el PDF.');
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            setPdfUrl(url);

            dismissToast(toastId);
            setLoadingToastId(null);

            const successId = showSuccess('PDF generado. Puedes previsualizarlo.');
            // Success toast auto-dismisses
            setSuccessToastId(null);

        } catch (error: any) {
            console.error('[ServiceOrderPDFViewer] Error generating PDF:', error);
            if (loadingToastId) dismissToast(loadingToastId);
            setLoadingToastId(null);
            showError(error.message || 'Error desconocido al generar el PDF.');
        } finally {
            setIsLoadingPdf(false);
        }
    };

    useEffect(() => {
        fetchOrderDetails();
        generatePdf();

        return () => {
            if (pdfUrl) {
                URL.revokeObjectURL(pdfUrl);
            }
            if (loadingToastId) {
                dismissToast(loadingToastId);
            }
            if (successToastId) {
                dismissToast(successToastId);
            }
        };
    }, [orderId]);

    const itemsForCalculation = orderData?.service_order_items.map((item) => ({
        quantity: item.quantity,
        unit_price: item.unit_price,
        tax_rate: item.tax_rate,
        is_exempt: item.is_exempt,
        sales_percentage: item.sales_percentage || 0,
        discount_percentage: item.discount_percentage || 0,
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
                        endpoint="generate-so-pdf"
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

ServiceOrderPDFViewer.displayName = "ServiceOrderPDFViewer";

export default ServiceOrderPDFViewer;
