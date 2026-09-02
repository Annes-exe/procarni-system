import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { PlusCircle, Edit, Trash2, Eye, Search, Filter, Ruler, Tag, Combine, Network, Info, X, ChevronRight, ChevronDown, Sparkles, Loader2, MoreHorizontal, Package } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import InlineEditableCell from '@/components/InlineEditableCell';

import { getPaginatedMaterials, createMaterial, updateMaterial, deleteMaterial, getAllMaterialCategories, getAllUnits, getMaterialChildren } from '@/integrations/supabase/data';
import { showError, showSuccess } from '@/utils/toast';
import { Material } from '@/integrations/supabase/types';

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

const getAllowedUnitsForCategory = (categoryName: string | null | undefined, unitsList: any[]) => {
  if (!categoryName) return unitsList;
  const catUpper = categoryName.toUpperCase();
  if (catUpper === 'SECA') {
    return unitsList.filter(u => ['KG', 'LT', 'GR'].includes(u.name.toUpperCase()));
  }
  if (catUpper === 'FRESCA') {
    return unitsList.filter(u => ['KG'].includes(u.name.toUpperCase()));
  }
  if (catUpper === 'EMPAQUE') {
    return unitsList.filter(u => ['MT', 'UND'].includes(u.name.toUpperCase()));
  }
  return unitsList;
};

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
  const navigate = useNavigate();
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
                    <TableRow 
                      key={child.id} 
                      className="hover:bg-slate-50/50 border-b border-slate-50 last:border-none cursor-pointer"
                      onClick={() => navigate(`/material/${child.id}`)}
                    >
                      <TableCell className="font-mono text-[10px] text-slate-500 font-bold py-1.5 pl-4">{child.code || '—'}</TableCell>
                      <TableCell className="py-1.5 font-bold text-slate-800 text-xs">
                        {child.name}
                      </TableCell>
                      <TableCell className="py-1.5 text-xs text-slate-600 font-medium">
                        {child.category}
                      </TableCell>
                      <TableCell className="py-1.5 font-mono font-bold text-[10px] text-slate-500">
                        {child.unit}
                      </TableCell>
                      <TableCell className="py-1.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${child.is_exempt ? 'bg-amber-50 text-procarni-alert' : 'bg-slate-50 text-slate-500'}`}>
                          {child.is_exempt ? 'EXENTO' : 'GRAVADO'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right pr-4 py-1.5" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 rounded-lg hover:bg-slate-100 text-slate-500"
                              title="Opciones"
                            >
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40 rounded-2xl shadow-xl border border-slate-100 p-1.5">
                            <DropdownMenuItem
                              onClick={() => navigate(`/material/${child.id}`)}
                              className="flex items-center gap-2 text-xs font-semibold py-2 rounded-xl cursor-pointer text-slate-700 hover:text-procarni-blue hover:bg-slate-50"
                            >
                              <Eye className="h-4 w-4 text-slate-400" />
                              <span>Ver Perfil</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => onEditMaterial(child)}
                              className="flex items-center gap-2 text-xs font-semibold py-2 rounded-xl cursor-pointer text-slate-700 hover:text-procarni-blue hover:bg-slate-50"
                            >
                              <Edit className="h-4 w-4 text-slate-400" />
                              <span>Editar</span>
                            </DropdownMenuItem>
                            {role === 'admin' && (
                              <DropdownMenuItem
                                onClick={() => updateMutation.mutate({ id: child.id, updates: { base_material_id: null } })}
                                className="flex items-center gap-2 text-xs font-semibold py-2 rounded-xl cursor-pointer text-amber-700 hover:bg-amber-50"
                              >
                                <Network className="h-4 w-4 text-amber-500" />
                                <span>Desvincular</span>
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => confirmDeleteMaterial(child.id)}
                              className="flex items-center gap-2 text-xs font-semibold py-2 rounded-xl cursor-pointer text-destructive hover:bg-red-50 focus:text-destructive focus:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span>Eliminar</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
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
  const navigate = useNavigate();
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
        <div 
          key={child.id} 
          className="bg-white p-3 rounded-lg border border-slate-100 shadow-sm space-y-2 cursor-pointer hover:bg-slate-50/50 transition-colors"
          onClick={() => navigate(`/material/${child.id}`)}
        >
          <div className="flex justify-between items-start" onClick={(e) => e.stopPropagation()}>
            <div>
              <p className="font-mono text-[10px] text-gray-500">{child.code}</p>
              <p className="font-semibold text-sm text-slate-700">{child.name}</p>
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
              <p className="text-xs text-gray-600 font-medium">{child.category || 'Sin categoría'}</p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-wider font-semibold text-gray-400">Unidad</p>
              <p className="text-xs text-slate-600 font-medium">{child.unit || 'Sin unidad'}</p>
            </div>
          </div>
          
          <div className="flex items-center justify-between pt-2 border-t border-slate-50" onClick={(e) => e.stopPropagation()}>
            <span className="text-[10px] text-slate-400 font-medium">Opciones</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg hover:bg-slate-100 text-slate-500">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40 rounded-2xl shadow-xl border border-slate-100 p-1.5">
                <DropdownMenuItem
                  onClick={() => onEditMaterial(child)}
                  className="flex items-center gap-2 text-xs font-semibold py-2 rounded-xl cursor-pointer text-slate-700 hover:text-procarni-blue hover:bg-slate-50"
                >
                  <Edit className="h-4 w-4 text-slate-400" />
                  <span>Editar</span>
                </DropdownMenuItem>
                {role === 'admin' && (
                  <DropdownMenuItem
                    onClick={() => updateMutation.mutate({ id: child.id, updates: { base_material_id: null } })}
                    className="flex items-center gap-2 text-xs font-semibold py-2 rounded-xl cursor-pointer text-amber-700 hover:bg-amber-50"
                  >
                    <Network className="h-4 w-4 text-amber-500" />
                    <span>Desvincular</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() => confirmDeleteMaterial(child.id)}
                  className="flex items-center gap-2 text-xs font-semibold py-2 rounded-xl cursor-pointer text-destructive hover:bg-red-50 focus:text-destructive focus:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Eliminar</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Omit<Material, 'id' | 'created_at' | 'updated_at' | 'user_id'>> }) =>
      updateMaterial(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials_paginated'] });
      queryClient.invalidateQueries({ queryKey: ['material_children'] });
      queryClient.invalidateQueries({ queryKey: ['active_parent_materials'] });
      queryClient.invalidateQueries({ queryKey: ['material_child_counts'] });
      queryClient.invalidateQueries({ queryKey: ['children_of_selected'] });
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

  const bulkMarkAsMasterMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from('materials')
        .update({ is_master: true, base_material_id: null })
        .in('id', ids);
      if (error) throw error;
      return ids;
    },
    onSuccess: (ids) => {
      queryClient.invalidateQueries({ queryKey: ['materials_paginated'] });
      queryClient.invalidateQueries({ queryKey: ['active_parent_materials'] });
      queryClient.invalidateQueries({ queryKey: ['material_child_counts'] });
      queryClient.invalidateQueries({ queryKey: ['children_of_selected'] });
      setSelectedMaterialIds([]);
      showSuccess(`Se han marcado ${ids.length} materiales como Patrón de Oro.`);
    },
    onError: () => {
      showError('Ocurrió un error al marcar los materiales como Patrón de Oro.');
    }
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

    // Auto-adjust unit if category changes and the current unit is not allowed
    if (field === 'category') {
      const targetCatUpper = newValue.toUpperCase();
      const currentUnitUpper = (updates.unit || material.unit || '').toUpperCase();
      let allowedNames: string[] = [];
      if (targetCatUpper === 'SECA') allowedNames = ['KG', 'LT', 'GR'];
      else if (targetCatUpper === 'FRESCA') allowedNames = ['KG'];
      else if (targetCatUpper === 'EMPAQUE') allowedNames = ['MT', 'UND'];

      if (allowedNames.length > 0 && !allowedNames.includes(currentUnitUpper)) {
        let defaultUnitName = allowedNames[0];
        if (targetCatUpper === 'EMPAQUE') {
          const nameUpper = (updates.name || material.name || '').toUpperCase();
          if (nameUpper.startsWith('TRIPA')) defaultUnitName = 'MT';
          else if (nameUpper.startsWith('BOLSA')) defaultUnitName = 'UND';
        }
        updates.unit = defaultUnitName;
      }
    }

    // Double check unit constraints validation
    const finalCategory = (field === 'category' ? newValue : material.category) || '';
    const finalUnit = (field === 'unit' ? newValue : updates.unit || material.unit) || '';
    const catUpper = finalCategory.toUpperCase();
    const unitUpper = finalUnit.toUpperCase();

    if (catUpper === 'SECA' && !['KG', 'LT', 'GR'].includes(unitUpper)) {
      showError('Para la categoría SECA, las unidades permitidas son: KG, LT, GR');
      return;
    }
    if (catUpper === 'FRESCA' && unitUpper !== 'KG') {
      showError('Para la categoría FRESCA, la única unidad permitida es: KG');
      return;
    }
    if (catUpper === 'EMPAQUE' && !['MT', 'UND'].includes(unitUpper)) {
      showError('Para la categoría EMPAQUE, las unidades permitidas son: MT, UND');
      return;
    }

    await updateMutation.mutateAsync({ id: material.id, updates });
  };

  const deleteMutation = useMutation({
    mutationFn: deleteMaterial,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials_paginated'] });
      queryClient.invalidateQueries({ queryKey: ['active_parent_materials'] });
      queryClient.invalidateQueries({ queryKey: ['material_child_counts'] });
      queryClient.invalidateQueries({ queryKey: ['children_of_selected'] });
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
    navigate('/material/new');
  };

  const handleEditMaterial = (material: Material) => {
    setEditingMaterial(material);
    setIsCreateDialogOpen(true);
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
    const pageIds = filteredMaterials.map(m => m.id);
    const allPageIdsSelected = pageIds.length > 0 && pageIds.every(id => selectedMaterialIds.includes(id));
    
    if (allPageIdsSelected) {
      setSelectedMaterialIds(prev => prev.filter(id => !pageIds.includes(id)));
    } else {
      setSelectedMaterialIds(prev => {
        const next = [...prev];
        pageIds.forEach(id => {
          if (!next.includes(id)) next.push(id);
        });
        return next;
      });
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
    <div className="container mx-auto p-4 md:p-6 pb-20 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white/70 backdrop-blur-xl border border-slate-100 shadow-xl shadow-slate-200/40 ring-1 ring-white rounded-3xl p-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-2xl bg-procarni-primary/10 text-procarni-primary">
              <Package className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-extrabold text-procarni-dark tracking-tight">Gestión de Materiales</h1>
          </div>
          <p className="text-xs md:text-sm text-slate-500 font-medium">
            Catálogo central de insumos, materias primas, unidades y patrones de oro.
          </p>
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
          {role === 'admin' && (
            <>
              <Button
                variant="outline"
                onClick={() => setIsUnitsModalOpen(true)}
                className="border-slate-200 bg-slate-50/80 hover:bg-slate-100 text-slate-700 h-10 w-10 p-0 rounded-2xl shadow-sm"
                size="icon"
                title="Gestionar Unidades"
              >
                <Ruler className="h-4 w-4" />
              </Button>

              <Button
                variant="outline"
                onClick={() => setIsCategoriesModalOpen(true)}
                className="border-slate-200 bg-slate-50/80 hover:bg-slate-100 text-slate-700 h-10 w-10 p-0 rounded-2xl shadow-sm"
                size="icon"
                title="Gestionar Categorías"
              >
                <Tag className="h-4 w-4" />
              </Button>
            </>
          )}

          <Button
            onClick={handleAddMaterial}
            className="bg-procarni-secondary hover:bg-emerald-800 text-white shadow-lg shadow-emerald-900/10 rounded-2xl h-10 px-4 font-semibold text-xs transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center gap-2 w-full md:w-auto"
          >
            <PlusCircle className="h-4 w-4" />
            <span>Añadir Material</span>
          </Button>
        </div>
      </div>

      {/* ActionBar para Multi-selección (Burbuja Flotante) */}
      {selectedMaterialIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[95vw] max-w-[680px] p-3 md:p-4 bg-white/95 backdrop-blur-xl border border-slate-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.15)] rounded-3xl flex items-center justify-between gap-2 md:gap-4 animate-in fade-in slide-in-from-bottom-5 duration-300 ring-1 ring-white">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <div className="bg-procarni-primary text-white w-8 h-8 md:w-9 md:h-9 rounded-2xl flex items-center justify-center text-xs font-bold shadow-md shrink-0 animate-pulse">
              {selectedMaterialIds.length}
            </div>
            <div className="hidden sm:block min-w-0">
              <p className="text-sm font-bold text-procarni-dark truncate">Materiales seleccionados</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold truncate">Navega libremente para agregar más</p>
            </div>
            <span className="sm:hidden text-xs font-bold text-procarni-dark truncate">
              sel.
            </span>
          </div>
          <div className="flex items-center gap-1 md:gap-1.5 shrink-0">
            {role === 'admin' && (
              <Button 
                variant="outline" 
                size="sm" 
                className="h-8 md:h-9 border-amber-500/30 text-amber-600 hover:bg-amber-50 hover:text-amber-700 font-bold text-xs px-2.5 rounded-xl transition-all"
                onClick={() => {
                  bulkMarkAsMasterMutation.mutate(selectedMaterialIds);
                }}
                disabled={bulkMarkAsMasterMutation.isPending}
                title="Hacer Patrón de Oro"
              >
                {bulkMarkAsMasterMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
                ) : (
                  <Sparkles className="h-4 w-4 text-amber-500" />
                )}
                <span className="hidden sm:inline ml-1">Hacer Oro</span>
              </Button>
            )}
            <Button 
              variant="outline" 
              size="sm" 
              className="h-8 md:h-9 border-procarni-primary/30 text-procarni-primary hover:bg-procarni-primary/10 font-bold text-xs px-2.5 rounded-xl transition-all"
              onClick={() => {
                setResolutionAction('group');
                setIsResolutionModalOpen(true);
              }}
              title="Asignar Grupo"
            >
              <Network className="h-4 w-4" />
              <span className="hidden sm:inline ml-1">Grupo</span>
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className={cn(
                "h-8 md:h-9 border-destructive/30 text-destructive hover:bg-destructive/5 font-bold text-xs px-2.5 rounded-xl transition-all",
                selectedMaterialIds.length < 2 && "opacity-50 grayscale pointer-events-none"
              )}
              onClick={() => {
                setResolutionAction('merge');
                setIsResolutionModalOpen(true);
              }}
              disabled={selectedMaterialIds.length < 2}
              title="Fusionar Materiales"
            >
              <Combine className="h-4 w-4" />
              <span className="hidden sm:inline ml-1">Fusionar</span>
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-8 md:h-9 text-muted-foreground hover:text-destructive hover:bg-destructive/5 font-medium px-2 rounded-xl transition-all"
              onClick={() => setSelectedMaterialIds([])}
              title="Cancelar Selección"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Main Content Card */}
      <Card className="bg-white/80 backdrop-blur-xl border border-slate-100 shadow-xl shadow-gray-200/50 ring-1 ring-white rounded-3xl p-6 overflow-hidden">
        <CardContent className="p-0 space-y-5">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar material por código, nombre o alias..."
                value={searchInput}
                onChange={handleSearchChange}
                className="w-full bg-slate-50/80 border-slate-200/80 rounded-2xl pl-10 h-10 text-xs focus:bg-white focus:ring-2 focus:ring-procarni-primary/20 transition-all shadow-none"
              />
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
              <div className="relative w-full sm:w-56">
                <Select value={selectedCategory} onValueChange={handleCategoryChange}>
                  <SelectTrigger className="w-full h-10 bg-slate-50/80 border-slate-200/80 rounded-2xl text-xs font-medium focus:ring-procarni-primary/20">
                    <SelectValue placeholder="Filtrar por categoría" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl shadow-xl border border-slate-100">
                    <SelectItem value="all">Todas las Categorías</SelectItem>
                    {categories.map(category => (
                      <SelectItem key={category.id} value={category.name}>{category.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="relative w-full sm:w-56">
                <Select value={masterFilter} onValueChange={handleMasterFilterChange}>
                  <SelectTrigger className="w-full h-10 bg-slate-50/80 border-slate-200/80 rounded-2xl text-xs font-medium focus:ring-procarni-primary/20">
                    <SelectValue placeholder="Tipo de Registro" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl shadow-xl border border-slate-100">
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
                  <Card 
                    key={material.id} 
                    className={cn(
                      "bg-white/90 backdrop-blur-xl border border-slate-100/90 shadow-lg shadow-slate-200/40 ring-1 ring-white rounded-3xl p-5 hover:shadow-xl transition-all duration-200 flex flex-col justify-between cursor-pointer",
                      selectedMaterialIds.includes(material.id) && "ring-2 ring-procarni-primary border-procarni-primary/40 bg-procarni-primary/5"
                    )}
                    onClick={() => navigate(`/material/${material.id}`)}
                  >
                    <div>
                      <div className="flex items-start gap-3 mb-2">
                        <Checkbox 
                          checked={selectedMaterialIds.includes(material.id)}
                          onCheckedChange={() => toggleMaterialSelection(material.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1.5 flex-wrap font-bold text-sm text-procarni-dark">
                            <span className="truncate">{material.name}</span>
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
                            {material.search_aliases && material.search_aliases.length > 0 && (
                              <Badge variant="outline" className="text-[9px] border-procarni-primary/40 text-procarni-primary" title={`Tiene alias: ${material.search_aliases.join(', ')}`}>
                                {material.search_aliases.length} Alias
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-slate-100 text-xs ml-7">
                        <div>
                          <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Código</p>
                          <span className="font-mono text-xs font-semibold text-slate-600">{material.code || '—'}</span>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Categoría</p>
                          <span className="text-xs text-slate-700 font-medium">{material.category || 'Sin categoría'}</span>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Unidad</p>
                          <span className="font-mono text-xs font-bold text-slate-600">{material.unit || '—'}</span>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">IVA</p>
                          <span className={cn("inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full", material.is_exempt ? "bg-amber-50 text-procarni-alert" : "bg-slate-100 text-slate-600")}>
                            {material.is_exempt ? 'EXENTO' : 'GRAVADO'}
                          </span>
                        </div>
                      </div>

                      {role === 'admin' && (
                        <div className="mt-3 ml-7 flex flex-wrap gap-2">
                          {material.is_master ? (
                            <Button
                              variant="default"
                              size="sm"
                              className="h-7 rounded-xl text-[11px] font-bold transition-all bg-amber-500 hover:bg-amber-600 text-white shadow-sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                updateMutation.mutate({ id: material.id, updates: { is_master: false } });
                              }}
                            >
                              ★ Patrón Oro
                            </Button>
                          ) : material.base_material_id ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 rounded-xl text-[11px] font-bold transition-all bg-blue-50/80 border-blue-200 text-blue-700 hover:bg-blue-100/80"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/material/${material.base_material_id}`);
                              }}
                              title="Ver ítem oro principal del grupo"
                            >
                              🔗 Grupo
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 rounded-xl text-[11px] font-bold transition-all border-slate-200 text-slate-600 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200"
                              onClick={(e) => {
                                e.stopPropagation();
                                updateMutation.mutate({ id: material.id, updates: { is_master: true, base_material_id: null } });
                              }}
                            >
                              ☆ Marcar Oro
                            </Button>
                          )}
                          
                          {material.is_master && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 rounded-xl text-[11px] font-bold transition-all border-slate-200 text-slate-600 hover:bg-slate-50"
                              onClick={(e) => toggleExpand(material.id, e)}
                            >
                              {expandedIds[material.id] ? '▲ Ocultar Hijos' : '▼ Mostrar Hijos'}
                            </Button>
                          )}
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
                    </div>

                    <div className="flex items-center justify-between mt-4 border-t border-slate-100 pt-3 ml-7" onClick={(e) => e.stopPropagation()}>
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Opciones</span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl hover:bg-slate-100 text-slate-500">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40 rounded-2xl shadow-xl border border-slate-100 p-1.5">
                          <DropdownMenuItem
                            onClick={() => navigate(`/material/${material.id}`)}
                            className="flex items-center gap-2 text-xs font-semibold py-2 rounded-xl cursor-pointer text-slate-700 hover:text-procarni-blue hover:bg-slate-50"
                          >
                            <Eye className="h-4 w-4 text-slate-400" />
                            <span>Ver Perfil</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleEditMaterial(material)}
                            disabled={deleteMutation.isPending}
                            className="flex items-center gap-2 text-xs font-semibold py-2 rounded-xl cursor-pointer text-slate-700 hover:text-procarni-blue hover:bg-slate-50"
                          >
                            <Edit className="h-4 w-4 text-slate-400" />
                            <span>Editar</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => confirmDeleteMaterial(material.id)}
                            disabled={deleteMutation.isPending}
                            className="flex items-center gap-2 text-xs font-semibold py-2 rounded-xl cursor-pointer text-destructive hover:bg-red-50 focus:text-destructive focus:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                            <span>Eliminar</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-100 overflow-hidden bg-white shadow-sm">
                <Table>
                  <TableHeader className="bg-slate-50/80 border-b border-slate-100">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-12 pl-4 py-3.5">
                        <Checkbox 
                          checked={filteredMaterials.length > 0 && filteredMaterials.every(m => selectedMaterialIds.includes(m.id))}
                          onCheckedChange={toggleAllSelections}
                        />
                      </TableHead>
                      <TableHead className="w-10 py-3.5"></TableHead>
                      <TableHead className="font-bold text-[10px] tracking-wider uppercase text-slate-500 py-3.5">Código</TableHead>
                      <TableHead className="font-bold text-[10px] tracking-wider uppercase text-slate-500 py-3.5">Nombre</TableHead>
                      <TableHead className="font-bold text-[10px] tracking-wider uppercase text-slate-500 py-3.5">Categoría</TableHead>
                      <TableHead className="font-bold text-[10px] tracking-wider uppercase text-slate-500 py-3.5">Unidad</TableHead>
                      <TableHead className="font-bold text-[10px] tracking-wider uppercase text-slate-500 py-3.5">Exento IVA</TableHead>
                      {role === 'admin' && (
                        <TableHead className="font-bold text-[10px] tracking-wider uppercase text-slate-500 py-3.5">Patrón Oro</TableHead>
                      )}
                      <TableHead className="text-right font-bold text-[10px] tracking-wider uppercase text-slate-500 pr-4 py-3.5">Opciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {materialsList.map((material) => (
                      <React.Fragment key={material.id}>
                        <TableRow 
                          className={cn(
                            "hover:bg-slate-50/60 transition-colors border-b border-slate-50 cursor-pointer group",
                            selectedMaterialIds.includes(material.id) && "bg-procarni-primary/5 hover:bg-procarni-primary/10"
                          )}
                          onClick={() => navigate(`/material/${material.id}`)}
                        >
                          <TableCell className="pl-4 py-2" onClick={(e) => e.stopPropagation()}>
                             <Checkbox 
                                checked={selectedMaterialIds.includes(material.id)}
                                onCheckedChange={() => toggleMaterialSelection(material.id)}
                                onClick={(e) => e.stopPropagation()}
                             />
                          </TableCell>
                          <TableCell className="py-2" onClick={(e) => e.stopPropagation()}>
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
                            <div className="flex flex-col">
                              <span className="flex items-center gap-1.5 flex-wrap font-medium text-procarni-dark whitespace-normal break-words text-sm">
                                {material.name}
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
                          </TableCell>
                          <TableCell className="py-2 text-gray-600 text-sm">
                            {material.category || 'Sin categoría'}
                          </TableCell>
                          <TableCell className="py-2 text-gray-600 text-sm">
                            {material.unit || 'Sin unidad'}
                          </TableCell>
                          <TableCell className="py-2 text-gray-600">{material.is_exempt ? 'Sí' : 'No'}</TableCell>
                          {role === 'admin' && (
                            <TableCell className="py-2" onClick={(e) => e.stopPropagation()}>
                              {material.is_master ? (
                                <Button
                                  variant="default"
                                  size="sm"
                                  className="h-8 rounded-full text-xs font-bold transition-all bg-amber-500 hover:bg-amber-600 text-white shadow-sm"
                                  onClick={() => {
                                    updateMutation.mutate({ id: material.id, updates: { is_master: false } });
                                  }}
                                >
                                  ★ Oro
                                </Button>
                              ) : material.base_material_id ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 rounded-full text-xs font-bold transition-all bg-blue-50/80 border-blue-200 text-blue-700 hover:bg-blue-100/80"
                                  onClick={() => {
                                    navigate(`/material/${material.base_material_id}`);
                                  }}
                                  title="Ver ítem oro principal del grupo"
                                >
                                  🔗 Grupo
                                </Button>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 rounded-full text-xs font-bold transition-all border-gray-200 text-gray-500 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200"
                                  onClick={() => {
                                    updateMutation.mutate({ id: material.id, updates: { is_master: true, base_material_id: null } });
                                  }}
                                >
                                  ☆ Marcar
                                </Button>
                              )}
                            </TableCell>
                          )}
                          <TableCell className="text-right pr-4 py-2" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 rounded-xl hover:bg-slate-100 text-slate-500"
                                  title="Opciones"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-40 rounded-2xl shadow-xl border border-slate-100 p-1.5">
                                <DropdownMenuItem
                                  onClick={() => navigate(`/material/${material.id}`)}
                                  disabled={deleteMutation.isPending}
                                  className="flex items-center gap-2 text-xs font-semibold py-2 rounded-xl cursor-pointer text-slate-700 hover:text-procarni-blue hover:bg-slate-50"
                                >
                                  <Eye className="h-4 w-4 text-slate-400" />
                                  <span>Ver Perfil</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleEditMaterial(material)}
                                  disabled={deleteMutation.isPending}
                                  className="flex items-center gap-2 text-xs font-semibold py-2 rounded-xl cursor-pointer text-slate-700 hover:text-procarni-blue hover:bg-slate-50"
                                >
                                  <Edit className="h-4 w-4 text-slate-400" />
                                  <span>Editar</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => confirmDeleteMaterial(material.id)}
                                  disabled={deleteMutation.isPending}
                                  className="flex items-center gap-2 text-xs font-semibold py-2 rounded-xl cursor-pointer text-destructive hover:bg-red-50 focus:text-destructive focus:bg-red-50"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  <span>Eliminar</span>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
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
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <div className="bg-slate-100 text-slate-400 p-4 rounded-full mb-4 ring-8 ring-slate-50/50">
                <Search className="h-8 w-8" />
              </div>
              <h3 className="text-base font-bold text-slate-800">No se encontraron materiales</h3>
              <p className="text-xs text-slate-500 max-w-sm mt-1">
                No hay materiales registrados o no coinciden con los criterios de búsqueda y filtros aplicados.
              </p>
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
            queryClient.invalidateQueries({ queryKey: ['active_parent_materials'] });
            queryClient.invalidateQueries({ queryKey: ['material_child_counts'] });
            queryClient.invalidateQueries({ queryKey: ['children_of_selected'] });
          }}
          initialAction={resolutionAction}
        />
      )}

      {isCreateDialogOpen && (
        <MaterialCreationDialog
          isOpen={isCreateDialogOpen}
          onClose={() => {
            setIsCreateDialogOpen(false);
            setEditingMaterial(null);
          }}
          hideNameProvided={true}
          onMaterialCreated={() => {
            queryClient.invalidateQueries({ queryKey: ['materials_paginated'] });
            queryClient.invalidateQueries({ queryKey: ['material_children'] });
            queryClient.invalidateQueries({ queryKey: ['active_parent_materials'] });
            queryClient.invalidateQueries({ queryKey: ['material_child_counts'] });
            queryClient.invalidateQueries({ queryKey: ['children_of_selected'] });
          }}
          editingMaterial={editingMaterial}
        />
      )}
    </div>
  );
};

export default MaterialManagement;