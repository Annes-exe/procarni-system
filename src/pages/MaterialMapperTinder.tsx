import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { SoftMigrationSuggestion } from '@/integrations/supabase/types';
import { showError, showSuccess } from '@/utils/toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, SkipForward, ArrowRight, Activity, Box, Sparkles } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface DirtyItemGroup {
  dirty_id: string;
  dirty_name: string;
  dirty_category: string | null;
  dirty_unit: string | null;
  suggestions: SoftMigrationSuggestion[];
}

const MaterialMapperTinder: React.FC = () => {
  const queryClient = useQueryClient();
  const [currentIndex, setCurrentIndex] = useState(0);

  const { data: groups, isLoading, error } = useQuery<DirtyItemGroup[]>({
    queryKey: ['vw_soft_migration_suggestions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vw_soft_migration_suggestions')
        .select('*')
        .order('similarity_score', { ascending: false })
        .limit(300);

      if (error) throw error;

      const groupedMap = (data as SoftMigrationSuggestion[]).reduce((acc, row) => {
        if (!acc[row.dirty_id]) {
          acc[row.dirty_id] = {
            dirty_id: row.dirty_id,
            dirty_name: row.dirty_name,
            dirty_category: row.dirty_category,
            dirty_unit: row.dirty_unit,
            suggestions: [],
          };
        }
        acc[row.dirty_id].suggestions.push(row);
        return acc;
      }, {} as Record<string, DirtyItemGroup>);

      // Ordenar los grupos por la sugerencia más alta de cada uno
      const groupedArray = Object.values(groupedMap).sort((a, b) => {
        const maxA = Math.max(...a.suggestions.map(s => s.similarity_score));
        const maxB = Math.max(...b.suggestions.map(s => s.similarity_score));
        return maxB - maxA;
      });

      return groupedArray;
    },
  });

  const linkMutation = useMutation({
    mutationFn: async ({ masterId, dirtyId }: { masterId: string; dirtyId: string }) => {
      const { error } = await supabase.rpc('safe_link_to_master', {
        p_master_id: masterId,
        p_dirty_id: dirtyId,
      });
      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      showSuccess('Material enlazado y archivado correctamente.');
      handleNext();
      // Opcionalmente revalidar query si quedan pocos
    },
    onError: (err: any) => {
      showError(`Error al vincular: ${err.message}`);
    },
  });

  const handleNext = () => {
    setCurrentIndex((prev) => prev + 1);
  };

  const handleLink = (masterId: string, dirtyId: string) => {
    linkMutation.mutate({ masterId, dirtyId });
  };

  if (isLoading) {
    return (
      <div className="p-8 max-w-5xl mx-auto space-y-6">
        <Skeleton className="h-10 w-1/3" />
        <div className="flex gap-8">
          <Skeleton className="h-64 w-1/2 rounded-3xl" />
          <Skeleton className="h-64 w-1/2 rounded-3xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return <div className="p-8 text-red-500">Error cargando sugerencias.</div>;
  }

  if (!groups || currentIndex >= groups.length) {
    return (
      <div className="p-8 max-w-4xl mx-auto text-center mt-20">
        <Sparkles className="h-16 w-16 mx-auto text-procarni-secondary mb-4" />
        <h2 className="text-3xl font-extrabold text-procarni-dark">¡Bandeja Limpia!</h2>
        <p className="text-gray-500 mt-2">No hay más sugerencias de alta confianza pendientes.</p>
        <Button onClick={() => queryClient.invalidateQueries({ queryKey: ['vw_soft_migration_suggestions'] })} className="mt-6">
          Refrescar Datos
        </Button>
      </div>
    );
  }

  const currentItem = groups[currentIndex];

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-procarni-dark flex items-center gap-3">
          <Activity className="h-8 w-8 text-procarni-primary" />
          Resolución de Conflictos
        </h1>
        <p className="text-gray-500 font-medium italic mt-1">
          Vincula items duplicados a sus versiones "Patrón Oro" de forma segura.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        {/* Lado Izquierdo: Material Sucio */}
        <Card className="bg-white/70 backdrop-blur-xl border-none shadow-2xl shadow-gray-200/50 rounded-3xl ring-1 ring-white overflow-hidden relative">
          <div className="absolute top-0 left-0 w-full h-1 bg-procarni-alert"></div>
          <CardHeader className="bg-amber-50/50 pb-4 border-b border-gray-100">
            <Badge variant="outline" className="w-fit text-[10px] tracking-widest text-procarni-alert border-procarni-alert/30 uppercase mb-2">
              Item a Limpiar (Dirty)
            </Badge>
            <CardTitle className="text-2xl font-bold text-gray-900 leading-tight">
              {currentItem.dirty_name}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div className="flex gap-4">
              <div className="bg-gray-50 p-3 rounded-2xl flex-1 border border-gray-100">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-1">Categoría</p>
                <p className="text-sm font-medium text-procarni-dark">{currentItem.dirty_category || 'N/A'}</p>
              </div>
              <div className="bg-gray-50 p-3 rounded-2xl flex-1 border border-gray-100">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-1">Unidad</p>
                <p className="text-sm font-medium text-procarni-dark">{currentItem.dirty_unit || 'N/A'}</p>
              </div>
            </div>
            
            <div className="pt-6 border-t border-gray-100 flex justify-between items-center">
              <span className="text-sm text-gray-400">
                Item {currentIndex + 1} de {groups.length}
              </span>
              <Button 
                variant="outline" 
                size="lg" 
                onClick={handleNext}
                className="rounded-xl border-gray-200 hover:bg-gray-50 group transition-all"
                disabled={linkMutation.isPending}
              >
                Saltar (No es ninguno)
                <SkipForward className="ml-2 h-4 w-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Lado Derecho: Sugerencias */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-5 w-5 text-procarni-primary" />
            <h3 className="text-lg font-bold text-procarni-dark">Sugerencias Patrón Oro</h3>
          </div>
          
          {currentItem.suggestions.slice(0, 3).map((suggestion, idx) => (
            <Card 
              key={suggestion.master_id} 
              className={`bg-white border-none shadow-lg rounded-2xl transition-all duration-300 hover:shadow-xl hover:-translate-y-1 ${idx === 0 ? 'ring-2 ring-procarni-primary/20' : 'ring-1 ring-gray-100'}`}
            >
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {idx === 0 && (
                      <Badge className="bg-procarni-primary/10 text-procarni-primary hover:bg-procarni-primary/20 text-[10px] py-0 border-none">Mejor Coincidencia</Badge>
                    )}
                    <span className="text-xs font-medium text-procarni-secondary bg-procarni-secondary/10 px-2 py-0.5 rounded-full">
                      {suggestion.similarity_score}% Similar
                    </span>
                  </div>
                  <h4 className="text-base font-bold text-gray-900">{suggestion.master_name}</h4>
                </div>
                
                <Button 
                  onClick={() => handleLink(suggestion.master_id, currentItem.dirty_id)}
                  disabled={linkMutation.isPending}
                  className="bg-procarni-primary hover:bg-procarni-primary/90 text-white rounded-xl shadow-md hover:shadow-lg transition-all"
                >
                  <Check className="mr-2 h-4 w-4" />
                  Vincular
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MaterialMapperTinder;
