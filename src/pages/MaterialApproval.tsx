import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/components/SessionContextProvider';
import { getPendingMaterials, updateMaterial, getAllUnits, getAllMaterialCategories } from '@/integrations/supabase/data';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Check, Edit, Link, Search, X, Loader2, Sparkles } from 'lucide-react';
import SmartSearch from '@/components/SmartSearch';
import MaterialCreationDialog from '@/components/MaterialCreationDialog';
import { Material } from '@/integrations/supabase/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const MaterialApproval = () => {
  const { role, isLoadingSession } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [linkingMaterial, setLinkingMaterial] = useState<Material | null>(null);
  
  // States for linking to master
  const [selectedParentId, setSelectedParentId] = useState<string>('');
  const [selectedParentName, setSelectedParentName] = useState<string>('');
  const [isLinkingSubmitting, setIsLinkingSubmitting] = useState(false);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');

  // Guard: Redirect if not admin
  React.useEffect(() => {
    if (!isLoadingSession && role !== 'admin') {
      navigate('/');
      showError('No tienes permisos para acceder a esta página.');
    }
  }, [role, isLoadingSession, navigate]);

  // Fetch pending materials
  const { data: pendingMaterials = [], isLoading } = useQuery<Material[]>({
    queryKey: ['pending_materials'],
    queryFn: getPendingMaterials,
    enabled: role === 'admin'
  });

  // Query categories
  const { data: categories = [] } = useQuery({
    queryKey: ['material_categories'],
    queryFn: getAllMaterialCategories,
    enabled: role === 'admin'
  });

  // Query profiles for showing creator names
  const { data: creatorProfiles = {} } = useQuery<Record<string, string>>({
    queryKey: ['profiles_map'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, username, email');
      if (error) return {};
      const map: Record<string, string> = {};
      data.forEach((p: any) => {
        const name = [p.first_name, p.last_name].filter(Boolean).join(' ');
        map[p.id] = name || p.username || p.email || 'Usuario';
      });
      return map;
    },
    enabled: role === 'admin'
  });

  const filteredMaterials = pendingMaterials.filter(material => {
    if (selectedCategoryFilter === 'all') return true;
    return material.category === selectedCategoryFilter;
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async (materialId: string) => {
      const { data, error } = await supabase
        .from('materials')
        .update({ status: 'active' })
        .eq('id', materialId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      showSuccess(`Material "${data.name}" aprobado y activado con éxito.`);
      queryClient.invalidateQueries({ queryKey: ['pending_materials'] });
      queryClient.invalidateQueries({ queryKey: ['materials'] });
    },
    onError: (err: any) => {
      console.error('[Approve Material Error]:', err);
      showError('Error al aprobar el material.');
    }
  });



  // Link to master handler
  const handleLinkToMasterSubmit = async () => {
    if (!linkingMaterial || !selectedParentId) return;
    setIsLinkingSubmitting(true);
    try {
      // Call resolve_materials_unified RPC
      const { error } = await supabase.rpc('resolve_materials_unified', {
        p_action: 'merge',
        p_target_material_id: selectedParentId,
        p_source_material_ids: [linkingMaterial.id]
      });

      if (error) throw error;

      showSuccess(`Material "${linkingMaterial.name}" vinculado exitosamente al Patrón de Oro "${selectedParentName}".`);
      setLinkingMaterial(null);
      setSelectedParentId('');
      setSelectedParentName('');
      queryClient.invalidateQueries({ queryKey: ['pending_materials'] });
      queryClient.invalidateQueries({ queryKey: ['materials'] });
    } catch (err: any) {
      console.error('[Link to Master Error]:', err);
      showError('Error al vincular el material.');
    } finally {
      setIsLinkingSubmitting(false);
    }
  };

  if (isLoadingSession || isLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-procarni-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-procarni-blue">
            Aprobación de Nuevos Materiales
          </h1>
          <p className="text-sm text-gray-500 font-medium italic mt-1">
            Revisa, edita, aprueba o vincula materiales pendientes para mantener la integridad del catálogo.
          </p>
        </div>
      </div>

      {/* Main Card */}
      <Card className="bg-white border border-slate-100/80 shadow-2xl shadow-gray-200/50 rounded-[2rem] overflow-hidden">
        <CardHeader>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="space-y-1">
              <CardTitle className="text-xl font-bold text-procarni-dark flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-amber-500 animate-pulse" />
                Bandeja de Entrada de Materiales Pendientes
              </CardTitle>
              <CardDescription>
                {pendingMaterials.length === 0 
                  ? 'No hay materiales pendientes de aprobación en este momento.' 
                  : `Tienes ${pendingMaterials.length} material(es) en total que requieren revisión.`}
              </CardDescription>
            </div>
            
            {/* Category filter */}
            {pendingMaterials.length > 0 && (
              <div className="flex items-center gap-2 w-full md:w-auto">
                <Label htmlFor="cat-filter" className="text-xs font-bold uppercase tracking-widest text-gray-400 whitespace-nowrap">Filtrar por:</Label>
                <Select value={selectedCategoryFilter} onValueChange={setSelectedCategoryFilter}>
                  <SelectTrigger id="cat-filter" className="w-full md:w-[200px] bg-white border border-gray-200 rounded-xl h-10">
                    <SelectValue placeholder="Todas las categorías" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las categorías</SelectItem>
                    {categories.map((cat: any) => (
                      <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {filteredMaterials.length > 0 ? (
            <div className="overflow-x-auto">
              <Table className="bg-white/50 rounded-2xl overflow-hidden border border-gray-100">
                <TableHeader className="bg-slate-100/50">
                  <TableRow>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Nombre</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Categoría</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Unidad</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Marca/Color</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Creado Por</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Fecha</TableHead>
                    <TableHead className="text-right text-[10px] uppercase tracking-wider font-semibold text-gray-500">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMaterials.map((material) => (
                    <TableRow key={material.id} className="hover:bg-slate-50/50 transition-colors group">
                      <TableCell className="font-semibold text-slate-800">
                        <div>
                          {material.name}
                          {material.code && (
                            <span className="text-[11px] font-mono text-gray-400 block">{material.code}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-slate-50 text-slate-700">
                          {material.category || 'Sin Categoría'}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium text-slate-600">{material.unit || 'N/A'}</TableCell>
                      <TableCell className="text-slate-500 text-xs">
                        {material.brand && <span>Marca: {material.brand}</span>}
                        {material.brand && material.color && <br />}
                        {material.color && <span>Color: {material.color}</span>}
                        {!material.brand && !material.color && <span className="text-gray-300">-</span>}
                      </TableCell>
                      <TableCell className="text-xs font-medium text-slate-600">
                        {material.user_id ? (creatorProfiles[material.user_id] || 'Cargando...') : 'Sistema'}
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {material.created_at ? new Date(material.created_at).toLocaleDateString() : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {/* Approve Action */}
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => approveMutation.mutate(material.id)}
                            className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-xl"
                            title="Aprobar Material"
                          >
                            <Check className="h-4.5 w-4.5" />
                          </Button>
                          
                          {/* Link to Master Action */}
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => setLinkingMaterial(material)}
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-xl"
                            title="Vincular a Patrón de Oro"
                          >
                            <Link className="h-4.5 w-4.5" />
                          </Button>

                          {/* Edit Action */}
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => setEditingMaterial(material)}
                            className="text-slate-600 hover:text-slate-700 hover:bg-slate-50 rounded-xl"
                            title="Editar Material"
                          >
                            <Edit className="h-4.5 w-4.5" />
                          </Button>

                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : pendingMaterials.length > 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <div className="bg-slate-100 text-slate-400 p-4 rounded-full mb-4 ring-8 ring-slate-50/50">
                <Search className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">Sin coincidencias</h3>
              <p className="text-sm text-slate-500 max-w-sm mt-1">
                No hay materiales pendientes en la categoría seleccionada ("{selectedCategoryFilter}").
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <div className="bg-emerald-50 text-emerald-600 p-4 rounded-full mb-4 ring-8 ring-emerald-50/50">
                <Check className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">¡Todo limpio!</h3>
              <p className="text-sm text-slate-500 max-w-sm mt-1">
                No hay nuevos materiales pendientes de revisión. Tu catálogo se encuentra al día.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Linking to Master Dialog */}
      <Dialog open={!!linkingMaterial} onOpenChange={(open) => !open && setLinkingMaterial(null)}>
        <DialogContent className="sm:max-w-[450px] rounded-3xl bg-white/95 backdrop-blur-xl border-none shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-procarni-blue">Vincular a Patrón de Oro</DialogTitle>
            <DialogDescription>
              Vincular el material pendiente <strong className="text-procarni-dark">"{linkingMaterial?.name}"</strong> a un material oficial. El material pendiente se archivará y todo su historial pasará al maestro.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="parentMaterial">Buscar Material Maestro Oficial</Label>
              <SmartSearch 
                placeholder="Escribe el nombre del patrón de oro..."
                displayValue={selectedParentName}
                selectedId={selectedParentId}
                onSelect={(item) => {
                  setSelectedParentId(item.id);
                  setSelectedParentName(item.name.split(' - ')[0]);
                }}
                fetchFunction={async (query) => {
                  let dbQuery = supabase
                    .from('materials')
                    .select('id, name, code, category')
                    .eq('is_master', true)
                    .eq('status', 'active');

                  if (linkingMaterial) {
                    dbQuery = dbQuery.neq('id', linkingMaterial.id);
                  }

                  if (query.trim()) {
                    dbQuery = dbQuery.ilike('name', `%${query}%`);
                  }

                  const { data, error } = await dbQuery
                    .order('name', { ascending: true })
                    .limit(10);

                  if (error) return [];
                  return (data || []).map((m: any) => ({
                    id: m.id,
                    name: `${m.name} - ${m.code || 'Sin código'}`
                  }));
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLinkingMaterial(null)} className="rounded-xl">
              Cancelar
            </Button>
            <Button 
              onClick={handleLinkToMasterSubmit} 
              disabled={!selectedParentId || isLinkingSubmitting}
              className="bg-procarni-blue hover:bg-slate-800 text-white rounded-xl shadow-lg"
            >
              {isLinkingSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Vinculando...
                </>
              ) : 'Confirmar Vínculo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editing dialog reused from MaterialCreationDialog */}
      <MaterialCreationDialog 
        isOpen={!!editingMaterial}
        onClose={() => setEditingMaterial(null)}
        editingMaterial={editingMaterial}
        onMaterialCreated={(updatedMat) => {
          // Since it was edited, we approve it as well (as standard flow)
          approveMutation.mutate(updatedMat.id);
          setEditingMaterial(null);
        }}
      />
    </div>
  );
};

export default MaterialApproval;
