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
        <Card
          key={comparison.id}
          className={cn(
            "bg-white/90 backdrop-blur-xl border border-slate-100/90 shadow-lg shadow-slate-200/40 ring-1 ring-white rounded-3xl p-5 hover:shadow-xl transition-all duration-200 flex flex-col justify-between",
            selectedIds.has(comparison.id) && "ring-2 ring-procarni-primary border-procarni-primary/40 bg-procarni-primary/5"
          )}
        >
          <div>
            <div className="flex justify-between items-start gap-2 mb-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <Checkbox
                  checked={selectedIds.has(comparison.id)}
                  onCheckedChange={() => toggleSelection(comparison.id)}
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="min-w-0">
                  <h3
                    className="font-bold text-sm text-procarni-dark truncate cursor-pointer hover:text-procarni-primary transition-colors"
                    title={comparison.name}
                    onClick={() => handleLoadComparison(comparison)}
                  >
                    {comparison.name}
                  </h3>
                  <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                    ID: {comparison.id.substring(0, 8)}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-slate-100 text-xs">
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Moneda Base</p>
                <p className="font-mono font-bold text-xs text-slate-700">{comparison.base_currency}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Tasa Global</p>
                <p className="font-mono text-xs text-slate-600">{exchangeRateDisplay}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Materiales</p>
                <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-procarni-blue border border-blue-100 mt-0.5">
                  {materialCount} {materialCount === 1 ? 'ítem' : 'ítems'}
                </span>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Fecha</p>
                <p className="text-xs text-slate-500 font-medium">{format(new Date(comparison.created_at), 'dd/MM/yyyy')}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between mt-4 border-t border-slate-100 pt-3" onClick={(e) => e.stopPropagation()}>
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Opciones</span>
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
      <TableRow
        key={comparison.id}
        className={cn(
          "hover:bg-slate-50/60 transition-colors border-b border-slate-50 group cursor-pointer",
          selectedIds.has(comparison.id) && "bg-procarni-primary/5 hover:bg-procarni-primary/10"
        )}
        onClick={() => handleLoadComparison(comparison)}
      >
        <TableCell className="pl-4 py-3.5" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={selectedIds.has(comparison.id)}
            onCheckedChange={() => toggleSelection(comparison.id)}
          />
        </TableCell>
        <TableCell className="py-3.5 font-bold text-sm text-procarni-dark group-hover:text-procarni-primary transition-colors">
          {comparison.name}
        </TableCell>
        <TableCell className="py-3.5">
          <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
            {comparison.id.substring(0, 8)}
          </span>
        </TableCell>
        <TableCell className="py-3.5 text-xs text-slate-700 font-mono font-bold">{comparison.base_currency}</TableCell>
        <TableCell className="py-3.5 text-xs text-slate-600 font-mono">{exchangeRateDisplay}</TableCell>
        <TableCell className="py-3.5">
          <span className="inline-flex items-center text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-procarni-blue border border-blue-100">
            {materialCount} {materialCount === 1 ? 'material' : 'materiales'}
          </span>
        </TableCell>
        <TableCell className="py-3.5 text-xs text-slate-500 font-medium">
          {format(new Date(comparison.created_at), 'dd/MM/yyyy HH:mm')}
        </TableCell>
        <TableCell className="text-right pr-4 py-3.5" onClick={(e) => e.stopPropagation()}>
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
    <div className="container mx-auto p-4 md:p-6 pb-20 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white/70 backdrop-blur-xl border border-slate-100 shadow-xl shadow-slate-200/40 ring-1 ring-white rounded-3xl p-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-2xl bg-procarni-primary/10 text-procarni-primary">
              <Scale className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-extrabold text-procarni-dark tracking-tight">Gestión de Comparaciones</h1>
          </div>
          <p className="text-xs md:text-sm text-slate-500 font-medium">
            Compara cotizaciones de múltiples proveedores y analiza las matrices de precios.
          </p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              className="bg-procarni-secondary hover:bg-emerald-800 text-white shadow-lg shadow-emerald-900/10 rounded-2xl h-10 px-4 font-semibold text-xs transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center gap-2 w-full md:w-auto"
            >
              <PlusCircle className="h-4 w-4" />
              <span>Nueva Comparación</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 rounded-2xl shadow-xl border border-slate-100 p-1.5">
            <DropdownMenuItem
              onClick={() => navigate('/quote-comparison')}
              className="flex items-center gap-2 text-xs font-semibold py-2.5 rounded-xl cursor-pointer text-slate-700 hover:text-procarni-blue hover:bg-slate-50"
            >
              <Scale className="h-4 w-4 text-slate-400" />
              <span>Comparación de Cotizaciones</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => navigate('/price-matrix')}
              className="flex items-center gap-2 text-xs font-semibold py-2.5 rounded-xl cursor-pointer text-slate-700 hover:text-procarni-blue hover:bg-slate-50"
            >
              <PlusCircle className="h-4 w-4 text-slate-400" />
              <span>Matriz de Proveedores</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="bg-slate-100/80 p-1.5 rounded-2xl border border-slate-200/60 inline-flex flex-wrap gap-1 mb-6">
          <TabsTrigger
            value="saved"
            className="rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 data-[state=active]:bg-white data-[state=active]:text-procarni-blue data-[state=active]:shadow-md transition-all"
          >
            Comparación de Cotizaciones
          </TabsTrigger>
          <TabsTrigger
            value="matrix"
            className="rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 data-[state=active]:bg-white data-[state=active]:text-procarni-blue data-[state=active]:shadow-md transition-all"
          >
            Matrices de Proveedores
          </TabsTrigger>
        </TabsList>

        <Card className="bg-white/80 backdrop-blur-xl border border-slate-100 shadow-xl shadow-gray-200/50 ring-1 ring-white rounded-3xl p-6 overflow-hidden">
          <CardContent className="p-0 space-y-5">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Buscar por nombre o ID de comparación..."
                  className="w-full bg-slate-50/80 border-slate-200/80 rounded-2xl pl-10 h-10 text-xs focus:bg-white focus:ring-2 focus:ring-procarni-primary/20 transition-all shadow-none"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="w-full sm:w-[220px]">
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger className="h-10 bg-slate-50/80 border-slate-200/80 rounded-2xl text-xs font-medium focus:ring-procarni-primary/20">
                    <SelectValue placeholder="Filtrar por usuario" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl shadow-xl border border-slate-100">
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
                <div className="rounded-2xl border border-slate-100 overflow-hidden bg-white shadow-sm">
                  <Table>
                    <TableHeader className="bg-slate-50/80 border-b border-slate-100">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-[50px] pl-4 py-3.5">
                          <Checkbox
                            checked={filteredComparisons.length > 0 && selectedIds.size === filteredComparisons.length}
                            onCheckedChange={toggleAll}
                          />
                        </TableHead>
                        <TableHead className="font-bold text-[10px] tracking-wider uppercase text-slate-500 py-3.5">Nombre</TableHead>
                        <TableHead className="font-bold text-[10px] tracking-wider uppercase text-slate-500 py-3.5">ID</TableHead>
                        <TableHead className="font-bold text-[10px] tracking-wider uppercase text-slate-500 py-3.5">Moneda Base</TableHead>
                        <TableHead className="font-bold text-[10px] tracking-wider uppercase text-slate-500 py-3.5">Tasa Global</TableHead>
                        <TableHead className="font-bold text-[10px] tracking-wider uppercase text-slate-500 py-3.5">Materiales</TableHead>
                        <TableHead className="font-bold text-[10px] tracking-wider uppercase text-slate-500 py-3.5">Fecha Guardado</TableHead>
                        <TableHead className="text-right font-bold text-[10px] tracking-wider uppercase text-slate-500 pr-4 py-3.5">Opciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredComparisons.map(renderComparisonRow)}
                    </TableBody>
                  </Table>
                </div>
              )
            ) : (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <div className="bg-slate-100 text-slate-400 p-4 rounded-full mb-4 ring-8 ring-slate-50/50">
                  <Search className="h-8 w-8" />
                </div>
                <h3 className="text-base font-bold text-slate-800">No se encontraron comparaciones</h3>
                <p className="text-xs text-slate-500 max-w-sm mt-1">
                  No hay análisis de comparación guardados o no coinciden con los filtros aplicados.
                </p>
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