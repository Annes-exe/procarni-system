import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { PlusCircle, Search, Eye, Edit, ArrowLeft, Archive, RotateCcw, CheckCircle, Send, XCircle } from 'lucide-react';
import { MadeWithDyad } from '@/components/made-with-dyad';
import { purchaseOrderService, PurchaseOrderWithRelations } from '@/services/purchaseOrderService';
import { showError, showSuccess } from '@/utils/toast';
import { useSession } from '@/components/SessionContextProvider';
import { Input } from '@/components/ui/input';
import { Link, useNavigate } from 'react-router-dom';
import { useIsMobile, useIsTablet } from '@/hooks/use-mobile';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

const STATUS_TRANSLATIONS: Record<string, string> = {
  'Draft': 'Borrador',
  'Sent': 'Enviada',
  'Approved': 'Aprobada',
  'Rejected': 'Rechazada',
  'Archived': 'Archivada',
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
  const { session } = useSession();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const isMobileView = isMobile || isTablet;

  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'active' | 'archived' | 'approved' | 'rejected'>('active');
  const [showHistory, setShowHistory] = useState(false);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [orderToModify, setOrderToModify] = useState<{ id: string; action: 'archive' | 'unarchive' } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkApproveDialogOpen, setIsBulkApproveDialogOpen] = useState(false);
  const [isBulkArchiveDialogOpen, setIsBulkArchiveDialogOpen] = useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [orderToReject, setOrderToReject] = useState<string | null>(null);

  // Fetch active orders
  const { data: activePurchaseOrders, isLoading: isLoadingActive, error: activeError } = useQuery<PurchaseOrderWithRelations[]>({
    queryKey: ['purchaseOrders', 'Active'],
    queryFn: async () => await purchaseOrderService.getAll('Active'),
    enabled: !!session && activeTab === 'active',
  });

  // Fetch approved orders
  const { data: approvedPurchaseOrders, isLoading: isLoadingApproved, error: approvedError } = useQuery<PurchaseOrderWithRelations[]>({
    queryKey: ['purchaseOrders', 'Approved'],
    queryFn: async () => await purchaseOrderService.getAll('Approved'),
    enabled: !!session && activeTab === 'approved',
  });

  // Fetch archived orders
  const { data: archivedPurchaseOrders, isLoading: isLoadingArchived, error: archivedError } = useQuery<PurchaseOrderWithRelations[]>({
    queryKey: ['purchaseOrders', 'Archived'],
    queryFn: async () => await purchaseOrderService.getAll('Archived'),
    enabled: !!session && activeTab === 'archived',
  });

  // Fetch rejected orders
  const { data: rejectedPurchaseOrders, isLoading: isLoadingRejected, error: rejectedError } = useQuery<PurchaseOrderWithRelations[]>({
    queryKey: ['purchaseOrders', 'Rejected'],
    queryFn: async () => await purchaseOrderService.getAll('Rejected'),
    enabled: !!session && activeTab === 'rejected',
  });

  const currentOrders = useMemo(() => {
    switch (activeTab) {
      case 'active': return activePurchaseOrders;
      case 'approved': return approvedPurchaseOrders;
      case 'archived': return archivedPurchaseOrders;
      case 'rejected': return rejectedPurchaseOrders;
      default: return [];
    }
  }, [activeTab, activePurchaseOrders, approvedPurchaseOrders, archivedPurchaseOrders, rejectedPurchaseOrders]);

  const isLoading = activeTab === 'active' ? isLoadingActive : (activeTab === 'approved' ? isLoadingApproved : (activeTab === 'rejected' ? isLoadingRejected : isLoadingArchived));
  const error = activeTab === 'active' ? activeError : (activeTab === 'approved' ? approvedError : (activeTab === 'rejected' ? rejectedError : archivedError));

  const filteredPurchaseOrders = useMemo(() => {
    if (!currentOrders) return [];
    if (!searchTerm) return currentOrders;

    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    return currentOrders.filter(order =>
      formatSequenceNumber(order.sequence_number, order.created_at).toLowerCase().includes(lowerCaseSearchTerm) ||
      order.suppliers.name.toLowerCase().includes(lowerCaseSearchTerm) ||
      order.companies.name.toLowerCase().includes(lowerCaseSearchTerm) ||
      order.currency.toLowerCase().includes(lowerCaseSearchTerm) ||
      (STATUS_TRANSLATIONS[order.status] || order.status).toLowerCase().includes(lowerCaseSearchTerm)
    );
  }, [currentOrders, searchTerm]);

  const archiveMutation = useMutation({
    mutationFn: (id: string) => purchaseOrderService.updateStatus(id, 'Archived'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
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
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
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
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
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
    if (selectedIds.size === filteredPurchaseOrders.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredPurchaseOrders.map(o => o.id)));
    }
  };

  const executeBulkApprove = async () => {
    try {
      await Promise.all(Array.from(selectedIds).map(id => purchaseOrderService.updateStatus(id, 'Approved')));
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
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
      showSuccess(`${selectedIds.size} órdenes archivadas exitosamente.`);
      setSelectedIds(new Set());
      setIsBulkArchiveDialogOpen(false);
    } catch (error) {
      console.error('Error archiving orders:', error);
      showError('Error al archivar las órdenes seleccionadas.');
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
      case 'Sent':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Approved':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'Rejected':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'Archived':
        return 'bg-gray-100 text-gray-600 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-600';
    }
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
    const isEditable = order.status === 'Draft';
    const isArchived = order.status === 'Archived';

    return (
      <TableCell className="text-right whitespace-nowrap">
        <Button variant="ghost" size="icon" onClick={() => handleViewDetails(order.id)}>
          <Eye className="h-4 w-4" />
        </Button>
        {isEditable && (
          <Button variant="ghost" size="icon" onClick={() => handleEditOrder(order.id)}>
            <Edit className="h-4 w-4" />
          </Button>
        )}
        {(order.status === 'Sent' || order.status === 'Draft') && (
          <Button variant="ghost" size="icon" onClick={() => handleRejectClick(order.id)} title="Rechazar">
            <XCircle className="h-4 w-4 text-procarni-primary" />
          </Button>
        )}
        {/* Removed CheckCircle button as requested */}
        {!isArchived && (
          <Button variant="ghost" size="icon" onClick={() => confirmAction(order.id, 'archive')} title="Archivar">
            <Archive className="h-4 w-4 text-muted-foreground" />
          </Button>
        )}
        {isArchived && (
          <Button variant="ghost" size="icon" onClick={() => confirmAction(order.id, 'unarchive')} title="Desarchivar">
            <RotateCcw className="h-4 w-4 text-procarni-secondary" />
          </Button>
        )}
      </TableCell>
    );
  };

  const renderMobileCard = (order: PurchaseOrderWithRelations) => (
    <Card key={order.id} className={cn("p-4 shadow-md", selectedIds.has(order.id) && "border-procarni-secondary border-2")}>
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {activeTab !== 'archived' && (
            <Checkbox
              checked={selectedIds.has(order.id)}
              onCheckedChange={() => toggleSelection(order.id)}
            />
          )}
          <CardTitle className="text-lg truncate font-mono text-procarni-dark">{formatSequenceNumber(order.sequence_number, order.created_at)}</CardTitle>
        </div>
        <span className={cn("px-2 py-0.5 text-xs font-medium rounded-full shrink-0 border", getStatusBadgeClass(order.status))}>
          {STATUS_TRANSLATIONS[order.status] || order.status}
        </span>
      </div>
      <div className="min-w-0 mb-2">
        <p className="text-sm font-medium text-gray-500">Proveedor</p>
        <p className="text-base font-medium text-procarni-dark truncate">{order.suppliers.name}</p>
      </div>
      <div className="text-sm space-y-1 mb-4">
        <div className="grid grid-cols-2 gap-2">
          <div className="min-w-0">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Empresa</p>
            <p className="font-medium text-procarni-dark truncate" title={order.companies.name}>{order.companies.name}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Moneda</p>
            <p className="font-medium">{order.currency}</p>
          </div>
        </div>
        <div className="pt-1">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Fecha</p>
          <p className="font-medium">{order.created_at ? new Date(order.created_at).toLocaleDateString('es-VE') : 'N/A'}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100">
        <Button variant="outline" className="w-full justify-center" onClick={() => handleViewDetails(order.id)}>
          <Eye className="h-4 w-4 mr-2" /> Ver
        </Button>

        {order.status === 'Draft' && (
          <Button variant="outline" className="w-full justify-center" onClick={() => handleEditOrder(order.id)}>
            <Edit className="h-4 w-4 mr-2" /> Editar
          </Button>
        )}

        {order.status === 'Sent' && (
          <>
            <Button variant="outline" className="w-full justify-center text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => handleViewDetails(order.id)}>
              <Send className="h-4 w-4 mr-2" /> Reenviar
            </Button>
            <Button variant="outline" className="w-full justify-center text-procarni-primary border-procarni-primary/20 hover:bg-red-50" onClick={() => handleRejectClick(order.id)}>
              <XCircle className="h-4 w-4 mr-2" /> Rechazar
            </Button>
          </>
        )}

        {order.status !== 'Archived' && (
          <Button variant="ghost" className="w-full justify-center text-muted-foreground" onClick={() => confirmAction(order.id, 'archive')}>
            <Archive className="h-4 w-4 mr-2" /> Archivar
          </Button>
        )}

        {order.status === 'Archived' && (
          <Button variant="ghost" className="w-full justify-center text-procarni-secondary" onClick={() => confirmAction(order.id, 'unarchive')}>
            <RotateCcw className="h-4 w-4 mr-2" /> Desarchivar
          </Button>
        )}
      </div>
    </Card>
  );

  return (
    <div className="container mx-auto p-4 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-procarni-primary tracking-tight">Gestión de Órdenes de Compra</h1>
          <p className="text-muted-foreground text-sm">Administra tus órdenes de compra generadas.</p>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <Button
            variant={showHistory ? "secondary" : "outline"}
            onClick={() => {
              const newMode = !showHistory;
              setShowHistory(newMode);
              setActiveTab(newMode ? 'archived' : 'active');
            }}
            className="gap-2"
            size="sm"
          >
            {showHistory ? <CheckCircle className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
            {showHistory ? 'Ver Activos' : 'Historial'}
          </Button>
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
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)} className="w-full">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-4">
              <TabsList className="grid w-full md:w-auto grid-cols-2 md:flex h-9">
                {!showHistory ? (
                  <>
                    <TabsTrigger value="active" className="text-xs md:text-sm">Activas</TabsTrigger>
                    <TabsTrigger value="approved" className="text-xs md:text-sm">Aprobadas</TabsTrigger>
                  </>
                ) : (
                  <>
                    <TabsTrigger value="archived" className="text-xs md:text-sm">Archivadas</TabsTrigger>
                    <TabsTrigger value="rejected" className="text-xs md:text-sm">Rechazadas</TabsTrigger>
                  </>
                )}
              </TabsList>

              <div className="relative w-full md:w-72">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Buscar orden..."
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
                  <span className="text-sm font-medium text-procarni-primary ml-2">{selectedIds.size} seleccionados</span>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())} className="h-8 text-xs hover:bg-white/50">
                      Cancelar
                    </Button>
                    {!showHistory && (
                      <>
                        <Button
                          className="bg-procarni-secondary hover:bg-green-700 text-white h-8 text-xs"
                          size="sm"
                          onClick={() => setIsBulkApproveDialogOpen(true)}
                        >
                          <CheckCircle className="mr-1 h-3.5 w-3.5" /> Aprobar
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setIsBulkArchiveDialogOpen(true)}
                          className="h-8 text-xs"
                        >
                          <Archive className="mr-1 h-3.5 w-3.5" /> Archivar
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {isLoading ? (
                <div className="text-center text-muted-foreground p-12 flex flex-col items-center">
                  <div className="h-8 w-8 border-4 border-procarni-secondary border-t-transparent rounded-full animate-spin mb-4"></div>
                  <p>Cargando órdenes...</p>
                </div>
              ) : filteredPurchaseOrders.length > 0 ? (
                isMobileView ? (
                  <div className="grid gap-3">
                    {filteredPurchaseOrders.map(renderMobileCard)}
                  </div>
                ) : (
                  <div className="rounded-md border border-gray-100 overflow-hidden">
                    <Table>
                      <TableHeader className="bg-gray-50/50">
                        <TableRow>
                          <TableHead className="w-[40px] pl-4">
                            <Checkbox
                              checked={filteredPurchaseOrders.length > 0 && selectedIds.size === filteredPurchaseOrders.length}
                              onCheckedChange={toggleAll}
                            />
                          </TableHead>
                          <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500">N° Orden</TableHead>
                          <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500">Proveedor</TableHead>
                          <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500">Empresa</TableHead>
                          <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500">Moneda</TableHead>
                          <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500">Calculada en</TableHead>
                          <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500">Estado</TableHead>
                          <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500">Fecha</TableHead>
                          <TableHead className="text-right font-semibold text-xs tracking-wider uppercase text-gray-500 pr-4">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredPurchaseOrders.map((order) => (
                          <TableRow key={order.id} className="hover:bg-gray-50/50 transition-colors">
                            <TableCell className="pl-4 py-3">
                              <Checkbox
                                checked={selectedIds.has(order.id)}
                                onCheckedChange={() => toggleSelection(order.id)}
                              />
                            </TableCell>
                            <TableCell className="py-3 font-mono text-xs font-medium text-procarni-dark">{formatSequenceNumber(order.sequence_number, order.created_at)}</TableCell>
                            <TableCell className="py-3 font-medium text-procarni-dark">{order.suppliers.name}</TableCell>
                            <TableCell className="py-3 text-gray-600">{order.companies.name}</TableCell>
                            <TableCell className="py-3">{order.currency}</TableCell>
                            <TableCell className="py-3 font-mono text-xs">{order.exchange_rate ? `Ref: ${order.exchange_rate.toFixed(2)}` : 'N/A'}</TableCell>
                            <TableCell className="py-3">
                              <span className={cn("px-2 py-0.5 text-xs font-medium rounded-md border", getStatusBadgeClass(order.status))}>
                                {STATUS_TRANSLATIONS[order.status] || order.status}
                              </span>
                            </TableCell>
                            <TableCell className="py-3 text-gray-500 text-sm">{order.created_at ? new Date(order.created_at).toLocaleDateString('es-VE') : 'N/A'}</TableCell>
                            {renderActions(order)}
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
                  <h3 className="text-lg font-medium text-gray-900 mb-1">No se encontraron órdenes</h3>
                  <p className="text-sm text-gray-500 max-w-sm mx-auto">
                    {searchTerm
                      ? `No hay resultados para "${searchTerm}" en esta vista.`
                      : "No tienes órdenes de compra en esta categoría."}
                  </p>
                  {!searchTerm && !showHistory && (
                    <Button variant="outline" className="mt-4" asChild>
                      <Link to="/generate-po">Crear nueva orden</Link>
                    </Button>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      <MadeWithDyad />

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
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Aprobación Masiva</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas aprobar las {selectedIds.size} órdenes de compra seleccionadas?
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
            <AlertDialogAction onClick={executeBulkArchive} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Archivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PurchaseOrderManagement;