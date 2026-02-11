import React, { useState, useEffect, useImperativeHandle } from 'react';
import { Button } from '@/components/ui/button';
import { showError, showLoading, dismissToast } from '@/utils/toast';
import { useSession } from '@/components/SessionContextProvider';
import PDFDownloadButton from './PDFDownloadButton';
import { getServiceOrderDetails } from '@/integrations/supabase/data';
import { calculateTotals } from '@/utils/calculations';
import { ServiceOrder, ServiceOrderItem } from '@/integrations/supabase/types';

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
            dismissToast(String(loadingToastId));
            setLoadingToastId(null);
        }
        if (successToastId) {
            dismissToast(String(successToastId));
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

        if (loadingToastId) dismissToast(String(loadingToastId));
        if (successToastId) dismissToast(String(successToastId));

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

            dismissToast(String(toastId));
            setLoadingToastId(null);

            const successId = showLoading('PDF generado. Puedes previsualizarlo.');
            setSuccessToastId(successId);

            setTimeout(() => {
                dismissToast(String(successId));
                setSuccessToastId(null);
            }, 2000);

        } catch (error: any) {
            console.error('[ServiceOrderPDFViewer] Error generating PDF:', error);
            if (loadingToastId) dismissToast(String(loadingToastId));
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
                dismissToast(String(loadingToastId));
            }
            if (successToastId) {
                dismissToast(String(successToastId));
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

            <div className="flex justify-end gap-2 mb-4">
                <PDFDownloadButton
                    orderId={orderId}
                    fileName={fileName}
                    endpoint="generate-so-pdf"
                    label="Descargar PDF"
                    variant="outline"
                    disabled={isLoadingPdf}
                />
                <Button onClick={handleClose} variant="outline">
                    Cerrar
                </Button>
            </div>

            <div className="flex-1 overflow-auto">
                {isLoadingPdf && (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                        Cargando previsualización del PDF...
                    </div>
                )}
                {pdfUrl && !isLoadingPdf && (
                    <iframe src={pdfUrl} className="w-full h-full border-none" title="PDF Preview"></iframe>
                )}
                {!pdfUrl && !isLoadingPdf && (
                    <div className="flex items-center justify-center h-full text-destructive">
                        No se pudo generar la previsualización del PDF.
                    </div>
                )}
            </div>
        </div>
    );
});

ServiceOrderPDFViewer.displayName = "ServiceOrderPDFViewer";

export default ServiceOrderPDFViewer;
