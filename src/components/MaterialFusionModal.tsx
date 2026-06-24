import React, { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { updateMaterial, getAllUnits, getAllMaterialCategories } from '@/integrations/supabase/data';
import { mergeMaterials } from '@/integrations/supabase/services/materialService';
import { logAudit } from '@/integrations/supabase/services/auditLogService';
import { showError, showSuccess } from '@/utils/toast';
import { Combine, AlertTriangle, Box } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Material } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';

interface MaterialFusionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: string[];
  materials: Material[];
  onSuccess: () => void;
}

const MaterialFusionModal: React.FC<MaterialFusionModalProps> = ({ 
  open, 
  onOpenChange, 
  selectedIds, 
  materials,
  onSuccess 
}) => {
  const queryClient = useQueryClient();
  
  const { data: units = [], isLoading: isLoadingUnits } = useQuery({
    queryKey: ['units_of_measure'],
    queryFn: getAllUnits,
  });
  
  const [targetId, setTargetId] = useState<string>('');
  const [newName, setNewName] = useState<string>('');
  const [newUnit, setNewUnit] = useState<string>('');
  const [newCategory, setNewCategory] = useState<string>('');
  const [isExempt, setIsExempt] = useState<boolean>(false);
  
  // Checks de confirmación (Doble Advertencia)
  const [checkMergeHistory, setCheckMergeHistory] = useState(false);
  const [checkDeleteSources, setCheckDeleteSources] = useState(false);

  const { data: categories = [], isLoading: isLoadingCategories } = useQuery({
    queryKey: ['material_categories'],
    queryFn: getAllMaterialCategories,
  });

  const { data: fetchedMaterials } = useQuery({
    queryKey: ['materials_by_ids', selectedIds],
    queryFn: async () => {
      if (!selectedIds || selectedIds.length === 0) return [];
      const { data, error } = await supabase.from('materials').select('*').in('id', selectedIds);
      if (error) throw error;
      return data as Material[];
    },
    enabled: open && selectedIds.length > 0
  });

  const combinedMaterials = [...materials, ...(fetchedMaterials || [])];
  const uniqueMaterialsMap = new Map<string, Material>();
  combinedMaterials.forEach(m => uniqueMaterialsMap.set(m.id, m));
  
  const itemsToMerge = Array.from(uniqueMaterialsMap.values()).filter(m => selectedIds.includes(m.id));

  const [loadedTargetId, setLoadedTargetId] = useState<string>('');

  // Initialize form when targetId changes OR when itemsToMerge updates (e.g. after fetching missing materials)
  useEffect(() => {
    if (targetId) {
      const targetMat = itemsToMerge.find(m => m.id === targetId);
      if (targetMat && loadedTargetId !== targetId) {
        setNewName(targetMat.name);
        setNewUnit(targetMat.unit || '');
        setNewCategory(targetMat.category || '');
        setIsExempt(targetMat.is_exempt || false);
        setLoadedTargetId(targetId);
      }
    } else {
      setNewName('');
      setNewUnit('');
      setNewCategory('');
      setIsExempt(false);
      setLoadedTargetId('');
    }
  }, [targetId, itemsToMerge, loadedTargetId]);

  // Reset state when modal closes/opens
  useEffect(() => {
    if (open) {
      setTargetId(selectedIds.length > 0 ? selectedIds[0] : '');
      setLoadedTargetId('');
      setCheckMergeHistory(false);
      setCheckDeleteSources(false);
    }
  }, [open, selectedIds]);

  const fusionMutation = useMutation({
    mutationFn: async () => {
      if (!targetId || !newName) throw new Error("Faltan datos obligatorios para la fusión.");
      
      const sourceIds = selectedIds.filter(id => id !== targetId);
      if (sourceIds.length === 0) throw new Error("Debes tener al menos 2 ítems para fusionar.");

      // 1. Update the target material with the potentially new name/unit/exempt
      await updateMaterial(targetId, {
        name: newName,
        unit: newUnit,
        category: newCategory,
        is_exempt: isExempt
      });

      // 2. Execute the fusion
      const success = await mergeMaterials(targetId, sourceIds);
      if (!success) throw new Error("Ocurrió un error en la base de datos durante la fusión.");

      // 3. Log Audit
      const sourceNames = sourceIds
        .map(id => itemsToMerge.find(m => m.id === id)?.name)
        .filter(Boolean)
        .join(', ');

      await logAudit('FUSION', {
        table: 'materials',
        record_id: targetId,
        description: `Fusión de "${sourceNames}" hacia "${newName}"`,
        is_mass_action: true
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      showSuccess(`¡Fusión completada! Los materiales se han unificado en "${newName}".`);
      onSuccess();
      onOpenChange(false);
    },
    onError: (err: Error) => {
      showError(`Error al fusionar: ${err.message}`);
    }
  });

  const handleFusion = () => {
    if (checkMergeHistory && checkDeleteSources) {
      fusionMutation.mutate();
    }
  };

  const isFormValid = targetId && newName.trim() !== '' && checkMergeHistory && checkDeleteSources;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-full sm:max-w-[850px] max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Combine className="h-5 w-5 shrink-0" />
            <span className="truncate">Fusionar Materiales (Acción Irreversible)</span>
          </DialogTitle>
          <DialogDescription className="text-sm">
            Estás a punto de combinar <strong>{selectedIds.length}</strong> materiales en uno solo. 
            El historial de precios y las órdenes se unificarán y los materiales de origen serán archivados.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-2 space-y-5">
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-md p-3 text-sm flex gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold mb-1">Advertencia Importante</p>
              <p className="leading-relaxed">Los ítems descartados serán <strong>archivados permanentemente</strong>. Sus nombres originales se guardarán como "alias de búsqueda" en el ítem resultante.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* COLUMNA 1: Selección y Vista Previa */}
            <div className="space-y-4">
              <div className="space-y-3 p-4 border rounded-xl bg-gray-50/50">
                <div>
                  <label className="text-sm font-semibold mb-1.5 block text-gray-700">1. Material Base (Maestro)</label>
                  <Select value={targetId} onValueChange={setTargetId} disabled={fusionMutation.isPending}>
                    <SelectTrigger className="w-full bg-white [&>span]:truncate">
                      <SelectValue placeholder="Elige el material principal" />
                    </SelectTrigger>
                    <SelectContent className="max-w-[85vw] sm:max-w-[400px]">
                      {itemsToMerge.map((material) => (
                        <SelectItem key={material.id} value={material.id} className="truncate">
                          {material.name} {material.category ? `- ${material.category}` : ''} <span className="text-muted-foreground text-xs hidden sm:inline">({material.code})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* PREVIEW DE ITEMS */}
                <div className="bg-white border rounded-lg p-3 max-h-40 overflow-y-auto mt-2">
                  <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2 block">Materiales a fusionar:</label>
                  <div className="space-y-2">
                    {itemsToMerge.map(m => (
                      <div key={m.id} className="flex flex-col sm:flex-row sm:justify-between sm:items-center text-sm p-2 hover:bg-gray-50 rounded-md gap-2 border sm:border-none">
                        <div className="flex items-start sm:items-center gap-2 overflow-hidden w-full">
                          <Box className="h-4 w-4 text-gray-400 shrink-0 mt-0.5 sm:mt-0" />
                          <span className="font-medium truncate text-gray-700 block w-full">{m.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 self-start sm:self-auto">
                          {m.category && <Badge variant="outline" className="text-[9px] py-0 px-1.5 whitespace-nowrap">{m.category}</Badge>}
                          {m.unit && <Badge variant="secondary" className="text-[9px] py-0 px-1.5 whitespace-nowrap">{m.unit}</Badge>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* COLUMNA 2: Propiedades y Checkboxes */}
            <div className="space-y-4">
              <div className="space-y-4 p-4 border rounded-xl bg-white shadow-sm">
                <label className="text-sm font-semibold block text-gray-700">2. Propiedades Finales</label>
                
                <div>
                  <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">Nombre Final del Material</label>
                  <Input 
                    value={newName} 
                    onChange={(e) => setNewName(e.target.value)} 
                    placeholder="Ej: Azúcar Blanca"
                    className="bg-white"
                    disabled={fusionMutation.isPending || !targetId}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block truncate">Unidad</label>
                    <Select value={newUnit} onValueChange={setNewUnit} disabled={fusionMutation.isPending || isLoadingUnits || !targetId}>
                      <SelectTrigger className="w-full bg-white text-xs h-9 [&>span]:truncate">
                        <SelectValue placeholder={isLoadingUnits ? "..." : "Unidad"} />
                      </SelectTrigger>
                      <SelectContent>
                        {units.map(unit => (
                          <SelectItem key={unit.id} value={unit.name}>{unit.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block truncate">Categoría</label>
                    <Select value={newCategory} onValueChange={setNewCategory} disabled={fusionMutation.isPending || isLoadingCategories || !targetId}>
                      <SelectTrigger className="w-full bg-white text-xs h-9 [&>span]:truncate">
                        <SelectValue placeholder={isLoadingCategories ? "..." : "Categoría"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Sin categoría</SelectItem>
                        {categories.map(cat => (
                          <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center space-x-2 border rounded-md p-2.5 bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer" onClick={() => !fusionMutation.isPending && targetId && setIsExempt(!isExempt)}>
                  <Checkbox 
                    id="exempt-fusion" 
                    checked={isExempt} 
                    onCheckedChange={(checked) => setIsExempt(checked as boolean)}
                    disabled={fusionMutation.isPending || !targetId}
                    className="data-[state=checked]:bg-procarni-primary data-[state=checked]:border-procarni-primary"
                  />
                  <label htmlFor="exempt-fusion" className="text-sm font-medium leading-none cursor-pointer flex-1">
                    Exento de IVA
                  </label>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <h4 className="text-sm font-semibold text-destructive">3. Confirmar Destrucción</h4>
                
                <div className="flex items-start space-x-3 p-3 rounded-xl bg-destructive/5 border border-destructive/10 hover:bg-destructive/10 transition-colors cursor-pointer" onClick={() => !fusionMutation.isPending && setCheckMergeHistory(!checkMergeHistory)}>
                  <Checkbox 
                    id="check-merge-history" 
                    checked={checkMergeHistory} 
                    onCheckedChange={(checked) => setCheckMergeHistory(checked as boolean)}
                    disabled={fusionMutation.isPending}
                    className="mt-0.5 border-destructive data-[state=checked]:bg-destructive data-[state=checked]:text-white shrink-0"
                  />
                  <label htmlFor="check-merge-history" className="text-xs sm:text-sm text-gray-700 font-medium cursor-pointer leading-tight">
                    El historial y las órdenes de los otros {selectedIds.length - 1} materiales se reasignarán al material maestro.
                  </label>
                </div>
                
                <div className="flex items-start space-x-3 p-3 rounded-xl bg-destructive/5 border border-destructive/10 hover:bg-destructive/10 transition-colors cursor-pointer" onClick={() => !fusionMutation.isPending && setCheckDeleteSources(!checkDeleteSources)}>
                  <Checkbox 
                    id="check-delete" 
                    checked={checkDeleteSources} 
                    onCheckedChange={(checked) => setCheckDeleteSources(checked as boolean)}
                    disabled={fusionMutation.isPending}
                    className="mt-0.5 border-destructive data-[state=checked]:bg-destructive data-[state=checked]:text-white shrink-0"
                  />
                  <label htmlFor="check-delete" className="text-xs sm:text-sm text-gray-700 font-medium cursor-pointer leading-tight">
                    Los otros {selectedIds.length - 1} materiales <strong>serán ARCHIVADOS permanentemente</strong>.
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            disabled={fusionMutation.isPending}
          >
            Cancelar
          </Button>
          <Button 
            onClick={handleFusion} 
            disabled={!isFormValid || fusionMutation.isPending}
            className="bg-destructive hover:bg-destructive/90 text-white"
          >
            {fusionMutation.isPending ? 'Ejecutando Fusión...' : 'Ejecutar Fusión Definitiva'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MaterialFusionModal;
