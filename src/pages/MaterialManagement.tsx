import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { PlusCircle, Edit, Trash2, Search, Filter, Ruler, Tag, Combine, Network, Info, X, ChevronRight, ChevronDown } from 'lucide-react';
import InlineEditableCell from '@/components/InlineEditableCell';

import { getPaginatedMaterials, createMaterial, updateMaterial, deleteMaterial, getAllMaterialCategories, getAllUnits, getMaterialChildren } from '@/integrations/supabase/data';
import { showError, showSuccess } from '@/utils/toast';
import MaterialForm from '@/components/MaterialForm';
import { useSession } from '@/components/SessionContextProvider';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import UnitOfMeasureModal from '@/components/UnitOfMeasureModal';
import MaterialCreationDialog from '@/components/MaterialCreationDialog';
import MaterialCategoryModal from '@/components/MaterialCategoryModal';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useDebounce } from 'use-debounce';
import PaginationControls from '@/components/PaginationControls';

import MaterialResolutionModal from '@/components/MaterialResolutionModal';

const ChildMaterialsRow = ({
  parentId,
  categories,
  units,
  role,
  onInlineSave,
  onEditMaterial,
  confirmDeleteMaterial,
  updateMutation
}: {
  parentId: string;
  categories: any[];
  units: any[];
  role: string | null;
  onInlineSave: (material: Material, field: keyof Material, newValue: string) => Promise<void>;
  onEditMaterial: (material: Material) => void;
  confirmDeleteMaterial: (id: string) => void;
  updateMutation: any;
}) => {
  const { data: children = [], isLoading } = useQuery({
    queryKey: ['material_children', parentId],
    queryFn: () => getMaterialChildren(parentId),
  });

  const colSpanCount = role === 'admin' ? 9 : 8;

  return (
    <TableRow className="bg-slate-50/30 hover:bg-slate-50/30 border-none">
      <TableCell colSpan={colSpanCount} className="p-0 pl-16 pr-4 py-2 border-y border-slate-100">
        <div className="rounded-2xl border border-slate-100 bg-white/60 backdrop-blur-md p-4 shadow-sm shadow-gray-200/50 mb-2">
          <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-3 flex items-center gap-1.5">
            <Combine className="h-3.5 w-3.5 text-procarni-primary" />
            Materiales Agrupados / Variaciones ({children.length})
          </div>
          {isLoading ? (
            <div className="flex items-center gap-2 p-2 text-xs text-muted-foreground">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-procarni-primary border-t-transparent"></div>
              Cargando materiales asociados...
            </div>
          ) : children.length === 0 ? (
            <div className="text-xs text-muted-foreground p-2 italic">
              No hay materiales agrupados bajo este patrón de oro.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-100/80 bg-white/50">
              <Table>
                <TableHeader className="bg-slate-50/50">
                  <TableRow className="hover:bg-transparent border-b border-slate-100">
                    <TableHead className="font-semibold text-[10px] tracking-wider uppercase text-slate-400 py-2 w-32 pl-4">Código</TableHead>
                    <TableHead className="font-semibold text-[10px] tracking-wider uppercase text-slate-400 py-2">Nombre</TableHead>
                    <TableHead className="font-semibold text-[10px] tracking-wider uppercase text-slate-400 py-2 w-48">Categoría</TableHead>
                    <TableHead className="font-semibold text-[10px] tracking-wider uppercase text-slate-400 py-2 w-32">Unidad</TableHead>
                    <TableHead className="font-semibold text-[10px] tracking-wider uppercase text-slate-400 py-2 w-24">Exento IVA</TableHead>
                    <TableHead className="text-right font-semibold text-[10px] tracking-wider uppercase text-slate-400 py-2 pr-4 w-28">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {children.map((child) => (
                    <TableRow key={child.id} className="hover:bg-slate-50/50 border-b border-slate-50 last:border-none">
                      <TableCell className="py-2 pl-4 font-mono text-xs text-slate-500 w-32">{child.code}</TableCell>
                      <TableCell className="py-2">
                        <InlineEditableCell
                          value={child.name}
                          onSave={(v) => onInlineSave(child, 'name', v)}
                          displayClassName="font-medium text-slate-700 text-sm whitespace-normal break-words"
                          placeholder="Nombre"
                          renderDisplay={(v) => (
                            <span className="flex items-center gap-1.5 flex-wrap">
                              {String(v)}
                              {child.is_exempt && (
                                <span className="px-1.5 py-0.5 text-[9px] uppercase font-bold bg-procarni-primary/10 text-procarni-primary rounded-full leading-none">EXENTO</span>
                              )}
                            </span>
                          )}
                        />
                      </TableCell>
                      <TableCell className="py-2 w-48">
                        <InlineEditableCell
                          value={child.category || ''}
                          onSave={(v) => onInlineSave(child, 'category', v)}
                          type="select"
                          options={categories.map(c => ({ value: c.name, label: c.name }))}
                          displayClassName="text-xs text-slate-600"
                          placeholder="Sin categoría"
                        />
                      </TableCell>
                      <TableCell className="py-2 w-32">
                        <InlineEditableCell
                          value={child.unit || ''}
                          onSave={(v) => onInlineSave(child, 'unit', v)}
                          type="select"
                          options={units.map(u => ({ value: u.name, label: u.name }))}
                          displayClassName="text-xs text-slate-600"
                          placeholder="Sin unidad"
                        />
                      </TableCell>
                      <TableCell className="py-2 text-xs text-slate-600 w-24">{child.is_exempt ? 'Sí' : 'No'}</TableCell>
                      <TableCell className="text-right pr-4 py-2 w-28 flex items-center justify-end gap-1.5">
                        {role === 'admin' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-[10px] text-slate-500 hover:text-destructive hover:bg-destructive/5 font-semibold px-2 rounded-lg border border-slate-100"
                            onClick={() => updateMutation.mutate({ id: child.id, updates: { base_material_id: null } })}
                            title="Remover este material del grupo del padre"
                          >
                            Desvincular
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-lg hover:bg-slate-100"
                          onClick={() => onEditMaterial(child)}
                          title="Editar completo"
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-lg hover:bg-destructive/5 hover:text-destructive"
                          onClick={() => confirmDeleteMaterial(child.id)}
                          title="Eliminar"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
};

const MobileChildMaterialsList = ({
  parentId,
  categories,
  units,
  role,
  onInlineSave,
  onEditMaterial,
  confirmDeleteMaterial,
  updateMutation
}: {
  parentId: string;
  categories: any[];
  units: any[];
  role: string | null;
  onInlineSave: (material: Material, field: keyof Material, newValue: string) => Promise<void>;
  onEditMaterial: (material: Material) => void;
  confirmDeleteMaterial: (id: string) => void;
  updateMutation: any;
}) => {
  const { data: children = [], isLoading } = useQuery({
    queryKey: ['material_children', parentId],
    queryFn: () => getMaterialChildren(parentId),
  });

  if (isLoading) {
    return (
      <div className="ml-7 mt-3 p-3 bg-slate-50/50 rounded-xl border border-slate-100 flex items-center gap-2 text-xs text-muted-foreground">
        <div className="h-3.5 w-3.5 animate-spin rounded-full border border-procarni-primary border-t-transparent"></div>
        Cargando asociados...
      </div>
    );
  }

  if (children.length === 0) {
    return (
      <div className="ml-7 mt-3 p-3 bg-slate-50/50 rounded-xl border border-slate-100 text-xs text-muted-foreground italic">
        No hay materiales agrupados.
      </div>
    );
  }

  return (
    <div className="ml-7 mt-3 space-y-3 p-3 bg-slate-50/50 rounded-xl border border-slate-100 shadow-inner">
      <div className="text-[9px] uppercase tracking-widest text-slate-400 font-bold flex items-center gap-1">
        <Combine className="h-3.5 w-3.5 text-procarni-primary" />
        Materiales Agrupados ({children.length})
      </div>
      {children.map(child => (
        <div key={child.id} className="bg-white p-3 rounded-lg border border-slate-100 shadow-sm space-y-2">
          <div className="flex justify-between items-start">
            <div>
              <p className="font-mono text-[10px] text-gray-500">{child.code}</p>
              <InlineEditableCell
                value={child.name}
                onSave={(v) => onInlineSave(child, 'name', v)}
                displayClassName="font-semibold text-sm text-slate-700"
                placeholder="Nombre"
              />
            </div>
            {role === 'admin' && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[9px] text-slate-500 hover:text-destructive hover:bg-destructive/5 px-1.5 rounded border border-slate-100"
                onClick={() => updateMutation.mutate({ id: child.id, updates: { base_material_id: null } })}
              >
                Desvincular
              </Button>
            )}
          </div>
          
          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-50">
            <div>
              <p className="text-[9px] uppercase tracking-wider font-semibold text-gray-400">Categoría</p>
              <InlineEditableCell
                value={child.category || ''}
                onSave={(v) => onInlineSave(child, 'category', v)}
                type="select"
                options={categories.map((c: any) => ({ value: c.name, label: c.name }))}
                displayClassName="text-xs text-gray-600"
                placeholder="Sin categoría"
              />
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-wider font-semibold text-gray-400">Unidad</p>
              <InlineEditableCell
                value={child.unit || ''}
                onSave={(v) => onInlineSave(child, 'unit', v)}
                type="select"
                options={units.map((u: any) => ({ value: u.name, label: u.name }))}
                displayClassName="text-xs text-gray-600"
                placeholder="Sin unidad"
              />
            </div>
          </div>
          
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-50">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => onEditMaterial(child)}
            >
              <Edit className="h-3 w-3 mr-1" /> Editar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => confirmDeleteMaterial(child.id)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
};

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
  const masterFilter = (searchParams.get('masterFilter') || 'all') as 'all' | 'master' | 'non-master';

  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedIds(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isUnitsModalOpen, setIsUnitsModalOpen] = useState(false);
  const [isCategoriesModalOpen, setIsCategoriesModalOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [materialToDeleteId, setMaterialToDeleteId] = useState<string | null>(null);

  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([]);
  const [isResolutionModalOpen, setIsResolutionModalOpen] = useState(false);
  const [resolutionAction, setResolutionAction] = useState<'merge' | 'group'>('merge');

  const { data: categories = [] } = useQuery({
    queryKey: ['material_categories'],
    queryFn: getAllMaterialCategories,
  });

  const { data: units = [] } = useQuery({
    queryKey: ['units_of_measure'],
    queryFn: getAllUnits,
  });

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['materials_paginated', page, pageSize, debouncedSearch, selectedCategory, masterFilter],
    queryFn: () => getPaginatedMaterials(page, pageSize, debouncedSearch, selectedCategory, masterFilter),
    placeholderData: keepPreviousData,
  });

  const materialsList = data?.data || [];
  const totalCount = data?.totalCount || 0;
  const filteredMaterials = materialsList; // Use paginated list as source for filtering if needed, or directly use materialsList

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

  const handleMasterFilterChange = (val: string) => {
    setSearchParams(prev => {
      if (val !== 'all') prev.set('masterFilter', val);
      else prev.delete('masterFilter');
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
    setIsCreateDialogOpen(true);
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

          <Dialog open={isFormOpen && !!editingMaterial} onOpenChange={(open) => {
            if (!open) {
              setIsFormOpen(false);
              setEditingMaterial(null);
            }
          }}>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Editar Material</DialogTitle>
                <DialogDescription>
                  Edita los detalles del material existente.
                </DialogDescription>
              </DialogHeader>
              <MaterialForm
                initialData={editingMaterial || undefined}
                onSubmit={handleSubmitForm}
                onCancel={() => {
                  setIsFormOpen(false);
                  setEditingMaterial(null);
                }}
                isSubmitting={updateMutation.isPending}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* ActionBar para Multi-selección */}
      {selectedMaterialIds.length > 0 && (
        <div className="mb-4 p-3 bg-procarni-primary/5 border border-procarni-primary/20 rounded-xl flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <div className="bg-procarni-primary text-white w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shadow-sm">
              {selectedMaterialIds.length}
            </div>
            <div>
              <p className="text-sm font-bold text-procarni-dark">Materiales seleccionados</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Acciones masivas disponibles</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="h-9 border-procarni-primary/30 text-procarni-primary hover:bg-procarni-primary/10 font-bold"
              onClick={() => {
                setResolutionAction('group');
                setIsResolutionModalOpen(true);
              }}
            >
              <Network className="h-4 w-4 mr-2" />
              Asignar Grupo
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className={cn(
                "h-9 border-destructive/30 text-destructive hover:bg-destructive/5 font-bold",
                selectedMaterialIds.length < 2 && "opacity-50 grayscale pointer-events-none"
              )}
              onClick={() => {
                setResolutionAction('merge');
                setIsResolutionModalOpen(true);
              }}
              disabled={selectedMaterialIds.length < 2}
            >
              <Combine className="h-4 w-4 mr-2" />
              Fusionar
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-9 text-muted-foreground hover:text-destructive hover:bg-destructive/5 font-medium px-2 lg:px-3"
              onClick={() => setSelectedMaterialIds([])}
              title="Cancelar Selección"
            >
              <X className="h-4 w-4 lg:mr-2" />
              <span className="hidden lg:inline">Cancelar Selección</span>
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
                placeholder="Buscar material..."
                value={searchInput}
                onChange={handleSearchChange}
                className="w-full pl-10 bg-white"
              />
            </div>
            <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
              <div className="relative w-full md:w-52">
                <Filter className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
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
              <div className="relative w-full md:w-52">
                <Filter className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Select value={masterFilter} onValueChange={handleMasterFilterChange}>
                  <SelectTrigger className="w-full pl-8 h-9 text-sm">
                    <SelectValue placeholder="Tipo de Registro" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los Materiales</SelectItem>
                    <SelectItem value="master">
                      {role === 'admin' ? 'Solo Patrón de Oro' : 'Solo Materiales Principales'}
                    </SelectItem>
                    <SelectItem value="non-master">
                      {role === 'admin' ? 'Sin Patrón de Oro' : 'Materiales Sin Grupo'}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
              <div className="grid gap-4">
                {materialsList.map((material) => (
                  <Card key={material.id} className={cn("p-4 shadow-md transition-all duration-200", selectedMaterialIds.includes(material.id) && "ring-2 ring-procarni-primary bg-procarni-primary/5")}>
                    <div className="flex items-start gap-3 mb-2">
                      <Checkbox 
                        checked={selectedMaterialIds.includes(material.id)}
                        onCheckedChange={() => toggleMaterialSelection(material.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-0.5">Nombre</p>
                        <InlineEditableCell
                          value={material.name}
                          onSave={(v) => handleInlineSave(material, 'name', v)}
                          alwaysShowIcon
                          displayClassName="font-semibold text-base text-procarni-dark"
                          placeholder="Nombre del material"
                          renderDisplay={(v) => (
                            <span className="flex items-center gap-1.5 flex-wrap">
                              {String(v)}
                              {material.is_exempt && (
                                <span className="px-1.5 py-0.5 text-[9px] uppercase font-bold bg-procarni-primary/10 text-procarni-primary rounded-full leading-none">EXENTO</span>
                              )}
                              {material.base_material_id && (
                                <Badge variant="secondary" className="text-[10px]" title="Forma parte de un grupo de materiales">Grupo</Badge>
                              )}
                              {role === 'admin' && material.is_master && (
                                <Badge className="bg-amber-500 text-white text-[9px] h-4 py-0 px-1.5 font-bold hover:bg-amber-600">★ Patrón Oro</Badge>
                              )}
                              {role !== 'admin' && material.is_master && (
                                <Badge className="bg-slate-500 text-white text-[9px] h-4 py-0 px-1.5 font-bold hover:bg-slate-600">★ Principal</Badge>
                              )}
                              {material.search_aliases && material.search_aliases.length > 0 && (
                                <Badge variant="outline" className="text-[10px] border-procarni-primary text-procarni-primary" title={`Tiene alias: ${material.search_aliases.join(', ')}`}>
                                  {material.search_aliases.length} Alias
                                </Badge>
                              )}
                            </span>
                          )}
                        />
                      </div>
                    </div>
                    <div className="mb-1 ml-7">
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-0.5">Código</p>
                      <span className="font-mono text-xs text-gray-600">{material.code}</span>
                    </div>
                    <div className="mb-1 ml-7">
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
                    <div className="mb-3 ml-7">
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
                    {role === 'admin' && (
                      <div className="mb-3 ml-7">
                        <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-0.5">Patrón Oro</p>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant={material.is_master ? "default" : "outline"}
                            size="sm"
                            className={cn(
                              "h-8 rounded-full text-xs font-bold transition-all",
                              material.is_master 
                                ? "bg-amber-500 hover:bg-amber-600 text-white shadow-sm" 
                                : "border-gray-200 text-gray-500 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200"
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              updateMutation.mutate({ id: material.id, updates: { is_master: !material.is_master } });
                            }}
                          >
                            {material.is_master ? '★ Patrón Oro' : '☆ Marcar como Oro'}
                          </Button>
                          
                          {material.is_master && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 rounded-full text-xs font-bold transition-all border-slate-200 text-slate-600 hover:bg-slate-50"
                              onClick={(e) => toggleExpand(material.id, e)}
                            >
                              {expandedIds[material.id] ? '▲ Ocultar Hijos' : '▼ Mostrar Hijos'}
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                    {role !== 'admin' && material.is_master && (
                      <div className="mb-3 ml-7">
                        <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-0.5">Grupo Jerárquico</p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-full text-xs font-bold transition-all border-slate-200 text-slate-600 hover:bg-slate-50"
                          onClick={(e) => toggleExpand(material.id, e)}
                        >
                          {expandedIds[material.id] ? '▲ Ocultar Hijos' : '▼ Mostrar Hijos'}
                        </Button>
                      </div>
                    )}

                    {expandedIds[material.id] && (
                      <MobileChildMaterialsList
                        parentId={material.id}
                        categories={categories}
                        units={units}
                        role={role}
                        onInlineSave={handleInlineSave}
                        onEditMaterial={handleEditMaterial}
                        confirmDeleteMaterial={confirmDeleteMaterial}
                        updateMutation={updateMutation}
                      />
                    )}
                    <div className="flex justify-start gap-2 mt-4 border-t pt-3 ml-7">
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
                      <TableHead className="w-10 py-3"></TableHead>
                      <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500 py-3">Código</TableHead>
                      <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500 py-3">Nombre</TableHead>
                      <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500 py-3">Categoría</TableHead>
                      <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500 py-3">Unidad</TableHead>
                      <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500 py-3">Exento IVA</TableHead>
                      {role === 'admin' && (
                        <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500 py-3">Patrón Oro</TableHead>
                      )}
                      <TableHead className="text-right font-semibold text-xs tracking-wider uppercase text-gray-500 pr-4 py-3">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {materialsList.map((material) => (
                      <React.Fragment key={material.id}>
                        <TableRow 
                          className={cn(
                            "hover:bg-gray-50/50 transition-colors cursor-pointer group",
                            selectedMaterialIds.includes(material.id) && "bg-procarni-primary/5 hover:bg-procarni-primary/10"
                          )}
                          onClick={() => toggleMaterialSelection(material.id)}
                        >
                          <TableCell className="pl-4 py-2">
                             <Checkbox 
                                checked={selectedMaterialIds.includes(material.id)}
                                onCheckedChange={() => toggleMaterialSelection(material.id)}
                                onClick={(e) => e.stopPropagation()}
                             />
                          </TableCell>
                          <TableCell className="py-2">
                            {material.is_master && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 p-0 hover:bg-slate-100 rounded-lg"
                                onClick={(e) => toggleExpand(material.id, e)}
                              >
                                {expandedIds[material.id] ? (
                                  <ChevronDown className="h-4 w-4 text-slate-500" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-slate-500" />
                                )}
                              </Button>
                            )}
                          </TableCell>
                          <TableCell className="py-2">
                            <span className="font-mono text-xs text-gray-600">{material.code}</span>
                          </TableCell>
                          <TableCell className="py-2 max-w-[220px]">
                            <InlineEditableCell
                              value={material.name}
                              onSave={(v) => handleInlineSave(material, 'name', v)}
                              displayClassName="font-medium text-procarni-dark whitespace-normal break-words"
                              placeholder="Nombre"
                              renderDisplay={(v) => (
                                <div className="flex flex-col">
                                  <span className="flex items-center gap-1.5 flex-wrap">
                                    {String(v)}
                                    {material.is_exempt && (
                                      <span className="px-1.5 py-0.5 text-[9px] uppercase font-bold bg-procarni-primary/10 text-procarni-primary rounded-full leading-none">EXENTO</span>
                                    )}
                                    {material.base_material_id && (
                                      <Badge variant="secondary" className="text-[9px] h-4 py-0 px-1.5 font-normal">Grupo</Badge>
                                    )}
                                    {role === 'admin' && material.is_master && (
                                      <Badge className="bg-amber-500 text-white text-[9px] h-4 py-0 px-1.5 font-bold hover:bg-amber-600">★ Patrón Oro</Badge>
                                    )}
                                    {role !== 'admin' && material.is_master && (
                                      <Badge className="bg-slate-500 text-white text-[9px] h-4 py-0 px-1.5 font-bold hover:bg-slate-600">★ Principal</Badge>
                                    )}
                                  </span>
                                  {material.search_aliases && material.search_aliases.length > 0 && (
                                    <div className="flex gap-2 mt-1">
                                      <Badge variant="outline" className="text-[9px] h-4 py-0 px-1.5 font-normal border-procarni-primary/40 text-procarni-primary" title={material.search_aliases.join(', ')}>
                                        {material.search_aliases.length} Alias
                                      </Badge>
                                    </div>
                                  )}
                                </div>
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
                          {role === 'admin' && (
                            <TableCell className="py-2" onClick={(e) => e.stopPropagation()}>
                              <Button
                                variant={material.is_master ? "default" : "outline"}
                                size="sm"
                                className={cn(
                                  "h-8 rounded-full text-xs font-bold transition-all",
                                  material.is_master 
                                    ? "bg-amber-500 hover:bg-amber-600 text-white shadow-sm" 
                                    : "border-gray-200 text-gray-500 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200"
                                )}
                                onClick={() => updateMutation.mutate({ id: material.id, updates: { is_master: !material.is_master } })}
                              >
                                {material.is_master ? '★ Oro' : '☆ Marcar'}
                              </Button>
                            </TableCell>
                          )}
                          <TableCell className="text-right pr-4 py-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => { e.stopPropagation(); handleEditMaterial(material); }}
                              disabled={deleteMutation.isPending}
                              title="Editar completo"
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
                        {expandedIds[material.id] && (
                          <ChildMaterialsRow 
                            parentId={material.id} 
                            categories={categories}
                            units={units}
                            role={role}
                            onInlineSave={handleInlineSave}
                            onEditMaterial={handleEditMaterial}
                            confirmDeleteMaterial={confirmDeleteMaterial}
                            updateMutation={updateMutation}
                          />
                        )}
                      </React.Fragment>
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

      {materialsList && isResolutionModalOpen && (
        <MaterialResolutionModal
          open={isResolutionModalOpen}
          onOpenChange={setIsResolutionModalOpen}
          selectedIds={selectedMaterialIds}
          materials={materialsList}
          onSuccess={() => {
            setSelectedMaterialIds([]);
            queryClient.invalidateQueries({ queryKey: ['materials_paginated'] });
          }}
          initialAction={resolutionAction}
        />
      )}

      {isCreateDialogOpen && (
        <MaterialCreationDialog
          isOpen={isCreateDialogOpen}
          onClose={() => setIsCreateDialogOpen(false)}
          hideNameProvided={true}
          onMaterialCreated={() => {
            queryClient.invalidateQueries({ queryKey: ['materials_paginated'] });
          }}
        />
      )}
    </div>
  );
};

export default MaterialManagement;