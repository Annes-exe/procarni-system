import React, { useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Edit, FileText, Download, Mail, MoreVertical, CheckCircle, Tag, Building2, DollarSign, Clock, Wrench, ListOrdered, Package } from 'lucide-react';
import { MadeWithDyad } from '@/components/made-with-dyad';
import { getServiceOrderDetails, updateServiceOrderStatus } from '@/integrations/supabase/data';
import { showError, showSuccess, showLoading, dismissToast } from '@/utils/toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import ServiceOrderPDFViewer, { ServiceOrderPDFViewerRef } from '@/components/ServiceOrderPDFViewer';
import PDFDownloadButton from '@/components/PDFDownloadButton';
import WhatsAppSenderButton from '@/components/WhatsAppSenderButton';
import { calculateTotals, numberToWords } from '@/utils/calculations';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import EmailSenderModal from '@/components/EmailSenderModal'; // Reusable component
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
import { ServiceOrder, ServiceOrderItem } from '@/integrations/supabase/types';

interface ServiceOrderItemDetails extends ServiceOrderItem {
  // No additional joins needed for items
}

interface SupplierDetails {
  id: string;
  name: string;
  rif: string;
  email?: string;
  phone?: string;
  payment_terms?: string;
  credit_days?: number;
}

interface CompanyDetails {
  id: string;
  name: string;
  rif: string;
}

interface ServiceOrderDetailsData extends ServiceOrder {
  suppliers: SupplierDetails;
  companies: CompanyDetails;
  service_order_items: ServiceOrderItemDetails[];
}

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

  // Helper function to correctly parse date strings (YYYY-MM-DD) for display
  const parseDateForDisplay = (dateString: string): Date => {
    return new Date(dateString + 'T12:00:00');
  };

  const { data: order, isLoading, error } = useQuery<ServiceOrderDetailsData | null>({
    queryKey: ['serviceOrderDetails', id],
    queryFn: async () => {
      if (!id) throw new Error('Service Order ID is missing.');
      const details = await getServiceOrderDetails(id);
      if (!details) throw new Error('Service Order not found.');
      return details as ServiceOrderDetailsData;
    },
    enabled: !!id,
  });

  const itemsForCalculation = [
    ...(order?.service_order_items?.map(item => ({
      quantity: item.quantity,
      unit_price: item.unit_price,
      tax_rate: item.tax_rate,
      is_exempt: item.is_exempt,
      sales_percentage: item.sales_percentage,
      discount_percentage: item.discount_percentage,
    })) || []),
    ...(order?.service_order_materials?.map(item => ({
      quantity: item.quantity,
      unit_price: item.unit_price,
      tax_rate: item.tax_rate,
      is_exempt: item.is_exempt,
      sales_percentage: item.sales_percentage,
      discount_percentage: item.discount_percentage,
    })) || [])
  ];

  const groupedMaterials = useMemo(() => {
    if (!order?.service_order_materials) return {};

    const groups: Record<string, { name: string; items: any[] }> = {};

    order.service_order_materials.forEach(item => {
      const supplierId = item.supplier_id;
      // @ts-ignore - Backend join provides this
      const supplierName = item.suppliers?.name || "Proveedor desconocido";

      if (!groups[supplierId]) {
        groups[supplierId] = {
          name: supplierName,
          items: []
        };
      }
      groups[supplierId].items.push(item);
    });

    return groups;
  }, [order?.service_order_materials]);





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
    const supplierName = order.suppliers?.name?.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_') || 'Proveedor';
    return `${sequence}-${supplierName}.pdf`;
  };

  const handleApproveOrder = async () => {
    if (!order || order.status === 'Approved' || order.status === 'Archived') return;

    setIsApproveConfirmOpen(false);
    setIsApproving(true);
    const toastId = showLoading('Aprobando orden de servicio...');

    try {
      const success = await updateServiceOrderStatus(order.id, 'Approved');
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
      dismissToast(String(toastId));
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

  const displayPaymentTerms = () => {
    // Payment terms come from supplier for Service Orders
    if (order?.suppliers?.payment_terms === 'Crédito' && order.suppliers.credit_days) {
      return `Crédito (${order.suppliers.credit_days} días)`;
    }
    return order?.suppliers?.payment_terms || 'Contado';
  };

  const handleSendEmail = async (customMessage: string, sendWhatsApp: boolean, phone?: string) => {
    if (!session?.user?.email || !order) return;

    // 1. Generate PDF
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

    // 2. Send Email
    const emailBody = `
        <h2>Orden de Servicio #${formatSequenceNumber(order.sequence_number, order.created_at)}</h2>
        <p><strong>Empresa:</strong> ${order.companies?.name}</p>
        <p><strong>Proveedor:</strong> ${order.suppliers?.name}</p>
        <p><strong>Fecha de Servicio:</strong> ${order.service_date ? format(parseDateForDisplay(order.service_date), 'PPP', { locale: es }) : 'N/A'}</p>
        <p><strong>Condición de Pago:</strong> ${displayPaymentTerms()}</p>
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
        to: order.suppliers?.email,
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

    // 3. Send WhatsApp (if requested)
    if (sendWhatsApp && phone) {
      const formattedPhone = phone.replace(/\D/g, '');
      const finalPhone = formattedPhone.startsWith('58') ? formattedPhone : `58${formattedPhone}`;
      const whatsappMessage = `Hola, te he enviado por correo la Orden de Servicio #${formatSequenceNumber(order.sequence_number, order.created_at)} de ${order.companies?.name}. Por favor, revisa tu bandeja de entrada.`;
      const whatsappUrl = `https://wa.me/${finalPhone}?text=${encodeURIComponent(whatsappMessage)}`;
      window.open(whatsappUrl, '_blank');
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 text-center text-muted-foreground">
        Cargando detalles de la orden de servicio...
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

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'Draft':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      case 'Sent':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'Approved':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'Rejected':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      case 'Archived':
        return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  const ActionButtons = () => (
    <>
      {/* 1. Previsualizar PDF */}
      <Dialog open={isModalOpen} onOpenChange={handleModalOpenChange}>
        <DialogTrigger asChild>
          <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="cursor-pointer">
            <span className="flex items-center">
              <FileText className="mr-2 h-4 w-4" /> Previsualizar PDF
            </span>
          </DropdownMenuItem>
        </DialogTrigger>
        <DialogContent className="max-w-5xl h-[95vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Previsualización de Orden de Servicio</DialogTitle>
          </DialogHeader>
          <ServiceOrderPDFViewer
            orderId={order.id}
            onClose={() => setIsModalOpen(false)}
            fileName={generateFileName()}
            ref={pdfViewerRef}
          />
        </DialogContent>
      </Dialog>

      {/* 2. Descargar PDF */}
      <DropdownMenuItem asChild>
        <PDFDownloadButton
          orderId={order.id}
          fileNameGenerator={generateFileName}
          endpoint="generate-so-pdf"
          label="Descargar PDF"
          variant="ghost"
          asChild
        />
      </DropdownMenuItem>

      <DropdownMenuSeparator />

      {/* 3. Enviar por Correo */}
      <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setIsEmailModalOpen(true); }} disabled={!order.suppliers?.email} className="cursor-pointer">
        <Mail className="mr-2 h-4 w-4" /> Enviar por Correo
      </DropdownMenuItem>

      {/* 4. Enviar por WhatsApp */}
      <DropdownMenuItem asChild>
        <WhatsAppSenderButton
          recipientPhone={order.suppliers?.phone}
          documentType="Orden de Servicio"
          documentId={order.id}
          documentNumber={formatSequenceNumber(order.sequence_number, order.created_at)}
          companyName={order.companies?.name || ''}
          variant="ghost"
          asChild
        />
      </DropdownMenuItem>

      <DropdownMenuSeparator />

      {/* 5. Aprobar Orden */}
      {isEditable && order.status !== 'Approved' && (
        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setIsApproveConfirmOpen(true); }} disabled={isApproving} className="cursor-pointer text-green-600 focus:text-green-700">
          <CheckCircle className="mr-2 h-4 w-4" /> Aprobar Orden
        </DropdownMenuItem>
      )}

      {/* 6. Editar Orden */}
      {isEditable ? (
        <DropdownMenuItem onSelect={() => navigate(`/service-orders/edit/${order.id}`)} className="cursor-pointer">
          <Edit className="mr-2 h-4 w-4" /> Editar Orden
        </DropdownMenuItem>
      ) : (
        <DropdownMenuItem disabled>
          <Edit className="mr-2 h-4 w-4" /> Editar Orden (No editable)
        </DropdownMenuItem>
      )}
    </>
  );

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary">
              <MoreVertical className="h-4 w-4" />
              <span className="ml-2">Acciones</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>Opciones de Orden de Servicio</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <ActionButtons />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-procarni-primary flex items-center">
            <Wrench className="mr-2 h-6 w-6" /> Orden de Servicio {formatSequenceNumber(order.sequence_number, order.created_at)}
          </CardTitle>
          <CardDescription>Detalles completos de la orden de servicio.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm mb-6 p-4 border rounded-lg bg-muted/50">
            <p className="flex items-center">
              <ListOrdered className="mr-2 h-4 w-4 text-procarni-primary" />
              <strong>N° Orden:</strong> {formatSequenceNumber(order.sequence_number, order.created_at)}
            </p>
            <p className="flex items-center">
              <Building2 className="mr-2 h-4 w-4 text-procarni-primary" />
              <strong>Empresa:</strong> {order.companies?.name || 'N/A'}
            </p>
            <p className="flex items-center">
              <Tag className="mr-2 h-4 w-4 text-procarni-primary" />
              <strong>Proveedor:</strong> {order.suppliers?.name || 'N/A'}
            </p>
            <p className="flex items-center">
              <Clock className="mr-2 h-4 w-4 text-procarni-primary" />
              <strong>Fecha Emisión:</strong> {format(parseDateForDisplay(order.issue_date), 'PPP', { locale: es })}
            </p>
            <p className="flex items-center">
              <Clock className="mr-2 h-4 w-4 text-procarni-primary" />
              <strong>Fecha Servicio:</strong> {format(parseDateForDisplay(order.service_date), 'PPP', { locale: es })}
            </p>
            <p className="flex items-center">
              <Wrench className="mr-2 h-4 w-4 text-procarni-primary" />
              <strong>Equipo:</strong> {order.equipment_name}
            </p>
            <p className="md:col-span-3">
              <strong>Tipo de Servicio:</strong> {order.service_type}
            </p>
            <p className="md:col-span-3">
              <strong>Detalle del Servicio:</strong> {order.detailed_service_description || 'N/A'}
            </p>
            <p className="md:col-span-3">
              <strong>Dirección Destino:</strong> {order.destination_address}
            </p>
            <p className="md:col-span-3">
              <strong>Estado:</strong>
              <span className={cn("ml-2 px-2 py-0.5 text-xs font-medium rounded-full", getStatusBadgeClass(order.status))}>
                {STATUS_TRANSLATIONS[order.status] || order.status}
              </span>
            </p>
          </div>

          {order.observations && (
            <div className="mb-6 p-3 border rounded-md bg-muted/50">
              <p className="font-semibold text-sm mb-1 text-procarni-primary">Observaciones:</p>
              <p className="text-sm whitespace-pre-wrap">{order.observations}</p>
            </div>
          )}

          <h3 className="text-lg font-semibold mt-8 mb-4 text-procarni-primary">Ítems de Costo/Servicio</h3>
          {order.service_order_items && order.service_order_items.length > 0 ? (
            isMobile ? (
              <div className="space-y-3">
                {order.service_order_items.map((item) => {
                  const itemTotals = calculateTotals([{
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                    tax_rate: item.tax_rate,
                    is_exempt: item.is_exempt,
                    sales_percentage: item.sales_percentage,
                    discount_percentage: item.discount_percentage,
                  }]);
                  return (
                    <Card key={item.id} className="p-3 shadow-sm">
                      <p className="font-semibold text-procarni-primary">{item.description}</p>
                      <div className="text-sm mt-1 grid grid-cols-2 gap-2">
                        <p><strong>Cantidad:</strong> {item.quantity}</p>
                        <p><strong>P. Unitario:</strong> {order.currency} {item.unit_price.toFixed(2)}</p>
                        <p><strong>Subtotal:</strong> {order.currency} {itemTotals.baseImponible.toFixed(2)}</p>
                        <p><strong>IVA:</strong> {order.currency} {itemTotals.montoIVA.toFixed(2)}</p>
                        <p><strong>Exento:</strong> {item.is_exempt ? 'Sí' : 'No'}</p>
                      </div>
                      <div className="mt-2 pt-2 border-t flex justify-between font-bold text-sm">
                        <span>Total Ítem:</span>
                        <span>{order.currency} {itemTotals.total.toFixed(2)}</span>
                      </div>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descripción</TableHead>
                      <TableHead>Cantidad</TableHead>
                      <TableHead>P. Unitario ({order.currency})</TableHead>
                      <TableHead>Desc. (%)</TableHead>
                      <TableHead>Venta (%)</TableHead>
                      <TableHead>Base Imponible ({order.currency})</TableHead>
                      <TableHead>IVA ({order.currency})</TableHead>
                      <TableHead>Exento</TableHead>
                      <TableHead className="text-right">Total ({order.currency})</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {order.service_order_items.map((item) => {
                      const itemTotals = calculateTotals([{
                        quantity: item.quantity,
                        unit_price: item.unit_price,
                        tax_rate: item.tax_rate,
                        is_exempt: item.is_exempt,
                        sales_percentage: item.sales_percentage,
                        discount_percentage: item.discount_percentage,
                      }]);
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium max-w-[200px] truncate">{item.description}</TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>{item.unit_price.toFixed(2)}</TableCell>
                          <TableCell>{(item.discount_percentage || 0).toFixed(2)}%</TableCell>
                          <TableCell>{(item.sales_percentage || 0).toFixed(2)}%</TableCell>
                          <TableCell>{itemTotals.baseImponible.toFixed(2)}</TableCell>
                          <TableCell>{itemTotals.montoIVA.toFixed(2)}</TableCell>
                          <TableCell>{item.is_exempt ? 'Sí' : 'No'}</TableCell>
                          <TableCell className="text-right font-bold">{itemTotals.total.toFixed(2)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )
          ) : (
            <p className="text-muted-foreground">Esta orden de servicio no tiene ítems registrados.</p>
          )}

          {Object.keys(groupedMaterials).length > 0 && (
            <div className="mt-8">
              <h3 className="text-lg font-semibold mb-4 text-procarni-primary flex items-center">
                <Package className="mr-2 h-5 w-5" /> Repuestos y Adicionales
              </h3>

              {Object.entries(groupedMaterials).map(([supplierId, group]) => (
                <div key={supplierId} className="mb-6 border rounded-lg overflow-hidden">
                  <div className="bg-muted px-4 py-2 font-medium border-b flex justify-between items-center">
                    <span>{group.name}</span>
                  </div>

                  {isMobile ? (
                    <div className="p-3 space-y-3">
                      {group.items.map((item: any) => {
                        const itemTotals = calculateTotals([{
                          quantity: item.quantity,
                          unit_price: item.unit_price,
                          tax_rate: item.tax_rate,
                          is_exempt: item.is_exempt,
                          sales_percentage: item.sales_percentage,
                          discount_percentage: item.discount_percentage,
                        }]);
                        return (
                          <Card key={item.id} className="p-3 shadow-sm bg-gray-50/50">
                            <p className="font-semibold text-sm">{item.description || item.materials?.name || 'Sin descripción'}</p>
                            <div className="text-xs mt-1 grid grid-cols-2 gap-2 text-muted-foreground">
                              <p><strong>Cant:</strong> {item.quantity}</p>
                              <p><strong>Precio:</strong> {order.currency} {item.unit_price.toFixed(2)}</p>
                              <p><strong>Total:</strong> {order.currency} {itemTotals.total.toFixed(2)}</p>
                            </div>
                          </Card>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-gray-50/50">
                            <TableHead className="w-[40%]">Descripción</TableHead>
                            <TableHead className="text-center">Cant.</TableHead>
                            <TableHead className="text-right">Precio</TableHead>
                            <TableHead className="text-right">Desc.%</TableHead>
                            <TableHead className="text-right">Venta%</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.items.map((item: any) => {
                            const itemTotals = calculateTotals([{
                              quantity: item.quantity,
                              unit_price: item.unit_price,
                              tax_rate: item.tax_rate,
                              is_exempt: item.is_exempt,
                              sales_percentage: item.sales_percentage,
                              discount_percentage: item.discount_percentage,
                            }]);
                            return (
                              <TableRow key={item.id}>
                                <TableCell className="font-medium">{item.description || item.materials?.name || 'Sin descripción'}</TableCell>
                                <TableCell className="text-center">{item.quantity}</TableCell>
                                <TableCell className="text-right">{item.unit_price.toFixed(2)}</TableCell>
                                <TableCell className="text-right">{(item.discount_percentage || 0).toFixed(2)}</TableCell>
                                <TableCell className="text-right">{(item.sales_percentage || 0).toFixed(2)}</TableCell>
                                <TableCell className="text-right font-bold">{itemTotals.total.toFixed(2)}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="mt-8 border-t pt-4">
            <div className="flex justify-end items-center mb-2">
              <span className="font-semibold mr-2">Base Imponible:</span>
              <span>{order.currency} {totals.baseImponible.toFixed(2)}</span>
            </div>
            <div className="flex justify-end items-center mb-2">
              <span className="font-semibold mr-2">Monto Descuento:</span>
              <span className="text-red-600">- {order.currency} {totals.montoDescuento.toFixed(2)}</span>
            </div>
            <div className="flex justify-end items-center mb-2">
              <span className="font-semibold mr-2">Monto Venta:</span>
              <span className="text-blue-600">+ {order.currency} {totals.montoVenta.toFixed(2)}</span>
            </div>
            <div className="flex justify-end items-center mb-2">
              <span className="font-semibold mr-2">Monto IVA:</span>
              <span>+ {order.currency} {totals.montoIVA.toFixed(2)}</span>
            </div>
            <div className="flex justify-end items-center text-xl font-bold">
              <span className="mr-2">TOTAL:</span>
              <span>{order.currency} {totals.total.toFixed(2)}</span>
            </div>
            {totalInUSD && order.currency === 'VES' && (
              <div className="flex justify-end items-center text-lg font-bold text-blue-600 mt-1">
                <span className="mr-2">TOTAL (USD):</span>
                <span>USD {totalInUSD}</span>
              </div>
            )}
            <p className="text-sm italic mt-2 text-right">({amountInWords})</p>
          </div>
        </CardContent>
      </Card>
      <MadeWithDyad />

      <EmailSenderModal
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        onSend={(message, sendWhatsApp) => handleSendEmail(message, sendWhatsApp, order.suppliers?.phone)}
        recipientEmail={order.suppliers?.email || ''}
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