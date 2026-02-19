import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { PlusCircle, Search, Eye, Edit, ArrowLeft, Archive, RotateCcw, CheckCircle, Send } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState<'active' | 'archived' | 'approved'>('active');
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [orderToModify, setOrderToModify] = useState<{ id: string; action: 'archive' | 'unarchive' } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkApproveDialogOpen, setIsBulkApproveDialogOpen] = useState(false);
  const [isBulkArchiveDialogOpen, setIsBulkArchiveDialogOpen] = useState(false);

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

  const currentOrders = activeTab === 'active' ? activePurchaseOrders : (activeTab === 'approved' ? approvedPurchaseOrders : archivedPurchaseOrders);
  const isLoading = activeTab === 'active' ? isLoadingActive : (activeTab === 'approved' ? isLoadingApproved : isLoadingArchived);
  const error = activeTab === 'active' ? activeError : (activeTab === 'approved' ? approvedError : archivedError);

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
        {order.status === 'Sent' && (
          <Button variant="ghost" size="icon" onClick={() => handleViewDetails(order.id)} title="Reenviar">
            <Send className="h-4 w-4 text-blue-600" />
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
        <div className="flex items-center gap-2">
          {activeTab !== 'archived' && (
            <Checkbox
              checked={selectedIds.has(order.id)}
              onCheckedChange={() => toggleSelection(order.id)}
            />
          )}
          <CardTitle className="text-lg truncate">{formatSequenceNumber(order.sequence_number, order.created_at)}</CardTitle>
        </div>
        <span className={cn("px-2 py-0.5 text-xs font-medium rounded-full", getStatusBadgeClass(order.status))}>
          {STATUS_TRANSLATIONS[order.status] || order.status}
        </span>
      </div>
      <CardDescription className="mb-2">Proveedor: {order.suppliers.name}</CardDescription>
      <div className="text-sm space-y-1">
        <p><strong>Empresa:</strong> {order.companies.name}</p>
        <p><strong>Moneda:</strong> {order.currency}</p>
        <p><strong>Fecha:</strong> {order.created_at ? new Date(order.created_at).toLocaleDateString('es-VE') : 'N/A'}</p>
      </div>
      <div className="flex justify-end gap-2 mt-4 border-t pt-3">
        <Button variant="outline" size="sm" onClick={() => handleViewDetails(order.id)}>
          <Eye className={cn("h-4 w-4", !isMobile && "mr-2")} /> {!isMobile && "Ver"}
        </Button>
        {order.status === 'Draft' && (
          <Button variant="outline" size="sm" onClick={() => handleEditOrder(order.id)}>
            <Edit className={cn("h-4 w-4", !isMobile && "mr-2")} /> {!isMobile && "Editar"}
          </Button>
        )}
        {order.status !== 'Archived' && (
          <Button variant="outline" size="sm" onClick={() => confirmAction(order.id, 'archive')}>
            <Archive className={cn("h-4 w-4", !isMobile && "mr-2")} /> {!isMobile && "Archivar"}
          </Button>
        )}
        {order.status === 'Archived' && (
          <Button variant="outline" size="sm" onClick={() => confirmAction(order.id, 'unarchive')}>
            <RotateCcw className={cn("h-4 w-4", !isMobile && "mr-2")} /> {!isMobile && "Desarchivar"}
          </Button>
        )}
      </div>
    </Card>
  );

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-4">
        {/* Removed redundant Back button as this is an Index page */}
      </div>
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="text-procarni-primary">Gestión de Órdenes de Compra</CardTitle>
            <CardDescription>Administra tus órdenes de compra generadas.</CardDescription>
          </div>
          <Button
            asChild
            className={cn(
              "bg-procarni-secondary hover:bg-green-700",
              isMobileView && "w-10 h-10 p-0" // Adaptación móvil
            )}
          >
            <Link to="/generate-po">
              <PlusCircle className={cn("h-4 w-4", !isMobileView && "mr-2")} />
              {!isMobileView && 'Nueva Orden'}
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'active' | 'archived' | 'approved')} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="active">Activas</TabsTrigger>
              <TabsTrigger value="approved">Aprobadas</TabsTrigger>
              <TabsTrigger value="archived">Archivadas</TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab} className="mt-4">
              <div className="relative mb-4">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Buscar por N°, proveedor, empresa o moneda..."
                  className="w-full appearance-none bg-background pl-8 shadow-none"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              {/* Bulk Actions Bar */}
              {selectedIds.size > 0 && (
                <div className="bg-muted p-2 rounded-md mb-4 flex items-center justify-between">
                  <span className="text-sm font-medium">{selectedIds.size} seleccionados</span>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                      Cancelar
                    </Button>
                    {activeTab === 'active' && (
                      <>
                        <Button
                          className="bg-procarni-secondary hover:bg-green-700 text-white"
                          size="sm"
                          onClick={() => setIsBulkApproveDialogOpen(true)}
                        >
                          <CheckCircle className="mr-2 h-4 w-4" /> Aprobar
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setIsBulkArchiveDialogOpen(true)}
                        >
                          <Archive className="mr-2 h-4 w-4" /> Archivar
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {isLoading ? (
                <div className="text-center text-muted-foreground p-8">Cargando órdenes...</div>
              ) : filteredPurchaseOrders.length > 0 ? (
                isMobileView ? (
                  <div className="grid gap-4">
                    {filteredPurchaseOrders.map(renderMobileCard)}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[50px]">
                            <Checkbox
                              checked={filteredPurchaseOrders.length > 0 && selectedIds.size === filteredPurchaseOrders.length}
                              onCheckedChange={toggleAll}
                            />
                          </TableHead>
                          <TableHead>N° Orden</TableHead>
                          <TableHead>Proveedor</TableHead>
                          <TableHead>Empresa</TableHead>
                          <TableHead>Moneda</TableHead>
                          <TableHead>Tasa</TableHead>
                          <TableHead>Estado</TableHead>
                          <TableHead>Fecha Creación</TableHead>
                          <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredPurchaseOrders.map((order) => (
                          <TableRow key={order.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                            <TableCell>
                              <Checkbox
                                checked={selectedIds.has(order.id)}
                                onCheckedChange={() => toggleSelection(order.id)}
                              />
                            </TableCell>
                            <TableCell className="font-medium">{formatSequenceNumber(order.sequence_number, order.created_at)}</TableCell>
                            <TableCell>{order.suppliers.name}</TableCell>
                            <TableCell>{order.companies.name}</TableCell>
                            <TableCell>{order.currency}</TableCell>
                            <TableCell>{order.exchange_rate ? order.exchange_rate.toFixed(2) : 'N/A'}</TableCell>
                            <TableCell>
                              <span className={cn("px-2 py-0.5 text-xs font-medium rounded-full", getStatusBadgeClass(order.status))}>
                                {STATUS_TRANSLATIONS[order.status] || order.status}
                              </span>
                            </TableCell>
                            <TableCell>{order.created_at ? new Date(order.created_at).toLocaleDateString('es-VE') : 'N/A'}</TableCell>
                            {renderActions(order)}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )
              ) : (
                <div className="text-center text-muted-foreground p-8">
                  No hay órdenes de compra en este estado o no se encontraron resultados para tu búsqueda.
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      <MadeWithDyad />

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
              Aprobar {selectedIds.size} Órdenes
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
              Archivar {selectedIds.size} Órdenes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PurchaseOrderManagement;