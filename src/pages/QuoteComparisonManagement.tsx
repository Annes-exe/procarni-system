import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ArrowLeft, Search, Scale, Eye, Trash2, PlusCircle } from 'lucide-react';
import { MadeWithDyad } from '@/components/made-with-dyad';
import { getAllQuoteComparisons, deleteQuoteComparison } from '@/integrations/supabase/data';
import { showError, showSuccess } from '@/utils/toast';
import { Input } from '@/components/ui/input';
import { useNavigate } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import { QuoteComparison } from '@/integrations/supabase/types';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Checkbox } from '@/components/ui/checkbox';

const QuoteComparisonManagement = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState('');
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [comparisonToDeleteId, setComparisonToDeleteId] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);

  const { data: comparisons, isLoading, error } = useQuery<QuoteComparison[]>({
    queryKey: ['quoteComparisons'],
    queryFn: getAllQuoteComparisons,
  });

  const filteredComparisons = useMemo(() => {
    if (!comparisons) return [];
    if (!searchTerm) return comparisons;

    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    return comparisons.filter(comp =>
      comp.name.toLowerCase().includes(lowerCaseSearchTerm) ||
      comp.id.toLowerCase().includes(lowerCaseSearchTerm)
    );
  }, [comparisons, searchTerm]);

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

  const handleLoadComparison = (id: string) => {
    navigate(`/quote-comparison?loadId=${id}`);
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
    const materialCount = comparison.items?.length || 0;

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
          <div className="flex justify-end gap-2 mt-4 border-t pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleLoadComparison(comparison.id)}
              disabled={deleteMutation.isPending}
            >
              <Eye className="h-4 w-4 mr-2" /> Cargar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => confirmDeleteComparison(comparison.id)}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      );
    }

    return (
      <TableRow key={comparison.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
        <TableCell>
          <Checkbox
            checked={selectedIds.has(comparison.id)}
            onCheckedChange={() => toggleSelection(comparison.id)}
          />
        </TableCell>
        <TableCell className="font-medium">{comparison.name}</TableCell>
        <TableCell className="text-xs">{comparison.id.substring(0, 8)}</TableCell>
        <TableCell>{comparison.base_currency}</TableCell>
        <TableCell>{exchangeRateDisplay}</TableCell>
        <TableCell>{materialCount}</TableCell>
        <TableCell>{format(new Date(comparison.created_at), 'dd/MM/yyyy HH:mm')}</TableCell>
        <TableCell className="text-right">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleLoadComparison(comparison.id)}
            disabled={deleteMutation.isPending}
            title="Cargar y Editar"
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => confirmDeleteComparison(comparison.id)}
            disabled={deleteMutation.isPending}
            title="Eliminar"
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </TableCell>
      </TableRow>
    );
  };

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
            <CardTitle className="text-procarni-primary flex items-center">
              <Scale className="mr-2 h-6 w-6" /> Gestión de Comparaciones Guardadas
            </CardTitle>
            <CardDescription>
              Carga, edita o elimina comparaciones de cotizaciones guardadas previamente.
            </CardDescription>
          </div>
          <Button
            onClick={() => navigate('/quote-comparison')}
            className={cn(
              "bg-procarni-secondary hover:bg-green-700",
              isMobile && "w-10 h-10 p-0"
            )}
          >
            <PlusCircle className={cn("h-4 w-4", !isMobile && "mr-2")} />
            {!isMobile && 'Nueva Comparación'}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="relative mb-4">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Buscar por nombre o ID..."
              className="w-full appearance-none bg-background pl-8 shadow-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {filteredComparisons.length > 0 ? (
            isMobile ? (
              <div className="grid gap-4">
                {filteredComparisons.map(renderComparisonRow)}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">
                        <Checkbox
                          checked={filteredComparisons.length > 0 && selectedIds.size === filteredComparisons.length}
                          onCheckedChange={toggleAll}
                        />
                      </TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>ID</TableHead>
                      <TableHead>Moneda Base</TableHead>
                      <TableHead>Tasa Global</TableHead>
                      <TableHead>Materiales</TableHead>
                      <TableHead>Fecha Guardado</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
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
      <MadeWithDyad />

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