import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { Combine, Network, AlertTriangle, Box, Sparkles, Loader2, ArrowRight, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Material } from '@/integrations/supabase/types';
import SmartSearch from '@/components/SmartSearch';

interface MaterialResolutionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: string[];
  materials: Material[];
  onSuccess: () => void;
  initialAction?: 'merge' | 'group';
}

const MaterialResolutionModal: React.FC<MaterialResolutionModalProps> = ({
  open,
  onOpenChange,
  selectedIds,
  materials,
  onSuccess,
  initialAction = 'merge',
}) => {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<number>(1);
  
  // States
  const [targetId, setTargetId] = useState<string>('');
  const [targetName, setTargetName] = useState<string>('');
  const [actionType, setActionType] = useState<'merge' | 'group'>('merge');
  
  // Source IDs selection state
  const [selectedSourceIds, setSelectedSourceIds] = useState<Record<string, boolean>>({});
  
  // Similar suggestions state
  const [similarSuggestions, setSimilarSuggestions] = useState<Material[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState<boolean>(false);

  // Checks de confirmación (Doble Advertencia para fusión)
  const [checkHistory, setCheckHistory] = useState(false);
  const [checkArchive, setCheckArchive] = useState(false);

  // Prefetch missing materials if selectedIds has elements not in the local materials array
  const [fetchedSources, setFetchedSources] = useState<Material[]>([]);
  const [isLoadingSources, setIsLoadingSources] = useState<boolean>(false);

  useEffect(() => {
    const fetchSources = async () => {
      const missingIds = selectedIds.filter(id => !materials.some(m => m.id === id));
      if (missingIds.length > 0) {
        setIsLoadingSources(true);
        try {
          const { data, error } = await supabase
            .from('materials')
            .select('*')
            .in('id', missingIds);
          if (error) throw error;
          setFetchedSources(data || []);
        } catch (e) {
          console.error("Error fetching missing source materials:", e);
        } finally {
          setIsLoadingSources(false);
        }
      } else {
        setFetchedSources([]);
      }
    };

    if (open && selectedIds.length > 0) {
      fetchSources();
    }
  }, [open, selectedIds, materials]);

  const allAvailableMaterials = [...materials, ...fetchedSources];
  const uniqueMaterialsMap = new Map<string, Material>();
  allAvailableMaterials.forEach(m => uniqueMaterialsMap.set(m.id, m));

  // Determine initial target
  useEffect(() => {
    if (open) {
      setStep(1);
      setTargetId('');
      setTargetName('');
      setActionType(initialAction);
      setCheckHistory(false);
      setCheckArchive(false);
      setSimilarSuggestions([]);
      
      // Auto-select initial target if one of the selectedIds is a master material
      const initialSources = selectedIds.map(id => uniqueMaterialsMap.get(id)).filter(Boolean) as Material[];
      const masterItem = initialSources.find(m => m.is_master);
      if (masterItem) {
        setTargetId(masterItem.id);
        setTargetName(masterItem.name);
        setStep(3); // Skip directly to confirmation
      }
      
      // Initialize checkboxes for source IDs (excluding target)
      const initialCheckboxes: Record<string, boolean> = {};
      selectedIds.forEach(id => {
        if (!masterItem || id !== masterItem.id) {
          initialCheckboxes[id] = true;
        }
      });
      setSelectedSourceIds(initialCheckboxes);
    }
  }, [open, selectedIds, initialAction]);

  // Load similar matches once a target (Patrón de Oro) is selected
  useEffect(() => {
    const fetchSimilarSuggestions = async () => {
      if (!targetId) {
        setSimilarSuggestions([]);
        return;
      }
      setIsLoadingSuggestions(true);
      try {
        const targetMat = uniqueMaterialsMap.get(targetId) || materials.find(m => m.id === targetId);
        if (!targetMat) return;
        
        // Clean name (e.g. remove " - CATEGORY") for ilike search
        const cleanName = targetMat.name.split(' - ')[0].trim();
        
        // Fetch materials with similar names in database
        const { data, error } = await supabase
          .from('materials')
          .select('*')
          .ilike('name', `%${cleanName.substring(0, 5)}%`) // Match prefix of 5 characters
          .eq('status', 'active')
          .neq('id', targetId)
          .limit(15);
          
        if (error) throw error;
        
        // Filter out those already in selectedIds
        const filtered = (data || []).filter(m => !selectedIds.includes(m.id) && !m.is_master);
        setSimilarSuggestions(filtered);
      } catch (e) {
        console.error("Error fetching similar suggestions:", e);
      } finally {
        setIsLoadingSuggestions(false);
      }
    };

    fetchSimilarSuggestions();
  }, [targetId]);

  // Mutation for applying resolution
  const resolutionMutation = useMutation({
    mutationFn: async () => {
      const sourceIds = Object.keys(selectedSourceIds).filter(id => selectedSourceIds[id] && id !== targetId);
      if (sourceIds.length === 0) {
        throw new Error("Debes tener al menos un material de origen seleccionado para resolver.");
      }

      const { error } = await supabase.rpc('resolve_materials_unified', {
        p_action: actionType,
        p_target_material_id: targetId,
        p_source_material_ids: sourceIds,
      });

      if (error) throw error;
      return { actionType, sourceIds };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      queryClient.invalidateQueries({ queryKey: ['fusion_suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['cleanup_history'] });
      queryClient.invalidateQueries({ queryKey: ['vw_soft_migration_suggestions'] });
      
      const successMsg = data.actionType === 'merge'
        ? `Fusión exitosa. Se han unificado ${data.sourceIds.length} materiales bajo el patrón de oro.`
        : `Agrupación exitosa. Se han vinculado ${data.sourceIds.length} materiales bajo el patrón de oro.`;
        
      showSuccess(successMsg);
      onSuccess();
      onOpenChange(false);
    },
    onError: (err: any) => {
      showError(`Error al resolver materiales: ${err.message}`);
    }
  });

  const handleApplyResolution = () => {
    if (actionType === 'merge' && (!checkHistory || !checkArchive)) {
      showError("Debes marcar las confirmaciones de seguridad antes de fusionar.");
      return;
    }
    resolutionMutation.mutate();
  };

  const handleToggleSource = (id: string, checked: boolean) => {
    setSelectedSourceIds(prev => ({
      ...prev,
      [id]: checked
    }));
  };

  // Get active source items list
  const activeSources = Object.keys(selectedSourceIds)
    .filter(id => selectedSourceIds[id] && id !== targetId)
    .map(id => uniqueMaterialsMap.get(id) || similarSuggestions.find(s => s.id === id))
    .filter(Boolean) as Material[];

  const targetMat = uniqueMaterialsMap.get(targetId) || allAvailableMaterials.find(m => m.id === targetId);

  const isFormValid = targetId && activeSources.length > 0 && (actionType === 'group' || (checkHistory && checkArchive));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-[850px] max-h-[90vh] overflow-y-auto p-6 rounded-[2rem] bg-white border border-slate-200/80 shadow-2xl shadow-slate-200/50">
        <DialogHeader className="pb-4 border-b border-gray-100">
          <DialogTitle className="text-2xl font-extrabold tracking-tight text-procarni-blue flex items-center gap-3">
            {actionType === 'merge' ? <Combine className="h-6 w-6 text-procarni-primary" /> : <Network className="h-6 w-6 text-procarni-blue" />}
            Resolución de Materiales
          </DialogTitle>
          <DialogDescription className="text-slate-500 font-medium italic">
            Une o estructura variaciones y duplicados bajo un único material "Patrón de Oro".
          </DialogDescription>
        </DialogHeader>

        {isLoadingSources ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-procarni-primary" />
            <p className="text-sm text-gray-500 font-medium">Cargando catálogo de referencia...</p>
          </div>
        ) : (
          <div className="py-4 space-y-6">
            
            {/* STEP WIZARD INDICATOR */}
            <div className="flex items-center justify-between text-xs font-bold text-gray-400 uppercase tracking-widest px-1">
              <span className={step === 1 ? "text-procarni-primary" : ""}>1. Patrón de Oro</span>
              <ArrowRight className="h-3 w-3 shrink-0" />
              <span className={step === 2 ? "text-procarni-primary" : ""}>2. Tipo de Resolución</span>
              <ArrowRight className="h-3 w-3 shrink-0" />
              <span className={step === 3 ? "text-procarni-primary" : ""}>3. Coincidencias y Aplicar</span>
            </div>

            {/* Target Item / Destination Identification */}
            {step > 1 && targetMat && (
              <div className="p-4 rounded-2xl border border-amber-200/50 bg-amber-50/20 shadow-sm flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 bg-amber-500/10 text-amber-600 rounded-xl shrink-0">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-amber-600 block mb-0.5">
                      Material Destino (Patrón de Oro)
                    </span>
                    <h4 className="font-bold text-slate-800 text-sm truncate">
                      {targetMat.name}
                    </h4>
                    {targetMat.code && (
                      <span className="text-[10px] font-mono text-slate-500">
                        Código: {targetMat.code}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {targetMat.category && (
                    <Badge variant="outline" className="text-[10px] border-amber-200 text-amber-700 bg-amber-50">
                      {targetMat.category}
                    </Badge>
                  )}
                  <Badge className="bg-amber-500 text-white text-[10px] font-bold">
                    ★ Principal
                  </Badge>
                </div>
              </div>
            )}

            {/* STEP 1: SELECT GOLD STANDARD */}
            {step === 1 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Selecciona el Material Oficial (Patrón de Oro)</label>
                  <SmartSearch
                    placeholder="Buscar patrón de oro..."
                    displayValue={targetName}
                    selectedId={targetId}
                    onSelect={(item) => {
                      setTargetId(item.id);
                      setTargetName(item.name.split(' - ')[0]);
                    }}
                    fetchFunction={async (query) => {
                      let dbQuery = supabase
                        .from('materials')
                        .select('id, name, code, category')
                        .eq('is_master', true)
                        .eq('status', 'active');

                      if (query.trim()) {
                        dbQuery = dbQuery.ilike('name', `%${query}%`);
                      }

                      const { data, error } = await dbQuery
                        .order('name', { ascending: true })
                        .limit(10);

                      if (error) return [];
                      return (data || []).map(m => ({
                        id: m.id,
                        name: `${m.name}${m.category ? ` - ${m.category}` : ''}${m.code ? ` (${m.code})` : ''}`,
                      }));
                    }}
                    className="w-full h-11"
                  />
                  <p className="text-xs text-gray-400 mt-1 italic">
                    Este material actuará como el registro maestro donde se conservará toda la información consolidada.
                  </p>
                </div>

                {selectedIds.length > 0 && (
                  <div className="bg-gray-50/50 border rounded-2xl p-4">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block mb-2">Materiales iniciales seleccionados</span>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {selectedIds.map(id => {
                        const mat = uniqueMaterialsMap.get(id);
                        if (!mat) return null;
                        const isTarget = mat.id === targetId;
                        return (
                          <div key={id} className={`flex items-start gap-2 p-2 rounded-xl text-sm border bg-white ${isTarget ? 'border-procarni-secondary/30 bg-green-50/30' : 'border-gray-100'}`}>
                            <Box className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                            <span className="font-medium text-gray-700 break-words whitespace-normal flex-1 mr-2">{mat.name}</span>
                            {isTarget ? (
                              <Badge className="bg-procarni-secondary/15 text-procarni-secondary text-[10px] border-none shrink-0 mt-0.5">Patrón de Oro</Badge>
                            ) : (
                              <Badge className="bg-procarni-primary/10 text-procarni-primary text-[10px] border-none shrink-0 mt-0.5">Duplicado</Badge>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* STEP 2: CHOOSE METHOD */}
            {step === 2 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="text-sm font-semibold text-gray-700 mb-2">
                  ¿Cómo deseas resolver la relación con <strong className="text-procarni-blue">"{targetName}"</strong>?
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* FUSION CARD */}
                  <button
                    type="button"
                    onClick={() => setActionType('merge')}
                    className={`text-left p-5 rounded-[2rem] border transition-all duration-300 hover:shadow-lg flex flex-col justify-between h-48 relative overflow-hidden group ${actionType === 'merge' ? 'border-procarni-primary ring-2 ring-procarni-primary/20 bg-white' : 'border-gray-100 bg-white/50 hover:bg-white'}`}
                  >
                    <div className="absolute top-0 right-0 w-24 h-24 bg-procarni-primary/5 rounded-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                    <Combine className={`h-8 w-8 ${actionType === 'merge' ? 'text-procarni-primary' : 'text-gray-400'}`} />
                    <div className="mt-4">
                      <span className="font-bold text-gray-900 block text-base">Fusión Definitiva</span>
                      <span className="text-xs text-gray-500 block leading-relaxed mt-1">
                        Archiva los duplicados (soft-delete) y mueve todo su historial y cotizaciones de forma definitiva al maestro.
                      </span>
                    </div>
                    {actionType === 'merge' && (
                      <span className="absolute top-4 right-4 h-5 w-5 bg-procarni-primary rounded-full flex items-center justify-center text-white">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                  </button>

                  {/* GROUP CARD */}
                  <button
                    type="button"
                    onClick={() => setActionType('group')}
                    className={`text-left p-5 rounded-[2rem] border transition-all duration-300 hover:shadow-lg flex flex-col justify-between h-48 relative overflow-hidden group ${actionType === 'group' ? 'border-procarni-blue ring-2 ring-procarni-blue/20 bg-white' : 'border-gray-100 bg-white/50 hover:bg-white'}`}
                  >
                    <div className="absolute top-0 right-0 w-24 h-24 bg-procarni-blue/5 rounded-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                    <Network className={`h-8 w-8 ${actionType === 'group' ? 'text-procarni-blue' : 'text-gray-400'}`} />
                    <div className="mt-4">
                      <span className="font-bold text-gray-900 block text-base">Agrupación Jerárquica</span>
                      <span className="text-xs text-gray-500 block leading-relaxed mt-1">
                        Mantiene los materiales activos e independientes en el catálogo, pero los vincula bajo el maestro como variantes.
                      </span>
                    </div>
                    {actionType === 'group' && (
                      <span className="absolute top-4 right-4 h-5 w-5 bg-procarni-blue rounded-full flex items-center justify-center text-white">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: MATCH SUGGESTIONS & CONFIRMATION */}
            {step === 3 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                {actionType === 'merge' && (
                  <div className="bg-red-50 border border-red-200 text-red-800 rounded-2xl p-4 text-xs flex gap-3">
                    <AlertTriangle className="h-5 w-5 text-procarni-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold mb-1">Fusión Definitiva (Soft-Delete)</p>
                      <p className="leading-relaxed text-slate-600">
                        Los materiales de origen serán **ocultados del catálogo activo**. Sus nombres se conservarán como alias de búsqueda en el maestro y se reasignarán cotizaciones, órdenes e historial.
                      </p>
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block mb-2">Materiales a resolver</label>
                    <div className="border rounded-2xl divide-y divide-gray-100 max-h-40 overflow-y-auto bg-white shadow-inner">
                      {selectedIds.filter(id => id !== targetId).map(id => {
                        const mat = uniqueMaterialsMap.get(id);
                        if (!mat) return null;
                        const isChecked = !!selectedSourceIds[id];
                        return (
                          <div key={id} className="flex items-start justify-between p-3 text-sm hover:bg-slate-50/50 transition-colors gap-4">
                            <span className="font-semibold text-gray-700 break-words whitespace-normal flex-1">{mat.name}</span>
                            <div className="flex items-center gap-2 shrink-0 mt-0.5">
                              {mat.category && <Badge variant="outline" className="text-[10px] py-0 border-slate-200">{mat.category}</Badge>}
                              <Checkbox 
                                checked={isChecked} 
                                onCheckedChange={(checked) => handleToggleSource(id, !!checked)} 
                                disabled={resolutionMutation.isPending}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* AUTO-DISCOVERED MATCHING SUGGESTIONS */}
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block mb-2 flex items-center gap-1.5">
                      <Sparkles className="h-3 w-3 text-procarni-primary" />
                      Otras posibles coincidencias detectadas en catálogo
                    </label>
                    
                    {isLoadingSuggestions ? (
                      <div className="py-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                        <Loader2 className="h-3 w-3 animate-spin text-procarni-primary" /> Buscando similitudes...
                      </div>
                    ) : similarSuggestions.length === 0 ? (
                      <p className="text-xs text-slate-400 italic bg-gray-50 p-3 rounded-2xl text-center">
                        No se detectaron más duplicados similares en el catálogo.
                      </p>
                    ) : (
                      <div className="border rounded-2xl divide-y divide-gray-100 max-h-40 overflow-y-auto bg-white shadow-inner">
                        {similarSuggestions.map(mat => {
                          const isChecked = !!selectedSourceIds[mat.id];
                          return (
                            <div key={mat.id} className="flex items-start justify-between p-3 text-sm hover:bg-slate-50/50 transition-colors gap-4">
                              <div className="flex flex-col flex-1 min-w-0">
                                <span className="font-semibold text-gray-700 break-words whitespace-normal">{mat.name}</span>
                                {mat.code && <span className="text-[10px] font-mono text-gray-400 mt-0.5">{mat.code}</span>}
                              </div>
                              <div className="flex items-center gap-2 shrink-0 mt-0.5">
                                {mat.category && <Badge variant="outline" className="text-[10px] py-0 border-slate-200">{mat.category}</Badge>}
                                <Checkbox 
                                  checked={isChecked} 
                                  onCheckedChange={(checked) => handleToggleSource(mat.id, !!checked)}
                                  disabled={resolutionMutation.isPending}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* FUSION DOUBLE-CHECK WARNINGS */}
                  {actionType === 'merge' && (
                    <div className="space-y-3 pt-2 border-t border-gray-100">
                      <div className="flex items-start gap-2.5">
                        <Checkbox 
                          id="checkHistory" 
                          checked={checkHistory} 
                          onCheckedChange={(c) => setCheckHistory(!!c)} 
                          className="mt-0.5 border-red-300 text-procarni-primary focus:ring-procarni-primary/20"
                        />
                        <label htmlFor="checkHistory" className="text-xs text-slate-600 font-medium leading-relaxed cursor-pointer select-none">
                          Entiendo que las cotizaciones y el historial transaccional de los duplicados seleccionados se moverán al maestro.
                        </label>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <Checkbox 
                          id="checkArchive" 
                          checked={checkArchive} 
                          onCheckedChange={(c) => setCheckArchive(!!c)} 
                          className="mt-0.5 border-red-300 text-procarni-primary focus:ring-procarni-primary/20"
                        />
                        <label htmlFor="checkArchive" className="text-xs text-slate-600 font-medium leading-relaxed cursor-pointer select-none">
                          Confirmo que deseo archivar (soft-delete) los materiales duplicados originales.
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>
        )}

        <DialogFooter className="border-t border-gray-100 pt-4 flex gap-2">
          {step > 1 && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep(prev => prev - 1)}
              disabled={resolutionMutation.isPending}
              className="rounded-xl border-gray-200 hover:bg-gray-50"
            >
              Atrás
            </Button>
          )}
          <div className="flex-1 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={resolutionMutation.isPending}
              className="rounded-xl"
            >
              Cancelar
            </Button>
            {step < 3 ? (
              <Button
                type="button"
                onClick={() => setStep(prev => prev + 1)}
                disabled={step === 1 && !targetId}
                className={`rounded-xl shadow-md ${actionType === 'merge' ? 'bg-procarni-primary hover:bg-procarni-primary/90 text-white' : 'bg-procarni-blue hover:bg-procarni-blue/90 text-white'}`}
              >
                Siguiente
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleApplyResolution}
                disabled={!isFormValid || resolutionMutation.isPending}
                className={`rounded-xl shadow-md ${actionType === 'merge' ? 'bg-procarni-primary hover:bg-procarni-primary/90 text-white' : 'bg-procarni-blue hover:bg-procarni-blue/90 text-white'}`}
              >
                {resolutionMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Procesando...
                  </>
                ) : (
                  'Aplicar Resolución'
                )}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MaterialResolutionModal;
