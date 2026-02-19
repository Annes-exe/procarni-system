// src/pages/ServiceOrderDetails.tsx

import React, { useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Edit, FileText, Mail, CheckCircle, Smartphone, Printer, MoreVertical, Paperclip, Wrench, Package, ListOrdered, Calendar, User, MapPin } from 'lucide-react';
import { MadeWithDyad } from '@/components/made-with-dyad';
import { serviceOrderService } from '@/services/serviceOrderService';
import { showError, showSuccess, showLoading, dismissToast } from '@/utils/toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import ServiceOrderPDFViewer, { ServiceOrderPDFViewerRef } from '@/components/ServiceOrderPDFViewer';
import PDFDownloadButton from '@/components/PDFDownloadButton';
import WhatsAppSenderButton from '@/components/WhatsAppSenderButton';
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

const STATUS_TRANSLATIONS: Record<string, string> = {
  'Draft': 'Borrador',
  'Sent': 'Enviada',
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
  return `OS-${year}-${month}-${seq}`;
};

const ServiceOrderDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { session } = useSession();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [isApproveConfirmOpen, setIsApproveConfirmOpen] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

  const pdfViewerRef = React.useRef<ServiceOrderPDFViewerRef>(null);

  const parseDateForDisplay = (dateString: string): Date => {
    return new Date(dateString + 'T12:00:00');
  };

  const { data: order, isLoading, error } = useQuery({
    queryKey: ['serviceOrderDetails', id],
    queryFn: async () => {
      if (!id) throw new Error('Service Order ID is missing.');
      const details = await serviceOrderService.getById(id);
      if (!details) throw new Error('Service Order not found.');
      return details;
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

  const handleApproveOrder = async () => {
    if (!order || order.status === 'Approved' || order.status === 'Archived') return;

    setIsApproveConfirmOpen(false);
    setIsApproving(true);
    const toastId = showLoading('Aprobando orden de servicio...');

    try {
      const success = await serviceOrderService.updateStatus(order.id, 'Approved');
      if (success) {
        showSuccess('Orden de Servicio aprobada exitosamente.');
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

  const handleSendEmail = async (customMessage: string, sendWhatsApp: boolean, phone?: string) => {
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

      if (sendWhatsApp && phone) {
        const formattedPhone = phone.replace(/\D/g, '');
        const finalPhone = formattedPhone.startsWith('58') ? formattedPhone : `58${formattedPhone}`;
        // @ts-ignore
        const whatsappMessage = `Hola, te he enviado por correo la Orden de Servicio #${formatSequenceNumber(order.sequence_number, order.created_at)} de ${order.companies?.name}. Por favor, revisa tu bandeja de entrada.`;
        const whatsappUrl = `https://wa.me/${finalPhone}?text=${encodeURIComponent(whatsappMessage)}`;
        window.open(whatsappUrl, '_blank');
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

  const isEditable = order.status !== 'Approved' && order.status !== 'Archived';

  const handleModalOpenChange = (open: boolean) => {
    setIsModalOpen(open);
    if (!open && pdfViewerRef.current) {
      pdfViewerRef.current.handleClose();
    }
  };

  const getStatusColorClass = (status: string) => {
    switch (status) {
      case 'Draft': return 'bg-amber-50 text-procarni-alert border-amber-200';
      case 'Sent': return 'bg-blue-50 text-blue-700 border-blue-200';
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
            <Badge className={cn("ml-2 pointer-events-none rounded-md px-2.5 py-0.5 text-xs font-semibold shadow-none border", getStatusColorClass(order.status))} variant="outline">
              {STATUS_TRANSLATIONS[order.status] || order.status}
            </Badge>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          <div className="flex items-center gap-2 ml-auto md:ml-0">
            {/* PDF Preview */}
            <Dialog open={isModalOpen} onOpenChange={handleModalOpenChange}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="hidden md:flex gap-2">
                  <FileText className="h-4 w-4" />
                  <span className="hidden lg:inline">Previsualizar</span>
                </Button>
              </DialogTrigger>
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

            <PDFDownloadButton
              orderId={order.id}
              fileNameGenerator={generateFileName}
              endpoint="generate-so-pdf"
              label="PDF"
              variant="outline"
              size="sm"
              className="hidden md:flex"
            />

            <Button variant="outline" size="sm" onClick={() => setIsEmailModalOpen(true)} disabled={
              // @ts-ignore
              !order.suppliers?.email
            } className="hidden md:flex gap-2">
              <Mail className="h-4 w-4" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="md:hidden">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Acciones</DropdownMenuLabel>
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
                    className="w-full justify-start cursor-pointer px-2 py-1.5 h-auto font-normal"
                  />
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setIsEmailModalOpen(true)} disabled={
                  // @ts-ignore
                  !order.suppliers?.email
                }>
                  <Mail className="mr-2 h-4 w-4" /> Enviar por Correo
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <WhatsAppSenderButton
                    // @ts-ignore
                    recipientPhone={order.suppliers?.phone}
                    documentType="Orden de Servicio"
                    documentId={order.id}
                    documentNumber={formatSequenceNumber(order.sequence_number, order.created_at)}
                    // @ts-ignore
                    companyName={order.companies?.name || ''}
                    variant="ghost"
                    className="w-full justify-start cursor-pointer px-2 py-1.5 h-auto font-normal"
                    label="Enviar por WhatsApp"
                  />
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {isEditable && order.status !== 'Approved' && (
              <Button
                onClick={() => setIsApproveConfirmOpen(true)}
                disabled={isApproving}
                className="bg-green-600 hover:bg-green-700 text-white gap-2 shadow-sm"
                size="sm"
              >
                <CheckCircle className="h-4 w-4" />
                <span className="hidden sm:inline">Aprobar Orden</span>
              </Button>
            )}

            {isEditable && (
              <Button onClick={() => navigate(`/service-orders/edit/${order.id}`)} variant="outline" size="sm" className="gap-2">
                <Edit className="h-4 w-4" />
                <span className="hidden sm:inline">Editar</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* PHASE 2: GENERAL INFORMATION GRID */}
      <div className="mb-10 animate-in fade-in slide-in-from-bottom-2 duration-500">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 px-1 text-sm">
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
            <p className={valueClass}>{order.suppliers?.name || 'N/A'}</p>
            {/* @ts-ignore */}
            <p className="text-xs text-gray-500">{order.suppliers?.rif}</p>
          </div>

          {/* Service Date */}
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
          <div className="space-y-1 md:col-span-2">
            <span className={microLabelClass}>Dirección Destino</span>
            <p className={valueClass}>{order.destination_address || 'N/A'}</p>
          </div>

        </div>

        {/* Details & Observations */}
        <div className="mt-6 space-y-4">
          {order.detailed_service_description && (
            <div className="p-4 bg-gray-50 border border-gray-100 rounded-md">
              <span className={microLabelClass}>Detalle del Servicio</span>
              <p className="whitespace-pre-wrap text-gray-700">{order.detailed_service_description}</p>
            </div>
          )}

          {order.observations && (
            <div className="p-4 bg-gray-50 border border-gray-100 rounded-md flex gap-3 text-sm text-gray-600 max-w-4xl">
              <Paperclip className="h-4 w-4 flex-shrink-0 mt-0.5 text-gray-400" />
              <div>
                <span className="font-semibold text-gray-700 block mb-1">Observaciones:</span>
                <p className="whitespace-pre-wrap">{order.observations}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* PHASE 3: SERVICES LIST (READ-ONLY) */}
      {order.service_order_items && order.service_order_items.length > 0 && (
        <Card className="mb-8 border-gray-200 shadow-sm overflow-hidden">
          <div className="bg-gray-50/80 px-6 py-3 border-b border-gray-100">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 flex items-center">
              <Wrench className="h-3 w-3 mr-2" /> Servicios
            </h3>
          </div>
          <CardContent className="p-0">
            {isMobile ? (
              <div className="divide-y divide-gray-100">
                {order.service_order_items.map((item) => (
                  <div key={item.id} className="p-4 bg-white">
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-medium text-procarni-dark">{item.description}</span>
                      <span className="font-mono text-sm font-semibold">{order.currency} {(item.quantity * item.unit_price).toFixed(2)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-y-2 text-xs text-gray-600">
                      <div>
                        <span className="text-[10px] uppercase text-gray-400 block">Cant.</span>
                        {item.quantity}
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] uppercase text-gray-400 block">Precio Unitarios</span>
                        {item.unit_price.toFixed(2)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-gray-100 hover:bg-transparent">
                    <TableHead className={tableHeaderClass + " h-9 py-2 pl-6"}>Descripción</TableHead>
                    <TableHead className={tableHeaderClass + " h-9 py-2 text-right"}>Cant.</TableHead>
                    <TableHead className={tableHeaderClass + " h-9 py-2 text-right"}>Precio ({order.currency})</TableHead>
                    <TableHead className={tableHeaderClass + " h-9 py-2 text-center"}>IVA</TableHead>
                    <TableHead className={tableHeaderClass + " h-9 py-2 text-right pr-6"}>Subtotal ({order.currency})</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.service_order_items.map((item) => {
                    const subtotal = item.quantity * item.unit_price;
                    return (
                      <TableRow key={item.id} className="border-b border-gray-50 hover:bg-gray-50/30">
                        <TableCell className="pl-6 py-4 font-medium text-procarni-dark text-sm">{item.description}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-gray-600">{item.quantity}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-gray-600">{item.unit_price.toFixed(2)}</TableCell>
                        <TableCell className="text-center">
                          {item.is_exempt ? (
                            <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">Exento</span>
                          ) : (
                            <span className="text-[10px] text-gray-400">{(item.tax_rate * 100).toFixed(0)}%</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-medium text-procarni-dark pr-6">{subtotal.toFixed(2)}</TableCell>
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
            <Card key={supplierId} className="border-gray-200 shadow-sm overflow-hidden">
              <div className="bg-gray-50/80 px-6 py-3 border-b border-gray-100 flex justify-between items-center">
                <span className="text-sm font-semibold text-gray-700">{group.name}</span>
                <Button
                  size="sm"
                  variant="default"
                  className="h-7 text-xs bg-procarni-secondary hover:bg-green-700 text-white"
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
                  <div className="divide-y divide-gray-100">
                    {group.items.map((item: any) => (
                      <div key={item.id} className="p-4 bg-white">
                        <div className="flex justify-between items-start mb-2">
                          {/* @ts-ignore */}
                          <span className="font-medium text-procarni-dark">{item.materials?.name || 'Material'}</span>
                          <span className="font-mono text-sm font-semibold">{order.currency} {(item.quantity * item.unit_price).toFixed(2)}</span>
                        </div>
                        {item.description && <p className="text-xs text-gray-500 mb-2">{item.description}</p>}
                        <div className="grid grid-cols-2 gap-y-2 text-xs text-gray-600">
                          <div>
                            <span className="text-[10px] uppercase text-gray-400 block">Cant.</span>
                            {item.quantity}
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] uppercase text-gray-400 block">Precio</span>
                            {item.unit_price.toFixed(2)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b border-gray-100 hover:bg-transparent">
                        <TableHead className={tableHeaderClass + " h-9 py-2 pl-6"}>Material / Descripción</TableHead>
                        <TableHead className={tableHeaderClass + " h-9 py-2 text-right"}>Cant.</TableHead>
                        <TableHead className={tableHeaderClass + " h-9 py-2 text-right"}>Precio ({order.currency})</TableHead>
                        <TableHead className={tableHeaderClass + " h-9 py-2 text-center"}>IVA</TableHead>
                        <TableHead className={tableHeaderClass + " h-9 py-2 text-right pr-6"}>Subtotal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.items.map((item: any) => {
                        const subtotal = item.quantity * item.unit_price;
                        return (
                          <TableRow key={item.id} className="border-b border-gray-50 hover:bg-gray-50/30">
                            <TableCell className="pl-6 py-4 text-sm">
                              {/* @ts-ignore */}
                              <span className="font-medium text-procarni-dark block">{item.materials?.name || 'Material'}</span>
                              {item.description && <span className="text-xs text-gray-500 block mt-0.5">{item.description}</span>}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-gray-600">{item.quantity}</TableCell>
                            <TableCell className="text-right font-mono text-sm text-gray-600">{item.unit_price.toFixed(2)}</TableCell>
                            <TableCell className="text-center">
                              {item.is_exempt ? (
                                <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">Exento</span>
                              ) : (
                                <span className="text-[10px] text-gray-400">{(item.tax_rate * 100).toFixed(0)}%</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm font-medium text-procarni-dark pr-6">{subtotal.toFixed(2)}</TableCell>
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
        <div className="w-full md:w-1/2 text-xs text-gray-400 italic px-2">
          Importe en letras: {amountInWords}
        </div>

        <div className="w-full md:w-auto min-w-[300px] bg-gray-50/50 rounded-lg border border-gray-100 p-6 space-y-3">
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-500 font-medium">Base Imponible</span>
            <span className="font-mono text-gray-700">{order.currency} {totals.baseImponible.toFixed(2)}</span>
          </div>

          {totals.montoDescuento > 0 && (
            <div className="flex justify-between items-center text-sm text-red-600">
              <span className="font-medium">Descuento</span>
              <span className="font-mono">- {order.currency} {totals.montoDescuento.toFixed(2)}</span>
            </div>
          )}

          {totals.montoVenta > 0 && (
            <div className="flex justify-between items-center text-sm text-blue-600">
              <span className="font-medium">Margen Comercial</span>
              <span className="font-mono">+ {order.currency} {totals.montoVenta.toFixed(2)}</span>
            </div>
          )}

          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-500 font-medium">Monto IVA</span>
            <span className="font-mono text-gray-700">+ {order.currency} {totals.montoIVA.toFixed(2)}</span>
          </div>

          <div className="h-px border-b border-dashed border-gray-300 my-2" />

          <div className="flex justify-between items-center text-lg">
            <span className="font-bold text-procarni-dark">Total Final</span>
            <span className="font-mono font-bold text-procarni-secondary text-xl">{order.currency} {totals.total.toFixed(2)}</span>
          </div>

          {totalInUSD && order.currency === 'VES' && (
            <div className="flex justify-end pt-1">
              <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
                Ref. USD {totalInUSD} (@ {order.exchange_rate?.toFixed(2)})
              </span>
            </div>
          )}
        </div>
      </div>

      <MadeWithDyad />

      <EmailSenderModal
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        // @ts-ignore
        onSend={(message, sendWhatsApp) => handleSendEmail(message, sendWhatsApp, order.suppliers?.phone)}
        // @ts-ignore
        recipientEmail={order.suppliers?.email || ''}
        // @ts-ignore
        recipientPhone={order.suppliers?.phone}
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
    </div>
  );
};

export default ServiceOrderDetails;