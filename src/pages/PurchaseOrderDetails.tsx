import React, { useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Edit, FileText, Mail, CheckCircle, Smartphone, Printer, MoreVertical, Paperclip, ChevronDown, Archive, RotateCcw, Clock } from 'lucide-react';

import { purchaseOrderService } from '@/services/purchaseOrderService';
import { showError, showSuccess, showLoading, dismissToast } from '@/utils/toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import PurchaseOrderPDFViewer, { PurchaseOrderPDFViewerRef } from '@/components/PurchaseOrderPDFViewer';
import PDFDownloadButton from '@/components/PDFDownloadButton';
import { calculateTotals, numberToWords } from '@/utils/calculations';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import EmailSenderModal from '@/components/EmailSenderModal';
import { useSession } from '@/components/SessionContextProvider';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel
} from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface PurchaseOrderItem {
  id: string;
  material_name: string;
  supplier_code?: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  is_exempt: boolean;
  unit?: string;
  description?: string;
  sales_percentage?: number;
  discount_percentage?: number;
}

interface SupplierDetails {
  id: string;
  name: string;
  rif: string;
  email?: string;
  phone?: string;
  payment_terms: string;
}

interface CompanyDetails {
  id: string;
  name: string;
  rif: string;
}

interface PurchaseOrderDetailsData {
  id: string;
  sequence_number?: number;
  supplier_id: string;
  suppliers: SupplierDetails;
  company_id: string;
  companies: CompanyDetails;
  currency: 'USD' | 'VES';
  exchange_rate?: number | null;
  status: 'Draft' | 'Approved' | 'Rejected' | 'Archived';
  created_at: string;
  created_by?: string;
  user_id: string;
  purchase_order_items: PurchaseOrderItem[];
  delivery_date?: string;
  payment_terms?: string;
  custom_payment_terms?: string | null;
  credit_days?: number;
  observations?: string;
}

const STATUS_TRANSLATIONS: Record<string, string> = {
  'Draft': 'Borrador',
  'Approved': 'Aprobada',
  'Rejected': 'Rechazada',
  'Archived': 'Archivada',
};

const formatSequenceNumber = (sequence?: number, dateString?: string): string => {
  if (!sequence) return 'N/A';

  const date = dateString ? new Date(dateString) : new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const seq = String(sequence).padStart(3, '0');

  return `OC-${year}-${month}-${seq}`;
};

const PurchaseOrderDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { session } = useSession();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [isApproveConfirmOpen, setIsApproveConfirmOpen] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejectConfirmOpen, setIsRejectConfirmOpen] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  const pdfViewerRef = React.useRef<PurchaseOrderPDFViewerRef>(null);

  // Helper function to correctly parse date strings (YYYY-MM-DD) for display
  const parseDateForDisplay = (dateString: string): Date => {
    return new Date(dateString + 'T12:00:00');
  };

  const { data: order, isLoading, error } = useQuery<PurchaseOrderDetailsData | null>({
    queryKey: ['purchaseOrderDetails', id],
    queryFn: async () => {
      if (!id) throw new Error('Purchase Order ID is missing.');
      const details = await purchaseOrderService.getById(id);
      if (!details) throw new Error('Purchase Order not found.');
      return details as unknown as PurchaseOrderDetailsData;
    },
    enabled: !!id,
  });

  const itemsForCalculation = order?.purchase_order_items.map(item => ({
    quantity: item.quantity,
    unit_price: item.unit_price,
    tax_rate: item.tax_rate,
    is_exempt: item.is_exempt,
    sales_percentage: item.sales_percentage || 0,
    discount_percentage: item.discount_percentage || 0,
  })) || [];

  const totals = calculateTotals(itemsForCalculation);
  const amountInWords = order ? numberToWords(totals.total, order.currency) : '';

  const totalInUSD = useMemo(() => {
    if (order?.currency === 'VES' && order.exchange_rate && order.exchange_rate > 0) {
      return (totals.total / order.exchange_rate).toFixed(2);
    }
    return null;
  }, [order, totals.total]);

  const displayPaymentTerms = () => {
    if (order?.payment_terms === 'Otro' && order.custom_payment_terms) {
      return order.custom_payment_terms;
    }
    if (order?.payment_terms === 'Crédito' && order.credit_days) {
      return `Crédito (${order.credit_days} días)`;
    }
    return order?.payment_terms || 'N/A';
  };

  const generateFileName = () => {
    if (!order) return '';
    const sequence = formatSequenceNumber(order.sequence_number, order.created_at);
    const supplierName = order.suppliers?.name?.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_') || 'Proveedor';
    return `${sequence}-${supplierName}.pdf`;
  };

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result);
      };
      reader.onerror = (error) => {
        console.error('[PurchaseOrderDetails] Error converting blob to base64:', error);
        reject(error);
      };
      reader.readAsDataURL(blob);
    });
  };

  const handleApproveOrder = async () => {
    if (!order || order.status === 'Approved') return;

    setIsApproveConfirmOpen(false);
    setIsApproving(true);
    const toastId = showLoading('Aprobando orden...');

    try {
      const success = await purchaseOrderService.updateStatus(order.id, 'Approved');
      if (success) {
        showSuccess('Orden de Compra aprobada exitosamente.');
        queryClient.invalidateQueries({ queryKey: ['purchaseOrderDetails', id] });
        queryClient.invalidateQueries({ queryKey: ['purchaseOrders', 'Active'] });
        queryClient.invalidateQueries({ queryKey: ['purchaseOrders', 'Approved'] });
      } else {
        throw new Error('Fallo al actualizar el estado.');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido al aprobar la orden.';
      showError(errorMessage);
    } finally {
      dismissToast(toastId);
      setIsApproving(false);
    }
  };

  const handleRejectOrder = async () => {
    if (!order || order.status === 'Rejected') return;

    setIsRejectConfirmOpen(false);
    setIsRejecting(true);
    const toastId = showLoading('Rechazando orden...');

    try {
      const success = await purchaseOrderService.updateStatus(order.id, 'Rejected');
      if (success) {
        showSuccess('Orden de Compra rechazada exitosamente.');
        queryClient.invalidateQueries({ queryKey: ['purchaseOrderDetails', id] });
        queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
      } else {
        throw new Error('Fallo al actualizar el estado.');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido al rechazar la orden.';
      showError(errorMessage);
    } finally {
      dismissToast(toastId);
      setIsRejecting(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!order || order.status === newStatus) return;

    if (newStatus === 'Approved') {
      setIsApproveConfirmOpen(true);
      return;
    }

    if (newStatus === 'Rejected') {
      setIsRejectConfirmOpen(true);
      return;
    }

    const toastId = showLoading(`Cambiando estado a ${STATUS_TRANSLATIONS[newStatus] || newStatus}...`);
    try {
      const success = await purchaseOrderService.updateStatus(order.id, newStatus as any);
      if (success) {
        showSuccess(`Estado cambiado a ${STATUS_TRANSLATIONS[newStatus] || newStatus} exitosamente.`);
        queryClient.invalidateQueries({ queryKey: ['purchaseOrderDetails', id] });
        queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
      } else {
        throw new Error('Error al actualizar el estado.');
      }
    } catch (error: any) {
      showError(error.message || 'Error al cambiar el estado.');
    } finally {
      dismissToast(toastId);
    }
  };

  const handleSendEmail = async (customMessage: string) => {
    if (!session?.user?.email || !order) return;

    const toastId = showLoading('Generando PDF y enviando correo...');

    try {
      const pdfResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-po-pdf`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderId: order.id }),
      });

      if (!pdfResponse.ok) {
        const errorData = await pdfResponse.json();
        throw new Error(errorData.error || 'Error al generar el PDF.');
      }

      const pdfBlob = await pdfResponse.blob();
      const pdfBase64 = await blobToBase64(pdfBlob);

      const emailBody = `
        <h2>Orden de Compra #${formatSequenceNumber(order.sequence_number, order.created_at)}</h2>
        <p><strong>Empresa:</strong> ${order.companies?.name}</p>
        <p><strong>Proveedor:</strong> ${order.suppliers?.name}</p>
        <p><strong>Fecha de Entrega:</strong> ${order.delivery_date ? format(parseDateForDisplay(order.delivery_date), 'PPP', { locale: es }) : 'N/A'}</p>
        <p><strong>Condición de Pago:</strong> ${displayPaymentTerms()}</p>
        ${customMessage ? `<p><strong>Mensaje:</strong><br>${customMessage.replace(/\n/g, '<br>')}</p>` : ''}
        <p>Se adjunta el PDF con los detalles de la orden de compra.</p>
      `;

      const emailResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: order.suppliers?.email,
          subject: `Orden de Compra #${formatSequenceNumber(order.sequence_number, order.created_at)} - ${order.companies?.name}`,
          body: emailBody,
          attachmentBase64: pdfBase64,
          attachmentFilename: generateFileName(),
        }),
      });

      if (!emailResponse.ok) {
        const errorData = await emailResponse.json();
        throw new Error(errorData.error || 'Error al enviar el correo.');
      }

      if (false) {
        // WhatsApp notification removed (incomplete)
      }

      dismissToast(toastId);
      showSuccess('Correo enviado exitosamente.');
      setIsEmailModalOpen(false);

    } catch (error) {
      console.error('[PurchaseOrderDetails] Error sending email:', error);
      dismissToast(toastId);
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido al enviar el correo.';
      showError(errorMessage);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 text-center text-muted-foreground animate-pulse mt-10">
        Cargando documento...
      </div>
    );
  }

  if (error) {
    showError(error.message);
    return (
      <div className="container mx-auto p-4 text-center text-destructive">
        Error: {error.message}
        <Button asChild variant="link" className="mt-4">
          <Link to="/purchase-order-management">Volver a la gestión de órdenes</Link>
        </Button>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="container mx-auto p-4 text-center text-muted-foreground">
        Orden de compra no encontrada.
        <Button asChild variant="link" className="mt-4">
          <Link to="/purchase-order-management">Volver a la gestión de órdenes</Link>
        </Button>
      </div>
    );
  }

  const isEditable = order.status !== 'Approved' && order.status !== 'Archived';

  const handleModalOpenChange = (open: boolean) => {
    setIsModalOpen(open);
    if (!open && pdfViewerRef.current) {
      pdfViewerRef.current.handleClose();
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'Draft': return 'default'; // gray/yellow handled by styling
      case 'Approved': return 'secondary'; // using custom class for colors
      case 'Rejected': return 'destructive';
      case 'Archived': return 'outline';
      default: return 'outline';
    }
  };

  const getStatusColorClass = (status: string) => {
    switch (status) {
      case 'Draft': return 'bg-amber-50 text-procarni-alert border-amber-200';
      case 'Approved': return 'bg-green-50 text-procarni-secondary border-green-200';
      case 'Rejected': return 'bg-red-50 text-red-700 border-red-200';
      case 'Archived': return 'bg-gray-100 text-gray-500 border-gray-200';
      default: return 'bg-gray-50 text-gray-500';
    }
  };

  const microLabelClass = "text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-1 block";
  const tableHeaderClass = "text-[10px] uppercase tracking-wider font-semibold text-gray-500";
  const valueClass = "text-procarni-dark font-medium text-sm";

  return (
    <div className="container mx-auto p-4 pb-24 relative min-h-screen">

      {/* PHASE 1: STICKY HEADER & ACTIONS */}
      <div className="relative md:sticky md:top-0 z-20 backdrop-blur-md bg-white/90 border-b border-gray-200 pb-3 pt-4 mb-8 -mx-4 px-4 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-all duration-200">

        {/* Title & Status */}
        <div className="flex flex-col gap-1 w-full md:w-auto">
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-gray-400 hover:text-procarni-dark hover:bg-gray-100 rounded-full h-8 w-8 -ml-2 mr-1">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold font-mono text-procarni-dark tracking-tight">
              {formatSequenceNumber(order.sequence_number, order.created_at)}
            </h1>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "ml-2 h-7 px-2.5 py-0.5 text-xs font-semibold shadow-none border flex gap-1.5 items-center",
                    getStatusColorClass(order.status)
                  )}
                >
                  {STATUS_TRANSLATIONS[order.status] || order.status}
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-40">
                <DropdownMenuLabel>Cambiar Estado</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {Object.entries(STATUS_TRANSLATIONS).map(([status, label]) => (
                  <DropdownMenuItem
                    key={status}
                    onSelect={() => handleStatusChange(status)}
                    className={cn(status === order.status && "bg-gray-100 font-medium")}
                  >
                    {label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          <div className="flex items-center gap-2 ml-auto">
            {/* Primary Actions: Approve and Edit */}
            {isEditable && order.status !== 'Approved' && (
              <Button
                onClick={() => setIsApproveConfirmOpen(true)}
                disabled={isApproving}
                className="bg-green-600 hover:bg-green-700 text-white gap-2 shadow-sm order-2 md:order-1"
                size="sm"
              >
                <CheckCircle className="h-4 w-4" />
                <span className="hidden sm:inline">Aprobar Orden</span>
              </Button>
            )}

            {isEditable && (
              <Button onClick={() => navigate(`/purchase-orders/edit/${order.id}`)} variant="outline" size="sm" className="gap-2 order-1 md:order-2">
                <Edit className="h-4 w-4" />
                <span className="hidden sm:inline">Editar</span>
              </Button>
            )}

            {/* Secondary Actions: Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 order-3">
                  <MoreVertical className="h-4 w-4" />
                  <span className="hidden sm:inline">Acciones</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Opciones de Documento</DropdownMenuLabel>
                <DropdownMenuSeparator />

                <DropdownMenuItem onSelect={() => setIsModalOpen(true)}>
                  <FileText className="mr-2 h-4 w-4" /> Previsualizar
                </DropdownMenuItem>

                <DropdownMenuItem asChild>
                  <PDFDownloadButton
                    orderId={order.id}
                    fileNameGenerator={generateFileName}
                    endpoint="generate-po-pdf"
                    label="Descargar PDF"
                    variant="ghost"
                    className="w-full justify-start cursor-pointer px-2 py-1.5 h-auto font-normal text-sm"
                  />
                </DropdownMenuItem>

                <DropdownMenuItem onSelect={() => setIsEmailModalOpen(true)} disabled={!order.suppliers?.email}>
                  <Mail className="mr-2 h-4 w-4" /> Enviar por Correo
                </DropdownMenuItem>

                <DropdownMenuSeparator />
                <DropdownMenuLabel>Operaciones</DropdownMenuLabel>

                {order.status !== 'Approved' && order.status !== 'Archived' && order.status !== 'Rejected' && (
                  <DropdownMenuItem onSelect={() => setIsRejectConfirmOpen(true)} className="text-red-600 focus:text-red-600">
                    <Clock className="mr-2 h-4 w-4" /> Rechazar Orden
                  </DropdownMenuItem>
                )}

                {order.status !== 'Archived' ? (
                  <DropdownMenuItem onSelect={() => handleStatusChange('Archived')}>
                    <Archive className="mr-2 h-4 w-4" /> Archivar
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => handleStatusChange('Draft')}>
                    <RotateCcw className="mr-2 h-4 w-4" /> Desarchivar
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Preview Dialog remains (triggered from dropdown) */}
            <Dialog open={isModalOpen} onOpenChange={handleModalOpenChange}>
              <DialogContent className="max-w-5xl h-[95vh] flex flex-col p-0 gap-0">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                  <DialogTitle>Previsualización de Documento</DialogTitle>
                  <Button variant="ghost" size="sm" onClick={() => setIsModalOpen(false)}>Cerrar</Button>
                </div>
                <div className="flex-1 overflow-hidden bg-gray-100">
                  <PurchaseOrderPDFViewer
                    orderId={order.id}
                    onClose={() => setIsModalOpen(false)}
                    fileName={generateFileName()}
                    ref={pdfViewerRef}
                  />
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      {/* PHASE 2: GENERAL INFORMATION GRID */}
      <div className="mb-10 animate-in fade-in slide-in-from-bottom-2 duration-500">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 px-1">
          {/* Company */}
          <div className="space-y-1">
            <span className={microLabelClass}>Empresa</span>
            <p className={valueClass}>{order.companies?.name || 'N/A'}</p>
            <p className="text-xs text-gray-500">{order.companies?.rif}</p>
          </div>

          {/* Supplier */}
          <div className="space-y-1">
            <span className={microLabelClass}>Proveedor</span>
            <p className={valueClass}>{order.suppliers?.name || 'N/A'}</p>
            <p className="text-xs text-gray-500">{order.suppliers?.rif}</p>
          </div>

          {/* Delivery Date */}
          <div className="space-y-1">
            <span className={microLabelClass}>Fecha de Entrega</span>
            <p className={valueClass}>
              {order.delivery_date ? format(parseDateForDisplay(order.delivery_date), 'PPP', { locale: es }) : 'N/A'}
            </p>
          </div>

          {/* Payment Conditions */}
          <div className="space-y-1">
            <span className={microLabelClass}>Condición de Pago</span>
            <p className={valueClass}>{displayPaymentTerms()}</p>
          </div>
        </div>

        {/* Observations (if any) - Styled as a subtle note */}
        {order.observations && (
          <div className="mt-6 p-4 bg-gray-50 border border-gray-100 rounded-md flex gap-3 text-sm text-gray-600 max-w-4xl">
            <Paperclip className="h-4 w-4 flex-shrink-0 mt-0.5 text-gray-400" />
            <div>
              <span className="font-semibold text-gray-700 block mb-1">Observaciones:</span>
              <p className="whitespace-pre-wrap">{order.observations}</p>
            </div>
          </div>
        )}
      </div>

      {/* PHASE 3: ITEMS TABLE (READ-ONLY) */}
      <Card className="mb-8 border-gray-200 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          {isMobile ? (
            /* Mobile Card View (optimized) */
            <div className="divide-y divide-gray-100">
              {order.purchase_order_items?.map((item) => {
                const subtotal = item.quantity * item.unit_price;
                return (
                  <div key={item.id} className="p-4 bg-white">
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-medium text-procarni-dark">{item.material_name}</span>
                      <span className="font-mono text-sm font-semibold">{order.currency} {totals.total.toFixed(2)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-y-2 text-xs text-gray-600">
                      <div>
                        <span className="text-[10px] uppercase text-gray-400 block">Cant.</span>
                        {item.quantity} {item.unit}
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] uppercase text-gray-400 block">P. Unit</span>
                        {item.unit_price.toFixed(2)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Desktop Table View */
            <Table>
              <TableHeader className="bg-gray-50/80">
                <TableRow className="border-b border-gray-100 hover:bg-transparent">
                  <TableHead className={tableHeaderClass + " h-9 py-2 pl-6"}>Ítem / Descripción</TableHead>
                  <TableHead className={tableHeaderClass + " h-9 py-2 text-right"}>Cant.</TableHead>
                  <TableHead className={tableHeaderClass + " h-9 py-2 text-right"}>Precio ({order.currency})</TableHead>
                  <TableHead className={tableHeaderClass + " h-9 py-2 text-center"}>IVA</TableHead>
                  <TableHead className={tableHeaderClass + " h-9 py-2 text-right pr-6"}>Total ({order.currency})</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.purchase_order_items?.map((item) => {
                  const subtotal = item.quantity * item.unit_price;
                  // const itemIva = item.is_exempt ? 0 : subtotal * item.tax_rate; // Not strictly needed for the row if we just show unit price and subtotal

                  return (
                    <TableRow key={item.id} className="border-b border-gray-50 hover:bg-gray-50/30">
                      <TableCell className="pl-6 py-4">
                        <span className="font-medium text-procarni-dark text-sm block">{item.material_name}</span>
                        {item.description && (
                          <span className="text-xs text-gray-500 truncate max-w-[300px] block mt-0.5">{item.description}</span>
                        )}
                        <span className="text-[10px] text-gray-400 mt-1 block">Cód: {item.supplier_code || 'N/A'}</span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-gray-600">
                        {item.quantity} <span className="text-[10px] text-gray-400 ml-0.5">{item.unit}</span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-gray-600">
                        {item.unit_price.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-center">
                        {item.is_exempt ? (
                          <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">Exento</span>
                        ) : (
                          <span className="text-[10px] text-gray-400">{(item.tax_rate * 100).toFixed(0)}%</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-medium text-procarni-dark pr-6">
                        {subtotal.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* PHASE 4: TOTALS ("TICKET DE CAJA") - Reused Design */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-6 mb-12">
        {/* Left Side: Amount in Words */}
        <div className="w-full md:w-1/2 text-xs text-gray-400 italic px-2">
          Importe en letras: {amountInWords}
        </div>

        {/* Right Side: Calculation Block */}
        <div className="w-full md:w-auto min-w-[300px] bg-gray-50/50 rounded-lg border border-gray-100 p-6 space-y-3">
          {/* Base Imponible */}
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-500 font-medium">Base Imponible</span>
            <span className="font-mono text-gray-700">{order.currency} {totals.baseImponible.toFixed(2)}</span>
          </div>

          {/* Discount */}
          {totals.montoDescuento > 0 && (
            <div className="flex justify-between items-center text-sm text-red-600">
              <span className="font-medium">Descuento</span>
              <span className="font-mono">- {order.currency} {totals.montoDescuento.toFixed(2)}</span>
            </div>
          )}

          {/* Margin / Sale % */}
          {totals.montoVenta > 0 && (
            <div className="flex justify-between items-center text-sm text-blue-600">
              <span className="font-medium">% de Venta</span>
              <span className="font-mono">+ {order.currency} {totals.montoVenta.toFixed(2)}</span>
            </div>
          )}

          {/* IVA */}
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-500 font-medium">Monto IVA</span>
            <span className="font-mono text-gray-700">+ {order.currency} {totals.montoIVA.toFixed(2)}</span>
          </div>

          {/* Separator */}
          <div className="h-px border-b border-dashed border-gray-300 my-2" />

          {/* Total */}
          <div className="flex justify-between items-center text-lg">
            <span className="font-bold text-procarni-dark">Total Final</span>
            <span className="font-mono font-bold text-procarni-secondary text-xl">{order.currency} {totals.total.toFixed(2)}</span>
          </div>

          {/* USD Reference for VES orders */}
          {totalInUSD && order.currency === 'VES' && (
            <div className="flex justify-end pt-1">
              <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
                Ref. USD {totalInUSD} (@ {order.exchange_rate?.toFixed(2)})
              </span>
            </div>
          )}
        </div>
      </div>


      {/* Modals & Dialogs */}
      <EmailSenderModal
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        onSend={(message) => handleSendEmail(message)}
        recipientEmail={order.suppliers?.email || ''}
        documentType="Orden de Compra"
        documentId={order.id}
      />

      <AlertDialog open={isApproveConfirmOpen} onOpenChange={setIsApproveConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Aprobación</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas aprobar esta Orden de Compra? Esto marcará la orden como finalizada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isApproving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleApproveOrder} disabled={isApproving} className="bg-green-600 hover:bg-green-700">
              {isApproving ? 'Aprobando...' : 'Aprobar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isRejectConfirmOpen} onOpenChange={setIsRejectConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Rechazo</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas rechazar esta Orden de Compra?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRejecting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRejectOrder} disabled={isRejecting} className="bg-red-600 hover:bg-red-700">
              {isRejecting ? 'Rechazando...' : 'Rechazar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PurchaseOrderDetails;