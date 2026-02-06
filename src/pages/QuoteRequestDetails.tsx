import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Edit, FileText, Download, ShoppingCart, Mail, MoreVertical, CheckCircle, Tag, Building2, DollarSign, Clock, Users } from 'lucide-react';
import { MadeWithDyad } from '@/components/made-with-dyad';
import { getQuoteRequestDetails, updateQuoteRequestStatus } from '@/integrations/supabase/data';
import { showError, showSuccess, showLoading, dismissToast } from '@/utils/toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import QuoteRequestPreviewModal, { QuoteRequestPreviewModalRef } from '@/components/QuoteRequestPreviewModal';
import PDFDownloadButton from '@/components/PDFDownloadButton';
import WhatsAppSenderButton from '@/components/WhatsAppSenderButton';
import { format } from 'date-fns';
import { es } from 'date-fns/locale'; // Importar la localización en español
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

interface QuoteRequestItem {
  id: string;
  material_name: string;
  description?: string;
  unit?: string;
  quantity: number;
  is_exempt?: boolean;
}

interface SupplierDetails {
  id: string;
  name: string;
  rif: string;
  email?: string;
  phone?: string;
  phone_2?: string;
  instagram?: string;
  address?: string;
}

interface CompanyDetails {
  id: string;
  name: string;
  logo_url?: string;
  fiscal_data?: any;
}

interface QuoteRequestDetailsData {
  id: string;
  supplier_id: string;
  suppliers: SupplierDetails;
  company_id: string;
  companies: CompanyDetails;
  currency: string;
  exchange_rate?: number | null;
  status: 'Draft' | 'Sent' | 'Archived' | 'Approved';
  created_at: string;
  created_by?: string;
  user_id: string;
  quote_request_items: QuoteRequestItem[];
}

const STATUS_TRANSLATIONS: Record<string, string> = {
  'Draft': 'Borrador',
  'Sent': 'Enviada',
  'Approved': 'Aprobada',
  'Archived': 'Archivada',
};

const QuoteRequestDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { session } = useSession();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [isApproveConfirmOpen, setIsApproveConfirmOpen] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  
  const qrViewerRef = React.useRef<QuoteRequestPreviewModalRef>(null);

  const { data: request, isLoading, error } = useQuery<QuoteRequestDetailsData | null>({
    queryKey: ['quoteRequestDetails', id],
    queryFn: async () => {
      if (!id) throw new Error('Quote Request ID is missing.');
      const details = await getQuoteRequestDetails(id);
      if (!details) throw new Error('Quote Request not found.');
      return details as QuoteRequestDetailsData;
    },
    enabled: !!id,
  });

  const handleConvertToPurchaseOrder = () => {
    if (!request) return;
    navigate('/generate-po', {
      state: {
        quoteRequest: request,
      },
    });
  };

  const handleApproveRequest = async () => {
    if (!request || request.status === 'Approved') return;

    setIsApproveConfirmOpen(false);
    setIsApproving(true);
    const toastId = showLoading('Aprobando solicitud...');
    
    try {
      const success = await updateQuoteRequestStatus(request.id, 'Approved');
      if (success) {
        showSuccess('Solicitud de Cotización aprobada exitosamente.');
        queryClient.invalidateQueries({ queryKey: ['quoteRequestDetails', id] });
        queryClient.invalidateQueries({ queryKey: ['quoteRequests', 'Active'] });
        queryClient.invalidateQueries({ queryKey: ['quoteRequests', 'Approved'] });
      } else {
        throw new Error('Fallo al actualizar el estado.');
      }
    } catch (error: any) {
      showError(error.message || 'Error al aprobar la solicitud.');
    } finally {
      dismissToast(toastId);
      setIsApproving(false);
    }
  };

  const generateFileName = () => {
    if (!request) return '';
    const supplierName = request.suppliers?.name?.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_') || 'Proveedor';
    const date = new Date(request.created_at).toLocaleDateString('es-VE').replace(/\//g, '-');
    return `SC_${request.id.substring(0, 8)}_${supplierName}_${date}.pdf`;
  };

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result);
      };
      reader.onerror = (error) => {
        console.error('[QuoteRequestDetails] Error converting blob to base64:', error);
        reject(error);
      };
      reader.readAsDataURL(blob);
    });
  };

  const handleSendEmail = async (customMessage: string, sendWhatsApp: boolean, phone?: string) => {
    if (!session?.user?.email || !request) return;

    const toastId = showLoading('Generando PDF y enviando correo...');

    try {
      // 1. Generate PDF
      const pdfResponse = await fetch(`https://sbmwuttfblpwwwpifmza.supabase.co/functions/v1/generate-qr-pdf`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requestId: request.id }),
      });

      if (!pdfResponse.ok) {
        const errorData = await pdfResponse.json();
        throw new Error(errorData.error || 'Error al generar el PDF.');
      }

      const pdfBlob = await pdfResponse.blob();
      const pdfBase64 = await blobToBase64(pdfBlob);

      // 2. Send Email
      const emailBody = `
        <h2>Solicitud de Cotización #${request.id.substring(0, 8)}</h2>
        <p><strong>Empresa:</strong> ${request.companies?.name}</p>
        <p><strong>Proveedor:</strong> ${request.suppliers?.name}</p>
        <p><strong>Fecha:</strong> ${format(new Date(request.created_at), 'PPP', { locale: es })}</p>
        ${customMessage ? `<p><strong>Mensaje:</strong><br>${customMessage.replace(/\n/g, '<br>')}</p>` : ''}
        <p>Se adjunta el PDF con los detalles de la solicitud.</p>
      `;

      const emailResponse = await fetch(`https://sbmwuttfblpwwwpifmza.supabase.co/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: request.suppliers?.email,
          subject: `Solicitud de Cotización #${request.id.substring(0, 8)} - ${request.companies?.name}`,
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
        const whatsappMessage = `Hola, te he enviado por correo la Solicitud de Cotización #${request.id.substring(0, 8)} de ${request.companies?.name}. Por favor, revisa tu bandeja de entrada.`;
        const whatsappUrl = `https://wa.me/${finalPhone}?text=${encodeURIComponent(whatsappMessage)}`;
        window.open(whatsappUrl, '_blank');
      }

      dismissToast(toastId);
      showSuccess('Correo enviado exitosamente.');
      setIsEmailModalOpen(false);

    } catch (error: any) {
      console.error('[QuoteRequestDetails] Error sending email:', error);
      dismissToast(toastId);
      showError(error.message || 'Error al enviar el correo.');
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 text-center text-muted-foreground">
        Cargando detalles de la solicitud de cotización...
      </div>
    );
  }

  if (error) {
    showError(error.message);
    return (
      <div className="container mx-auto p-4 text-center text-destructive">
        Error: {error.message}
        <Button asChild variant="link" className="mt-4">
          <Link to="/quote-request-management">Volver a la gestión de solicitudes</Link>
        </Button>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="container mx-auto p-4 text-center text-muted-foreground">
        Solicitud de cotización no encontrada.
        <Button asChild variant="link" className="mt-4">
          <Link to="/quote-request-management">Volver a la gestión de solicitudes</Link>
        </Button>
      </div>
    );
  }

  const isEditable = request.status !== 'Approved' && request.status !== 'Archived';

  const handleModalOpenChange = (open: boolean) => {
    setIsModalOpen(open);
    if (!open && qrViewerRef.current) {
      qrViewerRef.current.handleClose();
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
            <DialogTitle>Previsualización de Solicitud de Cotización</DialogTitle>
          </DialogHeader>
          <QuoteRequestPreviewModal
            requestId={request.id}
            onClose={() => setIsModalOpen(false)}
            fileName={generateFileName()}
            ref={qrViewerRef}
          />
        </DialogContent>
      </Dialog>
      
      {/* 2. Descargar PDF */}
      <DropdownMenuItem asChild>
        <PDFDownloadButton
          requestId={request.id}
          fileNameGenerator={generateFileName}
          endpoint="generate-qr-pdf"
          label="Descargar PDF"
          variant="ghost"
          asChild
        />
      </DropdownMenuItem>

      <DropdownMenuSeparator />

      {/* 3. Enviar por Correo */}
      <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setIsEmailModalOpen(true); }} disabled={!request.suppliers?.email} className="cursor-pointer">
        <Mail className="mr-2 h-4 w-4" /> Enviar por Correo
      </DropdownMenuItem>
      
      {/* 4. Enviar por WhatsApp */}
      <DropdownMenuItem asChild>
        <WhatsAppSenderButton
          recipientPhone={request.suppliers?.phone}
          documentType="Solicitud de Cotización"
          documentId={request.id}
          documentNumber={request.id.substring(0, 8)}
          companyName={request.companies?.name || ''}
          variant="ghost"
          asChild
        />
      </DropdownMenuItem>

      <DropdownMenuSeparator />

      {/* 5. Aprobar Solicitud */}
      {request.status !== 'Approved' && request.status !== 'Archived' && (
        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setIsApproveConfirmOpen(true); }} disabled={isApproving} className="cursor-pointer text-green-600 focus:text-green-700">
          <CheckCircle className="mr-2 h-4 w-4" /> Aprobar Solicitud
        </DropdownMenuItem>
      )}

      {/* 6. Editar Solicitud */}
      {isEditable ? (
        <DropdownMenuItem onSelect={() => navigate(`/quote-requests/edit/${request.id}`)} className="cursor-pointer">
          <Edit className="mr-2 h-4 w-4" /> Editar Solicitud
        </DropdownMenuItem>
      ) : (
        <DropdownMenuItem disabled>
          <Edit className="mr-2 h-4 w-4" /> Editar Solicitud (No editable)
        </DropdownMenuItem>
      )}

      <DropdownMenuSeparator />

      {/* 7. Convertir a OC */}
      <DropdownMenuItem onSelect={handleConvertToPurchaseOrder} className="cursor-pointer text-procarni-secondary focus:text-green-700">
        <ShoppingCart className="mr-2 h-4 w-4" /> Convertir a OC
      </DropdownMenuItem>
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
            <DropdownMenuLabel>Opciones de Solicitud</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <ActionButtons />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-procarni-primary">Solicitud de Cotización #{request.id.substring(0, 8)}</CardTitle>
          <CardDescription>Detalles completos de la solicitud de cotización.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm mb-6 p-4 border rounded-lg bg-muted/50">
            <p className="flex items-center">
              <Tag className="mr-2 h-4 w-4 text-procarni-primary" />
              <strong>ID:</strong> {request.id.substring(0, 8)}
            </p>
            <p className="flex items-center">
              <Building2 className="mr-2 h-4 w-4 text-procarni-primary" />
              <strong>Empresa:</strong> {request.companies?.name || 'N/A'}
            </p>
            <p className="flex items-center">
              <Users className="mr-2 h-4 w-4 text-procarni-primary" />
              <strong>Proveedor:</strong> {request.suppliers?.name || 'N/A'}
            </p>
            <p className="flex items-center">
              <DollarSign className="mr-2 h-4 w-4 text-procarni-primary" />
              <strong>Moneda:</strong> {request.currency}
            </p>
            {request.exchange_rate && <p className="flex items-center">
              <DollarSign className="mr-2 h-4 w-4 text-procarni-primary" />
              <strong>Tasa de Cambio:</strong> {request.exchange_rate.toFixed(2)}
            </p>}
            <p className="flex items-center">
              <Clock className="mr-2 h-4 w-4 text-procarni-primary" />
              <strong>Fecha:</strong> {format(new Date(request.created_at), 'PPP', { locale: es })}
            </p>
            <p className="md:col-span-3">
              <strong>Estado:</strong> 
              <span className={cn("ml-2 px-2 py-0.5 text-xs font-medium rounded-full", getStatusBadgeClass(request.status))}>
                {STATUS_TRANSLATIONS[request.status] || request.status}
              </span>
            </p>
          </div>

          <h3 className="text-lg font-semibold mt-8 mb-4 text-procarni-primary">Ítems Solicitados</h3>
          {request.quote_request_items && request.quote_request_items.length > 0 ? (
            isMobile ? (
              <div className="space-y-3">
                {request.quote_request_items.map((item) => (
                  <Card key={item.id} className="p-3 shadow-sm">
                    <p className="font-semibold text-procarni-primary">{item.material_name}</p>
                    <div className="text-sm mt-1 space-y-0.5">
                      <p><strong>Cantidad:</strong> {item.quantity} {item.unit || 'N/A'}</p>
                      <p><strong>Descripción:</strong> {item.description || 'N/A'}</p>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Material</TableHead>
                      <TableHead>Cantidad</TableHead>
                      <TableHead>Unidad</TableHead>
                      <TableHead>Descripción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {request.quote_request_items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.material_name}</TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>{item.unit || 'N/A'}</TableCell>
                        <TableCell>{item.description || 'N/A'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )
          ) : (
            <p className="text-muted-foreground">Esta solicitud no tiene ítems registrados.</p>
          )}
        </CardContent>
      </Card>
      <MadeWithDyad />

      <EmailSenderModal
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        onSend={(message, sendWhatsApp) => handleSendEmail(message, sendWhatsApp, request.suppliers?.phone)}
        recipientEmail={request.suppliers?.email || ''}
        recipientPhone={request.suppliers?.phone}
        documentType="Solicitud de Cotización"
        documentId={request.id}
      />

      <AlertDialog open={isApproveConfirmOpen} onOpenChange={setIsApproveConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Aprobación</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas aprobar esta Solicitud de Cotización? Esto marcará la solicitud como finalizada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isApproving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleApproveRequest} disabled={isApproving} className="bg-green-600 hover:bg-green-700">
              {isApproving ? 'Aprobando...' : 'Aprobar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default QuoteRequestDetails;