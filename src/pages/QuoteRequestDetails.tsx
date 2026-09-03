// src/pages/QuoteRequestDetails.tsx

import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Edit, FileText, ShoppingCart, Mail, MoreVertical, CheckCircle, Building2, Clock, Loader2, ChevronDown, Archive, Trash2, RotateCcw, Send, Smartphone } from 'lucide-react';

import { quoteRequestService } from '@/services/quoteRequestService';
import { showError, showSuccess, showLoading, dismissToast } from '@/utils/toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import QuoteRequestPreviewModal, { QuoteRequestPreviewModalRef } from '@/components/QuoteRequestPreviewModal';
import PDFDownloadButton from '@/components/PDFDownloadButton';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import EmailSenderModal from '@/components/EmailSenderModal';
import WhatsAppShareModal from '@/components/WhatsAppShareModal';
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
import { QUOTE_STATUS_TRANSLATIONS, getStatusColorClass } from '@/utils/statusTranslations';

const STATUS_TRANSLATIONS = QUOTE_STATUS_TRANSLATIONS;

const QuoteRequestDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { session, role } = useSession();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [isApproveConfirmOpen, setIsApproveConfirmOpen] = useState(false);
  const [isRejectConfirmOpen, setIsRejectConfirmOpen] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);

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

    try {
      await quoteRequestService.updateStatus(request.id, 'Approved');
      showSuccess('Solicitud de Cotización aprobada exitosamente.');
      queryClient.invalidateQueries({ queryKey: ['quoteRequestDetails', id] });
      queryClient.invalidateQueries({ queryKey: ['quoteRequests'] });

    } catch (error: any) {
      showError(error.message || 'Error al aprobar la solicitud.');
    } finally {
      setIsApproving(false);
    }
  };

  const handleRejectRequest = async () => {
    if (!request || request.status === 'Rejected') return;

    setIsRejectConfirmOpen(false);
    setIsRejecting(true);

    try {
      await quoteRequestService.updateStatus(request.id, 'Rejected');
      showSuccess('Solicitud de Cotización rechazada exitosamente.');
      queryClient.invalidateQueries({ queryKey: ['quoteRequestDetails', id] });
      queryClient.invalidateQueries({ queryKey: ['quoteRequests'] });

    } catch (error: any) {
      showError(error.message || 'Error al rechazar la solicitud.');
    } finally {
      setIsRejecting(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!request || request.status === newStatus) return;

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
      await quoteRequestService.updateStatus(request.id, newStatus as any);
      showSuccess(`Estado cambiado a ${STATUS_TRANSLATIONS[newStatus] || newStatus} exitosamente.`);
      queryClient.invalidateQueries({ queryKey: ['quoteRequestDetails', id] });
      queryClient.invalidateQueries({ queryKey: ['quoteRequests'] });
    } catch (error: any) {
      showError(error.message || 'Error al cambiar el estado.');
    } finally {
      dismissToast(toastId);
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

  const handleSendEmail = async (customMessage: string) => {
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
        <p>Se adjunta el PDF con los detalles de la solicitud. Por favor, responda al siguiente correo con su cotización: ${
        // @ts-ignore
        request.companies?.email || ''}</p>
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

      // 3. Send WhatsApp removed as it is incomplete

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

  const isEditable = (request.status === 'Draft' || role === 'admin') && request.status !== 'Archived';

  const handleModalOpenChange = (open: boolean) => {
    setIsModalOpen(open);
    if (!open && qrViewerRef.current) {
      qrViewerRef.current.handleClose();
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
            onClick={() => navigate('/quote-request-management')}
            className="text-slate-400 hover:text-procarni-primary hover:bg-slate-100/80 rounded-2xl h-10 w-10 shrink-0 group transition-all"
            title="Volver"
          >
            <ArrowLeft className="h-5 w-5 group-hover:-translate-x-1 transition-transform" />
          </Button>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-extrabold font-mono text-procarni-dark tracking-tight flex items-center gap-1.5">
                <span className="text-slate-400 font-light">#</span>{request.id.substring(0, 8)}
              </h1>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-7 px-3 py-0.5 text-xs font-extrabold rounded-full shadow-sm border flex gap-1.5 items-center transition-all hover:scale-[1.02]",
                      getStatusColorClass(request.status)
                    )}
                  >
                    {STATUS_TRANSLATIONS[request.status] || request.status}
                    <ChevronDown className="h-3 w-3 opacity-65" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-44 rounded-2xl p-1.5 shadow-xl border-slate-100">
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-slate-400 font-bold px-2 py-1">Cambiar Estado</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {Object.entries(STATUS_TRANSLATIONS).map(([status, label]) => {
                    const isRestrictedState = request.status === 'Approved' || request.status === 'Rejected';
                    const isDisabled = isRestrictedState && role !== 'admin' && status !== request.status;

                    return (
                      <DropdownMenuItem
                        key={status}
                        onSelect={() => handleStatusChange(status)}
                        className={cn("rounded-xl text-xs font-semibold px-2 py-1.5 cursor-pointer", status === request.status && "bg-slate-100 text-procarni-dark")}
                        disabled={isDisabled}
                      >
                        {label}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <span className="text-xs text-slate-500 font-medium italic mt-0.5">
              Solicitud de Cotización • {request.companies?.name || 'Procarni'}
            </span>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          <div className="flex items-center gap-2 ml-auto">
            {/* Primary Actions: Approve and Edit */}
            {(request.status === 'Draft' || role === 'admin') && request.status !== 'Approved' && request.status !== 'Archived' && (
              <Button
                onClick={() => setIsApproveConfirmOpen(true)}
                disabled={isApproving || isRejecting}
                className="bg-green-600 hover:bg-green-700 text-white gap-2 shadow-sm rounded-xl order-2 md:order-1"
                size="sm"
              >
                <CheckCircle className="h-4 w-4" />
                <span className="hidden sm:inline">Aprobar Solicitud</span>
              </Button>
            )}

            {isEditable && (
              <Button
                onClick={() => navigate(`/quote-requests/edit/${request.id}`)}
                variant="outline"
                size="sm"
                className="gap-2 order-1 md:order-2 rounded-xl"
              >
                <Edit className="h-4 w-4" />
                <span className="hidden sm:inline">Editar</span>
              </Button>
            )}

            {/* Secondary Actions: Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 order-3 rounded-xl">
                  <MoreVertical className="h-4 w-4" />
                  <span className="hidden sm:inline">Acciones</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-2xl p-1.5 shadow-xl border-slate-100">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-slate-400 font-bold px-2 py-1">Opciones de Documento</DropdownMenuLabel>
                <DropdownMenuSeparator />

                <DropdownMenuItem onSelect={() => setIsModalOpen(true)} className="rounded-xl cursor-pointer">
                  <FileText className="mr-2 h-4 w-4 text-slate-500" /> Previsualizar
                </DropdownMenuItem>

                <DropdownMenuItem asChild className="rounded-xl cursor-pointer">
                  <PDFDownloadButton
                    requestId={request.id}
                    fileNameGenerator={generateFileName}
                    endpoint="generate-qr-pdf"
                    label="Descargar PDF"
                    variant="ghost"
                    className="w-full justify-start cursor-pointer px-2 py-1.5 h-auto font-normal text-sm"
                  />
                </DropdownMenuItem>

                <DropdownMenuItem
                  onSelect={() => setIsEmailModalOpen(true)}
                  // @ts-ignore
                  disabled={!request.suppliers?.email}
                  className="rounded-xl cursor-pointer"
                >
                  <Mail className="mr-2 h-4 w-4 text-slate-500" /> Enviar por Correo
                </DropdownMenuItem>

                <DropdownMenuItem
                  onSelect={() => setIsWhatsAppModalOpen(true)}
                  // @ts-ignore
                  disabled={!request.suppliers?.phone && !request.suppliers?.phone_2}
                  className="rounded-xl cursor-pointer"
                >
                  <Smartphone className="mr-2 h-4 w-4 text-slate-500" /> Enviar por WhatsApp
                </DropdownMenuItem>

                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-slate-400 font-bold px-2 py-1">Flujo de Trabajo</DropdownMenuLabel>

                <DropdownMenuItem onSelect={handleConvertToPurchaseOrder} className="rounded-xl cursor-pointer">
                  <ShoppingCart className="mr-2 h-4 w-4 text-slate-500" /> Convertir a OC
                </DropdownMenuItem>

                {(request.status === 'Draft' || role === 'admin') && request.status !== 'Archived' && request.status !== 'Rejected' && (
                  <DropdownMenuItem onSelect={() => setIsRejectConfirmOpen(true)} className="text-red-600 focus:text-red-600 rounded-xl cursor-pointer">
                    <Clock className="mr-2 h-4 w-4" /> Rechazar Solicitud
                  </DropdownMenuItem>
                )}

                {request.status !== 'Archived' ? (
                  <DropdownMenuItem onSelect={() => handleStatusChange('Archived')} className="rounded-xl cursor-pointer">
                    <Archive className="mr-2 h-4 w-4 text-slate-500" /> Archivar
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => handleStatusChange('Draft')} className="rounded-xl cursor-pointer">
                    <RotateCcw className="mr-2 h-4 w-4 text-slate-500" /> Desarchivar
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Preview Dialog remains the same, but it's now triggered from dropdown */}
            <Dialog open={isModalOpen} onOpenChange={handleModalOpenChange}>
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
          </div>
        </div>
      </div>

      {/* PHASE 2: GENERAL INFORMATION GRID */}
      <Card className="border-none bg-white/70 backdrop-blur-xl shadow-2xl shadow-gray-200/50 ring-1 ring-white rounded-3xl p-6 mb-8 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-500">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
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
            <p className={valueClass}>
              <Link to={`/suppliers/${request.supplier_id}`} className="hover:underline text-procarni-primary font-semibold">
                {request.suppliers?.name || 'N/A'}
              </Link>
            </p>
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
            <span className={microLabelClass}>Fecha Emisión</span>
            <p className={valueClass}>
              {request.issue_date ? format(new Date(request.issue_date), 'PPP', { locale: es }) : format(new Date(request.created_at), 'PPP', { locale: es })}
            </p>
          </div>

          {/* Delivery Date */}
          <div className="space-y-1">
            <span className={microLabelClass}>Fecha Entrega</span>
            <p className={valueClass}>
              {request.deadline_date ? format(new Date(request.deadline_date), 'PPP', { locale: es }) : 'No definida'}
            </p>
          </div>

          {/* Created By */}
          <div className="space-y-1">
            <span className={microLabelClass}>Elaborado Por</span>
            <p className={valueClass}>
              {[request.profiles?.first_name, request.profiles?.last_name].filter(Boolean).join(' ').trim() || request.profiles?.username || request.created_by || '---'}
            </p>
          </div>
        </div>
      </Card>

      {/* PHASE 3: ITEMS TABLE */}
      <Card className="mb-8 border-none bg-white/70 backdrop-blur-xl shadow-2xl shadow-gray-200/50 ring-1 ring-white rounded-3xl overflow-hidden animate-in fade-in slide-in-from-bottom-3 duration-500">
        <CardContent className="p-0">
          {/* @ts-ignore */}
          {request.quote_request_items && request.quote_request_items.length > 0 ? (
            isMobile ? (
              <div className="grid gap-0 divide-y divide-slate-100">
                {/* @ts-ignore */}
                {request.quote_request_items.map((item) => (
                  <div key={item.id} className="p-4 bg-white space-y-2">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex flex-col gap-1 min-w-0">
                        {/* @ts-ignore */}
                        <p className="font-bold text-xs text-procarni-dark">{item.material_name || item.materials?.name || 'Material'}</p>
                        {/* @ts-ignore */}
                        {item.materials?.name && item.material_name && item.materials.name !== item.material_name && (
                          <Badge variant="outline" className="w-fit text-[9px] bg-amber-50 text-amber-700 border-amber-200 py-0 h-4">
                            Nuevo: {item.materials.name}
                          </Badge>
                        )}
                        {item.description && (
                          <p className="text-xs text-slate-500 italic mt-0.5">{item.description}</p>
                        )}
                      </div>
                      <Badge variant="outline" className="ml-2 font-mono text-[10px] bg-slate-50 border-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-bold">{item.quantity} {item.unit || 'UND'}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-slate-50/70 border-b border-slate-100">
                  <TableRow className="border-b border-slate-100 hover:bg-transparent">
                    <TableHead className={tableHeaderClass + " h-10 py-2 pl-6 w-[50%]"}>Material / Descripción</TableHead>
                    <TableHead className={tableHeaderClass + " h-10 py-2 text-center"}>Cantidad</TableHead>
                    <TableHead className={tableHeaderClass + " h-10 py-2 text-center"}>Unidad</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* @ts-ignore */}
                  {request.quote_request_items.map((item) => (
                    <TableRow key={item.id} className="border-b border-slate-100/60 hover:bg-slate-50/50 transition-colors last:border-b-0">
                      <TableCell className="pl-6 py-4">
                        <span className="font-bold text-procarni-dark text-sm block">
                          {/* @ts-ignore */}
                          {item.material_name || item.materials?.name || 'Material'}
                        </span>
                        {/* @ts-ignore */}
                        {item.materials?.name && item.material_name && item.materials.name !== item.material_name && (
                          <Badge variant="outline" className="mt-1 text-[10px] bg-amber-50 text-amber-700 border-amber-200 py-0 h-4">
                            Nuevo nombre: {item.materials.name}
                          </Badge>
                        )}
                        {item.description && (
                          <span className="text-xs text-slate-500 italic truncate max-w-[300px] block mt-0.5">{item.description}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center font-mono text-sm font-semibold text-slate-700">{item.quantity}</TableCell>
                      <TableCell className="text-center text-xs text-slate-500 font-semibold">{item.unit || 'UND'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 bg-white">
              <ShoppingCart className="h-12 w-12 mb-3 text-slate-200" />
              <p className="text-sm">No hay ítems registrados.</p>
            </div>
          )}
        </CardContent>
      </Card>


      <EmailSenderModal
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        // @ts-ignore
        onSend={(message) => handleSendEmail(message)}
        // @ts-ignore
        recipientEmail={request.suppliers?.email || ''}
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

      <AlertDialog open={isRejectConfirmOpen} onOpenChange={setIsRejectConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Rechazo</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas rechazar esta Solicitud de Cotización? Esta acción marcará la solicitud como rechazada y no podrá ser editada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRejecting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRejectRequest} disabled={isRejecting} className="bg-red-600 hover:bg-red-700 text-white border-red-600">
              {isRejecting ? 'Rechazando...' : 'Rechazar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <WhatsAppShareModal
        isOpen={isWhatsAppModalOpen}
        onClose={() => setIsWhatsAppModalOpen(false)}
        orderId={request.id}
        type="quote_request"
        // @ts-ignore
        supplierName={request.suppliers?.name || 'Proveedor'}
        orderNumber={request.id.substring(0, 8)}
        phones={{
          // @ts-ignore
          primary: request.suppliers?.phone || null,
          // @ts-ignore
          secondary: request.suppliers?.phone_2 || null
        }}
      />
    </div>
  );
};

export default QuoteRequestDetails;