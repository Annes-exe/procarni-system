// src/pages/ServiceOrderManagement.tsx

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { PlusCircle, Search, Eye, Edit, Archive, RotateCcw, Wrench, XCircle, Trash2 } from 'lucide-react';
import { MadeWithDyad } from '@/components/made-with-dyad';
import { serviceOrderService, ServiceOrderWithRelations } from '@/services/serviceOrderService';
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
import { format } from 'date-fns';

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
  return `OS-${year}-${month}-${seq}`;
};

const ServiceOrderManagement = () => {
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
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [orderToModify, setOrderToModify] = useState<{ id: string; action: 'archive' | 'unarchive' | 'delete' } | null>(null);

  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [orderToReject, setOrderToReject] = useState<string | null>(null);

  // Fetch active orders
  const { data: activeServiceOrders, isLoading: isLoadingActive, error: activeError } = useQuery<ServiceOrderWithRelations[]>({
    queryKey: ['serviceOrders', 'Active'],
    queryFn: async () => await serviceOrderService.getAll('Active'),
    enabled: !!session && activeTab === 'active',
  });

  // Fetch approved orders
  const { data: approvedServiceOrders, isLoading: isLoadingApproved, error: approvedError } = useQuery<ServiceOrderWithRelations[]>({
    queryKey: ['serviceOrders', 'Approved'],
    queryFn: async () => await serviceOrderService.getAll('Approved'),
    enabled: !!session && activeTab === 'approved',
  });

  // Fetch archived orders
  const { data: archivedServiceOrders, isLoading: isLoadingArchived, error: archivedError } = useQuery<ServiceOrderWithRelations[]>({
    queryKey: ['serviceOrders', 'Archived'],
    queryFn: async () => await serviceOrderService.getAll('Archived'),
    enabled: !!session && activeTab === 'archived',
  });

  // Fetch rejected orders
  const { data: rejectedServiceOrders, isLoading: isLoadingRejected, error: rejectedError } = useQuery<ServiceOrderWithRelations[]>({
    queryKey: ['serviceOrders', 'Rejected'],
    queryFn: async () => await serviceOrderService.getAll('Rejected'),
    enabled: !!session && activeTab === 'rejected',
  });

  const currentOrders = useMemo(() => {
    switch (activeTab) {
      case 'active': return activeServiceOrders;
      case 'approved': return approvedServiceOrders;
      case 'archived': return archivedServiceOrders;
      case 'rejected': return rejectedServiceOrders;
      default: return [];
    }
  }, [activeTab, activeServiceOrders, approvedServiceOrders, archivedServiceOrders, rejectedServiceOrders]);

  const isLoading = activeTab === 'active' ? isLoadingActive : (activeTab === 'approved' ? isLoadingApproved : (activeTab === 'rejected' ? isLoadingRejected : isLoadingArchived));
  const error = activeTab === 'active' ? activeError : (activeTab === 'approved' ? approvedError : (activeTab === 'rejected' ? rejectedError : archivedError));

  const filteredServiceOrders = useMemo(() => {
    if (!currentOrders) return [];
    if (!searchTerm) return currentOrders;

    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    return currentOrders.filter(order =>
      formatSequenceNumber(order.sequence_number, order.created_at).toLowerCase().includes(lowerCaseSearchTerm) ||
      order.suppliers.name.toLowerCase().includes(lowerCaseSearchTerm) ||
      order.companies.name.toLowerCase().includes(lowerCaseSearchTerm) ||
      order.equipment_name.toLowerCase().includes(lowerCaseSearchTerm) ||
      (STATUS_TRANSLATIONS[order.status] || order.status).toLowerCase().includes(lowerCaseSearchTerm)
    );
  }, [currentOrders, searchTerm]);

  const archiveMutation = useMutation({
    mutationFn: (id: string) => serviceOrderService.updateStatus(id, 'Archived'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['serviceOrders'] });
      showSuccess('Orden de servicio archivada exitosamente.');
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
    mutationFn: (id: string) => serviceOrderService.updateStatus(id, 'Draft'), // or 'Sent' depending on logic, usually Draft if restoring
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['serviceOrders'] });
      showSuccess('Orden de servicio desarchivada exitosamente.');
      setIsConfirmDialogOpen(false);
      setOrderToModify(null);
    },
    onError: (err) => {
      showError(`Error al desarchivar orden: ${err.message}`);
      setIsConfirmDialogOpen(false);
      setOrderToModify(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: serviceOrderService.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['serviceOrders'] });
      showSuccess('Orden de servicio eliminada permanentemente.');
      setIsDeleteDialogOpen(false);
      setOrderToModify(null);
    },
    onError: (err) => {
      showError(`Error al eliminar orden: ${err.message}`);
      setIsDeleteDialogOpen(false);
      setOrderToModify(null);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => serviceOrderService.updateStatus(id, 'Rejected'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['serviceOrders'] });
      showSuccess('Orden de servicio rechazada exitosamente.');
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

  const confirmDelete = (id: string) => {
    setOrderToModify({ id, action: 'delete' });
    setIsDeleteDialogOpen(true);
  };

  const executeAction = async () => {
    if (!orderToModify) return;

    if (orderToModify.action === 'archive') {
      await archiveMutation.mutateAsync(orderToModify.id);
    } else if (orderToModify.action === 'unarchive') {
      await unarchiveMutation.mutateAsync(orderToModify.id);
    } else if (orderToModify.action === 'delete') {
      await deleteMutation.mutateAsync(orderToModify.id);
    }
  }

  const handleViewDetails = (orderId: string) => {
    navigate(`/service-orders/${orderId}`);
  };

  const handleEditOrder = (orderId: string) => {
    navigate(`/service-orders/edit/${orderId}`);
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'Draft':
        return 'bg-amber-50 text-procarni-alert border border-procarni-alert/20';
      case 'Sent':
        return 'bg-blue-50 text-blue-700 border border-blue-200';
      case 'Approved':
        return 'bg-green-50 text-procarni-secondary border border-procarni-secondary/20';
      case 'Rejected':
        return 'bg-red-50 text-procarni-primary border-procarni-primary/20';
      case 'Archived':
        return 'bg-gray-100 text-gray-500 border border-gray-200';
      default:
        return 'bg-gray-100 text-gray-500 border border-gray-200';
    }
  };

  if (error) {
    showError(error.message);
    return (
      <div className="container mx-auto p-4 text-center text-destructive">
        Error al cargar las órdenes de servicio: {error.message}
      </div>
    );
  }

  const renderMobileCard = (order: ServiceOrderWithRelations) => (
    <Card key={order.id} className="p-4 shadow-md bg-white">
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <CardTitle className="text-lg truncate font-mono text-procarni-dark">{formatSequenceNumber(order.sequence_number, order.created_at)}</CardTitle>
        </div>
        <span className={cn("px-2 py-0.5 text-xs font-medium rounded-full shrink-0", getStatusBadgeClass(order.status))}>
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
          <div className="min-w-0">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Equipo</p>
            <p className="font-medium truncate" title={order.equipment_name}>{order.equipment_name}</p>
          </div>
        </div>
        <div className="pt-1">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Fecha Servicio</p>
          <p className="font-medium">{format(new Date(order.service_date), 'dd/MM/yyyy')}</p>
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
              <Wrench className="h-4 w-4 mr-2" /> Reenviar
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
          <>
            <Button variant="ghost" className="w-full justify-center text-procarni-secondary" onClick={() => confirmAction(order.id, 'unarchive')}>
              <RotateCcw className="h-4 w-4 mr-2" /> Rest.
            </Button>
            <Button variant="ghost" className="w-full justify-center text-destructive" onClick={() => confirmDelete(order.id)}>
              <Trash2 className="h-4 w-4 mr-2" /> Elim.
            </Button>
          </>
        )}
      </div>
    </Card>
  );

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center space-x-2">
          <Switch
            id="history-mode"
            checked={showHistory}
            onCheckedChange={(checked) => {
              setShowHistory(checked);
              setActiveTab(checked ? 'archived' : 'active');
            }}
          />
          <Label htmlFor="history-mode" className="text-sm font-medium text-gray-700">
            {showHistory ? 'Modo Histórico (Archivadas/Rechazadas)' : 'Modo Activo (Activas/Aprobadas)'}
          </Label>
        </div>
      </div>
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="text-procarni-primary flex items-center">
              <Wrench className="mr-2 h-6 w-6" /> Gestión de Órdenes de Servicio
            </CardTitle>
            <CardDescription>Administra tus órdenes de servicio generadas.</CardDescription>
          </div>
          <Button
            asChild
            className={cn(
              "bg-procarni-secondary hover:bg-green-700",
              isMobileView && "w-10 h-10 p-0"
            )}
          >
            <Link to="/generate-so">
              <PlusCircle className={cn("h-4 w-4", !isMobileView && "mr-2")} />
              {!isMobileView && 'Nueva Orden'}
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)} className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-gray-50/50 p-1">
              {!showHistory ? (
                <>
                  <TabsTrigger value="active">Activas</TabsTrigger>
                  <TabsTrigger value="approved">Aprobadas</TabsTrigger>
                </>
              ) : (
                <>
                  <TabsTrigger value="archived">Archivadas</TabsTrigger>
                  <TabsTrigger value="rejected">Rechazadas</TabsTrigger>
                </>
              )}
            </TabsList>

            <TabsContent value={activeTab} className="mt-4">
              <div className="relative mb-4">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Buscar por N°, proveedor, equipo o estado..."
                  className="w-full appearance-none bg-background pl-8 shadow-none"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              {isLoading ? (
                <div className="text-center text-muted-foreground p-8">Cargando órdenes...</div>
              ) : filteredServiceOrders.length > 0 ? (
                isMobileView ? (
                  <div className="grid gap-4">
                    {filteredServiceOrders.map(renderMobileCard)}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">N° Orden</TableHead>
                          <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Proveedor</TableHead>
                          <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Equipo</TableHead>
                          <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Tipo Servicio</TableHead>
                          <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Fecha Servicio</TableHead>
                          <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Estado</TableHead>
                          <TableHead className="text-right text-[10px] uppercase tracking-wider font-semibold text-gray-500">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredServiceOrders.map((order) => (
                          <TableRow key={order.id} className="hover:bg-gray-50/50 border-b border-gray-100 transition-colors">
                            <TableCell className="font-mono text-sm font-medium text-procarni-dark">{formatSequenceNumber(order.sequence_number, order.created_at)}</TableCell>
                            <TableCell className="text-procarni-dark font-medium">{order.suppliers.name}</TableCell>
                            <TableCell>{order.equipment_name}</TableCell>
                            <TableCell>{order.service_type}</TableCell>
                            <TableCell>{format(new Date(order.service_date), 'dd/MM/yyyy')}</TableCell>
                            <TableCell>
                              <span className={cn("px-2 py-0.5 text-xs font-medium rounded-full", getStatusBadgeClass(order.status))}>
                                {STATUS_TRANSLATIONS[order.status] || order.status}
                              </span>
                            </TableCell>
                            <TableCell className="text-right whitespace-nowrap">
                              <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="icon" onClick={() => handleViewDetails(order.id)} title="Ver detalles">
                                  <Eye className="h-4 w-4" />
                                </Button>
                                {(order.status === 'Draft') && (
                                  <Button variant="ghost" size="icon" onClick={() => handleEditOrder(order.id)} title="Editar">
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                )}
                                {(order.status === 'Sent' || order.status === 'Draft') && (
                                  <Button variant="ghost" size="icon" onClick={() => handleRejectClick(order.id)} title="Rechazar">
                                    <XCircle className="h-4 w-4 text-procarni-primary" />
                                  </Button>
                                )}
                                {order.status !== 'Archived' && (
                                  <Button variant="ghost" size="icon" onClick={() => confirmAction(order.id, 'archive')} title="Archivar">
                                    <Archive className="h-4 w-4 text-muted-foreground" />
                                  </Button>
                                )}
                                {order.status === 'Archived' && (
                                  <>
                                    <Button variant="ghost" size="icon" onClick={() => confirmAction(order.id, 'unarchive')} title="Desarchivar">
                                      <RotateCcw className="h-4 w-4 text-procarni-secondary" />
                                    </Button>
                                    <Button variant="ghost" size="icon" onClick={() => confirmDelete(order.id)} title="Eliminar Permanentemente">
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )
              ) : (
                <div className="text-center text-muted-foreground p-8">
                  No hay órdenes de servicio en este estado o no se encontraron resultados para tu búsqueda.
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
              ¿Estás seguro de que deseas rechazar esta orden de servicio?
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
                ? '¿Estás seguro de que deseas archivar esta orden de servicio? Podrás restaurarla más tarde.'
                : '¿Estás seguro de que deseas restaurar esta orden de servicio a la lista activa?'}
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

      {/* AlertDialog for permanent delete confirmation (OS only) */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Eliminación Permanente</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción es irreversible. ¿Estás seguro de que deseas eliminar permanentemente esta Orden de Servicio?
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

    </div>
  );
};

export default ServiceOrderManagement;