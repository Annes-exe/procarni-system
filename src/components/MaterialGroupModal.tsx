import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateMaterial } from '@/integrations/supabase/data';
import { showError, showSuccess } from '@/utils/toast';
import { Network } from 'lucide-react';
import { Material } from '@/integrations/supabase/types';

interface MaterialGroupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: string[];
  materials: Material[];
  onSuccess: () => void;
}

const MaterialGroupModal: React.FC<MaterialGroupModalProps> = ({ 
  open, 
  onOpenChange, 
  selectedIds, 
  materials,
  onSuccess 
}) => {
  const [selectedParentId, setSelectedParentId] = useState<string>('');
  const queryClient = useQueryClient();

  // Filtrar los posibles padres: no pueden ser los mismos que se van a agrupar
  const availableParents = materials
    .filter(m => !selectedIds.includes(m.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  const itemsToGroup = materials.filter(m => selectedIds.includes(m.id));

  const groupMutation = useMutation({
    mutationFn: async () => {
      if (!selectedParentId) throw new Error("Debes seleccionar un material padre");
      
      const promises = selectedIds.map(id => 
        updateMaterial(id, { base_material_id: selectedParentId })
      );
      await Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      showSuccess(`Se han agrupado ${selectedIds.length} materiales exitosamente.`);
      onSuccess();
      onOpenChange(false);
      setSelectedParentId('');
    },
    onError: (err: Error) => {
      showError(`Error al agrupar materiales: ${err.message}`);
    }
  });

  const handleGroup = () => {
    groupMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) setSelectedParentId('');
      onOpenChange(isOpen);
    }}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Network className="h-5 w-5 text-procarni-primary" />
            Asignar Grupo Base
          </DialogTitle>
          <DialogDescription>
            Selecciona un material principal al que se anclarán los <strong>{selectedIds.length}</strong> elementos seleccionados.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          <div className="mb-4">
            <label className="text-sm font-medium mb-1.5 block text-gray-700">Material principal (Padre)</label>
            <Select value={selectedParentId} onValueChange={setSelectedParentId} disabled={groupMutation.isPending}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Seleccione un material existente" />
              </SelectTrigger>
              <SelectContent className="max-h-[200px]">
                {availableParents.map((material) => (
                  <SelectItem key={material.id} value={material.id}>
                    {material.name} <span className="text-muted-foreground text-xs">({material.code})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="bg-gray-50 border border-gray-100 rounded-md p-3 max-h-32 overflow-y-auto">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Materiales a anidar:</label>
            <ul className="text-sm text-gray-700 space-y-1">
              {itemsToGroup.map(m => (
                <li key={m.id} className="flex items-center before:content-[''] before:w-1.5 before:h-1.5 before:rounded-full before:bg-procarni-primary/60 before:mr-2">
                  {m.name}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            disabled={groupMutation.isPending}
          >
            Cancelar
          </Button>
          <Button 
            onClick={handleGroup} 
            disabled={!selectedParentId || groupMutation.isPending}
            className="bg-procarni-primary hover:bg-procarni-primary/90 text-white"
          >
            {groupMutation.isPending ? 'Procesando...' : 'Guardar Grupo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MaterialGroupModal;
