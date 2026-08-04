import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { updateMaterial } from '@/integrations/supabase/services/materialService';
import { logAudit } from '@/integrations/supabase/services/auditLogService';
import { supabase } from '@/integrations/supabase/client';
import { Material } from '@/integrations/supabase/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search, Network, X, UserMinus, Plus, FolderTree } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

const GroupManagement = () => {
  const queryClient = useQueryClient();
  const [parentSearchTerm, setParentSearchTerm] = useState('');
  const [childSearchTerm, setChildSearchTerm] = useState('');
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);

  // 1. Mapa de conteo de hijos por cada base_material_id
  const { data: childCountMap = {} } = useQuery<Record<string, number>>({
    queryKey: ['material_child_counts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('materials')
        .select('base_material_id')
        .not('base_material_id', 'is', null)
        .limit(10000);
      if (error) throw error;
      const countMap: Record<string, number> = {};
      (data || []).forEach(r => {
        if (r.base_material_id) {
          countMap[r.base_material_id] = (countMap[r.base_material_id] || 0) + 1;
        }
      });
      return countMap;
    }
  });

  // 2. Padres activos con grupos existentes
  const { data: activeParentMaterials = [], isLoading: isLoadingParents } = useQuery<Material[]>({
    queryKey: ['active_parent_materials', childCountMap],
    queryFn: async () => {
      const parentIds = Object.keys(childCountMap);
      if (parentIds.length === 0) return [];
      const { data, error } = await supabase
        .from('materials')
        .select('*')
        .in('id', parentIds)
        .eq('status', 'active')
        .order('name', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!childCountMap
  });

  // 3. Resultados de búsqueda de padres
  const { data: parentSearchResults = [] } = useQuery<Material[]>({
    queryKey: ['parent_search', parentSearchTerm],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('materials')
        .select('*')
        .eq('status', 'active')
        .or(`name.ilike.%${parentSearchTerm}%,code.ilike.%${parentSearchTerm}%`)
        .order('name', { ascending: true })
        .limit(10);
      if (error) throw error;
      return data || [];
    },
    enabled: parentSearchTerm.length > 0
  });

  const displayParents = parentSearchTerm ? parentSearchResults : activeParentMaterials;

  // 4. Materiales hijos del padre seleccionado (soporta tanto activos como fusionados)
  const { data: childrenOfSelected = [], isLoading: isLoadingChildren } = useQuery<Material[]>({
    queryKey: ['children_of_selected', selectedParentId],
    queryFn: async () => {
      if (!selectedParentId) return [];
      const { data, error } = await supabase
        .from('materials')
        .select('*')
        .eq('base_material_id', selectedParentId)
        .in('status', ['active', 'archived'])
        .order('name', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedParentId,
  });

  // 5. Detalles del padre seleccionado
  const { data: selectedParent } = useQuery<Material | null>({
    queryKey: ['selected_parent_material', selectedParentId],
    queryFn: async () => {
      if (!selectedParentId) return null;
      const { data, error } = await supabase
        .from('materials')
        .select('*')
        .eq('id', selectedParentId)
        .single();
      if (error) throw error;
      return data || null;
    },
    enabled: !!selectedParentId,
  });

  // 6. Materiales disponibles para unir (excluyendo maestros y ya asignados)
  const { data: availableToJoin = [], isLoading: isLoadingAvailable } = useQuery<Material[]>({
    queryKey: ['available_to_join', selectedParentId, childSearchTerm],
    queryFn: async () => {
      if (!selectedParentId || !childSearchTerm) return [];
      const { data, error } = await supabase
        .from('materials')
        .select('*')
        .eq('status', 'active')
        .neq('id', selectedParentId)
        .neq('is_master', true)
        .or(`name.ilike.%${childSearchTerm}%,code.ilike.%${childSearchTerm}%`)
        .limit(10);
      if (error) throw error;
      
      // Filtrar aquellos que ya están en este grupo
      return (data || []).filter(m => m.base_material_id !== selectedParentId);
    },
    enabled: !!selectedParentId && childSearchTerm.length > 0,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, parentId }: { id: string, parentId: string | null }) => {
      // Obtener nombres para auditoría
      const { data: childMaterial } = await supabase.from('materials').select('name').eq('id', id).single();
      let parentMaterialName = null;
      if (parentId) {
        const { data: parentMat } = await supabase.from('materials').select('name').eq('id', parentId).single();
        parentMaterialName = parentMat?.name;
      }
      
      const res = await updateMaterial(id, { base_material_id: parentId });
      
      if (res) {
        const action = parentId ? 'GROUP_ADD' : 'GROUP_REMOVE';
        const description = parentId 
          ? `Material "${childMaterial?.name}" agregado al grupo de "${parentMaterialName}"`
          : `Material "${childMaterial?.name}" removido de su grupo jerárquico`;
        
        await logAudit(action, {
          table: 'materials',
          record_id: id,
          description,
          child_name: childMaterial?.name,
          parent_name: parentMaterialName,
          action_type: parentId ? 'join' : 'leave'
        });
      }
      
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material_child_counts'] });
      queryClient.invalidateQueries({ queryKey: ['active_parent_materials'] });
      queryClient.invalidateQueries({ queryKey: ['children_of_selected', selectedParentId] });
      queryClient.invalidateQueries({ queryKey: ['available_to_join', selectedParentId] });
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      showSuccess('Operación realizada con éxito');
    },
    onError: (err: Error) => {
      showError(`Error: ${err.message}`);
    }
  });

  const handleRemoveFromGroup = (childId: string) => {
    updateMutation.mutate({ id: childId, parentId: null });
  };

  const handleAddToGroup = (materialId: string) => {
    if (!selectedParentId) return;
    updateMutation.mutate({ id: materialId, parentId: selectedParentId });
    setChildSearchTerm('');
  };

  const isLoading = isLoadingParents;
  if (isLoading) return <div className="p-8 text-center">Cargando gestión de grupos...</div>;

  return (
    <div className="container mx-auto p-4 max-w-6xl">
      <div className="mb-6 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-procarni-primary flex items-center gap-2">
            <FolderTree className="h-6 w-6" />
            Gestión de Grupos de Materiales
          </h1>
          <p className="text-muted-foreground">Administra las jerarquías y relaciones entre materiales.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Columna Izquierda: Lista de Padres */}
        <Card className="lg:col-span-4 border-none shadow-md bg-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Grupos / Materiales</CardTitle>
            <CardDescription>Busca un material para convertirlo en "Padre" o elige un grupo existente.</CardDescription>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input 
                placeholder="Buscar material principal..." 
                className="pl-9 h-9 text-xs"
                value={parentSearchTerm}
                onChange={(e) => setParentSearchTerm(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[450px] pr-4">
              <div className="space-y-2">
                {displayParents.map(parent => (
                  <div 
                    key={parent.id}
                    onClick={() => setSelectedParentId(parent.id)}
                    className={cn(
                      "p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between group",
                      selectedParentId === parent.id 
                        ? "border-procarni-primary bg-procarni-primary/5 shadow-sm" 
                        : "border-gray-100 hover:border-gray-200 hover:bg-gray-50"
                    )}
                  >
                    <div className="flex flex-col">
                      <span className="font-bold text-procarni-dark text-sm">{parent.name}</span>
                      <span className="text-[10px] text-gray-500 font-mono uppercase">{parent.code}</span>
                    </div>
                    {childCountMap[parent.id] ? (
                      <Badge variant="secondary" className="bg-white border-gray-100 text-[10px]">
                        {childCountMap[parent.id]} hijos
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[9px] border-dashed">Nuevo</Badge>
                    )}
                  </div>
                ))}
                {displayParents.length === 0 && !parentSearchTerm && (
                  <div className="text-center py-10 text-muted-foreground italic text-sm">
                    No hay grupos activos. Usa el buscador de arriba para crear uno.
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Columna Derecha: Detalle del Grupo */}
        <Card className="lg:col-span-8 border-none shadow-md bg-white min-h-[600px]">
          {selectedParentId ? (
            <>
              <CardHeader className="bg-gray-50/50 border-b border-gray-100">
                <div className="flex justify-between items-start">
                  <div>
                    <Badge className="mb-2 bg-procarni-primary">Material Principal</Badge>
                    <CardTitle className="text-2xl text-procarni-dark">{selectedParent?.name}</CardTitle>
                    <p className="text-sm text-muted-foreground font-mono">{selectedParent?.code} • {selectedParent?.category}</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setSelectedParentId(null)}>
                    <X className="h-5 w-5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="space-y-6">
                  {/* Lista de Hijos Actuales */}
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2">
                      <Network className="h-4 w-4" />
                      Variantes en el grupo ({childrenOfSelected.length})
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {childrenOfSelected.map(child => (
                        <div key={child.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 bg-white hover:shadow-sm transition-shadow">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-medium">{child.name}</span>
                              {child.status === 'archived' && (
                                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[9px] font-bold uppercase py-0 px-1.5 h-max leading-none">
                                  Fusionado
                                </Badge>
                              )}
                            </div>
                            <span className="text-[10px] text-gray-400">{child.code}</span>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-destructive hover:text-destructive hover:bg-destructive/5"
                            onClick={() => handleRemoveFromGroup(child.id)}
                            title="Desagrupar este material"
                          >
                            <UserMinus className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      {childrenOfSelected.length === 0 && (
                        <p className="text-sm text-muted-foreground italic col-span-2 py-4">Este grupo no tiene variantes asignadas todavía. Añade una abajo.</p>
                      )}
                    </div>
                  </div>

                  <Separator />

                  {/* Buscador para Añadir */}
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4">Añadir variante al grupo</h3>
                    <div className="relative mb-4">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input 
                        placeholder="Buscar material para añadir..." 
                        className="pl-10"
                        value={childSearchTerm}
                        onChange={(e) => setChildSearchTerm(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      {childSearchTerm && availableToJoin.map(m => (
                        <div key={m.id} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg transition-colors border border-transparent hover:border-gray-100">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-bold">
                              {m.name.substring(0, 2).toUpperCase()}
                            </div>
                            <div className="flex flex-col">
                              <span className="text-sm font-medium">{m.name}</span>
                              <span className="text-[10px] text-gray-400">{m.code}</span>
                            </div>
                          </div>
                          <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => handleAddToGroup(m.id)}>
                            <Plus className="h-3 w-3" />
                            Añadir
                          </Button>
                        </div>
                      ))}
                      {childSearchTerm && availableToJoin.length === 0 && (
                        <p className="text-center py-4 text-sm text-muted-foreground">No se encontraron materiales.</p>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-10 space-y-4">
              <div className="w-20 h-20 rounded-full bg-gray-50 flex items-center justify-center">
                <FolderTree className="h-10 w-10 text-gray-200" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-400">Ningún grupo seleccionado</h3>
                <p className="text-gray-400 max-w-xs mx-auto">Selecciona un material principal de la lista de la izquierda para gestionar sus variantes.</p>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default GroupManagement;
