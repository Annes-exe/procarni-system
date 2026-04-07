import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateMaterial, getAllMaterialCategories } from '@/integrations/supabase/data';
import { mergeMaterials } from '@/integrations/supabase/services/materialService';
import { showError, showSuccess } from '@/utils/toast';
import { Combine, AlertTriangle } from 'lucide-react';
import { Material } from '@/integrations/supabase/types';

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
  
  const [targetId, setTargetId] = useState<string>('');
  const [newName, setNewName] = useState<string>('');
  const [newUnit, setNewUnit] = useState<string>('');
  const [isExempt, setIsExempt] = useState<boolean>(false);
  
  // Checks de confirmación (Doble Advertencia)
  const [checkMergeHistory, setCheckMergeHistory] = useState(false);
  const [checkDeleteSources, setCheckDeleteSources] = useState(false);

  const itemsToMerge = materials.filter(m => selectedIds.includes(m.id));

  // Initialize form when targetId changes
  useEffect(() => {
    if (targetId) {
      const targetMat = itemsToMerge.find(m => m.id === targetId);
      if (targetMat) {
        setNewName(targetMat.name);
        setNewUnit(targetMat.unit || '');
        setIsExempt(targetMat.is_exempt || false);
      }
    } else {
      setNewName('');
      setNewUnit('');
      setIsExempt(false);
    }
  }, [targetId, itemsToMerge]);

  // Reset state when modal closes/opens
  useEffect(() => {
    if (open) {
      setTargetId(selectedIds.length > 0 ? selectedIds[0] : '');
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
        is_exempt: isExempt
      });

      // 2. Execute the fusion
      const success = await mergeMaterials(targetId, sourceIds);
      if (!success) throw new Error("Ocurrió un error en la base de datos durante la fusión.");
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
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Combine className="h-5 w-5" />
            Fusionar Materiales (Acción Destructiva)
          </DialogTitle>
          <DialogDescription>
            Estás a punto de combinar <strong>{selectedIds.length}</strong> materiales en uno solo. 
            El historial de precios y las órdenes se unificarán.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-2 space-y-4">
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-md p-3 text-sm flex gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
            <div>
              <p className="font-semibold mb-1">Advertencia Importante</p>
              <p>Los ítems descartados serán <strong>eliminados permanentemente</strong>. Sus nombres originales se guardarán como "alias de búsqueda" en el ítem resultante para que sigan apareciendo en futuras búsquedas.</p>
            </div>
          </div>

          <div className="space-y-3 p-4 border rounded-md bg-gray-50/50">
            <div>
              <label className="text-sm font-semibold mb-1.5 block text-gray-700">1. Selecciona el Material Base (Maestro)</label>
              <Select value={targetId} onValueChange={setTargetId} disabled={fusionMutation.isPending}>
                <SelectTrigger className="w-full bg-white">
                  <SelectValue placeholder="Elige el material principal" />
                </SelectTrigger>
                <SelectContent>
                  {itemsToMerge.map((material) => (
                    <SelectItem key={material.id} value={material.id}>
                      {material.name} <span className="text-muted-foreground text-xs">({material.code})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-3 pt-2">
              <label className="text-sm font-semibold block text-gray-700">2. Define las propiedades finales</label>
              
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Nombre Final del Material</label>
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
                  <label className="text-xs text-gray-500 mb-1 block">Unidad de Medida (Opcional)</label>
                  <Input 
                    value={newUnit} 
                    onChange={(e) => setNewUnit(e.target.value)} 
                    placeholder="Ej: KG"
                    className="bg-white"
                    disabled={fusionMutation.isPending || !targetId}
                  />
                </div>
                <div className="flex flex-col justify-end pb-2">
                  <div className="flex items-center space-x-2 border rounded-md p-2 bg-white">
                    <Checkbox 
                      id="exempt-fusion" 
                      checked={isExempt} 
                      onCheckedChange={(checked) => setIsExempt(checked as boolean)}
                      disabled={fusionMutation.isPending || !targetId}
                    />
                    <label htmlFor="exempt-fusion" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                      Exento de IVA
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <h4 className="text-sm font-semibold text-destructive">3. Confirmar Destrucción de Datos</h4>
            
            <div className="flex items-start space-x-3 p-2 rounded-md bg-destructive/5 border border-destructive/10">
              <Checkbox 
                id="check-merge-history" 
                checked={checkMergeHistory} 
                onCheckedChange={(checked) => setCheckMergeHistory(checked as boolean)}
                disabled={fusionMutation.isPending}
                className="mt-0.5 border-destructive data-[state=checked]:bg-destructive data-[state=checked]:text-white"
              />
              <label htmlFor="check-merge-history" className="text-sm text-gray-700 font-medium cursor-pointer">
                Entiendo que el historial de cotizaciones y órdenes de los otros {selectedIds.length - 1} materiales se reasignará al material maestro que he configurado.
              </label>
            </div>
            
            <div className="flex items-start space-x-3 p-2 rounded-md bg-destructive/5 border border-destructive/10">
              <Checkbox 
                id="check-delete" 
                checked={checkDeleteSources} 
                onCheckedChange={(checked) => setCheckDeleteSources(checked as boolean)}
                disabled={fusionMutation.isPending}
                className="mt-0.5 border-destructive data-[state=checked]:bg-destructive data-[state=checked]:text-white"
              />
              <label htmlFor="check-delete" className="text-sm text-gray-700 font-medium cursor-pointer">
                Entiendo que los otros {selectedIds.length - 1} materiales <strong>serán ELIMINADOS de la base de datos de manera definitiva</strong> (solo conservando su nombre como alias oculto).
              </label>
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
