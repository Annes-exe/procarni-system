// src/pages/ServiceOrderDetails.tsx

import React, { useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Edit, FileText, Mail, CheckCircle, Smartphone, Printer, MoreVertical, Paperclip, Wrench, Package, ListOrdered, Calendar, User, MapPin, ChevronDown, Archive, RotateCcw, Clock } from 'lucide-react';

import { serviceOrderService } from '@/services/serviceOrderService';
import { showError, showSuccess, showLoading, dismissToast } from '@/utils/toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import ServiceOrderPDFViewer, { ServiceOrderPDFViewerRef } from '@/components/ServiceOrderPDFViewer';
import PDFDownloadButton from '@/components/PDFDownloadButton';
import { calculateTotals, numberToWords } from '@/utils/calculations';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import EmailSenderModal from '@/components/EmailSenderModal';
import { useSession } from '@/components/SessionContextProvider';
import { useIsMobile } from '@/hooks/use-mobile';
import WhatsAppShareModal from '@/components/WhatsAppShareModal';
import { OrderDocumentManager } from '@/components/OrderDocumentManager';
import { PriceAlert } from '@/components/PriceAlert';
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

interface SupplierDetails {
  id: string;
  name: string;
  rif: string;
  email?: string;
  phone?: string;
  phone_2?: string;
  payment_terms: string;
}

interface CompanyDetails {
  id: string;
  name: string;
  rif: string;
}

interface ServiceOrderItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  is_exempt: boolean;
  sales_percentage?: number | null;
  discount_percentage?: number | null;
}

interface ServiceOrderMaterial {
  id: string;
  supplier_id: string;
  material_id: string | null;
  material_name?: string | null;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  is_exempt: boolean;
  supplier_code?: string | null;
  unit?: string | null;
  unit_id?: string | null;
  description?: string | null;
  sales_percentage?: number | null;
  discount_percentage?: number | null;
  materials?: {
    name: string;
  } | null;
}

interface ServiceOrderDetailsData {
  id: string;
  sequence_number?: number;
  issue_date: string;
  service_date: string;
  supplier_id: string;
  suppliers: SupplierDetails;
  company_id: string;
  companies: CompanyDetails;
  equipment_name: string;
  service_type: string;
  detailed_service_description: string | null;
  destination_address: string;
  observations: string | null;
  currency: 'USD' | 'VES' | 'EUR';
  base_currency: 'USD' | 'EUR';
  exchange_rate: number | null;
  status: string;
  payment_terms?: string | null;
  custom_payment_terms?: string | null;
  credit_days?: number | null;
  user_id: string;
  created_at: string | null;
  service_order_items: ServiceOrderItem[];
  service_order_materials: ServiceOrderMaterial[];
}

const STATUS_TRANSLATIONS: Record<string, string> = {
  'Draft': 'Borrador',
  'Approved': 'Aprobada',
  'Credit': 'Crédito',
  'ToPay': 'Por pagar',
  'Paid': 'Pagada',
  'Rejected': 'Rechazada',
  'Archived': 'Archivada',
};

const formatSequenceNumber = (sequence?: number, dateString?: string): string => {
  if (!sequence) return 'N/A';
  const date = dateString ? new Date(dateString) : new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const seq = String(sequence).padStart(3, '0');
  return `OS-${year}-${month}-${seq}`;
};

const ServiceOrderDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { session, role } = useSession();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [isApproveConfirmOpen, setIsApproveConfirmOpen] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejectConfirmOpen, setIsRejectConfirmOpen] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isPayConfirmOpen, setIsPayConfirmOpen] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [isDocumentManagerOpen, setIsDocumentManagerOpen] = useState(false);

  const pdfViewerRef = React.useRef<ServiceOrderPDFViewerRef>(null);

  const parseDateForDisplay = (dateString: string): Date => {
    return new Date(dateString + 'T12:00:00');
  };

  const { data: order, isLoading, error } = useQuery<ServiceOrderDetailsData | null>({
    queryKey: ['serviceOrderDetails', id],
    queryFn: async () => {
      if (!id) throw new Error('Service Order ID is missing.');
      const details = await serviceOrderService.getById(id);
      if (!details) throw new Error('Service Order not found.');
      return details as unknown as ServiceOrderDetailsData;
    },
    enabled: !!id,
  });

  const { itemsForCalculation, groupedMaterials } = useMemo(() => {
    if (!order) return { itemsForCalculation: [], groupedMaterials: {} };

    const items = [
      ...(order.service_order_items?.map(item => ({
        quantity: item.quantity,
        unit_price: item.unit_price,
        tax_rate: item.tax_rate,
        is_exempt: item.is_exempt,
        sales_percentage: item.sales_percentage,
        discount_percentage: item.discount_percentage,
      })) || []),
      ...(order.service_order_materials?.map(item => ({
        quantity: item.quantity,
        unit_price: item.unit_price,
        tax_rate: item.tax_rate,
        is_exempt: item.is_exempt,
        sales_percentage: item.sales_percentage,
        discount_percentage: item.discount_percentage,
      })) || [])
    ];

    const groups: Record<string, { name: string; items: any[] }> = {};
    order.service_order_materials?.forEach(item => {
      const supplierId = item.supplier_id;
      // @ts-ignore
      const supplierName = item.suppliers?.name || "Proveedor desconocido";
      if (!groups[supplierId]) {
        groups[supplierId] = { name: supplierName, items: [] };
      }
      groups[supplierId].items.push(item);
    });

    return { itemsForCalculation: items, groupedMaterials: groups };
  }, [order]);

  const totals = calculateTotals(itemsForCalculation);
  const amountInWords = order ? numberToWords(totals.total, order.currency) : '';

  const totalInUSD = useMemo(() => {
    if (order?.currency === 'VES' && order.exchange_rate && order.exchange_rate > 0) {
      return (totals.total / order.exchange_rate).toFixed(2);
    }
    return null;
  }, [order, totals.total]);

  const generateFileName = () => {
    if (!order) return '';
    const sequence = formatSequenceNumber(order.sequence_number, order.created_at);
    // @ts-ignore
    const supplierName = order.suppliers?.name?.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_') || 'Proveedor';
    return `${sequence}-${supplierName}.pdf`;
  };

  const displayPaymentTerms = () => {
    if (order?.payment_terms === 'Otro' && order.custom_payment_terms) {
      return order.custom_payment_terms;
    }
    if (order?.payment_terms === 'Crédito' && order.credit_days) {
      return `Crédito (${order.credit_days} días)`;
    }
    return order?.payment_terms || 'Contado';
  };

  const handleApproveOrder = async () => {
    if (!order || order.status === 'Approved' || order.status === 'ToPay' || order.status === 'Archived') return;

    setIsApproveConfirmOpen(false);
    setIsApproving(true);
    const toastId = showLoading('Aprobando orden de servicio...');

    try {
      const isCredit = order.payment_terms === 'Crédito';
      // CXP paused: approve credit service orders directly as Approved instead of ToPay
      const targetStatus = 'Approved';
      const success = await serviceOrderService.updateStatus(order.id, targetStatus);
      if (success) {
        showSuccess(isCredit ? 'Orden de Servicio aprobada (Por Pagar) exitosamente.' : 'Orden de Servicio aprobada exitosamente.');
        queryClient.invalidateQueries({ queryKey: ['serviceOrderDetails', id] });
        queryClient.invalidateQueries({ queryKey: ['serviceOrders', 'Active'] });
        queryClient.invalidateQueries({ queryKey: ['serviceOrders', 'Approved'] });
      } else {
        throw new Error('Fallo al actualizar el estado.');
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Error al aprobar la orden de servicio.';
      showError(errorMessage);
    } finally {
      dismissToast(toastId);
      setIsApproving(false);
    }
  };

  const handlePayOrder = async () => {
    if (!order) return;

    setIsPayConfirmOpen(false);
    setIsPaying(true);
    const toastId = showLoading('Registrando pago...');

    try {
      // 1. Update service order status to Paid and paid_amount to the full total
      const { error: updateError } = await supabase
        .from('service_orders')
        .update({ status: 'Paid', paid_amount: totals.total })
        .eq('id', order.id);

      if (updateError) throw updateError;

      // 2. Insert into payment_transactions (Kardex log) for the remaining balance
      const currentPaid = order.paid_amount || 0;
      const remainingAmount = Number((totals.total - currentPaid).toFixed(2));

      if (remainingAmount > 0) {
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData?.user?.id || null;

        const { error: txError } = await supabase
          .from('payment_transactions')
          .insert({
            order_id: order.id,
            order_type: 'service_order',
            amount: remainingAmount,
            currency: order.currency,
            exchange_rate: null,
            converted_amount: remainingAmount,
            registered_by: userId,
            previous_paid: currentPaid,
            new_paid: totals.total,
            notes: 'Pago completo de saldo remanente registrado'
          });

        if (txError) throw txError;
      }

      showSuccess('Orden de Servicio marcada como pagada exitosamente.');
      queryClient.invalidateQueries({ queryKey: ['serviceOrderDetails', id] });
      queryClient.invalidateQueries({ queryKey: ['serviceOrders'] });
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : 'Error al registrar el pago.';
      showError(errorMessage);
    } finally {
      dismissToast(toastId);
      setIsPaying(false);
    }
  };

  const handleRejectOrder = async () => {
    if (!order || order.status === 'Rejected') return;

    setIsRejectConfirmOpen(false);
    setIsRejecting(true);
    const toastId = showLoading('Rechazando orden...');

    try {
      const success = await serviceOrderService.updateStatus(order.id, 'Rejected');
      if (success) {
        showSuccess('Orden de Servicio rechazada exitosamente.');
        queryClient.invalidateQueries({ queryKey: ['serviceOrderDetails', id] });
        queryClient.invalidateQueries({ queryKey: ['serviceOrders'] });
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
      const success = await serviceOrderService.updateStatus(order.id, newStatus as any);
      if (success) {
        showSuccess(`Estado cambiado a ${STATUS_TRANSLATIONS[newStatus] || newStatus} exitosamente.`);
        queryClient.invalidateQueries({ queryKey: ['serviceOrderDetails', id] });
        queryClient.invalidateQueries({ queryKey: ['serviceOrders'] });
      } else {
        throw new Error('Error al actualizar el estado.');
      }
    } catch (error: any) {
      showError(error.message || 'Error al cambiar el estado.');
    } finally {
      dismissToast(toastId);
    }
  };

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result);
      };
      reader.onerror = (error) => {
        console.error('[ServiceOrderDetails] Error converting blob to base64:', error);
        reject(error);
      };
      reader.readAsDataURL(blob);
    });
  };

  const handleSendEmail = async (customMessage: string) => {
    if (!session?.user?.email || !order) return;

    const toastId = showLoading('Generando PDF y enviando correo...');

    try {
      const pdfResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-so-pdf`, {
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
        <h2>Orden de Servicio #${formatSequenceNumber(order.sequence_number, order.created_at)}</h2>
        <p><strong>Empresa:</strong> ${
        // @ts-ignore
        order.companies?.name
        }</p>
        <p><strong>Proveedor:</strong> ${
        // @ts-ignore
        order.suppliers?.name
        }</p>
        <p><strong>Fecha de Servicio:</strong> ${order.service_date ? format(parseDateForDisplay(order.service_date), 'PPP', { locale: es }) : 'N/A'}</p>
        <p><strong>Condición de Pago:</strong> ${
        // @ts-ignore
        order.suppliers?.payment_terms || 'Contado'
        }</p>
        ${customMessage ? `<p><strong>Mensaje:</strong><br>${customMessage.replace(/\n/g, '<br>')}</p>` : ''}
        <p>Se adjunta el PDF con los detalles de la orden de servicio.</p>
      `;

      const emailResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // @ts-ignore
          to: order.suppliers?.email,
          // @ts-ignore
          subject: `Orden de Servicio #${formatSequenceNumber(order.sequence_number, order.created_at)} - ${order.companies?.name}`,
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

      showSuccess('Correo enviado exitosamente.');
      setIsEmailModalOpen(false);

    } catch (error: unknown) {
      console.error('[ServiceOrderDetails] Error sending email:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido al enviar el correo.';
      showError(errorMessage);
    } finally {
      dismissToast(toastId);
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
          <Link to="/service-order-management">Volver a la gestión de órdenes</Link>
        </Button>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="container mx-auto p-4 text-center text-muted-foreground">
        Orden de servicio no encontrada.
        <Button asChild variant="link" className="mt-4">
          <Link to="/service-order-management">Volver a la gestión de órdenes</Link>
        </Button>
      </div>
    );
  }

  const isEditable = (order.status === 'Draft' || role === 'admin') && order.status !== 'Archived' && role !== 'payment_viewer';

  const handleModalOpenChange = (open: boolean) => {
    setIsModalOpen(open);
    if (!open && pdfViewerRef.current) {
      pdfViewerRef.current.handleClose();
    }
  };

  const getStatusColorClass = (status: string) => {
    switch (status) {
      case 'Draft': return 'bg-amber-50 text-procarni-alert border-amber-200';
      case 'Approved': return 'bg-green-50 text-procarni-secondary border-green-200';
      case 'Credit': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'ToPay': return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'Paid': return 'bg-teal-50 text-teal-700 border-teal-200';
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
      <div className="relative md:sticky md:top-0 z-20 backdrop-blur-xl bg-white/80 border border-slate-100/80 rounded-3xl p-4 mb-8 shadow-xl shadow-gray-200/50 ring-1 ring-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-all duration-300">

        {/* Title & Status */}
        <div className="flex items-center gap-3 w-full md:w-auto">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="text-slate-400 hover:text-procarni-primary hover:bg-slate-100/80 rounded-2xl h-10 w-10 shrink-0 group transition-all"
            title="Volver"
          >
            <ArrowLeft className="h-5 w-5 group-hover:-translate-x-1 transition-transform" />
          </Button>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-extrabold font-mono text-procarni-dark tracking-tight">
                {formatSequenceNumber(order.sequence_number, order.created_at)}
              </h1>

              {role === 'payment_viewer' ? (
                <span
                  className={cn(
                    "inline-flex h-7 px-3 py-0.5 text-xs font-extrabold border rounded-full items-center shadow-sm",
                    getStatusColorClass(order.status)
                  )}
                >
                  {STATUS_TRANSLATIONS[order.status] || order.status}
                </span>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        "h-7 px-3 py-0.5 text-xs font-extrabold rounded-full shadow-sm border flex gap-1.5 items-center transition-all hover:scale-[1.02]",
                        getStatusColorClass(order.status)
                      )}
                    >
                      {STATUS_TRANSLATIONS[order.status] || order.status}
                      <ChevronDown className="h-3 w-3 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-44 rounded-2xl p-1.5 shadow-xl border-slate-100">
                    <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-slate-400 font-bold px-2 py-1">Cambiar Estado</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {Object.entries(STATUS_TRANSLATIONS).map(([status, label]) => {
                      const isRestrictedState = order.status === 'Rejected' || order.status === 'Archived';
                      const isDisabled = isRestrictedState && role !== 'admin' && status !== order.status;

                      return (
                        <DropdownMenuItem
                          key={status}
                          onSelect={() => handleStatusChange(status)}
                          className={cn("rounded-xl text-xs font-semibold px-2 py-1.5 cursor-pointer", status === order.status && "bg-slate-100 text-procarni-dark")}
                          disabled={isDisabled}
                        >
                          {label}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            <span className="text-xs text-slate-500 font-medium italic mt-0.5">
              Orden de Servicio • {order.companies?.name || 'Procarni'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          <div className="flex items-center gap-2 ml-auto">
            {role === 'payment_viewer' ? (
              <>
                {(order.status === 'Credit' || order.status === 'ToPay') && (
                  <Button
                    onClick={() => setIsPayConfirmOpen(true)}
                    disabled={isPaying}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-sm"
                    size="sm"
                  >
                    <Clock className="h-4 w-4" />
                    <span>Marcar como Pagada</span>
                  </Button>
                )}
                <Button onClick={() => setIsModalOpen(true)} variant="outline" size="sm" className="gap-2">
                  <FileText className="h-4 w-4" />
                  <span>Previsualizar</span>
                </Button>
                <PDFDownloadButton
                  orderId={order.id}
                  fileNameGenerator={generateFileName}
                  endpoint="generate-so-pdf"
                  label="Descargar PDF"
                  size="sm"
                  variant="outline"
                  className="h-9 px-3 text-xs font-semibold rounded-lg"
                />
              </>
            ) : (
              <>
                {/* Primary Actions: Approve and Edit */}
                {(order.status === 'Draft' || role === 'admin') && 
                  order.status !== 'Approved' && 
                  order.status !== 'Credit' && 
                  order.status !== 'ToPay' && 
                  order.status !== 'Paid' && 
                  order.status !== 'Archived' && (
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

                {(order.status === 'Credit' || order.status === 'ToPay') && (
                  <Button
                    onClick={() => setIsPayConfirmOpen(true)}
                    disabled={isPaying}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-sm order-2 md:order-1"
                    size="sm"
                  >
                    <Clock className="h-4 w-4" />
                    <span>Marcar como Pagada</span>
                  </Button>
                )}

                {isEditable && (
                  <Button onClick={() => navigate(`/service-orders/edit/${order.id}`)} variant="outline" size="sm" className="gap-2 order-1 md:order-2">
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
                        endpoint="generate-so-pdf"
                        label="Descargar PDF"
                        variant="ghost"
                        className="w-full justify-start cursor-pointer px-2 py-1.5 h-auto font-normal text-sm"
                      />
                    </DropdownMenuItem>
                    
                    <DropdownMenuItem onSelect={() => setIsDocumentManagerOpen(true)}>
                      <Paperclip className="mr-2 h-4 w-4" /> Documentos Adjuntos
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      onSelect={() => setIsEmailModalOpen(true)}
                      disabled={
                        // @ts-ignore
                        !order.suppliers?.email
                      }
                    >
                      <Mail className="mr-2 h-4 w-4" /> Enviar por Correo
                    </DropdownMenuItem>

                    <DropdownMenuItem 
                      onSelect={() => setIsWhatsAppModalOpen(true)} 
                      disabled={
                        // @ts-ignore
                        !order.suppliers?.phone && !order.suppliers?.phone_2
                      }
                    >
                      <Smartphone className="mr-2 h-4 w-4" /> Enviar por WhatsApp
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Operaciones</DropdownMenuLabel>

                    {(order.status === 'Draft' || role === 'admin') && order.status !== 'Archived' && order.status !== 'Rejected' && (
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
              </>
            )}

            {/* Preview Dialog remains (triggered from dropdown) */}
            <Dialog open={isModalOpen} onOpenChange={handleModalOpenChange}>
              <DialogContent className="max-w-5xl h-[95vh] flex flex-col p-0 gap-0">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                  <DialogTitle>Previsualización de Documento</DialogTitle>
                  <Button variant="ghost" size="sm" onClick={() => setIsModalOpen(false)}>Cerrar</Button>
                </div>
                <div className="flex-1 overflow-hidden bg-gray-100">
                  <ServiceOrderPDFViewer
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
      <Card className="border-none bg-white/70 backdrop-blur-xl shadow-2xl shadow-gray-200/50 ring-1 ring-white rounded-3xl p-6 mb-8 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-500">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
          {/* Company */}
          <div className="space-y-1">
            <span className={microLabelClass}>Empresa</span>
            {/* @ts-ignore */}
            <p className={valueClass}>{order.companies?.name || 'N/A'}</p>
            {/* @ts-ignore */}
            <p className="text-xs text-gray-500">{order.companies?.rif}</p>
          </div>

          {/* Supplier */}
          <div className="space-y-1">
            <span className={microLabelClass}>Proveedor</span>
            {/* @ts-ignore */}
            <p className={valueClass}>
              <Link to={`/suppliers/${order.supplier_id}`} className="hover:underline text-procarni-primary font-semibold">
                {order.suppliers?.name || 'N/A'}
              </Link>
            </p>
            {/* @ts-ignore */}
            <p className="text-xs text-gray-500">{order.suppliers?.rif}</p>
          </div>

          {/* Dates */}
          <div className="space-y-1">
            <span className={microLabelClass}>Fecha Emisión</span>
            <p className={valueClass}>
              {order.issue_date ? format(parseDateForDisplay(order.issue_date), 'PPP', { locale: es }) : format(new Date(order.created_at || new Date()), 'PPP', { locale: es })}
            </p>
          </div>

          <div className="space-y-1">
            <span className={microLabelClass}>Fecha de Servicio</span>
            <p className={valueClass}>
              {order.service_date ? format(parseDateForDisplay(order.service_date), 'PPP', { locale: es }) : 'N/A'}
            </p>
          </div>

          {/* Equipment */}
          <div className="space-y-1">
            <span className={microLabelClass}>Equipo / Maquinaria</span>
            <p className={valueClass}>{order.equipment_name || 'N/A'}</p>
          </div>

          {/* Service Type */}
          <div className="space-y-1">
            <span className={microLabelClass}>Tipo de Servicio</span>
            <p className={valueClass}>{order.service_type || 'N/A'}</p>
          </div>

          {/* Destination */}
          <div className="space-y-1">
            <span className={microLabelClass}>Dirección Destino</span>
            <p className={valueClass}>{order.destination_address || 'N/A'}</p>
          </div>

          {/* Condición de Pago */}
          <div className="space-y-1">
            <span className={microLabelClass}>Condición de Pago</span>
            <p className={valueClass}>{displayPaymentTerms()}</p>
          </div>
        </div>

        {/* Details & Observations */}
        <div className="mt-6 space-y-4">
          {order.detailed_service_description && (
            <div className="p-4 bg-slate-50/80 border border-slate-100 rounded-2xl">
              <span className={microLabelClass}>Detalle del Servicio</span>
              <p className="whitespace-pre-wrap text-slate-700">{order.detailed_service_description}</p>
            </div>
          )}

          {order.observations && (
            <div className="p-4 bg-slate-50/80 border border-slate-100 rounded-2xl flex gap-3 text-sm text-slate-600">
              <Paperclip className="h-4 w-4 flex-shrink-0 mt-0.5 text-slate-400" />
              <div>
                <span className="font-semibold text-slate-700 block mb-1">Observaciones:</span>
                <p className="whitespace-pre-wrap">{order.observations}</p>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* PHASE 3: SERVICES LIST (READ-ONLY) */}
      {order.service_order_items && order.service_order_items.length > 0 && (
        <Card className="mb-8 border-none bg-white/70 backdrop-blur-xl shadow-2xl shadow-gray-200/50 ring-1 ring-white rounded-3xl overflow-hidden">
          <div className="bg-slate-50/70 px-6 py-3 border-b border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center">
              <Wrench className="h-3.5 w-3.5 mr-2 text-procarni-primary" /> Servicios
            </h3>
          </div>
          <CardContent className="p-0">
            {isMobile ? (
              <div className="divide-y divide-slate-100">
                {order.service_order_items.map((item) => {
                  const qty = Number(item.quantity || 1);
                  const unitPrice = Number(item.unit_price || 0);
                  const subtotal = qty * unitPrice;
                  const tax = item.is_exempt ? 0 : subtotal * (item.tax_rate ?? 0.16);
                  const lineTotal = subtotal + tax;

                  return (
                    <div key={item.id} className="p-4 bg-white space-y-2">
                      <div className="flex justify-between items-start gap-2">
                        <span className="font-bold text-xs text-procarni-dark flex-1">{item.description}</span>
                        <div className="text-right shrink-0">
                          <span className="text-[9px] uppercase text-slate-400 font-bold block">Total Ítem</span>
                          <span className="font-mono text-xs font-extrabold text-procarni-dark">
                            {lineTotal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {order.currency}
                          </span>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100 font-mono">
                        <div>
                          <span className="text-[9px] uppercase text-slate-400 block font-semibold">Cant.</span>
                          <span className="font-bold text-slate-800">{qty}</span>
                        </div>
                        <div>
                          <span className="text-[9px] uppercase text-slate-400 block font-semibold">P. Unit</span>
                          <span>{unitPrice.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[9px] uppercase text-slate-400 block font-semibold">IVA</span>
                          <span>{tax.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-slate-50/70 border-b border-slate-100">
                  <TableRow className="border-b border-slate-100 hover:bg-transparent">
                    <TableHead className={tableHeaderClass + " h-10 py-2 pl-6"}>Descripción</TableHead>
                    <TableHead className={tableHeaderClass + " h-10 py-2 text-right"}>Cant.</TableHead>
                    <TableHead className={tableHeaderClass + " h-10 py-2 text-right"}>Precio ({order.currency})</TableHead>
                    <TableHead className={tableHeaderClass + " h-10 py-2 text-right"}>Subtotal ({order.currency})</TableHead>
                    <TableHead className={tableHeaderClass + " h-10 py-2 text-center"}>IVA</TableHead>
                    <TableHead className={tableHeaderClass + " h-10 py-2 text-right pr-6"}>Total ({order.currency})</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.service_order_items.map((item) => {
                    const qty = Number(item.quantity || 1);
                    const unitPrice = Number(item.unit_price || 0);
                    const subtotal = qty * unitPrice;
                    const tax = item.is_exempt ? 0 : subtotal * (item.tax_rate ?? 0.16);
                    const lineTotal = subtotal + tax;

                    return (
                      <TableRow key={item.id} className="border-b border-slate-100/60 hover:bg-slate-50/50 transition-colors last:border-b-0">
                        <TableCell className="pl-6 py-4 font-bold text-procarni-dark text-sm">{item.description}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-slate-700">{qty}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-slate-700">{unitPrice.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-slate-700">{subtotal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                        <TableCell className="text-center">
                          {item.is_exempt ? (
                            <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md font-semibold">Exento</span>
                          ) : (
                            <span className="text-[10px] text-slate-500 font-semibold font-mono">{((item.tax_rate ?? 0.16) * 100).toFixed(0)}%</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-bold text-procarni-dark pr-6">{lineTotal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* PHASE 4: SPARE PARTS (READ-ONLY) */}
      {Object.keys(groupedMaterials).length > 0 && (
        <div className="mb-8 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Package className="h-4 w-4 text-procarni-primary" />
            <h3 className="font-semibold text-procarni-primary">Repuestos y Adicionales</h3>
          </div>

          {Object.entries(groupedMaterials).map(([supplierId, group]) => (
            <Card key={supplierId} className="border-none bg-white/70 backdrop-blur-xl shadow-2xl shadow-gray-200/50 ring-1 ring-white rounded-3xl overflow-hidden">
              <div className="bg-slate-50/70 px-6 py-3 border-b border-slate-100 flex justify-between items-center">
                <span className="text-sm font-bold text-slate-700">{group.name}</span>
                <Button
                  size="sm"
                  variant="default"
                  className="h-7 text-xs bg-procarni-secondary hover:bg-green-700 text-white rounded-xl shadow-sm"
                  onClick={() => {
                    navigate('/generate-po', {
                      state: {
                        serviceOrder: order,
                        serviceOrderItems: group.items,
                        supplier: { id: supplierId, name: group.name }
                      }
                    });
                  }}
                >
                  Generar OC
                </Button>
              </div>
              <CardContent className="p-0">
                {isMobile ? (
                  <div className="divide-y divide-slate-100">
                    {group.items.map((item: any) => {
                      const qty = Number(item.quantity || 1);
                      const unitPrice = Number(item.unit_price || 0);
                      const subtotal = qty * unitPrice;
                      const tax = item.is_exempt ? 0 : subtotal * (item.tax_rate ?? 0.16);
                      const lineTotal = subtotal + tax;

                      return (
                        <div key={item.id} className="p-4 bg-white space-y-2">
                          <div className="flex justify-between items-start gap-2">
                            <div className="flex flex-col gap-1 min-w-0">
                              {/* @ts-ignore */}
                              <span className="font-bold text-xs text-procarni-dark">{item.material_name || item.materials?.name || 'Material'}</span>
                              {/* @ts-ignore */}
                              {item.materials?.name && item.material_name && item.materials.name !== item.material_name && (
                                <Badge variant="outline" className="w-fit text-[9px] bg-amber-50 text-amber-700 border-amber-200 py-0 h-4">
                                  Nuevo: {item.materials.name}
                                </Badge>
                              )}
                              {item.description && <p className="text-xs text-slate-500 italic">{item.description}</p>}
                            </div>
                            <div className="text-right shrink-0">
                              <span className="text-[9px] uppercase text-slate-400 font-bold block">Total Ítem</span>
                              <span className="font-mono text-xs font-extrabold text-procarni-dark">
                                {lineTotal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {order.currency}
                              </span>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100 font-mono">
                            <div>
                              <span className="text-[9px] uppercase text-slate-400 block font-semibold">Cant.</span>
                              <span className="font-bold text-slate-800">{qty}</span>
                            </div>
                            <div>
                              <span className="text-[9px] uppercase text-slate-400 block font-semibold">P. Unit</span>
                              <span>{unitPrice.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-[9px] uppercase text-slate-400 block font-semibold">IVA</span>
                              <span>{tax.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <Table>
                    <TableHeader className="bg-slate-50/70 border-b border-slate-100">
                      <TableRow className="border-b border-slate-100 hover:bg-transparent">
                        <TableHead className={tableHeaderClass + " h-10 py-2 pl-6"}>Material / Descripción</TableHead>
                        <TableHead className={tableHeaderClass + " h-10 py-2 text-right"}>Cant.</TableHead>
                        <TableHead className={tableHeaderClass + " h-10 py-2 text-right"}>Precio ({order.currency})</TableHead>
                        <TableHead className={tableHeaderClass + " h-10 py-2 text-right"}>Subtotal ({order.currency})</TableHead>
                        <TableHead className={tableHeaderClass + " h-10 py-2 text-center"}>IVA</TableHead>
                        <TableHead className={tableHeaderClass + " h-10 py-2 text-right pr-6"}>Total ({order.currency})</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.items.map((item: any) => {
                        const qty = Number(item.quantity || 1);
                        const unitPrice = Number(item.unit_price || 0);
                        const subtotal = qty * unitPrice;
                        const tax = item.is_exempt ? 0 : subtotal * (item.tax_rate ?? 0.16);
                        const lineTotal = subtotal + tax;

                        return (
                          <TableRow key={item.id} className="border-b border-slate-100/60 hover:bg-slate-50/50 transition-colors last:border-b-0">
                            <TableCell className="pl-6 py-4 text-sm">
                              {/* @ts-ignore */}
                              <span className="font-bold text-procarni-dark block">{item.material_name || item.materials?.name || 'Material'}</span>
                              {/* @ts-ignore */}
                              {item.materials?.name && item.material_name && item.materials.name !== item.material_name && (
                                <Badge variant="outline" className="mt-1 text-[10px] bg-amber-50 text-amber-700 border-amber-200 py-0 h-4">
                                  Nuevo nombre: {item.materials.name}
                                </Badge>
                              )}
                              {item.description && <span className="text-xs text-slate-500 italic block mt-0.5">{item.description}</span>}
                              <PriceAlert
                                materialId={item.material_id}
                                unitId={item.unit_id}
                                currentPrice={item.unit_price}
                                currency={order.currency}
                                exchangeRate={order.exchange_rate}
                                currentOrderId={order.id}
                              />
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-slate-700">{qty}</TableCell>
                            <TableCell className="text-right font-mono text-sm text-slate-700">{unitPrice.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                            <TableCell className="text-right font-mono text-sm text-slate-700">{subtotal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                            <TableCell className="text-center">
                              {item.is_exempt ? (
                                <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md font-semibold">Exento</span>
                              ) : (
                                <span className="text-[10px] text-slate-500 font-semibold font-mono">{((item.tax_rate ?? 0.16) * 100).toFixed(0)}%</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm font-bold text-procarni-dark pr-6">{lineTotal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* PHASE 5: TOTALS ("TICKET DE CAJA") */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-6 mb-12">
        <div className="w-full md:w-1/2 text-xs text-slate-400 italic px-2">
          Importe en letras: {amountInWords}
        </div>

        <div className="w-full md:w-auto min-w-[340px] bg-white/80 backdrop-blur-xl rounded-3xl border border-slate-100 shadow-xl shadow-gray-200/50 ring-1 ring-white p-6 space-y-3">
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-500 font-medium">Base Imponible</span>
            <span className="font-mono font-semibold text-slate-700">{order.currency} {totals.baseImponible.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>

          {totals.montoDescuento > 0 && (
            <div className="flex justify-between items-center text-sm text-red-600">
              <span className="font-medium">Descuento</span>
              <span className="font-mono">- {order.currency} {totals.montoDescuento.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          )}

          {totals.montoVenta > 0 && (
            <div className="flex justify-between items-center text-sm text-blue-600">
              <span className="font-medium">Margen Comercial</span>
              <span className="font-mono">+ {order.currency} {totals.montoVenta.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          )}

          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-500 font-medium">Monto IVA (16%)</span>
            <span className="font-mono font-semibold text-slate-700">+ {order.currency} {totals.montoIVA.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>

          <div className="h-px border-b border-dashed border-slate-200 my-2" />

          <div className="flex justify-between items-center text-lg">
            <span className="font-bold text-procarni-dark">Total Final</span>
            <span className="font-mono font-black text-procarni-primary text-xl">{order.currency} {totals.total.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>

          {totalInUSD && order.currency === 'VES' && (
            <div className="flex justify-end pt-1">
              <span className="text-xs font-medium text-slate-500 bg-slate-100/80 px-2.5 py-1 rounded-full border border-slate-200/50">
                Ref. USD {totalInUSD} (@ {order.exchange_rate?.toFixed(2)})
              </span>
            </div>
          )}

          {/* Abonos Progress Bar */}
          {order.payment_terms === 'Crédito' && (
            <div className="mt-4 p-3 bg-slate-50 border border-slate-100 rounded-2xl space-y-2">
              <div className="flex justify-between text-xs font-bold text-gray-500">
                <span>Abonado: {order.currency} {(order.paid_amount || 0).toFixed(2)}</span>
                <span>{Math.min(100, Math.max(0, Math.round(((order.paid_amount || 0) / totals.total) * 100)))}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <div 
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    order.status === 'Paid' ? "bg-green-500" : "bg-procarni-primary"
                  )}
                  style={{ width: `${Math.min(100, Math.max(0, Math.round(((order.paid_amount || 0) / totals.total) * 100)))}%` }}
                />
              </div>
              <div className="text-[10px] text-right text-gray-400 font-medium italic">
                Pendiente: {order.currency} {(totals.total - (order.paid_amount || 0)).toFixed(2)}
              </div>
            </div>
          )}
        </div>
      </div>



      <EmailSenderModal
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        // @ts-ignore
        onSend={(message) => handleSendEmail(message)}
        // @ts-ignore
        recipientEmail={order.suppliers?.email || ''}
        documentType="Orden de Servicio"
        documentId={order.id}
      />

      <AlertDialog open={isApproveConfirmOpen} onOpenChange={setIsApproveConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Aprobación</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas aprobar esta Orden de Servicio? Esto marcará la orden como finalizada.
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

      <AlertDialog open={isPayConfirmOpen} onOpenChange={setIsPayConfirmOpen}>
        <AlertDialogContent className="max-w-md bg-white/95 backdrop-blur-xl border-none shadow-2xl rounded-[2rem] p-6">
          <AlertDialogHeader className="space-y-2">
            <AlertDialogTitle className="text-xl font-extrabold tracking-tight text-procarni-dark flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-emerald-600" />
              Marcar como Pagada
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-gray-500 font-medium leading-relaxed">
              ¿Estás seguro de que deseas registrar el pago de esta Orden de Servicio? Esta acción cambiará su estado a "Pagada" y completará el flujo comercial de la misma.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 mt-4">
            <AlertDialogCancel disabled={isPaying} className="rounded-xl h-10 font-bold border-gray-200 hover:bg-slate-50">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handlePayOrder} disabled={isPaying} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl h-10 shadow-lg shadow-emerald-600/20">
              {isPaying ? 'Registrando...' : 'Confirmar Pago'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isRejectConfirmOpen} onOpenChange={setIsRejectConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Rechazo</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas rechazar esta Orden de Servicio?
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
      <WhatsAppShareModal
        isOpen={isWhatsAppModalOpen}
        onClose={() => setIsWhatsAppModalOpen(false)}
        orderId={order.id}
        type="service"
        // @ts-ignore
        supplierName={order.suppliers?.name || 'Proveedor'}
        orderNumber={formatSequenceNumber(order.sequence_number, order.created_at)}
        phones={{
          // @ts-ignore
          primary: order.suppliers?.phone || null,
          // @ts-ignore
          secondary: order.suppliers?.phone_2 || null
        }}
      />

      {order && (
        <OrderDocumentManager
          orderId={order.id}
          orderType="SO"
          // @ts-ignore
          supplierName={order.suppliers?.name || 'Proveedor'}
          sequenceNumber={formatSequenceNumber(order.sequence_number, order.created_at)}
          isOpen={isDocumentManagerOpen}
          onOpenChange={setIsDocumentManagerOpen}
        />
      )}
    </div>
  );
};

export default ServiceOrderDetails;