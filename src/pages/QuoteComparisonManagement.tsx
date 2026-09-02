import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ArrowLeft, Search, Scale, Eye, Trash2, PlusCircle, MoreHorizontal } from 'lucide-react';

import { getAllQuoteComparisons, deleteQuoteComparison } from '@/integrations/supabase/data';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { showError, showSuccess } from '@/utils/toast';
import { Input } from '@/components/ui/input';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import { QuoteComparison } from '@/integrations/supabase/types';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PriceComparisonMatrix from '@/components/PriceComparisonMatrix';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useSession } from '@/components/SessionContextProvider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useEffect } from 'react';

const QuoteComparisonManagement = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const { session, supabase } = useSession();

  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') === 'matrix' ? 'matrix' : 'saved';
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [usersList, setUsersList] = useState<{ id: string; first_name: string | null; last_name: string | null; email: string | null }[]>([]);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [comparisonToDeleteId, setComparisonToDeleteId] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);

  // Set default selectedUserId to session user
  useEffect(() => {
    if (session?.user?.id && !selectedUserId) {
      setSelectedUserId(session.user.id);
    }
  }, [session?.user?.id]);

  // Fetch users list
  useEffect(() => {
    const fetchUsers = async () => {
      if (!supabase) return;
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

  const { data: comparisons, isLoading, error } = useQuery<QuoteComparison[]>({
    queryKey: ['quoteComparisons'],
    queryFn: () => getAllQuoteComparisons(), // Fetch all so we can client-side filter and select
  });

  const filteredComparisons = useMemo(() => {
    if (!comparisons) return [];
    
    // Filter by type based on active tab
    const tabFiltered = comparisons.filter(comp => {
      if (activeTab === 'matrix') {
        return comp.type === 'price_matrix';
      } else {
        return !comp.type || comp.type === 'quote_comparison';
      }
    });

    // Filter by user
    const userFiltered = tabFiltered.filter(comp => {
      if (!selectedUserId || selectedUserId === 'all') return true;
      return comp.user_id === selectedUserId;
    });

    if (!searchTerm) return userFiltered;

    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    return userFiltered.filter(comp =>
      comp.name.toLowerCase().includes(lowerCaseSearchTerm) ||
      comp.id.toLowerCase().includes(lowerCaseSearchTerm)
    );
  }, [comparisons, activeTab, selectedUserId, searchTerm]);

  const deleteMutation = useMutation({
    mutationFn: deleteQuoteComparison,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quoteComparisons'] });
      showSuccess('Comparación eliminada exitosamente.');
      setIsDeleteDialogOpen(false);
      setComparisonToDeleteId(null);
    },
    onError: (err) => {
      showError(`Error al eliminar comparación: ${err.message}`);
      setIsDeleteDialogOpen(false);
      setComparisonToDeleteId(null);
    },
  });

  const handleLoadComparison = (comparison: QuoteComparison) => {
    if (comparison.type === 'price_matrix') {
      navigate(`/price-matrix?loadId=${comparison.id}`);
    } else {
      navigate(`/quote-comparison?loadId=${comparison.id}`);
    }
  };

  const confirmDeleteComparison = (id: string) => {
    setComparisonToDeleteId(id);
    setIsDeleteDialogOpen(true);
  };

  const executeDeleteComparison = async () => {
    if (comparisonToDeleteId) {
      await deleteMutation.mutateAsync(comparisonToDeleteId);
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
    if (selectedIds.size === filteredComparisons.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredComparisons.map(c => c.id)));
    }
  };

  const executeBulkDelete = async () => {
    try {
      await Promise.all(Array.from(selectedIds).map(id => deleteQuoteComparison(id)));
      queryClient.invalidateQueries({ queryKey: ['quoteComparisons'] });
      showSuccess(`${selectedIds.size} comparaciones eliminadas exitosamente.`);
      setSelectedIds(new Set());
      setIsBulkDeleteDialogOpen(false);
    } catch (error) {
      console.error('Error deleting comparisons:', error);
      showError('Error al eliminar las comparaciones seleccionadas.');
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 text-center text-muted-foreground">
        Cargando comparaciones guardadas...
      </div>
    );
  }

  if (error) {
    showError(error.message);
    return (
      <div className="container mx-auto p-4 text-center text-destructive">
        Error al cargar las comparaciones: {error.message}
      </div>
    );
  }

  const renderComparisonRow = (comparison: QuoteComparison) => {
    const exchangeRateDisplay = comparison.global_exchange_rate ? comparison.global_exchange_rate.toFixed(2) : 'N/A';
    // @ts-ignore - quote_comparison_items is populated by the join in the service
    const materialCount = comparison.quote_comparison_items?.length || 0;

    if (isMobile) {
      return (
        <Card key={comparison.id} className={cn("p-4 shadow-md", selectedIds.has(comparison.id) && "border-destructive border-2")}>
          <div className="flex justify-between items-start mb-2">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={selectedIds.has(comparison.id)}
                onCheckedChange={() => toggleSelection(comparison.id)}
              />
              <CardTitle className="text-lg mb-1 truncate">{comparison.name}</CardTitle>
            </div>
          </div>
          <CardDescription className="mb-2 flex items-center">
            <Scale className="mr-1 h-3 w-3" /> ID: {comparison.id.substring(0, 8)}
          </CardDescription>
          <div className="text-sm space-y-1 mt-2 w-full">
            <p><strong>Moneda Base:</strong> {comparison.base_currency}</p>
            <p><strong>Tasa Global:</strong> {exchangeRateDisplay}</p>
            <p><strong>Materiales:</strong> {materialCount}</p>
            <p><strong>Guardado:</strong> {format(new Date(comparison.created_at), 'dd/MM/yyyy')}</p>
          </div>
          <div className="flex items-center justify-between mt-4 border-t border-slate-100 pt-3" onClick={(e) => e.stopPropagation()}>
            <span className="text-[11px] text-slate-400 font-medium">Opciones</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl hover:bg-slate-100 text-slate-500">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44 rounded-2xl shadow-xl border border-slate-100 p-1.5">
                <DropdownMenuItem
                  onClick={() => handleLoadComparison(comparison)}
                  disabled={deleteMutation.isPending}
                  className="flex items-center gap-2 text-xs font-semibold py-2 rounded-xl cursor-pointer text-slate-700 hover:text-procarni-blue hover:bg-slate-50"
                >
                  <Eye className="h-4 w-4 text-slate-400" />
                  <span>Cargar y Editar</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => confirmDeleteComparison(comparison.id)}
                  disabled={deleteMutation.isPending}
                  className="flex items-center gap-2 text-xs font-semibold py-2 rounded-xl cursor-pointer text-destructive hover:bg-red-50 focus:text-destructive focus:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Eliminar</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </Card>
      );
    }

    return (
      <TableRow key={comparison.id} className="hover:bg-gray-50/50 transition-colors">
        <TableCell className="pl-4 py-3">
          <Checkbox
            checked={selectedIds.has(comparison.id)}
            onCheckedChange={() => toggleSelection(comparison.id)}
          />
        </TableCell>
        <TableCell className="py-3 font-medium text-procarni-dark">{comparison.name}</TableCell>
        <TableCell className="py-3 text-xs text-gray-500">{comparison.id.substring(0, 8)}</TableCell>
        <TableCell className="py-3 text-sm text-gray-600 font-mono">{comparison.base_currency}</TableCell>
        <TableCell className="py-3 text-sm text-gray-600 font-mono">{exchangeRateDisplay}</TableCell>
        <TableCell className="py-3 text-sm text-gray-600">{materialCount}</TableCell>
        <TableCell className="py-3 text-sm text-gray-600">{format(new Date(comparison.created_at), 'dd/MM/yyyy HH:mm')}</TableCell>
        <TableCell className="text-right pr-4 py-3" onClick={(e) => e.stopPropagation()}>
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
            <DropdownMenuContent align="end" className="w-44 rounded-2xl shadow-xl border border-slate-100 p-1.5">
              <DropdownMenuItem
                onClick={() => handleLoadComparison(comparison)}
                disabled={deleteMutation.isPending}
                className="flex items-center gap-2 text-xs font-semibold py-2 rounded-xl cursor-pointer text-slate-700 hover:text-procarni-blue hover:bg-slate-50"
              >
                <Eye className="h-4 w-4 text-slate-400" />
                <span>Cargar y Editar</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => confirmDeleteComparison(comparison.id)}
                disabled={deleteMutation.isPending}
                className="flex items-center gap-2 text-xs font-semibold py-2 rounded-xl cursor-pointer text-destructive hover:bg-red-50 focus:text-destructive focus:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
                <span>Eliminar</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>
    );
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setSearchParams({ tab: value });
    setSelectedIds(new Set()); // Reset selections on tab change
  };

  return (
    <div className="container mx-auto p-4 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-procarni-primary tracking-tight">Gestión de Comparaciones</h1>
          <p className="text-muted-foreground text-sm flex items-center gap-2">
            Compara precios de proveedores e ítems o gestiona tus análisis guardados.
          </p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              className={cn(
                "bg-procarni-secondary hover:bg-green-700 w-full md:w-auto",
              )}
            >
              <PlusCircle className="mr-2 h-4 w-4" />
              Nueva Comparación
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[200px]">
            <DropdownMenuItem onClick={() => navigate('/quote-comparison')}>
              Comparación de Cotizaciones
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/price-matrix')}>
              Matriz de Proveedores
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="bg-gray-100/50 border border-gray-200 p-1 h-auto flex flex-nowrap overflow-x-auto scrollbar-hide justify-start mb-6">
          <TabsTrigger value="saved" className="px-4 py-2 text-xs sm:text-sm whitespace-nowrap data-[state=active]:bg-white data-[state=active]:text-procarni-primary data-[state=active]:shadow-sm">
            Comparación de Cotizaciones
          </TabsTrigger>
          <TabsTrigger value="matrix" className="px-4 py-2 text-xs sm:text-sm whitespace-nowrap data-[state=active]:bg-white data-[state=active]:text-procarni-primary data-[state=active]:shadow-sm">
            Matrices de Proveedores
          </TabsTrigger>
        </TabsList>

        <Card className="mb-6 border-none shadow-sm bg-transparent md:bg-white md:border md:border-gray-200">
          <CardContent className="p-0 md:p-6 mt-4 md:mt-0">
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Buscar por nombre o ID..."
                  className="w-full appearance-none bg-background pl-8 h-9 text-sm shadow-none"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="w-full sm:w-[220px]">
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger className="h-9 bg-background border-gray-200 focus:ring-procarni-primary/20">
                    <SelectValue placeholder="Filtrar por usuario" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los usuarios</SelectItem>
                    {usersList.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.first_name || user.last_name 
                          ? `${user.first_name || ''} ${user.last_name || ''}`.trim()
                          : user.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {filteredComparisons.length > 0 ? (
              isMobile ? (
                <div className="grid gap-4">
                  {filteredComparisons.map(renderComparisonRow)}
                </div>
              ) : (
                <div className="rounded-md border border-gray-100 overflow-hidden bg-white">
                  <Table>
                    <TableHeader className="bg-gray-50/50">
                      <TableRow>
                        <TableHead className="w-[50px] pl-4 py-3">
                          <Checkbox
                            checked={filteredComparisons.length > 0 && selectedIds.size === filteredComparisons.length}
                            onCheckedChange={toggleAll}
                          />
                        </TableHead>
                        <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500 py-3">Nombre</TableHead>
                        <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500 py-3">ID</TableHead>
                        <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500 py-3">Moneda Base</TableHead>
                        <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500 py-3">Tasa Global</TableHead>
                        <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500 py-3">Materiales</TableHead>
                        <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500 py-3">Fecha Guardado</TableHead>
                        <TableHead className="text-right font-semibold text-xs tracking-wider uppercase text-gray-500 pr-4 py-3">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredComparisons.map(renderComparisonRow)}
                    </TableBody>
                  </Table>
                </div>
              )
            ) : (
              <div className="text-center text-muted-foreground p-8">
                No hay comparaciones guardadas o no se encontraron resultados.
              </div>
            )}
          </CardContent>
        </Card>
      </Tabs>


      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white border border-procarni-primary/20 p-2 pl-4 pr-2 rounded-full shadow-lg flex items-center gap-4 animate-in fade-in slide-in-from-bottom-4">
          <span className="text-sm font-medium text-procarni-primary">{selectedIds.size} {isMobile ? 'Sel.' : 'seleccionados'}</span>
          <div className="h-6 w-px bg-gray-200"></div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())} className="h-8 rounded-full text-xs hover:bg-gray-100">
              Cancelar
            </Button>
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-full text-destructive border-destructive/20 hover:bg-destructive hover:text-white"
                    onClick={() => setIsBulkDeleteDialogOpen(true)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Eliminar Seleccionadas</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      )}

      {/* AlertDialog for delete confirmation */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás absolutamente seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará permanentemente la comparación seleccionada y todos sus ítems.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={executeDeleteComparison} disabled={deleteMutation.isPending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={isBulkDeleteDialogOpen} onOpenChange={setIsBulkDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Eliminación Masiva</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas eliminar permanentemente las {selectedIds.size} comparaciones seleccionadas? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={executeBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar {selectedIds.size} Comparaciones
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default QuoteComparisonManagement;