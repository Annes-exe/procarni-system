import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { PlusCircle, Edit, Trash2, Search, Filter, Ruler, Tag } from 'lucide-react';
import InlineEditableCell from '@/components/InlineEditableCell';

import { getPaginatedMaterials, createMaterial, updateMaterial, deleteMaterial, getAllMaterialCategories, getAllUnits } from '@/integrations/supabase/data';
import { showError, showSuccess } from '@/utils/toast';
import MaterialForm from '@/components/MaterialForm';
import { useSession } from '@/components/SessionContextProvider';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import UnitOfMeasureModal from '@/components/UnitOfMeasureModal';
import MaterialCategoryModal from '@/components/MaterialCategoryModal';
import { useDebounce } from 'use-debounce';
import PaginationControls from '@/components/PaginationControls';

interface Material {
  id: string;
  code: string;
  name: string;
  category?: string;
  unit?: string;
  is_exempt?: boolean;
  user_id: string;
}


const MaterialManagement = () => {
  const queryClient = useQueryClient();
  const { session, role } = useSession();
  const userId = session?.user?.id;
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = 25;
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '');
  const [debouncedSearch] = useDebounce(searchInput, 500);
  const selectedCategory = searchParams.get('category') || 'all';

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isUnitsModalOpen, setIsUnitsModalOpen] = useState(false);
  const [isCategoriesModalOpen, setIsCategoriesModalOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [materialToDeleteId, setMaterialToDeleteId] = useState<string | null>(null);

  const { data: categories = [] } = useQuery({
    queryKey: ['material_categories'],
    queryFn: getAllMaterialCategories,
  });

  const { data: units = [] } = useQuery({
    queryKey: ['units_of_measure'],
    queryFn: getAllUnits,
  });

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['materials_paginated', page, pageSize, debouncedSearch, selectedCategory],
    queryFn: () => getPaginatedMaterials(page, pageSize, debouncedSearch, selectedCategory),
    placeholderData: keepPreviousData,
  });

  const materialsList = data?.data || [];
  const totalCount = data?.totalCount || 0;

  const setPage = (newPage: number) => {
    setSearchParams(prev => {
      prev.set('page', newPage.toString());
      return prev;
    });
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchInput(value);
    setSearchParams(prev => {
      if (value) prev.set('search', value);
      else prev.delete('search');
      prev.set('page', '1');
      return prev;
    });
  };

  const handleCategoryChange = (val: string) => {
    setSearchParams(prev => {
      if (val !== 'all') prev.set('category', val);
      else prev.delete('category');
      prev.set('page', '1');
      return prev;
    });
  };

  const createMutation = useMutation({
    mutationFn: (newMaterial: Omit<Material, 'id' | 'created_at' | 'updated_at' | 'user_id'>) =>
      createMaterial({ ...newMaterial, user_id: userId! } as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials_paginated'] });
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
      queryClient.invalidateQueries({ queryKey: ['materials_paginated'] });
      setIsFormOpen(false);
      setEditingMaterial(null);
      showSuccess('Material actualizado exitosamente.');
    },
    onError: (err: any) => {
      if (err?.code === '23505') {
        showError('Ya existe un material con ese código o nombre. Verifica los datos e intenta de nuevo.');
      } else {
        showError('No se pudo actualizar el material. Intenta de nuevo.');
      }
    },
  });

  // Inline save: updates a single field, applying tripa logic when saving the name
  const handleInlineSave = async (material: Material, field: keyof Material, newValue: string) => {
    const updates: Partial<Material> = { [field]: newValue } as any;

    // If renaming to something that starts with "tripa", auto-assign category and unit
    if (field === 'name' && newValue.toLowerCase().startsWith('tripa')) {
      const empaqueCategory = categories.find(c => c.name.toUpperCase() === 'EMPAQUE');
      const mtUnit = units.find(u => u.name.toLowerCase() === 'mt');
      if (empaqueCategory) updates.category = empaqueCategory.name;
      if (mtUnit) updates.unit = mtUnit.name;
    }

    await updateMutation.mutateAsync({ id: material.id, updates });
  };

  const deleteMutation = useMutation({
    mutationFn: deleteMaterial,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials_paginated'] });
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

      <Card className="mb-6 border-none shadow-sm bg-transparent md:bg-white md:border md:border-gray-200">
        <CardContent className="p-0 md:p-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-4">
            <div className="relative w-full md:w-72">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar material..."
                value={searchInput}
                onChange={handleSearchChange}
                className="w-full pl-10 bg-white"
              />
            </div>
            <div className="relative w-full md:w-72">
              <Filter className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Select value={selectedCategory} onValueChange={handleCategoryChange}>
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

          <div className={cn("transition-opacity duration-200", isFetching && "opacity-50 pointer-events-none")}>
          {isLoading && materialsList.length === 0 ? (
            <div className="flex justify-center p-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-procarni-primary border-t-transparent"></div>
            </div>
          ) : error ? (
            <div className="text-center text-red-500 p-4">Error cargando materiales</div>
          ) : materialsList.length > 0 ? (
            isMobile ? (
              <div className="space-y-4">
                {materialsList.map((material) => (
                  <Card key={material.id} className="p-4 shadow-md">
                    <div className="mb-2">
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-0.5">Nombre</p>
                      <InlineEditableCell
                        value={material.name}
                        onSave={(v) => handleInlineSave(material, 'name', v)}
                        alwaysShowIcon
                        displayClassName="font-semibold text-base text-procarni-dark"
                        placeholder="Nombre del material"
                        renderDisplay={(v) => (
                          <span className="flex items-center gap-1.5">
                            {String(v)}
                            {material.is_exempt && (
                              <span className="px-1.5 py-0.5 text-[9px] uppercase font-bold bg-procarni-primary/10 text-procarni-primary rounded-full leading-none">EXENTO</span>
                            )}
                          </span>
                        )}
                      />
                    </div>
                    <div className="mb-1">
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-0.5">Código</p>
                      <span className="font-mono text-xs text-gray-600">{material.code}</span>
                    </div>
                    <div className="mb-1">
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-0.5">Categoría</p>
                      <InlineEditableCell
                        value={material.category || ''}
                        onSave={(v) => handleInlineSave(material, 'category', v)}
                        type="select"
                        options={categories.map(c => ({ value: c.name, label: c.name }))}
                        alwaysShowIcon
                        displayClassName="text-gray-600"
                        placeholder="Sin categoría"
                      />
                    </div>
                    <div className="mb-3">
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-0.5">Unidad</p>
                      <InlineEditableCell
                        value={material.unit || ''}
                        onSave={(v) => handleInlineSave(material, 'unit', v)}
                        type="select"
                        options={units.map(u => ({ value: u.name, label: u.name }))}
                        alwaysShowIcon
                        displayClassName="text-gray-600"
                        placeholder="Sin unidad"
                      />
                    </div>
                    <div className="flex justify-start gap-2 mt-4 border-t pt-3">
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
                      <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500 pl-4 py-3">Código</TableHead>
                      <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500 py-3">Nombre</TableHead>
                      <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500 py-3">Categoría</TableHead>
                      <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500 py-3">Unidad</TableHead>
                      <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500 py-3">Exento IVA</TableHead>
                      <TableHead className="text-right font-semibold text-xs tracking-wider uppercase text-gray-500 pr-4 py-3">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {materialsList.map((material) => (
                      <TableRow key={material.id} className="hover:bg-gray-50/50 transition-colors group">
                        <TableCell className="pl-4 py-2">
                          <span className="font-mono text-xs text-gray-600">{material.code}</span>
                        </TableCell>
                        <TableCell className="py-2 max-w-[220px]">
                          <InlineEditableCell
                            value={material.name}
                            onSave={(v) => handleInlineSave(material, 'name', v)}
                            displayClassName="font-medium text-procarni-dark whitespace-normal break-words"
                            placeholder="Nombre"
                            renderDisplay={(v) => (
                              <span className="flex items-center gap-1.5 flex-wrap">
                                {String(v)}
                                {material.is_exempt && (
                                  <span className="px-1.5 py-0.5 text-[9px] uppercase font-bold bg-procarni-primary/10 text-procarni-primary rounded-full leading-none">EXENTO</span>
                                )}
                              </span>
                            )}
                          />
                        </TableCell>
                        <TableCell className="py-2">
                          <InlineEditableCell
                            value={material.category || ''}
                            onSave={(v) => handleInlineSave(material, 'category', v)}
                            type="select"
                            options={categories.map(c => ({ value: c.name, label: c.name }))}
                            displayClassName="text-gray-600"
                            placeholder="Sin categoría"
                          />
                        </TableCell>
                        <TableCell className="py-2">
                          <InlineEditableCell
                            value={material.unit || ''}
                            onSave={(v) => handleInlineSave(material, 'unit', v)}
                            type="select"
                            options={units.map(u => ({ value: u.name, label: u.name }))}
                            displayClassName="text-gray-600"
                            placeholder="Sin unidad"
                          />
                        </TableCell>
                        <TableCell className="py-2 text-gray-600">{material.is_exempt ? 'Sí' : 'No'}</TableCell>
                        <TableCell className="text-right pr-4 py-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEditMaterial(material)}
                            disabled={deleteMutation.isPending}
                            title="Editar completo"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => confirmDeleteMaterial(material.id)}
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
        </div>
        
        <PaginationControls
          currentPage={page}
          totalCount={totalCount}
          pageSize={pageSize}
          onPageChange={setPage}
        />
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
    </div>
  );
};

export default MaterialManagement;