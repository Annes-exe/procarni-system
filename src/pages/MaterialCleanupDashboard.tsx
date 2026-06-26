import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Material } from '@/integrations/supabase/types';
import MaterialResolutionModal from '@/components/MaterialResolutionModal';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Combine, Search, Network, History, Undo, Info, EyeOff, RotateCcw, Sparkles, Wrench, ArrowRight, Loader2 } from 'lucide-react';
import { getAllMaterials } from '@/integrations/supabase/data';
import { showSuccess, showError } from '@/utils/toast';
import { cn } from '@/lib/utils';

interface UnifiedSuggestion {
  target_id: string;
  target_name: string;
  source_id: string;
  source_name: string;
  similarity_score: number;
  is_dirty_migration?: boolean;
}

const getUnifiedSuggestions = async () => {
  const { data: fusionData, error: fusionError } = await supabase
    .from('vw_material_fusion_suggestions')
    .select('*')
    .limit(100);
    
  if (fusionError) throw fusionError;

  const { data: migrationData, error: migrationError } = await supabase
    .from('vw_soft_migration_suggestions')
    .select('*')
    .limit(100);

  if (migrationError) throw migrationError;

  const map = new Map<string, UnifiedSuggestion>();

  (migrationData || []).forEach((row: any) => {
    const key = `${row.master_id}-${row.dirty_id}`;
    map.set(key, {
      target_id: row.master_id,
      target_name: row.master_name,
      source_id: row.dirty_id,
      source_name: row.dirty_name,
      similarity_score: row.similarity_score,
      is_dirty_migration: true
    });
  });

  (fusionData || []).forEach((row: any) => {
    const key = `${row.target_id}-${row.source_id}`;
    const reverseKey = `${row.source_id}-${row.target_id}`;
    
    if (!map.has(key) && !map.has(reverseKey)) {
      map.set(key, {
        target_id: row.target_id,
        target_name: row.target_name,
        source_id: row.source_id,
        source_name: row.source_name,
        similarity_score: row.similarity_score,
        is_dirty_migration: false
      });
    }
  });

  return Array.from(map.values()).sort((a, b) => b.similarity_score - a.similarity_score);
};

const getCleanupHistory = async () => {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .in('action', ['FUSION', 'GROUP_ADD', 'GROUP_REMOVE', 'UNMERGE'])
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
  const [isResolutionModalOpen, setIsResolutionModalOpen] = useState(false);
  const [resolutionAction, setResolutionAction] = useState<'merge' | 'group'>('merge');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const { data: suggestions, isLoading: isLoadingSuggestions, refetch: refetchSuggestions } = useQuery({
    queryKey: ['fusion_suggestions'],
    queryFn: getUnifiedSuggestions,
  });

  const quickResolveMutation = useMutation({
    mutationFn: async ({ action, targetId, sourceId }: { action: 'merge' | 'group', targetId: string, sourceId: string }) => {
      const { error } = await supabase.rpc('resolve_materials_unified', {
        p_action: action,
        p_target_material_id: targetId,
        p_source_material_ids: [sourceId]
      });
      if (error) throw error;
      return { action, sourceId };
    },
    onSuccess: (data) => {
      const actionText = data.action === 'merge' ? 'Fusión rápida completada.' : 'Agrupación rápida completada.';
      showSuccess(actionText);
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      queryClient.invalidateQueries({ queryKey: ['vw_soft_migration_suggestions'] });
      refetchSuggestions();
      refetchHistory();
    },
    onError: (err: any) => {
      showError(`Error al resolver: ${err.message}`);
    }
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
    setResolutionAction('merge');
    setIsResolutionModalOpen(true);
  };

  const handleOpenGroup = (targetId: string, sourceId: string) => {
    setSelectedIds([targetId, sourceId]);
    setResolutionAction('group');
    setIsResolutionModalOpen(true);
  };

  const getScoreColor = (score: number) => {
    if (score > 80) return "bg-red-100 text-red-800 border-red-200";
    if (score > 60) return "bg-orange-100 text-orange-800 border-orange-200";
    return "bg-yellow-100 text-yellow-800 border-yellow-200";
  };

  const findMaterialData = (id: string) => materials.find(m => m.id === id);

  const undoMutation = useMutation({
    mutationFn: async ({ action, targetId, recordId }: { action: string, targetId: string, recordId: string }) => {
      const { error } = await supabase.rpc('resolve_materials_unified', {
        p_action: 'unmerge',
        p_target_material_id: targetId,
        p_source_material_ids: [recordId],
      });
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccess("Acción deshecha correctamente. El material vuelve a estar activo.");
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      queryClient.invalidateQueries({ queryKey: ['vw_soft_migration_suggestions'] });
      refetchSuggestions();
      refetchHistory();
    },
    onError: (err: Error) => {
      showError(`Error al deshacer: ${err.message}`);
    }
  });

  const handleUndo = (action: string, details: any) => {
    const recordId = details?.record_id;
    const targetId = details?.target_id || details?.parent_id;
    
    if (!recordId || !targetId) {
      showError("No se pudieron determinar los IDs necesarios para deshacer.");
      return;
    }

    const actionText = action === 'FUSION' ? 'fusión' : 'agrupación';
    if (confirm(`¿Estás seguro de deshacer esta ${actionText}? El material volverá a estar activo en el catálogo.`)) {
      undoMutation.mutate({ action, targetId, recordId });
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
    <div className="space-y-6 max-w-6xl mx-auto p-4 overflow-x-hidden w-full">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold tracking-tight text-procarni-dark">Limpieza de Catálogo</h2>
        <p className="text-muted-foreground">
          Detecta duplicados, fusiona registros redundantes y organiza la jerarquía de tus materiales.
        </p>
      </div>

      <Tabs defaultValue="panel" className="w-full">
        <div className="overflow-x-auto pb-2 w-full">
          <TabsList className="mb-2 w-max sm:w-auto">
            <TabsTrigger value="panel" className="flex items-center gap-2">
              <Combine className="w-4 h-4 shrink-0" />
              Panel de Limpieza
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History className="w-4 h-4 shrink-0" />
              Historial de Limpieza
            </TabsTrigger>
            <TabsTrigger value="ignored" className="flex items-center gap-2">
              <EyeOff className="w-4 h-4 shrink-0" />
              Ignorados
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="panel" className="space-y-6">
          <div className="flex flex-col gap-1.5 mb-2">
            <h3 className="text-lg font-extrabold text-procarni-blue flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-procarni-primary" />
              Sugerencias Inteligentes de Resolución
            </h3>
            <p className="text-xs text-slate-500 font-medium italic">
              El sistema ha detectado variaciones de catálogo con alta similitud trigramática. Resuélvelas de forma rápida (1-clic) o personaliza la acción.
            </p>
          </div>

          {isLoadingSuggestions ? (
            <div className="py-12 text-center text-muted-foreground animate-pulse flex flex-col items-center justify-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-procarni-primary border-t-transparent"></div>
              <span>Analizando similitudes en el catálogo...</span>
            </div>
          ) : suggestions?.length === 0 ? (
            <div className="bg-white border border-slate-100 shadow-md p-10 rounded-[2rem] text-center text-procarni-secondary flex flex-col items-center gap-3">
              <AlertCircle className="w-10 h-10 text-procarni-secondary" />
              <p className="font-extrabold text-lg text-procarni-dark">¡Catálogo Limpio!</p>
              <p className="text-sm text-slate-500">No se encontraron materiales duplicados o variaciones pendientes de estructurar.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
              {suggestions?.map((suggestion, index) => {
                const targetData = findMaterialData(suggestion.target_id);
                const sourceData = findMaterialData(suggestion.source_id);
                
                const isCardResolving = quickResolveMutation.isPending && quickResolveMutation.variables?.sourceId === suggestion.source_id;
                const isCardIgnoring = ignoreMutation.isPending && ignoreMutation.variables?.sourceId === suggestion.source_id && ignoreMutation.variables?.targetId === suggestion.target_id;
                const resolvingAction = quickResolveMutation.variables?.action;
                const isProcessing = isCardResolving || isCardIgnoring;

                return (
                  <div 
                    key={index} 
                    className={cn(
                      "bg-white border border-slate-100 shadow-md hover:shadow-xl rounded-[1.75rem] p-5 transition-all duration-300 flex flex-col justify-between group relative overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300",
                      isProcessing && "pointer-events-none"
                    )}
                  >
                    {isProcessing && (
                      <div className="absolute inset-0 bg-white/40 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center gap-2 animate-in fade-in duration-200">
                        <Loader2 className="h-8 w-8 animate-spin text-procarni-primary" />
                        <span className="text-xs font-bold text-procarni-primary">
                          {isCardIgnoring ? 'Ignorando...' : resolvingAction === 'merge' ? 'Fusionando...' : 'Agrupando...'}
                        </span>
                      </div>
                    )}
                    {/* Top light glow border */}
                    <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-procarni-primary to-procarni-secondary opacity-80"></div>
                    
                    <div>
                      {/* Badge header & ignore button */}
                      <div className="flex items-center justify-between gap-2 mb-4">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={`font-mono text-[10px] shadow-sm uppercase ${getScoreColor(suggestion.similarity_score)}`}>
                            {suggestion.similarity_score}% Similar
                          </Badge>
                          {suggestion.is_dirty_migration && (
                            <Badge className="bg-amber-50 text-procarni-alert border border-amber-200/50 text-[9px] font-bold">
                              Importado
                            </Badge>
                          )}
                        </div>
                        <Button 
                          onClick={() => ignoreMutation.mutate({ targetId: suggestion.target_id, sourceId: suggestion.source_id })}
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 rounded-full text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="Ignorar esta coincidencia"
                          disabled={ignoreMutation.isPending || quickResolveMutation.isPending}
                        >
                          <EyeOff className="w-4 h-4" />
                        </Button>
                      </div>

                      {/* Comparison Flow */}
                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 py-3 bg-slate-50/50 rounded-2xl px-4 border border-slate-100/50">
                        
                        {/* Left Side: Duplicate (Source) */}
                        <div className="text-center min-w-0">
                          <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-1">Material Duplicado</p>
                          <p className="font-bold text-slate-900 text-sm break-words leading-snug line-clamp-2" title={suggestion.source_name}>
                            {suggestion.source_name}
                          </p>
                          <div className="flex justify-center gap-1 mt-2 flex-wrap">
                            {sourceData?.category && <Badge variant="outline" className="text-[9px] py-0 border-slate-200">{sourceData.category}</Badge>}
                            {sourceData?.unit && <Badge variant="secondary" className="text-[9px] py-0">{sourceData.unit}</Badge>}
                          </div>
                        </div>

                        {/* Center: Connection icon */}
                        <div className="flex flex-col items-center justify-center text-slate-300">
                          <ArrowRight className="h-5 w-5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                        </div>

                        {/* Right Side: Gold Standard (Target) */}
                        <div className="text-center min-w-0">
                          <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-1">Patrón de Oro</p>
                          <p className="font-bold text-procarni-blue text-sm break-words leading-snug line-clamp-2" title={suggestion.target_name}>
                            {suggestion.target_name}
                          </p>
                          <div className="flex justify-center gap-1 mt-2 flex-wrap">
                            {targetData?.category && <Badge variant="outline" className="text-[9px] py-0 border-slate-200">{targetData.category}</Badge>}
                            {targetData?.unit && <Badge variant="secondary" className="text-[9px] py-0">{targetData.unit}</Badge>}
                          </div>
                        </div>

                      </div>
                    </div>

                    {/* Footer Action Bar */}
                    <div className="border-t border-slate-100 pt-4 mt-5 flex items-center justify-between gap-2">
                      <Button 
                        onClick={() => handleOpenFusion(suggestion.target_id, suggestion.source_id)}
                        variant="ghost"
                        size="sm"
                        className="text-[11px] font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl px-2 h-9 flex items-center gap-1"
                        disabled={quickResolveMutation.isPending}
                      >
                        <Wrench className="w-3.5 h-3.5" />
                        Personalizar
                      </Button>
                      
                      <div className="flex items-center gap-1.5">
                        <Button 
                          onClick={() => quickResolveMutation.mutate({ action: 'group', targetId: suggestion.target_id, sourceId: suggestion.source_id })}
                          variant="outline"
                          size="sm"
                          className="h-9 text-[11px] font-bold rounded-xl border-procarni-blue/30 text-procarni-blue hover:bg-procarni-blue hover:text-white transition-all shadow-sm flex items-center gap-1 px-2.5"
                          disabled={quickResolveMutation.isPending}
                        >
                          {isCardResolving && resolvingAction === 'group' ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                          ) : (
                            <Network className="w-3.5 h-3.5" />
                          )}
                          {isCardResolving && resolvingAction === 'group' ? 'Agrupando...' : 'Agrupar Rápido'}
                        </Button>
                        <Button 
                          onClick={() => quickResolveMutation.mutate({ action: 'merge', targetId: suggestion.target_id, sourceId: suggestion.source_id })}
                          variant="secondary"
                          size="sm"
                          className="h-9 text-[11px] font-bold rounded-xl bg-red-50 text-procarni-primary hover:bg-red-100 border border-red-200 shadow-sm flex items-center gap-1 px-2.5"
                          disabled={quickResolveMutation.isPending}
                        >
                          {isCardResolving && resolvingAction === 'merge' ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                          ) : (
                            <Combine className="w-3.5 h-3.5" />
                          )}
                          {isCardResolving && resolvingAction === 'merge' ? 'Vinculando...' : 'Vincular Rápido'}
                        </Button>
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          )}
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
                      {history?.map((log) => {
                        const isRowUndoing = undoMutation.isPending && undoMutation.variables?.recordId === log.details?.record_id;
                        return (
                          <tr key={log.id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                              {new Date(log.timestamp).toLocaleString()}
                            </td>
                            <td className="px-6 py-4">
                              {log.action === 'FUSION' ? (
                                <Badge variant="destructive" className="bg-red-100 text-red-800 border-red-200">Fusión</Badge>
                              ) : log.action === 'GROUP_ADD' ? (
                                <Badge variant="outline" className="bg-blue-50 text-blue-800 border-blue-200">Agrupado</Badge>
                              ) : log.action === 'UNMERGE' ? (
                                <Badge variant="outline" className="bg-green-50 text-green-800 border-green-200">Restaurado</Badge>
                              ) : (
                                <Badge variant="secondary" className="bg-gray-100 text-gray-800">Desagrupado</Badge>
                              )}
                            </td>
                            <td className="px-6 py-4 text-gray-700 font-medium">
                              {log.details?.description || 'Sin descripción'}
                            </td>
                            <td className="px-6 py-4 text-right">
                              {log.action === 'GROUP_ADD' || log.action === 'FUSION' ? (
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => handleUndo(log.action, log.details)}
                                  disabled={undoMutation.isPending}
                                  className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                                >
                                  {isRowUndoing ? (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                  ) : (
                                    <Undo className="w-4 h-4 mr-2" />
                                  )}
                                  {isRowUndoing ? 'Deshaciendo...' : 'Deshacer'}
                                </Button>
                              ) : log.action === 'UNMERGE' ? (
                                <div className="flex items-center justify-end text-xs text-gray-400 gap-1" title="Esta acción ya fue revertida.">
                                  <Info className="w-3 h-3" />
                                  Revertido
                                </div>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
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

      {isResolutionModalOpen && (
        <MaterialResolutionModal
          open={isResolutionModalOpen}
          onOpenChange={setIsResolutionModalOpen}
          selectedIds={selectedIds}
          materials={materials as Material[]}
          onSuccess={() => {
            refetchSuggestions();
            refetchHistory();
          }}
          initialAction={resolutionAction}
        />
      )}
    </div>
  );
};

export default MaterialCleanupDashboard;
