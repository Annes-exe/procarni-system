// src/pages/QuoteRequestManagement.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { PlusCircle, Edit, Trash2, Search, Eye, ArrowLeft, Archive, RotateCcw, CheckCircle, Send, History, Clock, XCircle, Trash, ChevronDown, ChevronRight, Package, MoreHorizontal, FileText } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { quoteRequestService } from '@/services/quoteRequestService';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import PDFDownloadButton from '@/components/PDFDownloadButton';
import { showError, showSuccess } from '@/utils/toast';
import { useSession } from '@/components/SessionContextProvider';
import { Input } from '@/components/ui/input';
import { Link, useNavigate } from 'react-router-dom';
import { useIsMobile, useIsTablet } from '@/hooks/use-mobile';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const STATUS_TRANSLATIONS: Record<string, string> = {
  'Draft': 'Borrador',
  'Sent': 'Enviada',
  'Approved': 'Aprobada',
  'Rejected': 'Rechazada',
  'Archived': 'Archivada',
};

const QuoteRequestManagement = () => {
  const queryClient = useQueryClient();
  const { session, role, supabase } = useSession();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const isMobileView = isMobile || isTablet;

  const [searchTerm, setSearchTerm] = useState('');
  const [isHistoryMode, setIsHistoryMode] = useState(false);
  const [onlyRawMaterials, setOnlyRawMaterials] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>('all');
  const [usersList, setUsersList] = useState<{ id: string; first_name: string | null; last_name: string | null; email: string | null }[]>([]);

  useEffect(() => {
    const fetchUsers = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email')
        .order('first_name', { ascending: true });
      if (!error && data) {
        setUsersList(data);
      }
    };
    fetchUsers();
  }, [supabase]);

  // Expanded row state for accordion (only 1 row open at a time)
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

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
    queryKey: ['quoteRequests', isHistoryMode ? 'History' : 'Active', onlyRawMaterials],
    queryFn: async () => await quoteRequestService.getAll(isHistoryMode ? 'History' : 'Active' as any, onlyRawMaterials),
    enabled: !!session,
  });

  const filteredQuoteRequests = useMemo(() => {
    if (!quoteRequests) return [];

    let filtered = quoteRequests;

    // Filter by Creator User
    if (selectedUserId && selectedUserId !== 'all') {
      filtered = filtered.filter(q => q.user_id === selectedUserId);
    }

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
  }, [quoteRequests, searchTerm, activeTab, selectedUserId]);

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
      case 'Draft': return 'secondary';
      case 'Sent': return 'outline';
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
      <TableCell className="text-right pr-4 py-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-1">
          <PDFDownloadButton
            requestId={request.id}
            endpoint="generate-qr-pdf"
            fileNameGenerator={() => {
              const id = request.id.substring(0, 8);
              const supplierName = request.suppliers?.name?.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_') || 'Proveedor';
              return `Cotizacion-${id}-${supplierName}.pdf`;
            }}
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-blue-600 hover:bg-blue-50"
            label=""
          />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-xl hover:bg-slate-100 text-slate-500"
                title="Opciones"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40 rounded-2xl shadow-xl border border-slate-100 p-1.5">
              <DropdownMenuItem
                onClick={() => handleViewDetails(request.id)}
                className="flex items-center gap-2 text-xs font-semibold py-2 rounded-xl cursor-pointer text-slate-700 hover:text-procarni-blue hover:bg-slate-50"
              >
                <Eye className="h-4 w-4 text-slate-400" />
                <span>Ver Detalles</span>
              </DropdownMenuItem>

              {request.status === 'Draft' && (
                <DropdownMenuItem
                  onClick={() => confirmAction(request.id, 'archive')}
                  className="flex items-center gap-2 text-xs font-semibold py-2 rounded-xl cursor-pointer text-slate-700 hover:bg-slate-50"
                >
                  <Archive className="h-4 w-4 text-slate-400" />
                  <span>Archivar</span>
                </DropdownMenuItem>
              )}

              {request.status === 'Archived' && (
                <DropdownMenuItem
                  onClick={() => confirmAction(request.id, 'unarchive')}
                  className="flex items-center gap-2 text-xs font-semibold py-2 rounded-xl cursor-pointer text-slate-700 hover:bg-slate-50"
                >
                  <RotateCcw className="h-4 w-4 text-slate-400" />
                  <span>Desarchivar</span>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    );
  };

  const renderMobileCard = (request: any) => {
    const isExpanded = expandedRowId === request.id;
    const items = request.quote_request_items || [];

    return (
      <Card
        key={request.id}
        className={cn(
          "bg-white/80 backdrop-blur-xl border border-slate-100 shadow-xl shadow-gray-200/50 ring-1 ring-white rounded-3xl p-5 transition-all overflow-hidden",
          selectedIds.has(request.id) && "ring-2 ring-procarni-secondary border-procarni-secondary",
          isExpanded && "border-l-4 border-l-procarni-primary"
        )}
      >
        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <Checkbox
              checked={selectedIds.has(request.id)}
              onCheckedChange={() => toggleSelection(request.id)}
              onClick={(e) => e.stopPropagation()}
            />
            <CardTitle className="text-base truncate font-mono font-bold text-procarni-dark">
              {request.id.substring(0, 8)}
            </CardTitle>
          </div>
          <span className={cn("px-2 py-0.5 text-[11px] font-semibold rounded-md border shrink-0", getStatusColorClass(request.status))}>
            {STATUS_TRANSLATIONS[request.status] || request.status}
          </span>
        </div>

        <div className="space-y-1.5 text-xs mb-3">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400">Proveedor</span>
            <p className="font-semibold text-slate-900 truncate">{request.suppliers?.name || 'Varios / General'}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400">Empresa</span>
              <p className="font-medium text-slate-700 truncate">{request.companies?.name || 'N/A'}</p>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400">Fecha</span>
              <p className="text-slate-600">{new Date(request.created_at).toLocaleDateString('es-VE')}</p>
            </div>
          </div>
        </div>

        {/* Expand Accordion Button for Mobile Items */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setExpandedRowId(isExpanded ? null : request.id)}
          className="w-full flex items-center justify-between text-xs py-2 bg-slate-50/80 hover:bg-slate-100/80 border-slate-200 text-slate-700 font-medium rounded-xl my-2"
        >
          <span className="flex items-center gap-1.5">
            <Package className="h-3.5 w-3.5 text-procarni-primary" />
            {items.length} {items.length === 1 ? 'material solicitado' : 'materiales solicitados'}
          </span>
          <span className="flex items-center gap-1 text-slate-500 font-semibold text-[11px]">
            {isExpanded ? 'Ocultar' : 'Ver detalle'}
            {isExpanded ? <ChevronDown className="h-4 w-4 text-procarni-primary" /> : <ChevronRight className="h-4 w-4" />}
          </span>
        </Button>

        {/* Expanded Items Cards on Mobile */}
        {isExpanded && (
          <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 animate-in fade-in slide-in-from-top-1 duration-200">
            {items.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-1 text-center">No hay ítems registrados en esta solicitud.</p>
            ) : (
              <div className="space-y-2">
                {items.map((item: any, idx: number) => (
                  <div key={item.id || idx} className="bg-slate-50/70 p-2.5 rounded-xl border border-slate-100 text-xs space-y-1">
                    <div className="flex justify-between items-start gap-2">
                      <span className="font-semibold text-slate-800 flex-1">{idx + 1}. {item.description || item.material_name || 'Material S/N'}</span>
                      <span className="font-mono font-bold text-procarni-dark shrink-0">
                        {item.quantity} {item.unit || 'UND'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Action Buttons Footer */}
        <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100" onClick={(e) => e.stopPropagation()}>
          <span className="text-[11px] text-slate-400 font-medium">Opciones</span>
          <div className="flex items-center gap-1">
            <PDFDownloadButton
              requestId={request.id}
              endpoint="generate-qr-pdf"
              fileNameGenerator={() => {
                const id = request.id.substring(0, 8);
                const supplierName = request.suppliers?.name?.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_') || 'Proveedor';
                return `Cotizacion-${id}-${supplierName}.pdf`;
              }}
              variant="outline"
              size="sm"
              className="h-8 px-2.5 text-xs text-blue-600 border-blue-100 hover:bg-blue-50"
              label="PDF"
            />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl hover:bg-slate-100 text-slate-500">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40 rounded-2xl shadow-xl border border-slate-100 p-1.5">
                <DropdownMenuItem
                  onClick={() => handleViewDetails(request.id)}
                  className="flex items-center gap-2 text-xs font-semibold py-2 rounded-xl cursor-pointer text-slate-700 hover:text-procarni-blue hover:bg-slate-50"
                >
                  <Eye className="h-4 w-4 text-slate-400" />
                  <span>Ver Detalles</span>
                </DropdownMenuItem>

                {request.status === 'Draft' && (
                  <DropdownMenuItem
                    onClick={() => confirmAction(request.id, 'archive')}
                    className="flex items-center gap-2 text-xs font-semibold py-2 rounded-xl cursor-pointer text-slate-700 hover:bg-slate-50"
                  >
                    <Archive className="h-4 w-4 text-slate-400" />
                    <span>Archivar</span>
                  </DropdownMenuItem>
                )}

                {request.status === 'Archived' && (
                  <DropdownMenuItem
                    onClick={() => confirmAction(request.id, 'unarchive')}
                    className="flex items-center gap-2 text-xs font-semibold py-2 rounded-xl cursor-pointer text-slate-700 hover:bg-slate-50"
                  >
                    <RotateCcw className="h-4 w-4 text-slate-400" />
                    <span>Desarchivar</span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div className="container mx-auto p-4 md:p-6 pb-20 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white/70 backdrop-blur-xl border border-slate-100 shadow-xl shadow-slate-200/40 ring-1 ring-white rounded-3xl p-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-2xl bg-procarni-primary/10 text-procarni-primary">
              <FileText className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-extrabold text-procarni-dark tracking-tight">Solicitudes de Cotización</h1>
          </div>
          <p className="text-xs md:text-sm text-slate-500 font-medium">
            Gestiona tus peticiones de precios a proveedores y seguimiento de cotizaciones.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
          <Button
            variant={isHistoryMode ? "secondary" : "outline"}
            onClick={() => {
              const newHistoryMode = !isHistoryMode;
              setIsHistoryMode(newHistoryMode);
              setActiveTab(newHistoryMode ? 'Rejected' : 'all');
            }}
            className="border-slate-200 bg-slate-50/80 hover:bg-slate-100 text-slate-700 shadow-sm rounded-2xl h-10 px-4 font-semibold text-xs transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center gap-2"
            size="sm"
          >
            {isHistoryMode ? <CheckCircle className="h-4 w-4 text-emerald-600" /> : <History className="h-4 w-4 text-slate-500" />}
            <span>{isHistoryMode ? 'Ver Activos' : 'Historial'}</span>
          </Button>
          <Button
            asChild
            className="bg-procarni-secondary hover:bg-emerald-800 text-white shadow-lg shadow-emerald-900/10 rounded-2xl h-10 px-4 font-semibold text-xs transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center gap-2 w-full sm:w-auto"
            size="sm"
          >
            <Link to="/generate-quote">
              <PlusCircle className="h-4 w-4" />
              <span>Nueva Solicitud</span>
            </Link>
          </Button>
        </div>
      </div>

      {/* Main Content Card */}
      <Card className="bg-white/80 backdrop-blur-xl border border-slate-100 shadow-xl shadow-gray-200/50 ring-1 ring-white rounded-3xl p-6 overflow-hidden">
        <CardContent className="p-0 space-y-5">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-5">
            <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4">
              <TabsList className={cn("bg-slate-100/80 p-1.5 rounded-2xl border border-slate-200/60 inline-flex flex-wrap gap-1", isHistoryMode ? "grid grid-cols-2" : "grid grid-cols-3")}>
                {isHistoryMode ? (
                  <>
                    <TabsTrigger value="Rejected" className="rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 data-[state=active]:bg-white data-[state=active]:text-procarni-blue data-[state=active]:shadow-md transition-all">Rechazadas</TabsTrigger>
                    <TabsTrigger value="Archived" className="rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 data-[state=active]:bg-white data-[state=active]:text-procarni-blue data-[state=active]:shadow-md transition-all">Archivadas</TabsTrigger>
                  </>
                ) : (
                  <>
                    <TabsTrigger value="all" className="rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 data-[state=active]:bg-white data-[state=active]:text-procarni-blue data-[state=active]:shadow-md transition-all">Todas</TabsTrigger>
                    <TabsTrigger value="Draft" className="rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 data-[state=active]:bg-white data-[state=active]:text-procarni-blue data-[state=active]:shadow-md transition-all">Borradores</TabsTrigger>
                    <TabsTrigger value="Approved" className="rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 data-[state=active]:bg-white data-[state=active]:text-procarni-blue data-[state=active]:shadow-md transition-all">Aprobadas</TabsTrigger>
                  </>
                )}
              </TabsList>

              <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
                {/* Filtro Por Usuario */}
                <div className="w-full sm:w-52">
                  <Select
                    value={selectedUserId}
                    onValueChange={setSelectedUserId}
                  >
                    <SelectTrigger className="w-full h-10 bg-slate-50/80 border-slate-200/80 rounded-2xl text-xs font-medium focus:ring-procarni-primary/20">
                      <SelectValue placeholder="POR USUARIO" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl shadow-xl border border-slate-100">
                      <SelectItem value="all">TODOS LOS USUARIOS</SelectItem>
                      {usersList.map((u) => {
                        const name = u.first_name || u.last_name 
                          ? `${u.first_name || ''} ${u.last_name || ''}`.trim() 
                          : u.email || 'Usuario';
                        return (
                          <SelectItem key={u.id} value={u.id}>
                            {name.toUpperCase()}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                {/* Switch Materia Prima */}
                <div className="flex items-center space-x-2 bg-slate-50/80 border border-slate-200/80 px-3.5 h-10 rounded-2xl self-stretch sm:self-auto justify-between sm:justify-start">
                  <Label htmlFor="raw-materials-switch" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer select-none">
                    Materia Prima
                  </Label>
                  <Switch
                    id="raw-materials-switch"
                    checked={onlyRawMaterials}
                    onCheckedChange={setOnlyRawMaterials}
                  />
                </div>

                <div className="relative w-full sm:w-72">
                  <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                  <Input
                    type="text"
                    placeholder="Buscar solicitud..."
                    className="w-full bg-slate-50/80 border-slate-200/80 rounded-2xl pl-10 h-10 text-xs focus:bg-white focus:ring-2 focus:ring-procarni-primary/20 transition-all shadow-none"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <TabsContent value={activeTab} className="mt-0">

              {/* Bulk Actions Bar */}
              {selectedIds.size > 0 && (
                <div className="bg-procarni-primary/5 border border-procarni-primary/20 p-2.5 rounded-2xl mb-4 flex items-center justify-between animate-in fade-in slide-in-from-top-2">
                  <span className="text-xs font-bold text-procarni-primary ml-2">{selectedIds.size} {isMobile ? 'Sel.' : 'seleccionados'}</span>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())} className="h-8 rounded-xl text-xs hover:bg-white/50">
                      Cancelar
                    </Button>
                    <TooltipProvider delayDuration={0}>
                      <div className="flex gap-1.5">
                        {!isHistoryMode ? (
                          <>
                            {(activeTab === 'Draft' || role === 'admin') && (
                              <>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="icon"
                                      className="h-8 w-8 rounded-xl text-procarni-secondary border-procarni-secondary/20 hover:bg-procarni-secondary hover:text-white"
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
                                      className="h-8 w-8 rounded-xl text-red-500 border-red-200 hover:bg-red-500 hover:text-white"
                                      onClick={() => setIsBulkRejectDialogOpen(true)}
                                    >
                                      <XCircle className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Rechazar Seleccionados</TooltipContent>
                                </Tooltip>
                              </>
                            )}

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8 rounded-xl text-slate-500 border-slate-200 hover:bg-slate-500 hover:text-white"
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
                            {(activeTab === 'Archived' || role === 'admin') && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8 rounded-xl text-procarni-secondary border-procarni-secondary/20 hover:bg-procarni-secondary hover:text-white"
                                    onClick={() => setIsBulkRestoreDialogOpen(true)}
                                  >
                                    <RotateCcw className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Restaurar Seleccionados</TooltipContent>
                              </Tooltip>
                            )}

                            {role === 'admin' && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8 rounded-xl text-destructive border-destructive/20 hover:bg-destructive hover:text-white"
                                    onClick={() => setIsBulkDeleteDialogOpen(true)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Eliminar Permanentemente</TooltipContent>
                              </Tooltip>
                            )}
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
                  <p className="text-xs font-medium">Cargando solicitudes...</p>
                </div>
              ) : filteredQuoteRequests.length > 0 ? (
                isMobileView ? (
                  <div className="grid gap-3">
                    {filteredQuoteRequests.map(renderMobileCard)}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-100 overflow-hidden bg-white shadow-sm">
                    <Table>
                      <TableHeader className="bg-slate-50/80 border-b border-slate-100">
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="w-[30px] pl-3 py-3.5"></TableHead>
                          <TableHead className="w-[40px] pl-2 py-3.5">
                            <Checkbox
                              checked={filteredQuoteRequests.length > 0 && selectedIds.size === filteredQuoteRequests.length}
                              onCheckedChange={toggleAll}
                            />
                          </TableHead>
                          <TableHead className="font-bold text-[10px] tracking-wider uppercase text-slate-500 py-3.5">ID</TableHead>
                          <TableHead className="font-bold text-[10px] tracking-wider uppercase text-slate-500 py-3.5">Proveedor</TableHead>
                          <TableHead className="font-bold text-[10px] tracking-wider uppercase text-slate-500 py-3.5">Empresa</TableHead>
                          <TableHead className="font-bold text-[10px] tracking-wider uppercase text-slate-500 py-3.5">Estado</TableHead>
                          <TableHead className="font-bold text-[10px] tracking-wider uppercase text-slate-500 py-3.5">Fecha</TableHead>
                          <TableHead className="text-right font-bold text-[10px] tracking-wider uppercase text-slate-500 pr-4 py-3.5">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredQuoteRequests.map((request) => {
                          const isExpanded = expandedRowId === request.id;
                          const items = (request as any).quote_request_items || [];

                          return (
                            <React.Fragment key={request.id}>
                              <TableRow
                                onClick={() => setExpandedRowId(isExpanded ? null : request.id)}
                                className={cn(
                                  "cursor-pointer transition-colors border-b border-slate-100/80",
                                  isExpanded
                                    ? "bg-red-50/20 hover:bg-red-50/30 border-l-4 border-l-procarni-primary"
                                    : "hover:bg-slate-50/80"
                                )}
                              >
                                <TableCell className="pl-3 py-3 text-slate-400">
                                  {isExpanded ? (
                                    <ChevronDown className="h-4 w-4 text-procarni-primary transition-transform duration-200" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 text-slate-400 transition-transform duration-200" />
                                  )}
                                </TableCell>
                                <TableCell className="pl-2 py-3" onClick={(e) => e.stopPropagation()}>
                                  <Checkbox
                                    checked={selectedIds.has(request.id)}
                                    onCheckedChange={() => toggleSelection(request.id)}
                                  />
                                </TableCell>
                                <TableCell className="py-3 text-xs font-mono font-medium text-slate-500">{request.id.substring(0, 8)}</TableCell>
                                {/* @ts-ignore */}
                                <TableCell className="py-3 font-semibold text-slate-900">{request.suppliers?.name || '---'}</TableCell>
                                {/* @ts-ignore */}
                                <TableCell className="py-3 text-slate-600">{request.companies?.name || '---'}</TableCell>
                                <TableCell className="py-3">
                                  <Badge variant="outline" className={cn("rounded-lg py-0.5 px-2 font-medium text-xs border shadow-none", getStatusColorClass(request.status))}>
                                    {STATUS_TRANSLATIONS[request.status] || request.status}
                                  </Badge>
                                </TableCell>
                                <TableCell className="py-3 text-slate-500 text-xs font-medium">{new Date(request.created_at).toLocaleDateString('es-VE')}</TableCell>
                                {renderActions(request)}
                              </TableRow>

                              {isExpanded && (
                                <TableRow className="bg-slate-50/50 hover:bg-slate-50/50 border-b border-slate-200/80">
                                  <TableCell colSpan={8} className="p-4 pl-12">
                                    <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                        <div className="flex items-center gap-2">
                                          <Package className="h-4 w-4 text-procarni-primary" />
                                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">Ítems integrados en la Solicitud</h4>
                                          <Badge variant="secondary" className="text-[10px] bg-slate-100 text-slate-600 font-semibold px-2 py-0.5 rounded-full">
                                            {items.length} {items.length === 1 ? 'ítem' : 'ítems'}
                                          </Badge>
                                        </div>
                                        <span className="text-[11px] text-slate-400 font-mono">ID Completo: {request.id}</span>
                                      </div>

                                      {items.length === 0 ? (
                                        <p className="text-xs text-slate-400 italic py-2">No hay ítems registrados en esta solicitud.</p>
                                      ) : (
                                        <div className="overflow-x-auto rounded-lg border border-slate-100">
                                          <Table className="text-xs">
                                            <TableHeader className="bg-slate-50">
                                              <TableRow className="border-b border-slate-100 hover:bg-transparent">
                                                <TableHead className="w-[40px] font-bold text-slate-500 py-2 text-center">#</TableHead>
                                                <TableHead className="font-bold text-slate-500 py-2">Material / Descripción</TableHead>
                                                <TableHead className="text-right font-bold text-slate-500 py-2">Cantidad</TableHead>
                                                <TableHead className="text-center font-bold text-slate-500 py-2">Unidad</TableHead>
                                              </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                              {items.map((item: any, idx: number) => (
                                                <TableRow key={item.id || idx} className="hover:bg-slate-50/50 border-b border-slate-100/60 last:border-b-0">
                                                  <TableCell className="text-center font-mono text-slate-400 py-2">{idx + 1}</TableCell>
                                                  <TableCell className="font-medium text-slate-800 py-2">{item.material_name || item.description || 'S/N'}</TableCell>
                                                  <TableCell className="text-right font-mono font-bold text-slate-800 py-2">{item.quantity}</TableCell>
                                                  <TableCell className="text-center text-slate-500 py-2">{item.unit || 'Und'}</TableCell>
                                                </TableRow>
                                              ))}
                                            </TableBody>
                                          </Table>
                                        </div>
                                      )}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )
              ) : (
                <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                  <div className="bg-slate-100 text-slate-400 p-4 rounded-full mb-4 ring-8 ring-slate-50/50">
                    <Search className="h-8 w-8" />
                  </div>
                  <h3 className="text-base font-bold text-slate-800">No se encontraron solicitudes</h3>
                  <p className="text-xs text-slate-500 max-w-sm mt-1">
                    {searchTerm
                      ? `No hay resultados para "${searchTerm}" en esta vista.`
                      : "No tienes solicitudes de cotización registradas para los filtros aplicados."}
                  </p>
                  {!searchTerm && !isHistoryMode && (
                    <Button variant="outline" className="mt-4 rounded-2xl border-slate-200 text-xs font-semibold" asChild>
                      <Link to="/generate-quote">Crear primera solicitud</Link>
                    </Button>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>


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