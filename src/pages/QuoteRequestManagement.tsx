// src/pages/QuoteRequestManagement.tsx

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { PlusCircle, Edit, Trash2, Search, Eye, ArrowLeft, Archive, RotateCcw, CheckCircle, Send, History, Clock, XCircle, Trash } from 'lucide-react';
import { MadeWithDyad } from '@/components/made-with-dyad';
import { quoteRequestService } from '@/services/quoteRequestService';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { showError, showSuccess } from '@/utils/toast';
import { useSession } from '@/components/SessionContextProvider';
import { Input } from '@/components/ui/input';
import { Link, useNavigate } from 'react-router-dom';
import { useIsMobile, useIsTablet } from '@/hooks/use-mobile';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';

const STATUS_TRANSLATIONS: Record<string, string> = {
  'Draft': 'Borrador',
  'Approved': 'Aprobada',
  'Rejected': 'Rechazada',
  'Archived': 'Archivada',
};

const QuoteRequestManagement = () => {
  const queryClient = useQueryClient();
  const { session } = useSession();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const isMobileView = isMobile || isTablet;

  const [searchTerm, setSearchTerm] = useState('');
  const [isHistoryMode, setIsHistoryMode] = useState(false);

  // Tabs state depends on mode
  const [activeTab, setActiveTab] = useState<string>('all');

  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [requestToModify, setRequestToModify] = useState<{ id: string; action: 'archive' | 'unarchive' | 'delete' | 'reject' } | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkApproveDialogOpen, setIsBulkApproveDialogOpen] = useState(false);
  const [isBulkArchiveDialogOpen, setIsBulkArchiveDialogOpen] = useState(false);
  const [isBulkRejectDialogOpen, setIsBulkRejectDialogOpen] = useState(false);
  const [isBulkRestoreDialogOpen, setIsBulkRestoreDialogOpen] = useState(false);
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [requestToReject, setRequestToReject] = useState<string | null>(null);

  // Rejection mutation
  const rejectMutation = useMutation({
    mutationFn: (id: string) => quoteRequestService.updateStatus(id, 'Rejected'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quoteRequests'] });
      showSuccess('Solicitud rechazada exitosamente.');
      setIsRejectDialogOpen(false);
      setRequestToReject(null);
    },
    onError: (err: any) => {
      showError(`Error al rechazar solicitud: ${err.message}`);
      setIsRejectDialogOpen(false);
      setRequestToReject(null);
    },
  });

  // Fetch Requests based on Mode
  const { data: quoteRequests, isLoading, error } = useQuery({
    queryKey: ['quoteRequests', isHistoryMode ? 'History' : 'Active'],
    queryFn: async () => await quoteRequestService.getAll(isHistoryMode ? 'History' : 'Active'),
    enabled: !!session,
  });

  const filteredQuoteRequests = useMemo(() => {
    if (!quoteRequests) return [];

    let filtered = quoteRequests;

    // Filter by Tab
    if (activeTab !== 'all') {
      filtered = filtered.filter(q => q.status === activeTab);
    }

    // Filter by Search Term
    if (searchTerm) {
      const lowerCaseSearchTerm = searchTerm.toLowerCase();
      filtered = filtered.filter(request =>
        // @ts-ignore
        (request.suppliers?.name || '').toLowerCase().includes(lowerCaseSearchTerm) ||
        // @ts-ignore
        (request.companies?.name || '').toLowerCase().includes(lowerCaseSearchTerm) ||
        (request.currency || '').toLowerCase().includes(lowerCaseSearchTerm) ||
        request.id.toLowerCase().includes(lowerCaseSearchTerm) ||
        (STATUS_TRANSLATIONS[request.status] || request.status).toLowerCase().includes(lowerCaseSearchTerm)
      );
    }

    return filtered;
  }, [quoteRequests, searchTerm, activeTab]);

  const archiveMutation = useMutation({
    mutationFn: (id: string) => quoteRequestService.updateStatus(id, 'Archived'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quoteRequests'] });
      showSuccess('Solicitud archivada exitosamente.');
      setIsConfirmDialogOpen(false);
      setRequestToModify(null);
    },
    onError: (err) => {
      showError(`Error al archivar solicitud: ${err.message}`);
      setIsConfirmDialogOpen(false);
      setRequestToModify(null);
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: (id: string) => quoteRequestService.updateStatus(id, 'Draft'), // Restore to Draft or check logic?
    // Actually, if unarchiving, it usually goes back to Draft or previous. Let's assume Draft for simplicity or Sent?
    // Let's stick to Draft so they can review it.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quoteRequests'] });
      showSuccess('Solicitud restaurada a Borrador.');
      setIsConfirmDialogOpen(false);
      setRequestToModify(null);
    },
    onError: (err) => {
      showError(`Error al desarchivar solicitud: ${err.message}`);
      setIsConfirmDialogOpen(false);
      setRequestToModify(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: quoteRequestService.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quoteRequests'] });
      showSuccess('Solicitud eliminada permanentemente.');
      setIsDeleteDialogOpen(false);
      setRequestToModify(null);
    },
    onError: (err) => {
      showError(`Error al eliminar solicitud: ${err.message}`);
      setIsDeleteDialogOpen(false);
      setRequestToModify(null);
    },
  });

  const handleRejectClick = (id: string) => {
    setRequestToReject(id);
    setIsRejectDialogOpen(true);
  };

  const confirmReject = async () => {
    if (requestToReject) {
      await rejectMutation.mutateAsync(requestToReject);
    }
  };

  const confirmAction = (id: string, action: 'archive' | 'unarchive' | 'delete') => {
    setRequestToModify({ id, action });
    if (action === 'delete') {
      setIsDeleteDialogOpen(true);
    } else {
      setIsConfirmDialogOpen(true);
    }
  };

  const executeAction = async () => {
    if (!requestToModify) return;

    if (requestToModify.action === 'archive') {
      await archiveMutation.mutateAsync(requestToModify.id);
    } else if (requestToModify.action === 'unarchive') {
      await unarchiveMutation.mutateAsync(requestToModify.id);
    } else if (requestToModify.action === 'delete') {
      await deleteMutation.mutateAsync(requestToModify.id);
    }
  };

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleAll = () => {
    if (selectedIds.size === filteredQuoteRequests.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredQuoteRequests.map(q => q.id)));
    }
  };

  const executeBulkApprove = async () => {
    try {
      await Promise.all(Array.from(selectedIds).map(id => quoteRequestService.updateStatus(id, 'Approved')));
      queryClient.invalidateQueries({ queryKey: ['quoteRequests'] });
      showSuccess(`${selectedIds.size} solicitudes aprobadas exitosamente.`);
      setSelectedIds(new Set());
      setIsBulkApproveDialogOpen(false);
    } catch (error) {
      console.error('Error approving requests:', error);
      showError('Error al aprobar las solicitudes seleccionadas.');
    }
  };

  const executeBulkReject = async () => {
    try {
      await Promise.all(Array.from(selectedIds).map(id => quoteRequestService.updateStatus(id, 'Rejected')));
      queryClient.invalidateQueries({ queryKey: ['quoteRequests'] });
      showSuccess(`${selectedIds.size} solicitudes rechazadas exitosamente.`);
      setSelectedIds(new Set());
      setIsBulkRejectDialogOpen(false);
    } catch (error) {
      console.error('Error rejecting requests:', error);
      showError('Error al rechazar las solicitudes seleccionadas.');
    }
  };

  const executeBulkArchive = async () => {
    try {
      await Promise.all(Array.from(selectedIds).map(id => quoteRequestService.updateStatus(id, 'Archived')));
      queryClient.invalidateQueries({ queryKey: ['quoteRequests'] });
      showSuccess(`${selectedIds.size} solicitudes archivadas exitosamente.`);
      setSelectedIds(new Set());
      setIsBulkArchiveDialogOpen(false);
    } catch (error) {
      console.error('Error archiving requests:', error);
      showError('Error al archivar las solicitudes seleccionadas.');
    }
  };

  const executeBulkRestore = async () => {
    try {
      await Promise.all(Array.from(selectedIds).map(id => quoteRequestService.updateStatus(id, 'Draft')));
      queryClient.invalidateQueries({ queryKey: ['quoteRequests'] });
      showSuccess(`${selectedIds.size} solicitudes restauradas a borrador.`);
      setSelectedIds(new Set());
      setIsBulkRestoreDialogOpen(false);
    } catch (error) {
      console.error('Error restoring requests:', error);
      showError('Error al restaurar las solicitudes seleccionadas.');
    }
  };

  const executeBulkDelete = async () => {
    try {
      await Promise.all(Array.from(selectedIds).map(id => quoteRequestService.delete(id)));
      queryClient.invalidateQueries({ queryKey: ['quoteRequests'] });
      showSuccess(`${selectedIds.size} solicitudes eliminadas permanentemente.`);
      setSelectedIds(new Set());
      setIsBulkDeleteDialogOpen(false);
    } catch (error) {
      console.error('Error deleting requests:', error);
      showError('Error al eliminar las solicitudes seleccionadas.');
    }
  };

  const handleViewDetails = (requestId: string) => {
    navigate(`/quote-requests/${requestId}`);
  };

  const handleEditRequest = (requestId: string) => {
    navigate(`/quote-requests/edit/${requestId}`);
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'Draft': return 'secondary'; // Yellow-ish usually handled by class, but badge variant 'secondary' is grey.
      case 'Approved': return 'outline'; // Green usually
      case 'Rejected': return 'destructive';
      case 'Archived': return 'outline';
      default: return 'secondary';
    }
  };

  const getStatusColorClass = (status: string) => {
    switch (status) {
      case 'Draft': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'Approved': return 'bg-green-100 text-green-800 border-green-200';
      case 'Rejected': return 'bg-red-100 text-red-800 border-red-200';
      case 'Archived': return 'bg-gray-100 text-gray-600 border-gray-200';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  if (error) {
    showError(error.message);
    return (
      <div className="container mx-auto p-4 text-center text-destructive">
        Error al cargar las solicitudes de cotización: {error.message}
      </div>
    );
  }

  const renderActions = (request: any) => {
    const isEditable = request.status === 'Draft';
    const isArchived = request.status === 'Archived';

    return (
      <TableCell className="text-right pr-4 py-3">
        <TooltipProvider delayDuration={0}>
          <div className="flex justify-end gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => handleViewDetails(request.id)} className="h-8 w-8">
                  <Eye className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Ver Detalles</TooltipContent>
            </Tooltip>

            {request.status === 'Draft' && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={() => handleEditRequest(request.id)} className="h-8 w-8 text-blue-600">
                    <Edit className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Editar</TooltipContent>
              </Tooltip>
            )}

            {request.status === 'Draft' ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={() => confirmAction(request.id, 'archive')} className="h-8 w-8 text-gray-500">
                    <Archive className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Archivar</TooltipContent>
              </Tooltip>
            ) : request.status === 'Archived' && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={() => confirmAction(request.id, 'unarchive')} className="h-8 w-8 text-gray-500">
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Desarchivar</TooltipContent>
              </Tooltip>
            )}
          </div>
        </TooltipProvider>
      </TableCell>
    );
  };

  const renderMobileCard = (request: any) => (
    <Card key={request.id} className={cn("p-4 shadow-md bg-white", selectedIds.has(request.id) && "border-procarni-secondary border-2")}>
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Checkbox
            checked={selectedIds.has(request.id)}
            onCheckedChange={() => toggleSelection(request.id)}
          />
          <CardTitle className="text-lg truncate font-mono text-procarni-dark">{request.id.substring(0, 8)}</CardTitle>
        </div>
        <span className={cn("px-2 py-0.5 text-xs font-medium rounded-full shrink-0 border", getStatusColorClass(request.status))}>
          {STATUS_TRANSLATIONS[request.status] || request.status}
        </span>
      </div>
      <div className="text-sm space-y-1 mt-2">
        <p><strong>Proveedor:</strong> {request.suppliers?.name || 'Varios'}</p>
        <p><strong>Fecha:</strong> {new Date(request.created_at).toLocaleDateString('es-VE')}</p>
      </div>
      <div className="flex justify-end gap-2 mt-4 border-t pt-3">
        <TooltipProvider delayDuration={0}>
          <div className="flex gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => handleViewDetails(request.id)}>
                  <Eye className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Ver Detalles</TooltipContent>
            </Tooltip>

            {request.status === 'Draft' && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" className="h-9 w-9 text-blue-600 border-blue-100 hover:bg-blue-50" onClick={() => handleEditRequest(request.id)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Editar</TooltipContent>
              </Tooltip>
            )}

            {request.status === 'Draft' ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" className="h-9 w-9 text-gray-500 border-gray-100 hover:bg-gray-50" onClick={() => confirmAction(request.id, 'archive')}>
                    <Archive className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Archivar</TooltipContent>
              </Tooltip>
            ) : request.status === 'Archived' && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" className="h-9 w-9 text-gray-500 border-gray-100 hover:bg-gray-50" onClick={() => confirmAction(request.id, 'unarchive')}>
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Desarchivar</TooltipContent>
              </Tooltip>
            )}
          </div>
        </TooltipProvider>
      </div>
    </Card>
  );

  return (
    <div className="container mx-auto p-4 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-procarni-primary tracking-tight">Solicitudes de Cotización</h1>
          <p className="text-muted-foreground text-sm">Gestiona tus peticiones de precios a proveedores.</p>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <Button
            variant={isHistoryMode ? "secondary" : "outline"}
            onClick={() => {
              setIsHistoryMode(!isHistoryMode);
              setActiveTab('all');
            }}
            className="gap-2"
            size="sm"
          >
            {isHistoryMode ? <CheckCircle className="h-4 w-4" /> : <History className="h-4 w-4" />}
            {isHistoryMode ? 'Ver Activos' : 'Historial'}
          </Button>
          <Button
            asChild
            className="bg-procarni-secondary hover:bg-green-700 text-white gap-2"
            size="sm"
          >
            <Link to="/generate-quote">
              <PlusCircle className="h-4 w-4" />
              <span className="hidden sm:inline">Nueva Solicitud</span>
            </Link>
          </Button>
        </div>
      </div>

      <Card className="mb-6 border-none shadow-sm bg-transparent md:bg-white md:border md:border-gray-200">
        <CardContent className="p-0 md:p-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-4">
              <TabsList className="grid w-full md:w-auto grid-cols-3 md:flex h-9">
                <TabsTrigger value="all" className="text-xs md:text-sm">Todas</TabsTrigger>
                {isHistoryMode ? (
                  <>
                    <TabsTrigger value="Approved" className="text-xs md:text-sm">Aprobadas</TabsTrigger>
                    <TabsTrigger value="Rejected" className="text-xs md:text-sm">Rechazadas</TabsTrigger>
                    <TabsTrigger value="Archived" className="text-xs md:text-sm hidden md:flex">Archivadas</TabsTrigger>
                  </>
                ) : (
                  <>
                    <TabsTrigger value="Draft" className="text-xs md:text-sm">Borradores</TabsTrigger>
                  </>
                )}
              </TabsList>

              <div className="relative w-full md:w-72">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Buscar solicitud..."
                  className="w-full appearance-none bg-background pl-8 h-9 text-sm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <TabsContent value={activeTab} className="mt-0">

              {/* Bulk Actions Bar */}
              {selectedIds.size > 0 && (
                <div className="bg-procarni-primary/5 border border-procarni-primary/20 p-2 rounded-md mb-4 flex items-center justify-between animate-in fade-in slide-in-from-top-2">
                  <span className="text-sm font-medium text-procarni-primary ml-2">{selectedIds.size} {isMobile ? 'Sel.' : 'seleccionados'}</span>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())} className="h-8 text-xs hover:bg-white/50">
                      Cancelar
                    </Button>
                    <TooltipProvider delayDuration={0}>
                      <div className="flex gap-1.5">
                        {!isHistoryMode ? (
                          <>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8 text-procarni-secondary border-procarni-secondary/20 hover:bg-procarni-secondary hover:text-white"
                                  onClick={() => setIsBulkApproveDialogOpen(true)}
                                >
                                  <CheckCircle className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Aprobar Seleccionados</TooltipContent>
                            </Tooltip>

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8 text-red-500 border-red-200 hover:bg-red-500 hover:text-white"
                                  onClick={() => setIsBulkRejectDialogOpen(true)}
                                >
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Rechazar Seleccionados</TooltipContent>
                            </Tooltip>

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8 text-gray-500 border-gray-200 hover:bg-gray-500 hover:text-white"
                                  onClick={() => setIsBulkArchiveDialogOpen(true)}
                                >
                                  <Archive className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Archivar Seleccionados</TooltipContent>
                            </Tooltip>
                          </>
                        ) : (
                          <>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8 text-procarni-secondary border-procarni-secondary/20 hover:bg-procarni-secondary hover:text-white"
                                  onClick={() => setIsBulkRestoreDialogOpen(true)}
                                >
                                  <RotateCcw className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Restaurar Seleccionados</TooltipContent>
                            </Tooltip>

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8 text-destructive border-destructive/20 hover:bg-destructive hover:text-white"
                                  onClick={() => setIsBulkDeleteDialogOpen(true)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Eliminar Permanentemente</TooltipContent>
                            </Tooltip>
                          </>
                        )}
                      </div>
                    </TooltipProvider>
                  </div>
                </div>
              )}

              {isLoading ? (
                <div className="text-center text-muted-foreground p-12 flex flex-col items-center">
                  <div className="h-8 w-8 border-4 border-procarni-secondary border-t-transparent rounded-full animate-spin mb-4"></div>
                  <p>Cargando solicitudes...</p>
                </div>
              ) : filteredQuoteRequests.length > 0 ? (
                isMobileView ? (
                  <div className="grid gap-3">
                    {filteredQuoteRequests.map(renderMobileCard)}
                  </div>
                ) : (
                  <div className="rounded-md border border-gray-100 overflow-hidden">
                    <Table>
                      <TableHeader className="bg-gray-50/50">
                        <TableRow>
                          <TableHead className="w-[40px] pl-4">
                            <Checkbox
                              checked={filteredQuoteRequests.length > 0 && selectedIds.size === filteredQuoteRequests.length}
                              onCheckedChange={toggleAll}
                            />
                          </TableHead>
                          <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500">ID</TableHead>
                          <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500">Proveedor</TableHead>
                          <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500">Empresa</TableHead>
                          <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500">Estado</TableHead>
                          <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500">Fecha</TableHead>
                          <TableHead className="text-right font-semibold text-xs tracking-wider uppercase text-gray-500 pr-4">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredQuoteRequests.map((request) => (
                          <TableRow key={request.id} className="hover:bg-gray-50/50 transition-colors">
                            <TableCell className="pl-4 py-3">
                              <Checkbox
                                checked={selectedIds.has(request.id)}
                                onCheckedChange={() => toggleSelection(request.id)}
                              />
                            </TableCell>
                            <TableCell className="py-3 text-xs font-mono text-gray-500">{request.id.substring(0, 8)}</TableCell>
                            {/* @ts-ignore */}
                            <TableCell className="py-3 font-medium text-procarni-dark">{request.suppliers?.name || '---'}</TableCell>
                            {/* @ts-ignore */}
                            <TableCell className="py-3 text-gray-600">{request.companies?.name || '---'}</TableCell>
                            <TableCell className="py-3">
                              <Badge variant="outline" className={cn("rounded-md py-0.5 font-normal", getStatusColorClass(request.status))}>
                                {STATUS_TRANSLATIONS[request.status] || request.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="py-3 text-gray-500 text-sm">{new Date(request.created_at).toLocaleDateString('es-VE')}</TableCell>
                            {renderActions(request)}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )
              ) : (
                <div className="text-center p-12 bg-gray-50/50 rounded-lg border border-dashed border-gray-200">
                  <div className="bg-white p-3 rounded-full w-fit mx-auto shadow-sm mb-3">
                    <Search className="h-6 w-6 text-gray-300" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-1">No se encontraron solicitudes</h3>
                  <p className="text-sm text-gray-500 max-w-sm mx-auto">
                    {searchTerm
                      ? `No hay resultados para "${searchTerm}" en esta vista.`
                      : "No tienes solicitudes de cotización en esta categoría."}
                  </p>
                  {!searchTerm && !isHistoryMode && (
                    <Button variant="outline" className="mt-4" asChild>
                      <Link to="/generate-quote">Crear primera solicitud</Link>
                    </Button>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      <MadeWithDyad />

      {/* Confirms */}
      <AlertDialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {requestToModify?.action === 'archive' ? 'Confirmar Archivado' : 'Confirmar Restauración'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {requestToModify?.action === 'archive'
                ? '¿Estás seguro de que deseas archivar esta solicitud? Pasará al historial.'
                : '¿Estás seguro de que deseas restaurar esta solicitud a Borrador?'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archiveMutation.isPending || unarchiveMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeAction}
              disabled={archiveMutation.isPending || unarchiveMutation.isPending}
              className={requestToModify?.action === 'archive' ? "bg-gray-800 text-white" : "bg-procarni-secondary hover:bg-green-700"}
            >
              {requestToModify?.action === 'archive' ? 'Archivar' : 'Restaurar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Eliminación Permanente</AlertDialogTitle>
            <AlertDialogDescription className="text-red-500 font-medium">
              Esta acción es irreversible.
            </AlertDialogDescription>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas eliminar permanentemente esta Solicitud de Cotización?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeAction}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar Permanentemente'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Rechazo</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas rechazar esta solicitud de cotización? Esta acción es definitiva.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rejectMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmReject}
              disabled={rejectMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {rejectMutation.isPending ? 'Rechazando...' : 'Rechazar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isBulkApproveDialogOpen} onOpenChange={setIsBulkApproveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Aprobación Masiva</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas aprobar las {selectedIds.size} solicitudes seleccionadas?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={executeBulkApprove} className="bg-procarni-secondary hover:bg-green-700 text-white">
              Aprobar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isBulkArchiveDialogOpen} onOpenChange={setIsBulkArchiveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Archivado Masivo</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas archivar las {selectedIds.size} solicitudes seleccionadas?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={executeBulkArchive} className="bg-gray-800 text-white">
              Archivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isBulkRejectDialogOpen} onOpenChange={setIsBulkRejectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Rechazo Masivo</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas rechazar las {selectedIds.size} solicitudes seleccionadas?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={executeBulkReject} className="bg-red-600 hover:bg-red-700 text-white border-red-600">
              Rechazar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isBulkRestoreDialogOpen} onOpenChange={setIsBulkRestoreDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Restauración Masiva</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas restaurar las {selectedIds.size} solicitudes seleccionadas a Borrador?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={executeBulkRestore} className="bg-procarni-secondary hover:bg-green-700 text-white">
              Restaurar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isBulkDeleteDialogOpen} onOpenChange={setIsBulkDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Eliminación Masiva Permanente</AlertDialogTitle>
            <AlertDialogDescription className="text-red-500 font-medium">
              Esta acción es irreversible y afectará a {selectedIds.size} solicitudes.
            </AlertDialogDescription>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas eliminar permanentemente todas las solicitudes seleccionadas?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={executeBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar Permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
};

export default QuoteRequestManagement;