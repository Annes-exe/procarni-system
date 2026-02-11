import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { PlusCircle, Edit, Trash2, Search, Eye, ArrowLeft, Archive, RotateCcw, CheckCircle, Send } from 'lucide-react';
import { MadeWithDyad } from '@/components/made-with-dyad';
import { getAllQuoteRequests, deleteQuoteRequest, archiveQuoteRequest, unarchiveQuoteRequest } from '@/integrations/supabase/data';
import { showError, showSuccess } from '@/utils/toast';
import { useSession } from '@/components/SessionContextProvider';
import { Input } from '@/components/ui/input';
import { Link, useNavigate } from 'react-router-dom';
import { useIsMobile, useIsTablet } from '@/hooks/use-mobile';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

interface QuoteRequest {
  id: string;
  supplier_id: string;
  suppliers: { name: string };
  company_id: string;
  companies: { name: string };
  currency: string;
  exchange_rate?: number | null;
  status: string;
  created_at: string;
  created_by?: string;
  user_id: string;
}

const STATUS_TRANSLATIONS: Record<string, string> = {
  'Draft': 'Borrador',
  'Sent': 'Enviada',
  'Approved': 'Aprobada',
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
  const [activeTab, setActiveTab] = useState<'active' | 'archived' | 'approved'>('active');
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false); // Nuevo estado para eliminación permanente
  const [requestToModify, setRequestToModify] = useState<{ id: string; action: 'archive' | 'unarchive' | 'delete' } | null>(null);

  // Fetch active requests
  const { data: activeQuoteRequests, isLoading: isLoadingActive, error: activeError } = useQuery<QuoteRequest[]>({
    queryKey: ['quoteRequests', 'Active'],
    queryFn: async () => (await getAllQuoteRequests('Active')) as unknown as QuoteRequest[],
    enabled: !!session && activeTab === 'active',
  });

  // Fetch approved requests
  const { data: approvedQuoteRequests, isLoading: isLoadingApproved, error: approvedError } = useQuery<QuoteRequest[]>({
    queryKey: ['quoteRequests', 'Approved'],
    queryFn: async () => (await getAllQuoteRequests('Approved')) as unknown as QuoteRequest[],
    enabled: !!session && activeTab === 'approved',
  });

  // Fetch archived requests
  const { data: archivedQuoteRequests, isLoading: isLoadingArchived, error: archivedError } = useQuery<QuoteRequest[]>({
    queryKey: ['quoteRequests', 'Archived'],
    queryFn: async () => (await getAllQuoteRequests('Archived')) as unknown as QuoteRequest[],
    enabled: !!session && activeTab === 'archived',
  });

  const currentRequests = activeTab === 'active' ? activeQuoteRequests : (activeTab === 'approved' ? approvedQuoteRequests : archivedQuoteRequests);
  const isLoading = activeTab === 'active' ? isLoadingActive : (activeTab === 'approved' ? isLoadingApproved : isLoadingArchived);
  const error = activeTab === 'active' ? activeError : (activeTab === 'approved' ? approvedError : archivedError);

  const filteredQuoteRequests = useMemo(() => {
    if (!currentRequests) return [];
    if (!searchTerm) return currentRequests;

    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    return currentRequests.filter(request =>
      request.suppliers.name.toLowerCase().includes(lowerCaseSearchTerm) ||
      request.companies.name.toLowerCase().includes(lowerCaseSearchTerm) ||
      request.currency.toLowerCase().includes(lowerCaseSearchTerm) ||
      request.id.toLowerCase().includes(lowerCaseSearchTerm) ||
      (STATUS_TRANSLATIONS[request.status] || request.status).toLowerCase().includes(lowerCaseSearchTerm)
    );
  }, [currentRequests, searchTerm]);

  const archiveMutation = useMutation({
    mutationFn: archiveQuoteRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quoteRequests', 'Active'] });
      queryClient.invalidateQueries({ queryKey: ['quoteRequests', 'Approved'] });
      queryClient.invalidateQueries({ queryKey: ['quoteRequests', 'Archived'] });
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
    mutationFn: unarchiveQuoteRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quoteRequests', 'Active'] });
      queryClient.invalidateQueries({ queryKey: ['quoteRequests', 'Approved'] });
      queryClient.invalidateQueries({ queryKey: ['quoteRequests', 'Archived'] });
      showSuccess('Solicitud desarchivada exitosamente.');
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
    mutationFn: deleteQuoteRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quoteRequests', 'Archived'] });
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

  const confirmAction = (id: string, action: 'archive' | 'unarchive') => {
    setRequestToModify({ id, action });
    setIsConfirmDialogOpen(true);
  };

  const confirmDelete = (id: string) => {
    setRequestToModify({ id, action: 'delete' });
    setIsDeleteDialogOpen(true);
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

  const handleViewDetails = (requestId: string) => {
    navigate(`/quote-requests/${requestId}`);
  };

  const handleEditRequest = (requestId: string) => {
    navigate(`/quote-requests/edit/${requestId}`);
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'Draft':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      case 'Sent':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'Approved':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
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
        Error al cargar las solicitudes de cotización: {error.message}
      </div>
    );
  }

  const renderActions = (request: QuoteRequest) => {
    const isEditable = request.status === 'Draft';
    const isArchived = request.status === 'Archived';

    return (
      <TableCell className="text-right whitespace-nowrap">
        <Button variant="ghost" size="icon" onClick={() => handleViewDetails(request.id)}>
          <Eye className="h-4 w-4" />
        </Button>
        {isEditable && (
          <Button variant="ghost" size="icon" onClick={() => handleEditRequest(request.id)}>
            <Edit className="h-4 w-4" />
          </Button>
        )}
        {/* Removed Send button */}
        {!isArchived && (
          <Button variant="ghost" size="icon" onClick={() => confirmAction(request.id, 'archive')} title="Archivar">
            <Archive className="h-4 w-4 text-muted-foreground" />
          </Button>
        )}
        {isArchived && (
          <>
            <Button variant="ghost" size="icon" onClick={() => confirmAction(request.id, 'unarchive')} title="Desarchivar">
              <RotateCcw className="h-4 w-4 text-procarni-secondary" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => confirmDelete(request.id)} title="Eliminar Permanentemente">
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </>
        )}
      </TableCell>
    );
  };

  const renderMobileCard = (request: QuoteRequest) => (
    <Card key={request.id} className="p-4 shadow-md">
      <div className="flex justify-between items-start mb-2">
        <CardTitle className="text-lg truncate">{request.suppliers.name}</CardTitle>
        {/* Status badge removed from top right */}
      </div>
      <CardDescription className="mb-2">Empresa: {request.companies.name}</CardDescription>
      <div className="text-sm space-y-1">
        <p><strong>ID:</strong> {request.id.substring(0, 8)}</p>
        {/* Removed Moneda line */}
        <p><strong>Fecha:</strong> {new Date(request.created_at).toLocaleDateString('es-VE')}</p>
        {/* Status badge moved here */}
        <p>
          <strong>Estado:</strong>
          <span className={cn("ml-2 px-2 py-0.5 text-xs font-medium rounded-full", getStatusBadgeClass(request.status))}>
            {STATUS_TRANSLATIONS[request.status] || request.status}
          </span>
        </p>
      </div>
      <div className="flex justify-end gap-2 mt-4 border-t pt-3">
        <Button variant="outline" size="sm" onClick={() => handleViewDetails(request.id)}>
          <Eye className={cn("h-4 w-4", !isMobile && "mr-2")} /> {!isMobile && "Ver"}
        </Button>
        {request.status === 'Draft' && (
          <Button variant="outline" size="sm" onClick={() => handleEditRequest(request.id)}>
            <Edit className={cn("h-4 w-4", !isMobile && "mr-2")} /> {!isMobile && "Editar"}
          </Button>
        )}
        {request.status !== 'Archived' && (
          <Button variant="outline" size="sm" onClick={() => confirmAction(request.id, 'archive')}>
            <Archive className={cn("h-4 w-4", !isMobile && "mr-2")} /> {!isMobile && "Archivar"}
          </Button>
        )}
        {request.status === 'Archived' && (
          <>
            <Button variant="outline" size="sm" onClick={() => confirmAction(request.id, 'unarchive')}>
              <RotateCcw className={cn("h-4 w-4", !isMobile && "mr-2")} /> {!isMobile && "Desarchivar"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => confirmDelete(request.id)} className="text-destructive border-destructive hover:bg-destructive/10">
              <Trash2 className={cn("h-4 w-4", !isMobile && "mr-2")} /> {!isMobile && "Eliminar"}
            </Button>
          </>
        )}
      </div>
    </Card>
  );

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-4">
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver
        </Button>
      </div>
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="text-procarni-primary">Gestión de Solicitudes de Cotización</CardTitle>
            <CardDescription>Administra tus solicitudes de cotización enviadas a proveedores.</CardDescription>
          </div>
          <Button
            asChild
            className={cn(
              "bg-procarni-secondary hover:bg-green-700",
              isMobileView && "w-10 h-10 p-0" // Adaptación móvil
            )}
          >
            <Link to="/generate-quote">
              <PlusCircle className={cn("h-4 w-4", !isMobileView && "mr-2")} />
              {!isMobileView && 'Nueva Solicitud'}
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
                  placeholder="Buscar por proveedor, empresa, estado o ID..."
                  className="w-full appearance-none bg-background pl-8 shadow-none"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              {isLoading ? (
                <div className="text-center text-muted-foreground p-8">Cargando solicitudes...</div>
              ) : filteredQuoteRequests.length > 0 ? (
                isMobileView ? (
                  <div className="grid gap-4">
                    {filteredQuoteRequests.map(renderMobileCard)}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>ID</TableHead>
                          <TableHead>Proveedor</TableHead>
                          <TableHead>Empresa</TableHead>
                          <TableHead>Estado</TableHead>
                          <TableHead>Fecha Creación</TableHead>
                          <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredQuoteRequests.map((request) => (
                          <TableRow key={request.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                            <TableCell className="text-xs">{request.id.substring(0, 8)}</TableCell>
                            <TableCell className="font-medium">{request.suppliers.name}</TableCell>
                            <TableCell>{request.companies.name}</TableCell>
                            <TableCell>
                              <span className={cn("px-2 py-0.5 text-xs font-medium rounded-full", getStatusBadgeClass(request.status))}>
                                {STATUS_TRANSLATIONS[request.status] || request.status}
                              </span>
                            </TableCell>
                            <TableCell>{new Date(request.created_at).toLocaleDateString('es-VE')}</TableCell>
                            {renderActions(request)}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )
              ) : (
                <div className="text-center text-muted-foreground p-8">
                  No hay solicitudes de cotización en este estado o no se encontraron resultados para tu búsqueda.
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
              {requestToModify?.action === 'archive' ? 'Confirmar Archivado' : 'Confirmar Desarchivado'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {requestToModify?.action === 'archive'
                ? '¿Estás seguro de que deseas archivar esta solicitud? Podrás restaurarla más tarde.'
                : '¿Estás seguro de que deseas restaurar esta solicitud a la lista activa?'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archiveMutation.isPending || unarchiveMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeAction}
              disabled={archiveMutation.isPending || unarchiveMutation.isPending}
              className={requestToModify?.action === 'archive' ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : "bg-procarni-secondary hover:bg-green-700"}
            >
              {requestToModify?.action === 'archive' ? 'Archivar' : 'Desarchivar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog for permanent delete confirmation (SC only) */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Eliminación Permanente</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción es irreversible. ¿Estás seguro de que deseas eliminar permanentemente esta Solicitud de Cotización?
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

export default QuoteRequestManagement;