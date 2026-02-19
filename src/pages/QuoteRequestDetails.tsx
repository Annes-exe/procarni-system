// src/pages/QuoteRequestDetails.tsx

import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Edit, FileText, ShoppingCart, Mail, MoreVertical, CheckCircle, Building2, Clock, Loader2 } from 'lucide-react';
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
      <div className="relative md:sticky md:top-0 z-20 backdrop-blur-md bg-white/90 border-b border-gray-200 pb-3 pt-4 mb-10 -mx-4 px-4 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-all duration-200">

        {/* Title & Status */}
        <div className="flex flex-col gap-1 w-full md:w-auto">
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="ghost" size="icon" onClick={() => navigate('/quote-request-management')} className="text-gray-400 hover:text-procarni-dark hover:bg-gray-100 rounded-full h-8 w-8 -ml-2 mr-1">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold font-mono text-procarni-dark tracking-tight flex items-center gap-2">
              <span className="text-gray-400 font-light">#</span>{request.id.substring(0, 8)}
            </h1>
            <Badge className={cn("ml-2 pointer-events-none rounded-md px-2.5 py-0.5 text-xs font-semibold shadow-none border", getStatusColorClass(request.status))} variant="outline">
              {STATUS_TRANSLATIONS[request.status] || request.status}
            </Badge>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 scrollbar-none">

          {/* Action Buttons (Desktop & Mobile optimized) */}
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
                  <QuoteRequestPreviewModal
                    requestId={request.id}
                    onClose={() => setIsModalOpen(false)}
                    fileName={generateFileName()}
                    ref={qrViewerRef}
                  />
                </div>
              </DialogContent>
            </Dialog>

            {/* Download PDF */}
            <PDFDownloadButton
              requestId={request.id}
              fileNameGenerator={generateFileName}
              endpoint="generate-qr-pdf"
              label="PDF"
              variant="outline"
              size="sm"
              className="hidden md:flex"
            />

            {/* Send Email */}
            <Button variant="outline" size="sm" onClick={() => setIsEmailModalOpen(true)} disabled={
              // @ts-ignore 
              !request.suppliers?.email
            } className="hidden md:flex gap-2">
              <Mail className="h-4 w-4" />
            </Button>

            {/* Mobile Actions Dropdown */}
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
                    requestId={request.id}
                    fileNameGenerator={generateFileName}
                    endpoint="generate-qr-pdf"
                    label="Descargar PDF"
                    variant="ghost"
                    className="w-full justify-start cursor-pointer px-2 py-1.5 h-auto font-normal"
                  />
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setIsEmailModalOpen(true)} disabled={
                  // @ts-ignore 
                  !request.suppliers?.email
                }>
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
                    className="w-full justify-start cursor-pointer px-2 py-1.5 h-auto font-normal"
                    label="Enviar por WhatsApp"
                  />
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Approve Button */}
            {request.status !== 'Approved' && request.status !== 'Archived' && request.status !== 'Rejected' && (
              <Button
                onClick={() => setIsApproveConfirmOpen(true)}
                disabled={isApproving}
                className="bg-green-600 hover:bg-green-700 text-white gap-2 shadow-sm"
                size="sm"
              >
                <CheckCircle className="h-4 w-4" />
                <span className="hidden sm:inline">Aprobar Solicitud</span>
              </Button>
            )}

            {/* Edit Button */}
            {isEditable && (
              <Button onClick={() => navigate(`/quote-requests/edit/${request.id}`)} variant="outline" size="sm" className="gap-2">
                <Edit className="h-4 w-4" />
                <span className="hidden sm:inline">Editar</span>
              </Button>
            )}

            {/* Convert to PO Button */}
            <Button onClick={handleConvertToPurchaseOrder} className="bg-procarni-secondary hover:bg-green-700 text-white gap-2 shadow-sm" size="sm">
              <ShoppingCart className="h-4 w-4" />
              <span className="hidden sm:inline">Convertir a OC</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="mb-10 animate-in fade-in slide-in-from-bottom-2 duration-500">
        {/* PHASE 2: INFO GRID */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 px-1">
          {/* Company */}
          <div className="space-y-1">
            <span className={microLabelClass}>Empresa</span>
            {/* @ts-ignore */}
            <p className={valueClass}>{request.companies?.name || 'N/A'}</p>
            {/* @ts-ignore */}
            <p className="text-xs text-gray-500">{request.companies?.rif}</p>
          </div>

          {/* Supplier */}
          <div className="space-y-1">
            <span className={microLabelClass}>Proveedor</span>
            {/* @ts-ignore */}
            <p className={valueClass}>{request.suppliers?.name || 'N/A'}</p>
            {/* @ts-ignore */}
            {(request.suppliers?.email || request.suppliers?.phone) && (
              <p className="text-xs text-gray-500">
                {/* @ts-ignore */}
                {request.suppliers?.email}
              </p>
            )}
          </div>

          {/* Date */}
          <div className="space-y-1">
            <span className={microLabelClass}>Fecha Solicitud</span>
            <p className={valueClass}>
              {format(new Date(request.created_at), 'PPP', { locale: es })}
            </p>
          </div>

          {/* Created By */}
          <div className="space-y-1">
            <span className={microLabelClass}>Elaborado Por</span>
            {/* @ts-ignore */}
            <p className={valueClass}>{request.created_by || '---'}</p>
          </div>
        </div>
      </div>

      {/* PHASE 3: ITEMS TABLE */}
      <Card className="mb-8 border-gray-200 shadow-sm overflow-hidden">
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
              <Table>
                <TableHeader className="bg-gray-50/80">
                  <TableRow className="border-b border-gray-100 hover:bg-transparent">
                    <TableHead className={tableHeaderClass + " h-9 py-2 pl-6 w-[40%]"}>Material / Descripción</TableHead>
                    <TableHead className={tableHeaderClass + " h-9 py-2 text-center"}>Cantidad</TableHead>
                    <TableHead className={tableHeaderClass + " h-9 py-2 text-center"}>Unidad</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* @ts-ignore */}
                  {request.quote_request_items.map((item) => (
                    <TableRow key={item.id} className="border-b border-gray-50 hover:bg-gray-50/30">
                      <TableCell className="pl-6 py-4">
                        <span className="font-medium text-procarni-dark text-sm block">
                          {/* @ts-ignore */}
                          {item.materials?.name || item.material_name}
                        </span>
                        {item.description && (
                          <span className="text-xs text-gray-500 truncate max-w-[300px] block mt-0.5">{item.description}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center font-mono text-sm text-gray-600">{item.quantity}</TableCell>
                      <TableCell className="text-center text-xs text-gray-500">{item.unit || '---'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 bg-white">
              <ShoppingCart className="h-12 w-12 mb-3 text-gray-200" />
              <p className="text-sm">No hay ítems registrados.</p>
            </div>
          )}
        </CardContent>
      </Card>

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