import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { PlusCircle, Search, Eye, Edit, ArrowLeft, Archive, RotateCcw, CheckCircle, Send, XCircle, Trash2, Download, Copy, X, Truck, Loader2, Package, ChevronDown, ChevronRight } from 'lucide-react';
import PDFDownloadButton from '@/components/PDFDownloadButton';
import TransitReportDialog from '@/components/TransitReportDialog';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { purchaseOrderService, PurchaseOrderWithRelations } from '@/services/purchaseOrderService';
import { showError, showSuccess } from '@/utils/toast';
import { useSession } from '@/components/SessionContextProvider';
import { Input } from '@/components/ui/input';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useDebounce } from 'use-debounce';
import PaginationControls from '@/components/PaginationControls';
import { Switch } from '@/components/ui/switch';
import { logAudit } from '@/integrations/supabase/services/auditLogService';
import { useIsMobile, useIsTablet } from '@/hooks/use-mobile';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const STATUS_TRANSLATIONS: Record<string, string> = {
  'Draft': 'Borrador',
  'Approved': 'Aprobada',
  'Credit': 'Crédito',
  'ToPay': 'Por pagar',
  'Paid': 'Pagada',
  'Rejected': 'Rechazada',
  'Archived': 'Archivada',
  'Received': 'Aprobada',
};

const formatSequenceNumber = (sequence?: number | null, dateString?: string | null): string => {
  if (!sequence) return 'N/A';

  const date = dateString ? new Date(dateString) : new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const seq = String(sequence).padStart(3, '0');

  return `OC-${year}-${month}-${seq}`;
};

const PurchaseOrderManagement = () => {
  const queryClient = useQueryClient();
  const { session, role, supabase } = useSession();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const isMobileView = isMobile || isTablet;

  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = 25;
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '');
  const [debouncedSearch] = useDebounce(searchInput, 500);
  const activeTab = (searchParams.get('tab') || 'all') as 'active' | 'archived' | 'approved' | 'rejected' | 'all';

  // Helper function to update search params
  const updateSearchParams = (key: string, value: string | null) => {
    setSearchParams(prev => {
      if (value) prev.set(key, value);
      else prev.delete(key);
      if (key !== 'page') prev.set('page', '1'); // Reset to page 1 on search or tab change
      return prev;
    });
  };

  const [showHistory, setShowHistory] = useState(false);
  const [onlyRawMaterials, setOnlyRawMaterials] = useState(false);
  const [date, setDate] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  });
  const [dateFilterType, setDateFilterType] = useState<'range' | 'single'>('range');
  const [singleDate, setSingleDate] = useState<Date | undefined>(undefined);

  const hasActiveDateFilter = useMemo(() => {
    if (dateFilterType === 'single') {
      return !!singleDate;
    }
    return !!(date.from || date.to);
  }, [dateFilterType, date, singleDate]);

  const clearDates = () => {
    setSingleDate(undefined);
    setDate({ from: undefined, to: undefined });
  };

  const effectiveStartDate = useMemo(() => {
    if (dateFilterType === 'single') {
      return singleDate ? format(singleDate, 'yyyy-MM-dd') : undefined;
    }
    return date.from ? format(date.from, 'yyyy-MM-dd') : undefined;
  }, [dateFilterType, date.from, singleDate]);

  const effectiveEndDate = useMemo(() => {
    if (dateFilterType === 'single') {
      return singleDate ? format(singleDate, 'yyyy-MM-dd') : undefined;
    }
    return date.to ? format(date.to, 'yyyy-MM-dd') : undefined;
  }, [dateFilterType, date.to, singleDate]);

  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [orderToModify, setOrderToModify] = useState<{ id: string; action: 'archive' | 'unarchive' } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isTransitReportOpen, setIsTransitReportOpen] = useState(false);
  const [transitOrderIds, setTransitOrderIds] = useState<string[]>([]);

  useEffect(() => {
    const openTransit = searchParams.get('openTransitReport');
    const orderIdParam = searchParams.get('orderId');
    if (openTransit === 'true' && orderIdParam) {
      const ids = orderIdParam.split(',');
      setTransitOrderIds(ids);
      setIsTransitReportOpen(true);
      setSearchParams(prev => {
        prev.delete('openTransitReport');
        prev.delete('orderId');
        return prev;
      }, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  const [isBulkApproveDialogOpen, setIsBulkApproveDialogOpen] = useState(false);
  const [isCreditApprove, setIsCreditApprove] = useState(false);
  const [creditDaysApprove, setCreditDaysApprove] = useState(30);
  const [isBulkArchiveDialogOpen, setIsBulkArchiveDialogOpen] = useState(false);
  const [isBulkRejectDialogOpen, setIsBulkRejectDialogOpen] = useState(false);
  const [isBulkRestoreDialogOpen, setIsBulkRestoreDialogOpen] = useState(false);
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [orderToReject, setOrderToReject] = useState<string | null>(null);

  const translateTabToStatus = (tab: string) => {
    switch (tab) {
      case 'active': return 'Active';
      case 'approved': return 'Approved';
      case 'topay': return 'ToPay';
      case 'archived': return 'Archived';
      case 'rejected': return 'Rejected';
      case 'all': return 'All';
      default: return 'Active';
    }
  };

  // Centralized query for all tabs with pagination
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['purchaseOrders_paginated', page, pageSize, debouncedSearch, activeTab, onlyRawMaterials, effectiveStartDate, effectiveEndDate],
    queryFn: () => purchaseOrderService.getPaginated(page, pageSize, debouncedSearch, translateTabToStatus(activeTab) as any, onlyRawMaterials, effectiveStartDate, effectiveEndDate),
    enabled: !!session,
    placeholderData: keepPreviousData,
  });

  const currentOrders = data?.data || [];
  const totalCount = data?.count || 0;

  const archiveMutation = useMutation({
    mutationFn: (id: string) => purchaseOrderService.updateStatus(id, 'Archived'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders_paginated'] });
      showSuccess('Orden de compra archivada exitosamente.');
      setIsConfirmDialogOpen(false);
      setOrderToModify(null);
    },
    onError: (err) => {
      showError(`Error al archivar orden: ${err.message}`);
      setIsConfirmDialogOpen(false);
      setOrderToModify(null);
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: (id: string) => purchaseOrderService.updateStatus(id, 'Draft'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders_paginated'] });
      showSuccess('Orden de compra desarchivada exitosamente.');
      setIsConfirmDialogOpen(false);
      setOrderToModify(null);
    },
    onError: (err) => {
      showError(`Error al desarchivar orden: ${err.message}`);
      setIsConfirmDialogOpen(false);
      setOrderToModify(null);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => purchaseOrderService.updateStatus(id, 'Rejected'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders_paginated'] });
      showSuccess('Orden de compra rechazada exitosamente.');
      setIsRejectDialogOpen(false);
      setOrderToReject(null);
    },
    onError: (err) => {
      showError(`Error al rechazar orden: ${err.message}`);
      setIsRejectDialogOpen(false);
      setOrderToReject(null);
    },
  });

  const handleRejectClick = (id: string) => {
    setOrderToReject(id);
    setIsRejectDialogOpen(true);
  };

  const confirmReject = async () => {
    if (orderToReject) {
      await rejectMutation.mutateAsync(orderToReject);
    }
  };

  const confirmAction = (id: string, action: 'archive' | 'unarchive') => {
    setOrderToModify({ id, action });
    setIsConfirmDialogOpen(true);
  };

  const executeAction = async () => {
    if (!orderToModify) return;

    if (orderToModify.action === 'archive') {
      await archiveMutation.mutateAsync(orderToModify.id);
    } else if (orderToModify.action === 'unarchive') {
      await unarchiveMutation.mutateAsync(orderToModify.id);
    }
  };

  // Multiple Selection Logic
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
    if (selectedIds.size === currentOrders.length && currentOrders.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(currentOrders.map(o => o.id)));
    }
  };

  const executeBulkApprove = async (sendToTransit: boolean = false) => {
    try {
      // CXP paused: approve credit orders directly as Approved instead of ToPay
      const targetStatus = 'Approved';
      const targetPaymentTerms = isCreditApprove ? 'Crédito' : 'Contado';
      const targetCreditDays = isCreditApprove ? creditDaysApprove : 0;

      const updates: any = {
        status: targetStatus,
        payment_terms: targetPaymentTerms,
        credit_days: targetCreditDays
      };

      if (sendToTransit) {
        updates.reception_status = 'En tránsito';
      }

      const promises = Array.from(selectedIds).map(async id => {
        const { error } = await supabase
          .from('purchase_orders')
          .update(updates)
          .eq('id', id);
        if (error) throw error;

        if (sendToTransit) {
          try {
            await logAudit('update_reception_status', {
              table: 'purchase_orders',
              record_id: id,
              description: `Estableció el estado de recepción a 'En tránsito' al aprobar la orden en lote.`,
              new_data: { reception_status: 'En tránsito' },
              old_data: { reception_status: 'Ninguno' }
            });
          } catch (e) {
            console.error('Audit log error:', e);
          }
        }
      });

      await Promise.all(promises);
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders_paginated'] });
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
      showSuccess(`${selectedIds.size} órdenes aprobadas exitosamente.`);
      setSelectedIds(new Set());
      setIsBulkApproveDialogOpen(false);
    } catch (error) {
      console.error('Error approving orders:', error);
      showError('Error al aprobar las órdenes seleccionadas.');
    }
  };

  const executeBulkArchive = async () => {
    try {
      await Promise.all(Array.from(selectedIds).map(id => purchaseOrderService.updateStatus(id, 'Archived')));
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders_paginated'] });
      showSuccess(`${selectedIds.size} órdenes archivadas exitosamente.`);
      setSelectedIds(new Set());
      setIsBulkArchiveDialogOpen(false);
    } catch (error) {
      console.error('Error archiving orders:', error);
      showError('Error al archivar las órdenes seleccionadas.');
    }
  };

  const executeBulkReject = async () => {
    try {
      await Promise.all(Array.from(selectedIds).map(id => purchaseOrderService.updateStatus(id, 'Rejected')));
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders_paginated'] });
      showSuccess(`${selectedIds.size} órdenes rechazadas exitosamente.`);
      setSelectedIds(new Set());
      setIsBulkRejectDialogOpen(false);
    } catch (error) {
      console.error('Error rejecting orders:', error);
      showError('Error al rechazar las órdenes seleccionadas.');
    }
  };

  const executeBulkRestore = async () => {
    try {
      await Promise.all(Array.from(selectedIds).map(id => purchaseOrderService.updateStatus(id, 'Draft')));
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders_paginated'] });
      showSuccess(`${selectedIds.size} órdenes restauradas a borrador.`);
      setSelectedIds(new Set());
      setIsBulkRestoreDialogOpen(false);
    } catch (error) {
      console.error('Error restoring orders:', error);
      showError('Error al restaurar las órdenes seleccionadas.');
    }
  };

  const executeBulkDelete = async () => {
    try {
      await Promise.all(Array.from(selectedIds).map(id => purchaseOrderService.delete(id)));
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders_paginated'] });
      showSuccess(`${selectedIds.size} órdenes eliminadas permanentemente.`);
      setSelectedIds(new Set());
      setIsBulkDeleteDialogOpen(false);
    } catch (error) {
      console.error('Error deleting orders:', error);
      showError('Error al eliminar las órdenes seleccionadas.');
    }
  };

  const handleViewDetails = (orderId: string) => {
    navigate(`/purchase-orders/${orderId}`);
  };

  const handleEditOrder = (orderId: string) => {
    navigate(`/purchase-orders/edit/${orderId}`);
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'Draft':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'Approved':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'Credit':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'ToPay':
        return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      case 'Paid':
        return 'bg-teal-100 text-teal-800 border-teal-200';
      case 'Rejected':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'Archived':
        return 'bg-gray-100 text-gray-600 border-gray-200';
      case 'Received':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  const renderReceptionStatusBadge = (recStatus?: string | null) => {
    if (!recStatus || recStatus === 'Ninguno') return null;
    
    let colorClass = "bg-gray-100 text-gray-800 border-gray-200";
    if (recStatus === 'En tránsito') {
      colorClass = "bg-blue-100 text-blue-800 border-blue-200";
    } else if (recStatus === 'Parcial') {
      colorClass = "bg-amber-100 text-amber-800 border-amber-200";
    } else if (recStatus === 'Recibido') {
      colorClass = "bg-emerald-100 text-emerald-800 border-emerald-200";
    }

    return (
      <span className={cn("px-2.5 py-0.5 text-xs font-semibold rounded-md border whitespace-nowrap", colorClass)}>
        {recStatus}
      </span>
    );
  };

  if (error) {
    showError(error.message);
    return (
      <div className="container mx-auto p-4 text-center text-destructive">
        Error al cargar las órdenes de compra: {error.message}
      </div>
    );
  }

  const renderActions = (order: PurchaseOrderWithRelations) => {
    const isArchived = order.status === 'Archived';

    const generateFileName = () => {
      const sequence = formatSequenceNumber(order.sequence_number, order.created_at);
      const supplierName = order.suppliers?.name?.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_') || 'Proveedor';
      return `${sequence}-${supplierName}.pdf`;
    };

    return (
      <TableCell className="text-right whitespace-nowrap pr-4 py-3" onClick={(e) => e.stopPropagation()}>
        <TooltipProvider delayDuration={0}>
          <div className="flex justify-end gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleViewDetails(order.id); }} className="h-8 w-8 text-slate-600 hover:text-slate-900 hover:bg-slate-100">
                  <Eye className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Ver Detalles</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <div onClick={(e) => e.stopPropagation()}>
                  <PDFDownloadButton
                    orderId={order.id}
                    endpoint="generate-po-pdf"
                    fileNameGenerator={generateFileName}
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-blue-600 hover:bg-blue-50"
                    label=""
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>Descargar PDF</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); navigate(`/generate-po?duplicateFrom=${order.id}`); }} className="h-8 w-8 text-teal-600 hover:bg-teal-50">
                  <Copy className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Duplicar Orden</TooltipContent>
            </Tooltip>

            {!isArchived && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); confirmAction(order.id, 'archive'); }} className="h-8 w-8 text-gray-500 hover:bg-gray-100">
                    <Archive className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Archivar</TooltipContent>
              </Tooltip>
            )}

            {isArchived && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); confirmAction(order.id, 'unarchive'); }} className="h-8 w-8 text-gray-500 hover:bg-gray-100">
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

  const renderMobileCard = (order: PurchaseOrderWithRelations) => {
    const isExpanded = expandedRowId === order.id;
    const items = order.purchase_order_items || [];

    // Calculate totals for items
    let summarySubtotal = 0;
    let summaryTax = 0;
    let summaryTotal = 0;

    items.forEach((item: any) => {
      const qty = Number(item.quantity || 0);
      const unitPrice = Number(item.unit_price || 0);
      const sub = (item.subtotal !== undefined && item.subtotal !== null && Number(item.subtotal) > 0)
        ? Number(item.subtotal)
        : qty * unitPrice;
      const tax = (item.tax_amount !== undefined && item.tax_amount !== null && Number(item.tax_amount) >= 0 && !item.is_exempt)
        ? Number(item.tax_amount)
        : (item.is_exempt ? 0 : sub * 0.16);
      const tot = (item.total_price !== undefined && item.total_price !== null && Number(item.total_price) > 0)
        ? Number(item.total_price)
        : ((item.total !== undefined && item.total !== null && Number(item.total) > 0) ? Number(item.total) : (sub + tax));

      summarySubtotal += sub;
      summaryTax += tax;
      summaryTotal += tot;
    });

    return (
      <Card
        key={order.id}
        className={cn(
          "bg-white/80 backdrop-blur-xl border border-slate-100 shadow-xl shadow-gray-200/50 ring-1 ring-white rounded-3xl p-5 transition-all overflow-hidden",
          selectedIds.has(order.id) && "ring-2 ring-procarni-secondary border-procarni-secondary",
          isExpanded && "border-l-4 border-l-procarni-primary"
        )}
      >
        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center gap-2 min-w-0">
            {activeTab !== 'archived' && (
              <Checkbox
                checked={selectedIds.has(order.id)}
                onCheckedChange={() => toggleSelection(order.id)}
                onClick={(e) => e.stopPropagation()}
              />
            )}
            <CardTitle className="text-base truncate font-mono font-bold text-procarni-dark">
              {formatSequenceNumber(order.sequence_number, order.created_at)}
            </CardTitle>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className={cn("px-2 py-0.5 text-[11px] font-semibold rounded-md border", getStatusBadgeClass(order.status))}>
              {STATUS_TRANSLATIONS[order.status] || order.status}
            </span>
            {order.reception_status && order.reception_status !== 'Ninguno' && (
              renderReceptionStatusBadge(order.reception_status)
            )}
          </div>
        </div>

        <div className="space-y-1.5 text-xs mb-3">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400">Proveedor</span>
            <p className="font-semibold text-slate-900 truncate">{order.suppliers.name}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400">Empresa</span>
              <p className="font-medium text-slate-700 truncate">{order.companies.name}</p>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400">Monto Total</span>
              <p className="font-mono font-bold text-procarni-dark text-sm">
                {summaryTotal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {order.currency}
              </p>
            </div>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400">Fecha</span>
            <p className="text-slate-600">{order.created_at ? new Date(order.created_at).toLocaleDateString('es-VE') : 'N/A'}</p>
          </div>
        </div>

        {/* Expand Accordion Button for Mobile Items */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setExpandedRowId(isExpanded ? null : order.id)}
          className="w-full flex items-center justify-between text-xs py-2 bg-slate-50/80 hover:bg-slate-100/80 border-slate-200 text-slate-700 font-medium rounded-xl my-2"
        >
          <span className="flex items-center gap-1.5">
            <Package className="h-3.5 w-3.5 text-procarni-primary" />
            {items.length} {items.length === 1 ? 'ítem integrado' : 'ítems integrados'}
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
              <p className="text-xs text-slate-400 italic py-1 text-center">No hay ítems registrados en esta orden.</p>
            ) : (
              <div className="space-y-2">
                {items.map((item: any, idx: number) => {
                  const qty = Number(item.quantity || 0);
                  const unitPrice = Number(item.unit_price || 0);
                  const subtotal = (item.subtotal !== undefined && item.subtotal !== null && Number(item.subtotal) > 0)
                    ? Number(item.subtotal)
                    : qty * unitPrice;
                  const tax = (item.tax_amount !== undefined && item.tax_amount !== null && Number(item.tax_amount) >= 0 && !item.is_exempt)
                    ? Number(item.tax_amount)
                    : (item.is_exempt ? 0 : subtotal * 0.16);
                  const lineTotal = (item.total_price !== undefined && item.total_price !== null && Number(item.total_price) > 0)
                    ? Number(item.total_price)
                    : ((item.total !== undefined && item.total !== null && Number(item.total) > 0) ? Number(item.total) : (subtotal + tax));

                  return (
                    <div key={item.id || idx} className="bg-slate-50/70 p-2.5 rounded-xl border border-slate-100 text-xs space-y-1">
                      <div className="flex justify-between items-start gap-2">
                        <span className="font-semibold text-slate-800 flex-1">{idx + 1}. {item.description || item.material_name || 'S/N'}</span>
                        <span className="font-mono font-bold text-procarni-dark shrink-0">
                          {lineTotal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {order.currency}
                        </span>
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-500 font-mono pt-0.5">
                        <span>Cant: {qty} × {unitPrice.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span>
                        <span>IVA: {tax.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  );
                })}

                {/* Sub-table Totals Summary Footer */}
                <div className="bg-slate-100/80 p-2.5 rounded-xl text-xs font-mono space-y-1 border border-slate-200/60 mt-2">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal:</span>
                    <span className="font-semibold">{summarySubtotal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {order.currency}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>IVA (16%):</span>
                    <span className="font-semibold">{summaryTax.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {order.currency}</span>
                  </div>
                  <div className="flex justify-between text-slate-800 font-bold border-t border-slate-200/80 pt-1 mt-1">
                    <span className="text-procarni-dark font-extrabold">TOTAL:</span>
                    <span className="text-procarni-primary font-black text-sm">{summaryTotal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {order.currency}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons Footer */}
        <div className="flex flex-wrap justify-end gap-2 pt-3 mt-3 border-t border-slate-100">
          <TooltipProvider delayDuration={0}>
            <div className="flex flex-wrap gap-2 w-full sm:w-auto justify-end">
              <Button variant="outline" size="sm" className="h-9 px-3 text-xs gap-1.5" onClick={() => handleViewDetails(order.id)}>
                <Eye className="h-3.5 w-3.5" />
                <span>Detalles</span>
              </Button>

              {['Approved', 'Credit', 'Paid', 'ToPay', 'Received'].includes(order.status) && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-9 px-3 text-xs text-procarni-secondary border-procarni-secondary/20 hover:bg-procarni-secondary/5 gap-1.5" 
                  onClick={() => {
                    setTransitOrderIds([order.id]);
                    setIsTransitReportOpen(true);
                  }}
                >
                  <Package className="h-3.5 w-3.5" />
                  <span>Recepción</span>
                </Button>
              )}

              <PDFDownloadButton
                orderId={order.id}
                endpoint="generate-po-pdf"
                fileNameGenerator={() => {
                  const sequence = formatSequenceNumber(order.sequence_number, order.created_at);
                  const supplierName = order.suppliers?.name?.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_') || 'Proveedor';
                  return `${sequence}-${supplierName}.pdf`;
                }}
                variant="outline"
                size="sm"
                className="h-9 px-3 text-xs text-blue-600 border-blue-100 hover:bg-blue-50"
                label="PDF"
              />

              <Button variant="outline" size="sm" className="h-9 px-3 text-xs text-teal-600 border-teal-100 hover:bg-teal-50 gap-1.5" onClick={() => navigate(`/generate-po?duplicateFrom=${order.id}`)}>
                <Copy className="h-3.5 w-3.5" />
                <span>Duplicar</span>
              </Button>

              {order.status !== 'Archived' ? (
                <Button variant="outline" size="sm" className="h-9 px-3 text-xs text-slate-500 border-slate-200 hover:bg-slate-50 gap-1.5" onClick={() => confirmAction(order.id, 'archive')}>
                  <Archive className="h-3.5 w-3.5" />
                  <span>Archivar</span>
                </Button>
              ) : (
                <Button variant="outline" size="sm" className="h-9 px-3 text-xs text-slate-500 border-slate-200 hover:bg-slate-50 gap-1.5" onClick={() => confirmAction(order.id, 'unarchive')}>
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Restaurar</span>
                </Button>
              )}
            </div>
          </TooltipProvider>
        </div>
      </Card>
    );
  };

  // Compute bulk action conditions
  const selectedOrders = currentOrders.filter(order => selectedIds.has(order.id));
  const canBulkApprove = selectedOrders.length > 0 && selectedOrders.some(order => order.status === 'Draft');
  const canBulkReject = selectedOrders.length > 0 && selectedOrders.some(order => order.status !== 'Rejected' && order.status !== 'Archived');
  const canBulkArchive = selectedOrders.length > 0 && selectedOrders.some(order => order.status !== 'Archived');
  const canBulkRestore = selectedOrders.length > 0 && selectedOrders.some(order => order.status === 'Archived' || order.status === 'Rejected');

  return (
    <div className="container mx-auto p-4 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-procarni-primary tracking-tight">Órdenes de Compra</h1>
          <p className="text-muted-foreground text-sm">Administra tus órdenes de compra generadas.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <Button
            variant={showHistory ? "secondary" : "outline"}
            onClick={() => {
              const newMode = !showHistory;
              setShowHistory(newMode);
              updateSearchParams('tab', newMode ? 'archived' : 'all');
            }}
            className="gap-2"
            size="sm"
          >
            {showHistory ? <CheckCircle className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
            {showHistory ? 'Ver Activos' : 'Historial'}
          </Button>

          {/* Selector de fecha (Día / Periodo) */}
          <div className="relative flex flex-col items-stretch sm:items-end">
            <div className="flex items-center gap-2 bg-white px-2 py-0.5 h-9 rounded-xl border border-gray-200 shadow-sm w-full sm:w-auto">
              <Select
                value={dateFilterType}
                onValueChange={(val: 'range' | 'single') => setDateFilterType(val)}
              >
                <SelectTrigger className="h-8 w-[95px] border-none bg-transparent shadow-none text-xs focus:ring-0 px-1">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="range">Periodo</SelectItem>
                  <SelectItem value="single">Día</SelectItem>
                </SelectContent>
              </Select>

              <Separator orientation="vertical" className="h-4 bg-gray-200" />

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-2 text-xs text-gray-600 hover:bg-gray-50 font-normal px-2"
                  >
                    <CalendarIcon className="h-3.5 w-3.5 text-gray-400" />
                    {dateFilterType === 'single' ? (
                      singleDate ? (
                        format(singleDate, 'dd/MM/yyyy')
                      ) : (
                        <span className="text-gray-400 font-normal">Elegir día</span>
                      )
                    ) : date.from ? (
                      date.to ? (
                        `${format(date.from, 'dd/MM/yyyy')} - ${format(date.to, 'dd/MM/yyyy')}`
                      ) : (
                        format(date.from, 'dd/MM/yyyy')
                      )
                    ) : (
                      <span className="text-gray-400 font-normal">Rango de fechas</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    initialFocus
                    mode={dateFilterType === 'single' ? 'single' : 'range'}
                    selected={dateFilterType === 'single' ? singleDate : (date as any)}
                    onSelect={(val: any) => {
                      if (dateFilterType === 'single') {
                        setSingleDate(val);
                      } else {
                        setDate(val || { from: undefined, to: undefined });
                      }
                    }}
                    numberOfMonths={dateFilterType === 'single' ? 1 : 2}
                    locale={es}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {hasActiveDateFilter && (
              <button
                onClick={clearDates}
                className="absolute top-full right-1 mt-1 text-[10px] text-gray-400 hover:text-procarni-primary transition-colors font-medium flex items-center gap-0.5 select-none"
              >
                <X className="h-3 w-3" />
                Limpiar fechas
              </button>
            )}
          </div>

          <Button
            asChild
            className="bg-procarni-secondary hover:bg-green-700 text-white gap-2"
            size="sm"
          >
            <Link to="/generate-po">
              <PlusCircle className="h-4 w-4" />
              <span className="hidden sm:inline">Nueva Orden</span>
            </Link>
          </Button>
        </div>
      </div>

      <Card className="mb-6 border-none shadow-sm bg-transparent md:bg-white md:border md:border-gray-200">
        <CardContent className="p-0 md:p-6">
          <Tabs value={activeTab} onValueChange={(val) => { updateSearchParams('tab', val); }} className="w-full">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-4">
              <TabsList className={cn("grid w-full md:w-auto md:flex h-9", !showHistory ? "grid-cols-4" : "grid-cols-2")}>
                {!showHistory ? (
                  <>
                    <TabsTrigger value="all" className="text-xs md:text-sm">Todas</TabsTrigger>
                    <TabsTrigger value="active" className="text-xs md:text-sm">Borradores</TabsTrigger>
                    <TabsTrigger value="approved" className="text-xs md:text-sm">Aprobadas</TabsTrigger>
                    <TabsTrigger value="topay" className="text-xs md:text-sm">Por pagar</TabsTrigger>
                  </>
                ) : (
                  <>
                    <TabsTrigger value="archived" className="text-xs md:text-sm">Archivadas</TabsTrigger>
                    <TabsTrigger value="rejected" className="text-xs md:text-sm">Rechazadas</TabsTrigger>
                  </>
                )}
              </TabsList>

              <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
                {/* Switch Materia Prima */}
                <div className="flex items-center space-x-2 bg-slate-50 border border-gray-200 px-3 py-1.5 h-9 rounded-xl self-stretch sm:self-auto justify-between sm:justify-start">
                  <Label htmlFor="raw-materials-switch" className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider cursor-pointer select-none">
                    Materia Prima
                  </Label>
                  <Switch
                    id="raw-materials-switch"
                    checked={onlyRawMaterials}
                    onCheckedChange={setOnlyRawMaterials}
                  />
                </div>

                <div className="relative w-full sm:w-72">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Buscar orden..."
                    className="w-full appearance-none bg-background pl-8 h-9 text-sm"
                    value={searchInput}
                    onChange={(e) => {
                      setSearchInput(e.target.value);
                      updateSearchParams('search', e.target.value);
                    }}
                  />
                </div>
              </div>
            </div>

            <TabsContent value={activeTab} className="mt-0">
              <div className={cn("transition-opacity duration-200 mt-4", isFetching && "opacity-50 pointer-events-none")}>
              {(!isLoading && currentOrders.length === 0) ? (
                <div className="text-center py-10 bg-white rounded-lg border border-dashed border-gray-300">
                  <p className="text-gray-500 text-lg">No se encontraron órdenes para esta vista o búsqueda.</p>
                </div>
              ) : (
                isMobileView ? (
                  <div className="grid gap-3">
                    {currentOrders.map(renderMobileCard)}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-200/80 shadow-sm bg-white overflow-hidden">
                    <Table>
                      <TableHeader className="bg-slate-50/80 border-b border-slate-200/80">
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="w-[30px] pl-3 py-3"></TableHead>
                          <TableHead className="w-[40px] pl-2 py-3">
                            <Checkbox
                              checked={currentOrders.length > 0 && selectedIds.size === currentOrders.length}
                              onCheckedChange={toggleAll}
                            />
                          </TableHead>
                          <TableHead className="font-bold text-[11px] tracking-wider uppercase text-slate-600 py-3">N° Orden</TableHead>
                          <TableHead className="font-bold text-[11px] tracking-wider uppercase text-slate-600 py-3">Proveedor</TableHead>
                          <TableHead className="font-bold text-[11px] tracking-wider uppercase text-slate-600 py-3">Empresa</TableHead>
                          <TableHead className="font-bold text-[11px] tracking-wider uppercase text-slate-600 py-3">Moneda</TableHead>
                          <TableHead className="font-bold text-[11px] tracking-wider uppercase text-slate-600 py-3">Calculada en</TableHead>
                          <TableHead className="font-bold text-[11px] tracking-wider uppercase text-slate-600 py-3">Estado</TableHead>
                          <TableHead className="font-bold text-[11px] tracking-wider uppercase text-slate-600 py-3">Recepción</TableHead>
                          <TableHead className="font-bold text-[11px] tracking-wider uppercase text-slate-600 py-3">Fecha</TableHead>
                          <TableHead className="text-right font-bold text-[11px] tracking-wider uppercase text-slate-600 pr-4 py-3">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {currentOrders.map((order) => {
                          const isExpanded = expandedRowId === order.id;
                          const items = order.purchase_order_items || [];

                          // Calculate totals for items
                          let summarySubtotal = 0;
                          let summaryTax = 0;
                          let summaryTotal = 0;

                          items.forEach((item: any) => {
                            const qty = Number(item.quantity || 0);
                            const unitPrice = Number(item.unit_price || 0);
                            const sub = (item.subtotal !== undefined && item.subtotal !== null && Number(item.subtotal) > 0)
                              ? Number(item.subtotal)
                              : qty * unitPrice;
                            const tax = (item.tax_amount !== undefined && item.tax_amount !== null && Number(item.tax_amount) >= 0 && !item.is_exempt)
                              ? Number(item.tax_amount)
                              : (item.is_exempt ? 0 : sub * 0.16);
                            const tot = (item.total_price !== undefined && item.total_price !== null && Number(item.total_price) > 0)
                              ? Number(item.total_price)
                              : ((item.total !== undefined && item.total !== null && Number(item.total) > 0) ? Number(item.total) : (sub + tax));

                            summarySubtotal += sub;
                            summaryTax += tax;
                            summaryTotal += tot;
                          });

                          return (
                            <React.Fragment key={order.id}>
                              <TableRow
                                onClick={() => setExpandedRowId(isExpanded ? null : order.id)}
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
                                    checked={selectedIds.has(order.id)}
                                    onCheckedChange={() => toggleSelection(order.id)}
                                  />
                                </TableCell>
                                <TableCell className="py-3 font-mono text-xs font-bold text-procarni-dark">
                                  {formatSequenceNumber(order.sequence_number, order.created_at)}
                                </TableCell>
                                <TableCell className="py-3 font-semibold text-slate-900">{order.suppliers?.name || '---'}</TableCell>
                                <TableCell className="py-3 text-slate-600">{order.companies?.name || '---'}</TableCell>
                                <TableCell className="py-3 font-mono text-xs text-slate-700">{order.currency}</TableCell>
                                <TableCell className="py-3 font-mono text-xs text-slate-500">{order.exchange_rate ? `Ref: ${order.exchange_rate.toFixed(2)}` : 'N/A'}</TableCell>
                                <TableCell className="py-3">
                                  <span className={cn("px-2.5 py-0.5 text-xs font-semibold rounded-md border whitespace-nowrap", getStatusBadgeClass(order.status))}>
                                    {STATUS_TRANSLATIONS[order.status] || order.status}
                                  </span>
                                </TableCell>
                                <TableCell className="py-3">
                                  {renderReceptionStatusBadge(order.reception_status)}
                                </TableCell>
                                <TableCell className="py-3 text-slate-500 text-xs font-medium">{order.created_at ? new Date(order.created_at).toLocaleDateString('es-VE') : 'N/A'}</TableCell>
                                {renderActions(order)}
                              </TableRow>

                              {isExpanded && (
                                <TableRow className="bg-slate-50/50 hover:bg-slate-50/50 border-b border-slate-200/80">
                                  <TableCell colSpan={11} className="p-4 pl-12">
                                    <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                        <div className="flex items-center gap-2">
                                          <Package className="h-4 w-4 text-procarni-primary" />
                                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">Ítems integrados en la Orden de Compra</h4>
                                          <Badge variant="secondary" className="text-[10px] bg-slate-100 text-slate-600 font-semibold px-2 py-0.5 rounded-full">
                                            {items.length} {items.length === 1 ? 'ítem' : 'ítems'}
                                          </Badge>
                                        </div>
                                        <span className="text-[11px] text-slate-400 font-mono">ID: {order.id}</span>
                                      </div>

                                      {items.length === 0 ? (
                                        <p className="text-xs text-slate-400 italic py-2">No hay ítems registrados en esta orden de compra.</p>
                                      ) : (
                                        <div className="overflow-x-auto rounded-lg border border-slate-100">
                                          <Table className="text-xs">
                                            <TableHeader className="bg-slate-50">
                                              <TableRow className="border-b border-slate-100 hover:bg-transparent">
                                                <TableHead className="w-[40px] font-bold text-slate-500 py-2 text-center">#</TableHead>
                                                <TableHead className="font-bold text-slate-500 py-2">Descripción / Producto</TableHead>
                                                <TableHead className="text-right font-bold text-slate-500 py-2">Cant.</TableHead>
                                                <TableHead className="text-right font-bold text-slate-500 py-2">Precio Unit.</TableHead>
                                                <TableHead className="text-right font-bold text-slate-500 py-2">Subtotal</TableHead>
                                                <TableHead className="text-right font-bold text-slate-500 py-2">IVA / Imp.</TableHead>
                                                <TableHead className="text-right font-bold text-slate-500 py-2">Total</TableHead>
                                              </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                              {items.map((item: any, idx: number) => {
                                                const qty = Number(item.quantity || 0);
                                                const unitPrice = Number(item.unit_price || 0);
                                                const subtotal = (item.subtotal !== undefined && item.subtotal !== null && Number(item.subtotal) > 0)
                                                  ? Number(item.subtotal)
                                                  : qty * unitPrice;
                                                const tax = (item.tax_amount !== undefined && item.tax_amount !== null && Number(item.tax_amount) >= 0 && !item.is_exempt)
                                                  ? Number(item.tax_amount)
                                                  : (item.is_exempt ? 0 : subtotal * 0.16);
                                                const lineTotal = (item.total_price !== undefined && item.total_price !== null && Number(item.total_price) > 0)
                                                  ? Number(item.total_price)
                                                  : ((item.total !== undefined && item.total !== null && Number(item.total) > 0) ? Number(item.total) : (subtotal + tax));

                                                return (
                                                  <TableRow key={item.id || idx} className="hover:bg-slate-50/50 border-b border-slate-100/60 last:border-b-0">
                                                    <TableCell className="text-center font-mono text-slate-400 py-2">{idx + 1}</TableCell>
                                                    <TableCell className="font-medium text-slate-800 py-2">{item.description || item.material_name || 'S/N'}</TableCell>
                                                    <TableCell className="text-right font-mono font-bold text-slate-800 py-2">{qty}</TableCell>
                                                    <TableCell className="text-right font-mono text-slate-600 py-2">{unitPrice.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {order.currency}</TableCell>
                                                    <TableCell className="text-right font-mono text-slate-600 py-2">{subtotal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {order.currency}</TableCell>
                                                    <TableCell className="text-right font-mono text-slate-500 py-2">{tax.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {order.currency}</TableCell>
                                                    <TableCell className="text-right font-mono font-bold text-procarni-dark py-2">{lineTotal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {order.currency}</TableCell>
                                                  </TableRow>
                                                );
                                              })}
                                            </TableBody>
                                          </Table>

                                          {/* Summary Footer for items */}
                                          <div className="bg-slate-50/80 px-4 py-2 border-t border-slate-100 flex justify-end gap-6 text-xs font-mono">
                                            <div><span className="text-slate-500 font-medium">Subtotal:</span> <span className="font-semibold text-slate-700">{summarySubtotal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {order.currency}</span></div>
                                            <div><span className="text-slate-500 font-medium">IVA (16%):</span> <span className="font-semibold text-slate-700">{summaryTax.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {order.currency}</span></div>
                                            <div><span className="text-slate-600 font-bold">TOTAL:</span> <span className="font-extrabold text-procarni-primary">{summaryTotal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {order.currency}</span></div>
                                          </div>
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
              )}
              </div>
              <div className="mt-6 flex justify-center w-full">
                <PaginationControls
                  currentPage={page}
                  totalCount={totalCount}
                  pageSize={pageSize}
                  onPageChange={(newPage) => updateSearchParams('page', newPage.toString())}
                />
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>


      {/* Reject Confirmation Dialog */}
      <AlertDialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Rechazo</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas rechazar esta orden de compra?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rejectMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmReject}
              disabled={rejectMutation.isPending}
              className="bg-procarni-primary hover:bg-procarni-primary/90 text-white"
            >
              Rechazar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog for archive/unarchive confirmation */}
      <AlertDialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {orderToModify?.action === 'archive' ? 'Confirmar Archivado' : 'Confirmar Desarchivado'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {orderToModify?.action === 'archive'
                ? '¿Estás seguro de que deseas archivar esta orden de compra? Podrás restaurarla más tarde.'
                : '¿Estás seguro de que deseas restaurar esta orden de compra a la lista activa?'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archiveMutation.isPending || unarchiveMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeAction}
              disabled={archiveMutation.isPending || unarchiveMutation.isPending}
              className={orderToModify?.action === 'archive' ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : "bg-procarni-secondary hover:bg-green-700"}
            >
              {orderToModify?.action === 'archive' ? 'Archivar' : 'Desarchivar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Approve Confirmation Dialog */}
      <AlertDialog open={isBulkApproveDialogOpen} onOpenChange={setIsBulkApproveDialogOpen}>
        <AlertDialogContent className="max-w-xl bg-white/95 backdrop-blur-xl border-none shadow-2xl rounded-[2rem] p-6">
          <AlertDialogHeader className="space-y-2">
            <AlertDialogTitle className="text-xl font-extrabold tracking-tight text-procarni-dark flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Aprobación Masiva de Órdenes ({selectedIds.size})
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-gray-500 font-medium leading-relaxed">
              Esta acción dará validez comercial a las {selectedIds.size} órdenes seleccionadas. Por favor, especifica la modalidad de facturación y plazos para activar el seguimiento de vencimientos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="space-y-5 my-5 p-5 bg-slate-50 border border-slate-100 rounded-3xl">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-sm font-bold text-procarni-blue block">Pago a Crédito</span>
                <span className="text-xs text-gray-400 font-medium">Habilitar financiamiento por días</span>
              </div>
              <Switch
                id="bulk-dialog-credit-switch"
                checked={isCreditApprove}
                onCheckedChange={setIsCreditApprove}
                className="data-[state=checked]:bg-procarni-primary"
              />
            </div>
            
            {isCreditApprove && (
              <div className="space-y-2 pt-3 border-t border-slate-200/50 animate-in fade-in slide-in-from-top-2 duration-300">
                <label htmlFor="bulk-dialog-credit-days" className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1">
                  Días de Crédito Concedidos
                </label>
                <Input
                  id="bulk-dialog-credit-days"
                  type="number"
                  min="1"
                  value={creditDaysApprove}
                  onChange={(e) => setCreditDaysApprove(parseInt(e.target.value) || 0)}
                  className="bg-white border-slate-200 focus-visible:ring-procarni-primary/20 h-10 rounded-xl"
                  placeholder="Ej. 15, 30, 45 días"
                />
              </div>
            )}
          </div>
          
          <AlertDialogFooter className="flex flex-col sm:flex-row gap-2 w-full">
            <AlertDialogCancel className="w-full sm:w-auto rounded-xl h-10 font-bold border-gray-200 hover:bg-slate-50 order-3 sm:order-1">
              Cancelar
            </AlertDialogCancel>
            
            <AlertDialogAction 
              onClick={() => executeBulkApprove(true)} 
              disabled={isCreditApprove && creditDaysApprove <= 0} 
              className="w-full sm:w-auto bg-procarni-secondary hover:bg-procarni-secondary/95 text-white font-bold rounded-xl h-10 shadow-lg shadow-procarni-secondary/20 flex gap-1.5 items-center justify-center order-1 sm:order-2 px-4"
            >
              <Truck className="h-4 w-4 shrink-0" />
              <span className="truncate">Aprobar y Enviar a Tránsito</span>
            </AlertDialogAction>

            <AlertDialogAction 
              onClick={() => executeBulkApprove(false)} 
              disabled={isCreditApprove && creditDaysApprove <= 0} 
              className="w-full sm:w-auto bg-procarni-primary hover:bg-procarni-primary/95 text-white font-bold rounded-xl h-10 shadow-lg shadow-procarni-primary/20 order-2 sm:order-3 flex items-center justify-center px-4"
            >
              <span>Sólo Aprobar</span>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Archive Confirmation Dialog */}
      <AlertDialog open={isBulkArchiveDialogOpen} onOpenChange={setIsBulkArchiveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Archivado Masivo</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas archivar las {selectedIds.size} órdenes de compra seleccionadas?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={executeBulkArchive} className="bg-gray-800 text-white hover:bg-gray-900">
              Archivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Reject Confirmation Dialog */}
      <AlertDialog open={isBulkRejectDialogOpen} onOpenChange={setIsBulkRejectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Rechazo Masivo</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas rechazar las {selectedIds.size} órdenes de compra seleccionadas?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={executeBulkReject} className="bg-red-600 hover:bg-red-700 text-white">
              Rechazar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Restore Confirmation Dialog */}
      <AlertDialog open={isBulkRestoreDialogOpen} onOpenChange={setIsBulkRestoreDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Restauración Masiva</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas restaurar las {selectedIds.size} órdenes de compra seleccionadas a Borrador?
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

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={isBulkDeleteDialogOpen} onOpenChange={setIsBulkDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Eliminación Masiva Permanente</AlertDialogTitle>
            <AlertDialogDescription className="text-red-500 font-medium">
              Esta acción es irreversible y afectará a {selectedIds.size} órdenes.
            </AlertDialogDescription>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas eliminar permanentemente todas las órdenes seleccionadas?
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

      {/* Floating Action Bar for Multi-selection */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[95vw] max-w-[680px] p-3 md:p-4 bg-white/95 backdrop-blur-xl border border-gray-200 shadow-[0_20px_50px_rgba(0,0,0,0.15)] rounded-[2rem] flex items-center justify-between gap-2 md:gap-4 animate-in fade-in slide-in-from-bottom-5 duration-300 ring-1 ring-white">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <div className="bg-procarni-primary text-white w-8 h-8 md:w-9 md:h-9 rounded-xl flex items-center justify-center text-xs font-bold shadow-md shrink-0 animate-pulse">
              {selectedIds.size}
            </div>
            <div className="hidden sm:block min-w-0">
              <p className="text-sm font-bold text-procarni-dark truncate">Órdenes seleccionadas</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold truncate">Realiza acciones masivas o exporta</p>
            </div>
            <span className="sm:hidden text-xs font-bold text-procarni-dark truncate">sel.</span>
          </div>

          <div className="flex items-center gap-1 md:gap-1.5 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="h-8 md:h-9 border-procarni-secondary/30 text-procarni-secondary hover:bg-procarni-secondary/10 font-bold text-xs px-2.5 rounded-xl transition-all"
              onClick={() => {
                setTransitOrderIds(Array.from(selectedIds));
                setIsTransitReportOpen(true);
              }}
              title="Reporte de Materiales en Tránsito"
            >
              <Truck className="h-4 w-4 text-procarni-secondary" />
              <span className="hidden sm:inline ml-1 text-procarni-secondary">En Tránsito</span>
            </Button>

            {!showHistory ? (
              <>
                {(activeTab === 'active' || role === 'admin') && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 md:h-9 border-procarni-secondary/30 text-procarni-secondary hover:bg-procarni-secondary/10 font-bold text-xs px-2.5 rounded-xl transition-all"
                    onClick={() => setIsBulkApproveDialogOpen(true)}
                    disabled={!canBulkApprove}
                    title="Aprobar Seleccionadas"
                  >
                    <CheckCircle className="h-4 w-4" />
                    <span className="hidden sm:inline ml-1">Aprobar</span>
                  </Button>
                )}

                {(activeTab === 'active' || role === 'admin') && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 md:h-9 border-red-500/30 text-red-600 hover:bg-red-500/10 font-bold text-xs px-2.5 rounded-xl transition-all"
                    onClick={() => setIsBulkRejectDialogOpen(true)}
                    disabled={!canBulkReject}
                    title="Rechazar Seleccionadas"
                  >
                    <XCircle className="h-4 w-4" />
                    <span className="hidden sm:inline ml-1">Rechazar</span>
                  </Button>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 md:h-9 border-gray-500/30 text-gray-600 hover:bg-gray-500/10 font-bold text-xs px-2.5 rounded-xl transition-all"
                  onClick={() => setIsBulkArchiveDialogOpen(true)}
                  disabled={!canBulkArchive}
                  title="Archivar Seleccionadas"
                >
                  <Archive className="h-4 w-4" />
                  <span className="hidden sm:inline ml-1">Archivar</span>
                </Button>
              </>
            ) : (
              <>
                {(activeTab === 'archived' || role === 'admin') && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 md:h-9 border-procarni-secondary/30 text-procarni-secondary hover:bg-procarni-secondary/10 font-bold text-xs px-2.5 rounded-xl transition-all"
                    onClick={() => setIsBulkRestoreDialogOpen(true)}
                    disabled={!canBulkRestore}
                    title="Restaurar Seleccionadas"
                  >
                    <RotateCcw className="h-4 w-4" />
                    <span className="hidden sm:inline ml-1">Restaurar</span>
                  </Button>
                )}

                {role === 'admin' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 md:h-9 border-destructive/30 text-destructive hover:bg-destructive/5 font-bold text-xs px-2.5 rounded-xl transition-all"
                    onClick={() => setIsBulkDeleteDialogOpen(true)}
                    title="Eliminar Permanentemente"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="hidden sm:inline ml-1">Eliminar</span>
                  </Button>
                )}
              </>
            )}

            <Button
              variant="ghost"
              size="sm"
              className="h-8 md:h-9 text-muted-foreground hover:text-destructive hover:bg-destructive/5 font-medium px-2 rounded-xl transition-all"
              onClick={() => setSelectedIds(new Set())}
              title="Cancelar Selección"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Transit Report Dialog Component */}
      {isTransitReportOpen && (
        <TransitReportDialog
          isOpen={isTransitReportOpen}
          onClose={() => {
            setIsTransitReportOpen(false);
            setTransitOrderIds([]);
          }}
          orderIds={transitOrderIds}
        />
      )}
    </div>
  );
};

export default PurchaseOrderManagement;