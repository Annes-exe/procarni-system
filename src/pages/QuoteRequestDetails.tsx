// src/pages/QuoteRequestDetails.tsx

import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Edit, FileText, Download, ShoppingCart, Mail, MoreVertical, CheckCircle, Tag, Building2, DollarSign, Clock, Users, Loader2 } from 'lucide-react';
import { MadeWithDyad } from '@/components/made-with-dyad';
import { quoteRequestService } from '@/services/quoteRequestService';
import { showError, showSuccess, showLoading, dismissToast } from '@/utils/toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import QuoteRequestPreviewModal, { QuoteRequestPreviewModalRef } from '@/components/QuoteRequestPreviewModal';
import PDFDownloadButton from '@/components/PDFDownloadButton';
import WhatsAppSenderButton from '@/components/WhatsAppSenderButton';
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
import { Label } from '@/components/ui/label';

const STATUS_TRANSLATIONS: Record<string, string> = {
  'Draft': 'Borrador',
  'Sent': 'Enviada',
  'Approved': 'Aprobada',
  'Rejected': 'Rechazada',
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

  const { data: request, isLoading, error } = useQuery({
    queryKey: ['quoteRequestDetails', id],
    queryFn: async () => {
      if (!id) throw new Error('Quote Request ID is missing.');
      return await quoteRequestService.getById(id);
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
    // const toastId = showLoading('Aprobando solicitud...');

    try {
      await quoteRequestService.updateStatus(request.id, 'Approved');
      showSuccess('Solicitud de Cotización aprobada exitosamente.');
      queryClient.invalidateQueries({ queryKey: ['quoteRequestDetails', id] });
      queryClient.invalidateQueries({ queryKey: ['quoteRequests'] });

    } catch (error: any) {
      showError(error.message || 'Error al aprobar la solicitud.');
    } finally {
      // dismissToast(toastId);
      setIsApproving(false);
    }
  };

  const generateFileName = () => {
    if (!request) return '';
    // @ts-ignore
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
      const pdfResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-qr-pdf`, {
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
        <p><strong>Empresa:</strong> ${
        // @ts-ignore
        request.companies?.name}</p>
        <p><strong>Proveedor:</strong> ${
        // @ts-ignore
        request.suppliers?.name}</p>
        <p><strong>Fecha:</strong> ${format(new Date(request.created_at), 'PPP', { locale: es })}</p>
        ${customMessage ? `<p><strong>Mensaje:</strong><br>${customMessage.replace(/\n/g, '<br>')}</p>` : ''}
        <p>Se adjunta el PDF con los detalles de la solicitud.</p>
      `;

      const emailResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // @ts-ignore
          to: request.suppliers?.email,
          // @ts-ignore
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
        // @ts-ignore
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
      <div className="container mx-auto p-4 text-center text-muted-foreground pt-20">
        <Loader2 className="h-10 w-10 animate-spin mx-auto text-procarni-secondary mb-4" />
        <p>Cargando detalles de la solicitud...</p>
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

  const isEditable = request.status !== 'Approved' && request.status !== 'Archived' && request.status !== 'Rejected';

  const handleModalOpenChange = (open: boolean) => {
    setIsModalOpen(open);
    if (!open && qrViewerRef.current) {
      qrViewerRef.current.handleClose();
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'Draft': return 'secondary';
      case 'Sent': return 'default';
      case 'Approved': return 'outline';
      case 'Rejected': return 'destructive';
      case 'Archived': return 'outline';
      default: return 'secondary';
    }
  };

  const getStatusColorClass = (status: string) => {
    switch (status) {
      case 'Draft': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'Sent': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Approved': return 'bg-green-100 text-green-800 border-green-200';
      case 'Rejected': return 'bg-red-100 text-red-800 border-red-200';
      case 'Archived': return 'bg-gray-100 text-gray-600 border-gray-200';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const ActionButtons = () => (
    <>
      <Dialog open={isModalOpen} onOpenChange={handleModalOpenChange}>
        <DialogTrigger asChild>
          <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="cursor-pointer">
            <FileText className="mr-2 h-4 w-4" /> Previsualizar PDF
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

      <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setIsEmailModalOpen(true); }} disabled={
        // @ts-ignore 
        !request.suppliers?.email
      } className="cursor-pointer">
        <Mail className="mr-2 h-4 w-4" /> Enviar por Correo
      </DropdownMenuItem>

      <DropdownMenuItem asChild>
        <WhatsAppSenderButton
          // @ts-ignore
          recipientPhone={request.suppliers?.phone}
          documentType="Solicitud de Cotización"
          documentId={request.id}
          documentNumber={request.id.substring(0, 8)}
          // @ts-ignore
          companyName={request.companies?.name || ''}
          variant="ghost"
          asChild
        />
      </DropdownMenuItem>

      <DropdownMenuSeparator />

      {request.status !== 'Approved' && request.status !== 'Archived' && request.status !== 'Rejected' && (
        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setIsApproveConfirmOpen(true); }} disabled={isApproving} className="cursor-pointer text-green-600 focus:text-green-700 font-medium">
          <CheckCircle className="mr-2 h-4 w-4" /> Aprobar Solicitud
        </DropdownMenuItem>
      )}

      {isEditable ? (
        <DropdownMenuItem onSelect={() => navigate(`/quote-requests/edit/${request.id}`)} className="cursor-pointer">
          <Edit className="mr-2 h-4 w-4" /> Editar Solicitud
        </DropdownMenuItem>
      ) : (
        <DropdownMenuItem disabled>
          <Edit className="mr-2 h-4 w-4" /> Editar (No disponible)
        </DropdownMenuItem>
      )}

      <DropdownMenuSeparator />

      <DropdownMenuItem onSelect={handleConvertToPurchaseOrder} className="cursor-pointer text-procarni-secondary focus:text-green-700 font-medium">
        <ShoppingCart className="mr-2 h-4 w-4" /> Convertir a OC
      </DropdownMenuItem>
    </>
  );

  return (
    <div className="container mx-auto p-4 pb-20">

      {/* PHASE 1: STICKY HEADER */}
      <div className="relative md:sticky md:top-0 z-20 backdrop-blur-md bg-white/90 border-b border-gray-200 pb-3 pt-4 mb-4 -mx-4 px-4 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-all duration-200">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate('/quote-request-management')} className="text-gray-400 hover:text-procarni-dark hover:bg-gray-100 rounded-full h-8 w-8 -ml-2 mr-1">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className='flex flex-col'>
            <h1 className="text-xl font-bold font-mono text-procarni-dark tracking-tight flex items-center gap-2">
              <span className="text-gray-400 font-light">#</span>{request.id.substring(0, 8)}
              <Badge variant="outline" className={cn("ml-2 text-[10px] px-2 py-0.5", getStatusColorClass(request.status))}>
                {STATUS_TRANSLATIONS[request.status] || request.status}
              </Badge>
            </h1>
            <p className="text-xs text-gray-500 flex items-center gap-2">
              {/* @ts-ignore */}
              <span>{request.suppliers?.name}</span>
              <span className="text-gray-300">•</span>
              <span>{format(new Date(request.created_at), 'PPP', { locale: es })}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          {isEditable && (
            <Button variant="outline" size="sm" onClick={() => navigate(`/quote-requests/edit/${request.id}`)} className="hidden md:flex">
              <Edit className="mr-2 h-3.5 w-3.5" /> Editar
            </Button>
          )}

          {request.status !== 'Approved' && request.status !== 'Archived' && request.status !== 'Rejected' && (
            <Button size="sm" onClick={() => setIsApproveConfirmOpen(true)} className="bg-green-600 hover:bg-green-700 text-white hidden md:flex">
              <CheckCircle className="mr-2 h-3.5 w-3.5" /> Aprobar
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="sm" className="ml-auto md:ml-0">
                <MoreVertical className="h-4 w-4 mr-0 md:mr-2" />
                <span className="hidden md:inline">Acciones</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Opciones</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <ActionButtons />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid gap-6">
        {/* PHASE 2: INFO GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="border-gray-200 shadow-sm col-span-1 md:col-span-2">
            <CardHeader className="bg-gray-50/50 pb-4">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-gray-500 flex items-center">
                <Building2 className="h-4 w-4 mr-2" /> Información General
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-12">
              <div>
                <Label className="text-xs text-gray-500 block mb-1">Empresa Solicitante</Label>
                {/* @ts-ignore */}
                <p className="font-medium text-gray-900">{request.companies?.name || '---'}</p>
              </div>
              <div>
                <Label className="text-xs text-gray-500 block mb-1">Proveedor</Label>
                {/* @ts-ignore */}
                <p className="font-medium text-gray-900">{request.suppliers?.name || '---'}</p>
                {/* @ts-ignore */}
                {(request.suppliers?.email || request.suppliers?.phone) && (
                  <p className="text-xs text-gray-500 mt-1">
                    {/* @ts-ignore */}
                    {request.suppliers?.email} • {request.suppliers?.phone}
                  </p>
                )}
              </div>
              <div>
                <Label className="text-xs text-gray-500 block mb-1">Moneda</Label>
                <p className="font-medium text-gray-900">{request.currency}</p>
              </div>
              <div>
                <Label className="text-xs text-gray-500 block mb-1">Elaborado Por</Label>
                {/* @ts-ignore */}
                <p className="font-medium text-gray-900">{request.created_by || '---'}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="bg-gray-50/50 pb-4">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-gray-500 flex items-center">
                <Clock className="h-4 w-4 mr-2" /> Estado
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 flex flex-col justify-center items-center text-center h-[calc(100%-60px)]">
              <Badge className={cn("text-sm px-4 py-1 mb-2", getStatusColorClass(request.status))} variant="outline">
                {STATUS_TRANSLATIONS[request.status] || request.status}
              </Badge>
              <p className="text-xs text-gray-500">
                Última actualización: {format(new Date(request.created_at), 'PPP', { locale: es })}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* PHASE 3: ITEMS TABLE */}
        <Card className="border-gray-200 shadow-sm overflow-hidden min-h-[400px]">
          <CardHeader className="bg-gray-50/50 pb-4 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-gray-500 flex items-center">
              <ShoppingCart className="h-4 w-4 mr-2" /> Ítems Solicitados
            </CardTitle>
            <Badge variant="secondary" className="font-mono">
              {/* @ts-ignore */}
              {request.quote_request_items?.length || 0} Ítems
            </Badge>
          </CardHeader>
          <CardContent className="p-0">
            {/* @ts-ignore */}
            {request.quote_request_items && request.quote_request_items.length > 0 ? (
              isMobile ? (
                <div className="grid gap-0 divide-y divide-gray-100">
                  {/* @ts-ignore */}
                  {request.quote_request_items.map((item) => (
                    <div key={item.id} className="p-4 bg-white hover:bg-gray-50">
                      <div className="flex justify-between items-start mb-1">
                        {/* @ts-ignore */}
                        <p className="font-semibold text-procarni-primary text-sm">{item.materials?.name || item.material_name}</p>
                        <Badge variant="outline" className="ml-2 font-mono text-[10px]">{item.quantity} {item.unit}</Badge>
                      </div>
                      {item.description && (
                        <p className="text-xs text-gray-500 line-clamp-2">{item.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-gray-50/30">
                      <TableRow>
                        <TableHead className="w-[40%] text-xs uppercase tracking-wider text-gray-500 font-semibold pl-6">Material / Descripción</TableHead>
                        <TableHead className="text-center text-xs uppercase tracking-wider text-gray-500 font-semibold">Cantidad</TableHead>
                        <TableHead className="text-center text-xs uppercase tracking-wider text-gray-500 font-semibold">Unidad</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {/* @ts-ignore */}
                      {request.quote_request_items.map((item) => (
                        <TableRow key={item.id} className="hover:bg-gray-50/50">
                          <TableCell className="pl-6 py-4">
                            <div className="flex flex-col">
                              {/* @ts-ignore */}
                              <span className="font-medium text-gray-900">{item.materials?.name || item.material_name}</span>
                              {item.description && (
                                <span className="text-xs text-gray-500 mt-1 max-w-lg truncate">{item.description}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center font-mono text-gray-700">{item.quantity}</TableCell>
                          <TableCell className="text-center text-xs text-gray-500">{item.unit || '---'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400 bg-white">
                <ShoppingCart className="h-12 w-12 mb-3 text-gray-200" />
                <p className="text-sm">No hay ítems registrados.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <MadeWithDyad />

      <EmailSenderModal
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        // @ts-ignore
        onSend={(message, sendWhatsApp) => handleSendEmail(message, sendWhatsApp, request.suppliers?.phone)}
        // @ts-ignore
        recipientEmail={request.suppliers?.email || ''}
        // @ts-ignore
        recipientPhone={request.suppliers?.phone}
        documentType="Solicitud de Cotización"
        documentId={request.id}
      />

      <AlertDialog open={isApproveConfirmOpen} onOpenChange={setIsApproveConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Aprobación</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas aprobar esta Solicitud de Cotización? Esto marcará la solicitud como finalizada y lista para generar una Orden de Compra si es necesario.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isApproving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleApproveRequest} disabled={isApproving} className="bg-green-600 hover:bg-green-700 text-white">
              {isApproving ? 'Aprobando...' : 'Aprobar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default QuoteRequestDetails;