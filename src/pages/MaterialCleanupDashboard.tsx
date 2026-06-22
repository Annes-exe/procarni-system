import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Material } from '@/integrations/supabase/types';
import MaterialFusionModal from '@/components/MaterialFusionModal';
import MaterialGroupModal from '@/components/MaterialGroupModal';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Combine, Search, Network, History, Undo, Info, EyeOff, RotateCcw } from 'lucide-react';
import { getAllMaterials } from '@/integrations/supabase/data';
import { updateMaterial } from '@/integrations/supabase/services/materialService';
import { showSuccess, showError } from '@/utils/toast';

const getFusionSuggestions = async () => {
  const { data, error } = await supabase
    .from('vw_material_fusion_suggestions')
    .select('*')
    .limit(50);
    
  if (error) throw error;
  return data;
};

const getCleanupHistory = async () => {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .in('action', ['FUSION', 'GROUP_ADD', 'GROUP_REMOVE'])
    .order('timestamp', { ascending: false })
    .limit(100);
    
  if (error) throw error;
  return data;
};

const getIgnoredMatches = async () => {
  const { data, error } = await supabase
    .from('ignored_material_matches')
    .select('*')
    .order('created_at', { ascending: false });
    
  if (error) throw error;
  return data;
};

const MaterialCleanupDashboard = () => {
  const queryClient = useQueryClient();
  const [isFusionModalOpen, setIsFusionModalOpen] = useState(false);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const { data: suggestions, isLoading: isLoadingSuggestions, refetch: refetchSuggestions } = useQuery({
    queryKey: ['fusion_suggestions'],
    queryFn: getFusionSuggestions,
  });

  const { data: materials = [] } = useQuery({
    queryKey: ['materials'],
    queryFn: getAllMaterials,
  });

  const { data: history = [], isLoading: isLoadingHistory, refetch: refetchHistory } = useQuery({
    queryKey: ['cleanup_history'],
    queryFn: getCleanupHistory,
  });

  const { data: ignored = [], isLoading: isLoadingIgnored, refetch: refetchIgnored } = useQuery({
    queryKey: ['ignored_matches'],
    queryFn: getIgnoredMatches,
  });

  const handleOpenFusion = (targetId: string, sourceId: string) => {
    setSelectedIds([targetId, sourceId]);
    setIsFusionModalOpen(true);
  };

  const handleOpenGroup = (targetId: string, sourceId: string) => {
    setSelectedIds([targetId, sourceId]);
    setIsGroupModalOpen(true);
  };

  const getScoreColor = (score: number) => {
    if (score > 80) return "bg-red-100 text-red-800 border-red-200";
    if (score > 60) return "bg-orange-100 text-orange-800 border-orange-200";
    return "bg-yellow-100 text-yellow-800 border-yellow-200";
  };

  const findMaterialData = (id: string) => materials.find(m => m.id === id);

  const undoGroupMutation = useMutation({
    mutationFn: async (recordId: string) => {
      const res = await updateMaterial(recordId, { base_material_id: null });
      if (!res) throw new Error("Error al desagrupar el material");
      // Opcional: Registrar en el log que se deshizo la acción
      await supabase.from('audit_logs').insert({
        action: 'GROUP_REMOVE',
        table: 'materials',
        record_id: recordId,
        description: `Agrupación deshecha vía Historial (Recovery)`
      });
    },
    onSuccess: () => {
      showSuccess("Agrupación deshecha correctamente. El material vuelve a estar libre.");
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      refetchHistory();
    },
    onError: (err: Error) => {
      showError(`Error: ${err.message}`);
    }
  });

  const handleUndoGroup = (recordId: string) => {
    if (confirm("¿Estás seguro de deshacer esta agrupación? El material quedará libre en el catálogo.")) {
      undoGroupMutation.mutate(recordId);
    }
  };

  const ignoreMutation = useMutation({
    mutationFn: async ({ targetId, sourceId }: { targetId: string, sourceId: string }) => {
      const { error } = await supabase.from('ignored_material_matches').insert({
        target_id: targetId,
        source_id: sourceId
      });
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccess("Coincidencia ignorada. No volverá a aparecer en las sugerencias.");
      refetchSuggestions();
      refetchIgnored();
    },
    onError: (err: Error) => showError(`Error al ignorar: ${err.message}`)
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ignored_material_matches').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccess("Coincidencia restaurada con éxito.");
      refetchSuggestions();
      refetchIgnored();
    },
    onError: (err: Error) => showError(`Error al restaurar: ${err.message}`)
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-4">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold tracking-tight text-procarni-dark">Limpieza de Catálogo</h2>
        <p className="text-muted-foreground">
          Detecta duplicados, fusiona registros redundantes y organiza la jerarquía de tus materiales.
        </p>
      </div>

      <Tabs defaultValue="suggestions" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="suggestions" className="flex items-center gap-2">
            <Search className="w-4 h-4" />
            Sugerencias de la IA
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="w-4 h-4" />
            Historial de Limpieza
          </TabsTrigger>
          <TabsTrigger value="ignored" className="flex items-center gap-2">
            <EyeOff className="w-4 h-4" />
            Ignorados
          </TabsTrigger>
        </TabsList>

        <TabsContent value="suggestions">
          <Card className="bg-white/70 backdrop-blur-xl border-none shadow-xl shadow-gray-200/50">
            <CardHeader className="bg-slate-50/50 border-b rounded-t-xl">
              <CardTitle className="flex items-center gap-2 text-lg text-procarni-blue">
                Sugerencias de Fusión y Agrupación
              </CardTitle>
              <CardDescription>
                Revisa los pares encontrados. Puedes optar por Fusionar (destructivo) o Agrupar (jerárquico).
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {isLoadingSuggestions ? (
                <div className="p-8 text-center text-muted-foreground animate-pulse">Calculando similitudes trigramáticas...</div>
              ) : suggestions?.length === 0 ? (
                <div className="p-8 text-center text-procarni-secondary flex flex-col items-center gap-2">
                  <AlertCircle className="w-8 h-8" />
                  <p className="font-medium">¡Catálogo Limpio!</p>
                  <p className="text-sm">No se encontraron materiales con alta similitud.</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {suggestions?.map((suggestion, index) => {
                    const targetData = findMaterialData(suggestion.target_id);
                    const sourceData = findMaterialData(suggestion.source_id);

                    return (
                      <div key={index} className="flex flex-col md:flex-row md:items-center justify-between p-4 hover:bg-slate-50/80 transition-colors gap-4">
                        <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center flex-1">
                          
                          {/* Material A */}
                          <div className="text-right">
                            <p className="font-medium text-slate-900">{suggestion.target_name}</p>
                            <div className="flex justify-end gap-1 mt-1">
                              {targetData?.category && <Badge variant="outline" className="text-[10px]">{targetData.category}</Badge>}
                              {targetData?.unit && <Badge variant="secondary" className="text-[10px]">{targetData.unit}</Badge>}
                            </div>
                            <p className="text-[10px] text-muted-foreground font-mono mt-1 truncate max-w-[150px] ml-auto">{suggestion.target_id}</p>
                          </div>

                          {/* Porcentaje de Similitud */}
                          <div className="flex flex-col items-center px-4 shrink-0">
                            <Badge variant="outline" className={`font-mono ${getScoreColor(suggestion.similarity_score)}`}>
                              {suggestion.similarity_score}%
                            </Badge>
                            <div className="h-px w-full bg-slate-200 mt-2 relative">
                              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-1 text-[10px] text-slate-400">VS</div>
                            </div>
                          </div>

                          {/* Material B */}
                          <div className="text-left">
                            <p className="font-medium text-slate-900">{suggestion.source_name}</p>
                            <div className="flex justify-start gap-1 mt-1">
                              {sourceData?.category && <Badge variant="outline" className="text-[10px]">{sourceData.category}</Badge>}
                              {sourceData?.unit && <Badge variant="secondary" className="text-[10px]">{sourceData.unit}</Badge>}
                            </div>
                            <p className="text-[10px] text-muted-foreground font-mono mt-1 truncate max-w-[150px]">{suggestion.source_id}</p>
                          </div>

                        </div>

                        <div className="flex flex-col sm:flex-row gap-2 shrink-0 md:ml-4">
                          <Button 
                            onClick={() => ignoreMutation.mutate({ targetId: suggestion.target_id, sourceId: suggestion.source_id })}
                            variant="ghost"
                            className="shrink-0 flex items-center gap-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 px-2"
                            disabled={ignoreMutation.isPending}
                            title="Ignorar esta coincidencia"
                          >
                            <EyeOff className="w-4 h-4" />
                          </Button>
                          <Button 
                            onClick={() => handleOpenGroup(suggestion.target_id, suggestion.source_id)}
                            variant="outline"
                            className="shrink-0 flex items-center gap-2 border-procarni-blue text-procarni-blue hover:bg-procarni-blue hover:text-white transition-all"
                          >
                            <Network className="w-4 h-4" />
                            Agrupar
                          </Button>
                          <Button 
                            onClick={() => handleOpenFusion(suggestion.target_id, suggestion.source_id)}
                            variant="secondary"
                            className="shrink-0 flex items-center gap-2 bg-red-50 text-procarni-primary hover:bg-red-100 border border-red-200"
                          >
                            <Combine className="w-4 h-4" />
                            Evaluar Fusión
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card className="bg-white/70 backdrop-blur-xl border-none shadow-xl shadow-gray-200/50">
            <CardHeader className="bg-slate-50/50 border-b rounded-t-xl">
              <CardTitle className="text-lg text-procarni-blue">Historial de Limpieza</CardTitle>
              <CardDescription>
                Registro de acciones de fusión y agrupación. Solo las agrupaciones se pueden deshacer.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {isLoadingHistory ? (
                <div className="p-8 text-center text-muted-foreground">Cargando historial...</div>
              ) : history?.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">No hay registros de limpieza recientes.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-gray-500 uppercase bg-gray-50/50 border-b">
                      <tr>
                        <th className="px-6 py-3 font-semibold">Fecha</th>
                        <th className="px-6 py-3 font-semibold">Tipo</th>
                        <th className="px-6 py-3 font-semibold">Descripción</th>
                        <th className="px-6 py-3 font-semibold text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {history?.map((log) => (
                        <tr key={log.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                            {new Date(log.timestamp).toLocaleString()}
                          </td>
                          <td className="px-6 py-4">
                            {log.action === 'FUSION' ? (
                              <Badge variant="destructive" className="bg-red-100 text-red-800 border-red-200">Fusión</Badge>
                            ) : log.action === 'GROUP_ADD' ? (
                              <Badge variant="outline" className="bg-blue-50 text-blue-800 border-blue-200">Agrupado</Badge>
                            ) : (
                              <Badge variant="secondary" className="bg-gray-100 text-gray-800">Desagrupado</Badge>
                            )}
                          </td>
                          <td className="px-6 py-4 text-gray-700 font-medium">
                            {log.description}
                          </td>
                          <td className="px-6 py-4 text-right">
                            {log.action === 'GROUP_ADD' ? (
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => handleUndoGroup(log.record_id)}
                                disabled={undoGroupMutation.isPending}
                                className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                              >
                                <Undo className="w-4 h-4 mr-2" />
                                Deshacer
                              </Button>
                            ) : log.action === 'FUSION' ? (
                              <div className="flex items-center justify-end text-xs text-gray-400 gap-1" title="Las fusiones destruyen los datos originales y no se pueden deshacer.">
                                <Info className="w-3 h-3" />
                                Irreversible
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ignored">
          <Card className="bg-white/70 backdrop-blur-xl border-none shadow-xl shadow-gray-200/50">
            <CardHeader className="bg-slate-50/50 border-b rounded-t-xl">
              <CardTitle className="text-lg text-procarni-blue">Coincidencias Ignoradas</CardTitle>
              <CardDescription>
                Pares de materiales que has decidido no agrupar ni fusionar. Puedes restaurarlos si cambias de opinión.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {isLoadingIgnored ? (
                <div className="p-8 text-center text-muted-foreground">Cargando ignorados...</div>
              ) : ignored?.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground flex flex-col items-center gap-2">
                  <p className="font-medium">No hay coincidencias ignoradas.</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {ignored?.map((item) => {
                    const targetData = findMaterialData(item.target_id);
                    const sourceData = findMaterialData(item.source_id);

                    return (
                      <div key={item.id} className="flex flex-col md:flex-row md:items-center justify-between p-4 hover:bg-slate-50/80 transition-colors gap-4">
                        <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center flex-1">
                          <div className="text-right">
                            <p className="font-medium text-slate-500 line-through decoration-slate-300">{targetData?.name || item.target_id}</p>
                            <p className="text-[10px] text-muted-foreground font-mono mt-1">{targetData?.code}</p>
                          </div>
                          <div className="flex flex-col items-center px-4 shrink-0 opacity-50">
                            <div className="h-px w-full bg-slate-200 relative">
                              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-1 text-[10px] text-slate-400">VS</div>
                            </div>
                          </div>
                          <div className="text-left">
                            <p className="font-medium text-slate-500 line-through decoration-slate-300">{sourceData?.name || item.source_id}</p>
                            <p className="text-[10px] text-muted-foreground font-mono mt-1">{sourceData?.code}</p>
                          </div>
                        </div>

                        <div className="flex shrink-0 md:ml-4">
                          <Button 
                            onClick={() => restoreMutation.mutate(item.id)}
                            variant="outline"
                            className="shrink-0 flex items-center gap-2"
                            disabled={restoreMutation.isPending}
                          >
                            <RotateCcw className="w-4 h-4" />
                            Restaurar
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {isFusionModalOpen && (
        <MaterialFusionModal
          open={isFusionModalOpen}
          onOpenChange={setIsFusionModalOpen}
          selectedIds={selectedIds}
          materials={materials as Material[]}
          onSuccess={() => {
            refetchSuggestions();
            refetchHistory();
          }}
        />
      )}

      {isGroupModalOpen && (
        <MaterialGroupModal
          open={isGroupModalOpen}
          onOpenChange={setIsGroupModalOpen}
          selectedIds={selectedIds}
          materials={materials as Material[]}
          onSuccess={() => {
            refetchSuggestions();
            refetchHistory();
          }}
        />
      )}
    </div>
  );
};

export default MaterialCleanupDashboard;
