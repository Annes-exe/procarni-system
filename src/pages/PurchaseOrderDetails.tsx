import React, { useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Edit, FileText, Download, Mail, MoreVertical, CheckCircle, Tag, Building2, DollarSign, Clock, ListOrdered } from 'lucide-react';
import { MadeWithDyad } from '@/components/made-with-dyad';
import { purchaseOrderService } from '@/services/purchaseOrderService';
import { showError, showSuccess, showLoading, dismissToast } from '@/utils/toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import PurchaseOrderPDFViewer, { PurchaseOrderPDFViewerRef } from '@/components/PurchaseOrderPDFViewer';
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
  status: 'Draft' | 'Sent' | 'Approved' | 'Rejected' | 'Archived';
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

  const pdfViewerRef = React.useRef<PurchaseOrderPDFViewerRef>(null);

  // Helper function to correctly parse date strings (YYYY-MM-DD) for display
  const parseDateForDisplay = (dateString: string): Date => {
    // Appending T12:00:00 ensures the date object is created at noon local time,
    // preventing timezone offsets from shifting the date back a day.
    return new Date(dateString + 'T12:00:00');
  };

  const { data: order, isLoading, error } = useQuery<PurchaseOrderDetailsData | null>({
    queryKey: ['purchaseOrderDetails', id],
    queryFn: async () => {
      if (!id) throw new Error('Purchase Order ID is missing.');
      const details = await purchaseOrderService.getById(id);
      if (!details) throw new Error('Purchase Order not found.');
      // The service returns the data with joins, so we cast it to the local interface
      // compatible with the view.
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
    } catch (error: any) {
      showError(error.message || 'Error al aprobar la orden.');
    } finally {
      dismissToast(toastId);
      setIsApproving(false);
    }
  };

  const handleSendEmail = async (customMessage: string, sendWhatsApp: boolean, phone?: string) => {
    if (!session?.user?.email || !order) return;

    const toastId = showLoading('Generando PDF y enviando correo...');

    try {
      // 1. Generate PDF
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

      // 2. Send Email
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

      // 3. Send WhatsApp (if requested)
      if (sendWhatsApp && phone) {
        const formattedPhone = phone.replace(/\D/g, '');
        const finalPhone = formattedPhone.startsWith('58') ? formattedPhone : `58${formattedPhone}`;
        const whatsappMessage = `Hola, te he enviado por correo la Orden de Compra #${formatSequenceNumber(order.sequence_number, order.created_at)} de ${order.companies?.name}. Por favor, revisa tu bandeja de entrada.`;
        const whatsappUrl = `https://wa.me/${finalPhone}?text=${encodeURIComponent(whatsappMessage)}`;
        window.open(whatsappUrl, '_blank');
      }

      dismissToast(toastId);
      showSuccess('Correo enviado exitosamente.');
      setIsEmailModalOpen(false);

    } catch (error: any) {
      console.error('[PurchaseOrderDetails] Error sending email:', error);
      dismissToast(toastId);
      showError(error.message || 'Error al enviar el correo.');
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 text-center text-muted-foreground">
        Cargando detalles de la orden de compra...
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
            <DialogTitle>Previsualización de Orden de Compra</DialogTitle>
          </DialogHeader>
          <PurchaseOrderPDFViewer
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
          endpoint="generate-po-pdf"
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
          documentType="Orden de Compra"
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
        <DropdownMenuItem onSelect={() => navigate(`/purchase-orders/edit/${order.id}`)} className="cursor-pointer">
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
      <div className="flex justify-between items-center mb-2 -mt-2 flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground pl-0">
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
            <DropdownMenuLabel>Opciones de Orden</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <ActionButtons />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-procarni-primary">Orden de Compra {formatSequenceNumber(order.sequence_number, order.created_at)}</CardTitle>
          <CardDescription>Detalles completos de la orden de compra.</CardDescription>
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
              <DollarSign className="mr-2 h-4 w-4 text-procarni-primary" />
              <strong>Moneda:</strong> {order.currency}
            </p>
            {order.exchange_rate && <p className="flex items-center">
              <DollarSign className="mr-2 h-4 w-4 text-procarni-primary" />
              <strong>Tasa de Cambio:</strong> {order.exchange_rate.toFixed(2)}
            </p>}
            <p className="flex items-center">
              <Clock className="mr-2 h-4 w-4 text-procarni-primary" />
              <strong>Fecha de Entrega:</strong> {order.delivery_date ? format(parseDateForDisplay(order.delivery_date), 'PPP', { locale: es }) : 'N/A'}
            </p>
            <p className="md:col-span-3">
              <strong>Condición de Pago:</strong> {displayPaymentTerms()}
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

          <h3 className="text-lg font-semibold mt-8 mb-4 text-procarni-primary">Ítems de la Orden</h3>
          {order.purchase_order_items && order.purchase_order_items.length > 0 ? (
            isMobile ? (
              <div className="space-y-3">
                {order.purchase_order_items.map((item) => {
                  const subtotal = item.quantity * item.unit_price;
                  const itemIva = item.is_exempt ? 0 : subtotal * item.tax_rate;
                  return (
                    <Card key={item.id} className="p-3 shadow-sm">
                      <p className="font-semibold text-procarni-primary">{item.material_name}</p>
                      <div className="text-sm mt-1 grid grid-cols-2 gap-2">
                        <p><strong>Cód. Prov:</strong> {item.supplier_code || 'N/A'}</p>
                        <p><strong>Cantidad:</strong> {item.quantity} {item.unit || 'N/A'}</p>
                        <p><strong>P. Unitario:</strong> {order.currency} {item.unit_price.toFixed(2)}</p>
                        <p><strong>Subtotal:</strong> {order.currency} {subtotal.toFixed(2)}</p>
                        <p><strong>IVA:</strong> {order.currency} {itemIva.toFixed(2)}</p>
                        <p><strong>Exento:</strong> {item.is_exempt ? 'Sí' : 'No'}</p>
                        {item.description && <p className="col-span-2"><strong>Descripción:</strong> {item.description}</p>}
                      </div>
                      <div className="mt-2 pt-2 border-t flex justify-between font-bold text-sm">
                        <span>Total Ítem:</span>
                        <span>{order.currency} {(subtotal + itemIva).toFixed(2)}</span>
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
                      <TableHead>Material</TableHead>
                      <TableHead>Cód. Prov.</TableHead>
                      <TableHead>Cantidad</TableHead>
                      <TableHead>P. Unitario ({order.currency})</TableHead>
                      <TableHead>Subtotal ({order.currency})</TableHead>
                      <TableHead>IVA ({order.currency})</TableHead>
                      <TableHead>Exento</TableHead>
                      <TableHead>Descripción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {order.purchase_order_items.map((item) => {
                      const subtotal = item.quantity * item.unit_price;
                      const itemIva = item.is_exempt ? 0 : subtotal * item.tax_rate;
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.material_name}</TableCell>
                          <TableCell>{item.supplier_code || 'N/A'}</TableCell>
                          <TableCell>{item.quantity} {item.unit || 'N/A'}</TableCell>
                          <TableCell>{item.unit_price.toFixed(2)}</TableCell>
                          <TableCell>{subtotal.toFixed(2)}</TableCell>
                          <TableCell>{itemIva.toFixed(2)}</TableCell>
                          <TableCell>{item.is_exempt ? 'Sí' : 'No'}</TableCell>
                          <TableCell className="text-xs max-w-[150px] truncate">{item.description || 'N/A'}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )
          ) : (
            <p className="text-muted-foreground">Esta orden no tiene ítems registrados.</p>
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
              <span>{order.currency} {totals.montoIVA.toFixed(2)}</span>
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
    </div>
  );
};

export default PurchaseOrderDetails;