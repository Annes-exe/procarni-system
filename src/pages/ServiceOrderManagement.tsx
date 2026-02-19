// src/pages/ServiceOrderManagement.tsx

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { PlusCircle, Search, Eye, Edit, Archive, RotateCcw, Wrench, XCircle, Trash2, CheckCircle } from 'lucide-react';
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
    mutationFn: (id: string) => serviceOrderService.updateStatus(id, 'Draft'),
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
    <div className="container mx-auto p-4 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-procarni-primary tracking-tight">Gestión de Órdenes de Servicio</h1>
          <p className="text-muted-foreground text-sm">Administra tus órdenes de servicio generadas.</p>
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
            <Link to="/generate-so">
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
              {isLoading ? (
                <div className="text-center text-muted-foreground p-12 flex flex-col items-center">
                  <div className="h-8 w-8 border-4 border-procarni-secondary border-t-transparent rounded-full animate-spin mb-4"></div>
                  <p>Cargando órdenes...</p>
                </div>
              ) : filteredServiceOrders.length > 0 ? (
                isMobileView ? (
                  <div className="grid gap-3">
                    {filteredServiceOrders.map(renderMobileCard)}
                  </div>
                ) : (
                  <div className="rounded-md border border-gray-100 overflow-hidden">
                    <Table>
                      <TableHeader className="bg-gray-50/50">
                        <TableRow>
                          <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500 pl-4">N° Orden</TableHead>
                          <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500">Proveedor</TableHead>
                          <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500">Equipo</TableHead>
                          <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500">Tipo Servicio</TableHead>
                          <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500">Fecha Servicio</TableHead>
                          <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500">Estado</TableHead>
                          <TableHead className="text-right font-semibold text-xs tracking-wider uppercase text-gray-500 pr-4">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredServiceOrders.map((order) => (
                          <TableRow key={order.id} className="hover:bg-gray-50/50 transition-colors">
                            <TableCell className="pl-4 py-3 font-mono text-xs font-medium text-procarni-dark">{formatSequenceNumber(order.sequence_number, order.created_at)}</TableCell>
                            <TableCell className="py-3 font-medium text-procarni-dark">{order.suppliers.name}</TableCell>
                            <TableCell className="py-3 text-gray-600">{order.equipment_name}</TableCell>
                            <TableCell className="py-3 text-gray-600">{order.service_type}</TableCell>
                            <TableCell className="py-3 text-gray-600">{format(new Date(order.service_date), 'dd/MM/yyyy')}</TableCell>
                            <TableCell className="py-3">
                              <span className={cn("px-2 py-0.5 text-xs font-medium rounded-md border", getStatusBadgeClass(order.status))}>
                                {STATUS_TRANSLATIONS[order.status] || order.status}
                              </span>
                            </TableCell>
                            <TableCell className="py-3 text-right">
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
                <div className="text-center p-12 bg-gray-50/50 rounded-lg border border-dashed border-gray-200">
                  <div className="bg-white p-3 rounded-full w-fit mx-auto shadow-sm mb-3">
                    <Search className="h-6 w-6 text-gray-300" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-1">No se encontraron órdenes</h3>
                  <p className="text-sm text-gray-500 max-w-sm mx-auto">
                    {searchTerm
                      ? `No hay resultados para "${searchTerm}" en esta vista.`
                      : "No tienes órdenes de servicio en esta categoría."}
                  </p>
                  {!searchTerm && !showHistory && (
                    <Button variant="outline" className="mt-4" asChild>
                      <Link to="/generate-so">Crear nueva orden</Link>
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