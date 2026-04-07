import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { PlusCircle, Edit, Trash2, Search, Filter, Ruler, Tag, Combine, Network, Info } from 'lucide-react';

import { getAllMaterials, createMaterial, updateMaterial, deleteMaterial, getAllMaterialCategories } from '@/integrations/supabase/data';
import { showError, showSuccess } from '@/utils/toast';
import MaterialForm from '@/components/MaterialForm';
import { useSession } from '@/components/SessionContextProvider';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useNavigate, useLocation } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import UnitOfMeasureModal from '@/components/UnitOfMeasureModal';
import MaterialCategoryModal from '@/components/MaterialCategoryModal';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';

import MaterialFusionModal from '@/components/MaterialFusionModal';
import MaterialGroupModal from '@/components/MaterialGroupModal';

import { Material } from '@/integrations/supabase/types';


const MaterialManagement = () => {
  const queryClient = useQueryClient();
  const { session, role } = useSession();
  const userId = session?.user?.id;
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const initialSearch = queryParams.get('search') || '';

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isUnitsModalOpen, setIsUnitsModalOpen] = useState(false);
  const [isCategoriesModalOpen, setIsCategoriesModalOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [materialToDeleteId, setMaterialToDeleteId] = useState<string | null>(null);

  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([]);
  const [isFusionModalOpen, setIsFusionModalOpen] = useState(false);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);

  const { data: categories = [] } = useQuery({
    queryKey: ['material_categories'],
    queryFn: getAllMaterialCategories,
  });

  const { data: materials, isLoading, error } = useQuery<Material[]>({
    queryKey: ['materials'],
    queryFn: getAllMaterials,
  });

  const filteredMaterials = useMemo(() => {
    if (!materials) return [];
    let currentMaterials = materials;

    if (searchTerm) {
      const lowerCaseSearchTerm = searchTerm.toLowerCase();
      currentMaterials = currentMaterials.filter(material => {
        const nameMatch = material.name.toLowerCase().includes(lowerCaseSearchTerm);
        const codeMatch = material.code?.toLowerCase().includes(lowerCaseSearchTerm);
        const aliasMatch = material.search_aliases?.some((alias: string) => alias.toLowerCase().includes(lowerCaseSearchTerm));
        return nameMatch || codeMatch || aliasMatch;
      });
    }

    if (selectedCategory !== 'all') {
      currentMaterials = currentMaterials.filter(material => material.category === selectedCategory);
    }

    return currentMaterials;
  }, [materials, searchTerm, selectedCategory]);

  const createMutation = useMutation({
    mutationFn: (newMaterial: Omit<Material, 'id' | 'created_at' | 'updated_at' | 'user_id'>) =>
      createMaterial({ ...newMaterial, user_id: userId! } as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      setIsFormOpen(false);
      showSuccess('Material creado exitosamente.');
    },
    onError: (err) => {
      showError(`Error al crear material: ${err.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Omit<Material, 'id' | 'created_at' | 'updated_at' | 'user_id'>> }) =>
      updateMaterial(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      setIsFormOpen(false);
      setEditingMaterial(null);
      showSuccess('Material actualizado exitosamente.');
    },
    onError: (err) => {
      showError(`Error al actualizar material: ${err.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteMaterial,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      showSuccess('Material eliminado exitosamente.');
      setIsDeleteDialogOpen(false);
      setMaterialToDeleteId(null);
    },
    onError: (err) => {
      showError(`Error al eliminar material: ${err.message}`);
      setIsDeleteDialogOpen(false);
      setMaterialToDeleteId(null);
    },
  });

  const handleAddMaterial = () => {
    setEditingMaterial(null);
    setIsFormOpen(true);
  };

  const handleEditMaterial = (material: Material) => {
    setEditingMaterial(material);
    setIsFormOpen(true);
  };

  const confirmDeleteMaterial = (id: string) => {
    setMaterialToDeleteId(id);
    setIsDeleteDialogOpen(true);
  };

  const executeDeleteMaterial = async () => {
    if (materialToDeleteId) {
      await deleteMutation.mutateAsync(materialToDeleteId);
    }
  };

  const toggleMaterialSelection = (id: string) => {
    setSelectedMaterialIds(prev => 
      prev.includes(id) ? prev.filter(mId => mId !== id) : [...prev, id]
    );
  };

  const toggleAllSelections = () => {
    if (selectedMaterialIds.length === filteredMaterials.length && filteredMaterials.length > 0) {
      setSelectedMaterialIds([]);
    } else {
      setSelectedMaterialIds(filteredMaterials.map(m => m.id));
    }
  };

  const handleSubmitForm = async (data: Omit<Material, 'id' | 'created_at' | 'updated_at' | 'user_id'>) => {
    if (!userId) {
      showError('Usuario no autenticado. No se puede realizar la operación.');
      return;
    }
    if (editingMaterial) {
      await updateMutation.mutateAsync({ id: editingMaterial.id, updates: data });
    } else {
      await createMutation.mutateAsync(data);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 text-center text-muted-foreground">
        Cargando materiales...
      </div>
    );
  }

  if (error) {
    showError(error.message);
    return (
      <div className="container mx-auto p-4 text-center text-destructive">
        Error al cargar los materiales: {error.message}
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-procarni-primary tracking-tight">Gestión de Materiales</h1>
          <p className="text-muted-foreground text-sm">Administra la información de tus materiales.</p>
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          {role === 'admin' && (
            <>
              <Button
                variant="outline"
                onClick={() => setIsUnitsModalOpen(true)}
                className="border-procarni-primary text-procarni-primary hover:bg-procarni-primary/10 h-10 w-10 p-0"
                size="icon"
                title="Gestionar Unidades"
              >
                <Ruler className="h-4 w-4" />
              </Button>

              <Button
                variant="outline"
                onClick={() => setIsCategoriesModalOpen(true)}
                className="border-procarni-primary text-procarni-primary hover:bg-procarni-primary/10 h-10 w-10 p-0"
                size="icon"
                title="Gestionar Categorías"
              >
                <Tag className="h-4 w-4" />
              </Button>
            </>
          )}

          <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <DialogTrigger asChild>
              <Button
                onClick={handleAddMaterial}
                className={cn(
                  "bg-procarni-secondary hover:bg-green-700 text-white gap-2",
                  isMobile && "w-10 h-10 p-0"
                )}
                size={isMobile ? "default" : "sm"}
              >
                <PlusCircle className={cn("h-4 w-4", !isMobile && "mr-2")} />
                {!isMobile && 'Añadir Material'}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>{editingMaterial ? 'Editar Material' : 'Añadir Nuevo Material'}</DialogTitle>
                <DialogDescription>
                  {editingMaterial ? 'Edita los detalles del material existente.' : 'Completa los campos para añadir un nuevo material.'}
                </DialogDescription>
              </DialogHeader>
              <MaterialForm
                initialData={editingMaterial || undefined}
                onSubmit={handleSubmitForm}
                onCancel={() => setIsFormOpen(false)}
                isSubmitting={createMutation.isPending || updateMutation.isPending}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* ActionBar para Multi-selección */}
      {selectedMaterialIds.length > 0 && (
        <div className="bg-procarni-primary/5 border border-procarni-primary/20 rounded-lg p-3 mb-4 flex items-center justify-between animate-in fade-in slide-in-from-top-4">
          <div className="text-sm font-medium text-procarni-dark">
            <span className="font-bold">{selectedMaterialIds.length}</span> materiales seleccionados
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsGroupModalOpen(true)}
              className="border-procarni-primary text-procarni-primary hover:bg-procarni-primary/10"
              disabled={selectedMaterialIds.length < 1}
            >
              <Network className="h-4 w-4 mr-2" />
              Asignar Grupo Base
            </Button>
            <Button
              variant={selectedMaterialIds.length >= 2 ? "destructive" : "outline"}
              size="sm"
              onClick={() => setIsFusionModalOpen(true)}
              disabled={selectedMaterialIds.length < 2}
              title={selectedMaterialIds.length < 2 ? "Selecciona al menos 2 materiales para fusionar" : "Fusionar materiales"}
            >
              <Combine className="h-4 w-4 mr-2" />
              Fusionar
            </Button>
          </div>
        </div>
      )}

      <Card className="mb-6 border-none shadow-sm bg-transparent md:bg-white md:border md:border-gray-200">
        <CardContent className="p-0 md:p-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-4">
            <div className="relative w-full md:w-72">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Buscar material por código o nombre..."
                className="w-full appearance-none bg-background pl-8 h-9 text-sm shadow-none"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="relative w-full md:w-72">
              <Filter className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-full pl-8 h-9 text-sm">
                  <SelectValue placeholder="Filtrar por categoría" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las Categorías</SelectItem>
                  {categories.map(category => (
                    <SelectItem key={category.id} value={category.name}>{category.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {filteredMaterials && filteredMaterials.length > 0 ? (
            isMobile ? (
              <div className="grid gap-4">
                {filteredMaterials.map((material) => (
                  <Card key={material.id} className={cn("p-4 shadow-md transition-all duration-200", selectedMaterialIds.includes(material.id) && "ring-2 ring-procarni-primary bg-procarni-primary/5")}>
                    <CardTitle className="text-lg mb-2 flex items-start gap-2">
                      <Checkbox 
                        checked={selectedMaterialIds.includes(material.id)}
                        onCheckedChange={() => toggleMaterialSelection(material.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        {material.name}
                        {material.is_exempt && (
                          <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-procarni-primary text-white rounded-full">
                            EXENTO
                          </span>
                        )}
                        {/* Indicadores de Grupo/Alias */}
                        {material.base_material_id && (
                          <Badge variant="secondary" className="ml-2 text-[10px]" title="Forma parte de un grupo de materiales">Grupo</Badge>
                        )}
                      </div>
                      <div className="flex-1 mt-1">
                        {material.search_aliases && material.search_aliases.length > 0 && (
                          <Badge variant="outline" className="text-[10px] border-procarni-primary text-procarni-primary" title={`Tiene alias: ${material.search_aliases.join(', ')}`}>
                            {material.search_aliases.length} Alias
                          </Badge>
                        )}
                      </div>
                    </CardTitle>
                    <CardDescription className="mb-2 flex items-center">
                      <Tag className="mr-1 h-3 w-3" /> Código: {material.code}
                    </CardDescription>
                    <div className="text-sm space-y-1 mt-2 w-full">
                      <p><strong>Categoría:</strong> {material.category || 'N/A'}</p>
                      <p><strong>Unidad:</strong> {material.unit || 'N/A'}</p>
                    </div>
                    <div className="flex justify-end gap-2 mt-4 border-t pt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); handleEditMaterial(material); }}
                        disabled={deleteMutation.isPending}
                      >
                        <Edit className="h-4 w-4 mr-2" /> Editar
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); confirmDeleteMaterial(material.id); }}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-gray-100 overflow-hidden bg-white">
                <Table>
                  <TableHeader className="bg-gray-50/50">
                    <TableRow>
                      <TableHead className="w-12 pl-4 py-3">
                        <Checkbox 
                          checked={filteredMaterials.length > 0 && selectedMaterialIds.length === filteredMaterials.length}
                          onCheckedChange={toggleAllSelections}
                        />
                      </TableHead>
                      <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500 py-3">Código</TableHead>
                      <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500 py-3">Nombre</TableHead>
                      <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500 py-3">Categoría</TableHead>
                      <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500 py-3">Unidad</TableHead>
                      <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500 py-3">Exento IVA</TableHead>
                      <TableHead className="text-right font-semibold text-xs tracking-wider uppercase text-gray-500 pr-4 py-3">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMaterials.map((material) => (
                      <TableRow 
                        key={material.id} 
                        className={cn(
                          "hover:bg-gray-50/50 transition-colors cursor-pointer",
                          selectedMaterialIds.includes(material.id) && "bg-procarni-primary/5"
                        )}
                        onClick={() => toggleMaterialSelection(material.id)}
                      >
                        <TableCell className="pl-4 py-3">
                           <Checkbox 
                              checked={selectedMaterialIds.includes(material.id)}
                              onCheckedChange={() => toggleMaterialSelection(material.id)}
                              onClick={(e) => e.stopPropagation()}
                           />
                        </TableCell>
                        <TableCell className="py-3 font-mono text-xs text-gray-600">{material.code}</TableCell>
                        <TableCell className="flex flex-col items-start justify-center font-medium py-3 text-procarni-dark">
                          <div className="flex items-center flex-wrap gap-2">
                            <span>{material.name}</span>
                            {material.is_exempt && (
                              <span className="px-2 py-0.5 text-[10px] uppercase font-bold bg-procarni-primary/10 text-procarni-primary rounded-full">
                                EXENTO
                              </span>
                            )}
                            {material.base_material_id && (
                              <Badge variant="secondary" className="text-[9px] h-4 py-0 px-1.5 font-normal">Grupo</Badge>
                            )}
                          </div>
                          
                          {/* Indicadores Base Group y Aliases en Subtítulo */}
                          <div className="flex gap-2 mt-1">
                             {material.search_aliases && material.search_aliases.length > 0 && (
                                <Badge variant="outline" className="text-[9px] h-4 py-0 px-1.5 font-normal border-procarni-primary/40 text-procarni-primary" title={material.search_aliases.join(', ')}>
                                  {material.search_aliases.length} Alias
                                </Badge>
                             )}
                          </div>
                        </TableCell>
                        <TableCell className="py-3 text-gray-600">{material.category || 'N/A'}</TableCell>
                        <TableCell className="py-3 text-gray-600">{material.unit || 'N/A'}</TableCell>
                        <TableCell className="py-3 text-gray-600">{material.is_exempt ? 'Sí' : 'No'}</TableCell>
                        <TableCell className="text-right pr-4 py-3">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => { e.stopPropagation(); handleEditMaterial(material); }}
                            disabled={deleteMutation.isPending}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => { e.stopPropagation(); confirmDeleteMaterial(material.id); }}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )
          ) : (
            <div className="text-center text-muted-foreground p-8">
              No hay materiales registrados o no se encontraron resultados para tu búsqueda/filtro.
            </div>
          )}
        </CardContent>
      </Card>


      {/* AlertDialog for delete confirmation */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás absolutamente seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Esto eliminará permanentemente el material.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={executeDeleteMaterial} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <UnitOfMeasureModal
        open={isUnitsModalOpen}
        onOpenChange={setIsUnitsModalOpen}
      />

      <MaterialCategoryModal
        open={isCategoriesModalOpen}
        onOpenChange={setIsCategoriesModalOpen}
      />

      {materials && (
        <>
          <MaterialGroupModal
            open={isGroupModalOpen}
            onOpenChange={setIsGroupModalOpen}
            selectedIds={selectedMaterialIds}
            materials={materials}
            onSuccess={() => setSelectedMaterialIds([])}
          />

          <MaterialFusionModal
            open={isFusionModalOpen}
            onOpenChange={setIsFusionModalOpen}
            selectedIds={selectedMaterialIds}
            materials={materials}
            onSuccess={() => setSelectedMaterialIds([])}
          />
        </>
      )}
    </div>
  );
};

export default MaterialManagement;