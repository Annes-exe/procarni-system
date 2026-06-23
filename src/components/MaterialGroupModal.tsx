import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import SmartSearch from '@/components/SmartSearch';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateMaterial } from '@/integrations/supabase/services/materialService';
import { logAudit } from '@/integrations/supabase/services/auditLogService';
import { showError, showSuccess } from '@/utils/toast';
import { Network, Box } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Material } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

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
  const completeMaterials = Array.from(uniqueMaterialsMap.values());

  // Todos los materiales completos pueden ser padres
  const availableParents = completeMaterials
    .sort((a, b) => a.name.localeCompare(b.name));

  const itemsToGroup = completeMaterials.filter(m => selectedIds.includes(m.id) && m.id !== selectedParentId);

  const groupMutation = useMutation({
    mutationFn: async () => {
      const parentId = selectedParentId === 'none' ? null : selectedParentId;
      if (selectedParentId === '' ) throw new Error("Debes seleccionar una opción");
      
      const parentMaterial = materials.find(m => m.id === parentId);
      
      // Agrupar solo los hijos (los que no son el padre)
      const childrenIds = selectedIds.filter(id => id !== parentId);
      const promises = childrenIds.map(async (id) => {
        const res = await updateMaterial(id, { base_material_id: parentId });
        if (res) {
          const childMaterial = materials.find(m => m.id === id);
          const description = parentId 
            ? `Material "${childMaterial?.name}" agrupado masivamente bajo "${parentMaterial?.name}"`
            : `Material "${childMaterial?.name}" desagrupado masivamente`;
          
          await logAudit(parentId ? 'GROUP_ADD' : 'GROUP_REMOVE', {
            table: 'materials',
            record_id: id,
            description,
            is_mass_action: true
          });
        }
        return res;
      });
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
            <div className="flex gap-2">
              <div className="flex-1">
                <SmartSearch 
                  placeholder="Buscar material padre..."
                  displayValue={selectedParentId && selectedParentId !== 'none' ? materials.find(m => m.id === selectedParentId)?.name : ''}
                  selectedId={selectedParentId === 'none' ? '' : selectedParentId}
                  onSelect={(item) => setSelectedParentId(item.id)}
                  fetchFunction={async (query) => {
                    const lowerQuery = query.toLowerCase();
                    return availableParents.filter(m => 
                      m.name.toLowerCase().includes(lowerQuery) || 
                      (m.code && m.code.toLowerCase().includes(lowerQuery)) ||
                      (m.category && m.category.toLowerCase().includes(lowerQuery))
                    ).map(m => ({
                      id: m.id,
                      name: `${m.name} ${m.category ? `- ${m.category}` : ''} ${m.code ? `(${m.code})` : ''}`,
                    }));
                  }}
                  disabled={groupMutation.isPending}
                />
              </div>
              <Button 
                variant="outline" 
                onClick={() => setSelectedParentId('none')}
                title="Quitar grupo actual (Desagrupar)"
                className={selectedParentId === 'none' ? 'border-destructive text-destructive' : ''}
              >
                Sin Grupo
              </Button>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-md p-3 max-h-48 overflow-y-auto">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Materiales a agrupar:</label>
            <div className="space-y-2">
              {itemsToGroup.map(m => (
                <div key={m.id} className="flex justify-between items-center text-sm p-1.5 hover:bg-gray-50 rounded border border-transparent hover:border-gray-100">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <Box className="h-4 w-4 text-procarni-primary shrink-0" />
                    <span className="font-medium truncate text-gray-700">{m.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {m.category && <Badge variant="outline" className="text-[10px] py-0">{m.category}</Badge>}
                    {m.unit && <Badge variant="secondary" className="text-[10px] py-0 bg-gray-100 text-gray-600">{m.unit}</Badge>}
                  </div>
                </div>
              ))}
            </div>
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
