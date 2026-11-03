"use client";

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  ArrowRightLeft, 
  Check, 
  CheckSquare, 
  Square, 
  Search, 
  Loader2, 
  AlertTriangle, 
  Info, 
  Sparkles, 
  FolderSync,
  Plus
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getAllMaterialCategories, getMaterialsByCategory, migrateCategoryMaterials } from '@/integrations/supabase/data';
import { useSession } from '@/components/SessionContextProvider';
import { showError, showSuccess } from '@/utils/toast';
import { cn } from '@/lib/utils';

export interface CategoryMigrationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultSourceCategory?: string;
}

interface MaterialItem {
  id: string;
  name: string;
  code: string | null;
  unit: string | null;
  category: string | null;
}

const CategoryMigrationModal: React.FC<CategoryMigrationModalProps> = ({
  open,
  onOpenChange,
  defaultSourceCategory,
}) => {
  const queryClient = useQueryClient();
  const { session, profile, role, isDev, userName } = useSession();

  const [sourceCategory, setSourceCategory] = useState<string>(defaultSourceCategory || '');
  const [targetCategory, setTargetCategory] = useState<string>('');
  const [isCreatingNewCategory, setIsCreatingNewCategory] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [migrationScope, setMigrationScope] = useState<'all' | 'specific'>('all');
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([]);
  const [searchFilter, setSearchFilter] = useState('');
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  // Sync default category if provided
  React.useEffect(() => {
    if (defaultSourceCategory) {
      setSourceCategory(defaultSourceCategory);
    }
  }, [defaultSourceCategory]);

  // Load all categories
  const { data: categories = [], isLoading: isLoadingCategories } = useQuery({
    queryKey: ['material_categories'],
    queryFn: getAllMaterialCategories,
    enabled: open,
  });

  // Load materials of the selected source category
  const { data: sourceMaterials = [], isLoading: isLoadingMaterials } = useQuery<MaterialItem[]>({
    queryKey: ['materials_by_category', sourceCategory],
    queryFn: () => getMaterialsByCategory(sourceCategory),
    enabled: open && Boolean(sourceCategory),
  });

  // Filter materials for the specific selector
  const filteredMaterials = useMemo(() => {
    if (!searchFilter.trim()) return sourceMaterials;
    const term = searchFilter.toLowerCase();
    return sourceMaterials.filter(
      (m) =>
        m.name.toLowerCase().includes(term) ||
        (m.code && m.code.toLowerCase().includes(term))
    );
  }, [sourceMaterials, searchFilter]);

  // Mutation to execute migration
  const migrationMutation = useMutation({
    mutationFn: async () => {
      const finalTarget = isCreatingNewCategory ? newCategoryInput.trim().toUpperCase() : targetCategory.trim();
      const idsToMigrate = migrationScope === 'all' ? undefined : selectedMaterialIds;

      return await migrateCategoryMaterials({
        sourceCategory,
        targetCategory: finalTarget,
        materialIds: idsToMigrate,
        userId: session?.user?.id,
        userName: userName || profile?.username || 'Dev',
      });
    },
    onSuccess: (res) => {
      if (res.success) {
        showSuccess(`¡Éxito! ${res.count} materiales migrados a "${isCreatingNewCategory ? newCategoryInput.toUpperCase() : targetCategory}".`);
        queryClient.invalidateQueries({ queryKey: ['materials_paginated'] });
        queryClient.invalidateQueries({ queryKey: ['materials'] });
        queryClient.invalidateQueries({ queryKey: ['material_categories'] });
        queryClient.invalidateQueries({ queryKey: ['materials_by_category'] });
        queryClient.invalidateQueries({ queryKey: ['active_parent_materials'] });

        // Reset state
        setSelectedMaterialIds([]);
        setIsConfirmOpen(false);
        setIsCreatingNewCategory(false);
        setNewCategoryInput('');
        onOpenChange(false);
      }
    },
  });

  // Handle select/deselect all
  const handleSelectAll = () => {
    if (selectedMaterialIds.length === filteredMaterials.length) {
      setSelectedMaterialIds([]);
    } else {
      setSelectedMaterialIds(filteredMaterials.map((m) => m.id));
    }
  };

  const toggleMaterial = (id: string) => {
    setSelectedMaterialIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleStartMigration = () => {
    const finalTarget = isCreatingNewCategory ? newCategoryInput.trim() : targetCategory.trim();
    if (!sourceCategory) {
      showError('Selecciona una categoría de origen.');
      return;
    }
    if (!finalTarget) {
      showError('Selecciona o escribe una categoría de destino.');
      return;
    }
    if (sourceCategory.toUpperCase() === finalTarget.toUpperCase()) {
      showError('La categoría de origen y de destino no pueden ser la misma.');
      return;
    }
    if (migrationScope === 'specific' && selectedMaterialIds.length === 0) {
      showError('Selecciona al menos un material para migrar.');
      return;
    }
    if (sourceMaterials.length === 0) {
      showError(`La categoría "${sourceCategory}" no contiene materiales.`);
      return;
    }

    setIsConfirmOpen(true);
  };

  // Only accessible for Dev
  if (!isDev) {
    return null;
  }

  const itemsToMigrateCount = migrationScope === 'all' ? sourceMaterials.length : selectedMaterialIds.length;
  const effectiveTarget = isCreatingNewCategory ? newCategoryInput.trim().toUpperCase() : targetCategory;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-xl md:max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white/95 backdrop-blur-xl border border-slate-100 shadow-2xl p-6">
          <DialogHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-2xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold">
                  <FolderSync className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-extrabold text-procarni-dark flex items-center gap-2">
                    Migración de Categorías
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-purple-100 text-purple-700 border border-purple-200 uppercase tracking-widest">
                      Dev
                    </span>
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-500">
                    Mueve materiales masivamente de una categoría a otra de forma segura y controlada.
                  </DialogDescription>
                </div>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-5 py-3">
            {/* 1. Categoría Origen y Destino */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Origen */}
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  Categoría Origen <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={sourceCategory}
                  onValueChange={(val) => {
                    setSourceCategory(val);
                    setSelectedMaterialIds([]);
                  }}
                  disabled={isLoadingCategories}
                >
                  <SelectTrigger className="h-10 bg-slate-50/70 border-slate-200 rounded-xl text-xs font-semibold">
                    <SelectValue placeholder="Selecciona origen..." />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl shadow-xl max-h-56">
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.name} className="text-xs font-medium">
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {sourceCategory && (
                  <p className="text-[11px] text-slate-500 font-medium">
                    {isLoadingMaterials ? (
                      <span className="flex items-center gap-1 text-slate-400">
                        <Loader2 className="h-3 w-3 animate-spin" /> Contando materiales...
                      </span>
                    ) : (
                      <span>
                        Total en origen:{' '}
                        <strong className="text-procarni-dark">{sourceMaterials.length}</strong> material(es)
                      </span>
                    )}
                  </p>
                )}
              </div>

              {/* Destino */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    Categoría Destino <span className="text-red-500">*</span>
                  </Label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreatingNewCategory(!isCreatingNewCategory);
                      setNewCategoryInput('');
                    }}
                    className="text-[10px] font-bold text-purple-600 hover:text-purple-700 flex items-center gap-0.5 transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                    {isCreatingNewCategory ? 'Elegir existente' : 'Nueva categoría'}
                  </button>
                </div>

                {isCreatingNewCategory ? (
                  <Input
                    placeholder="Escribe el nombre de la nueva categoría..."
                    value={newCategoryInput}
                    onChange={(e) => setNewCategoryInput(e.target.value.toUpperCase())}
                    className="h-10 uppercase bg-slate-50/70 border-purple-300 focus:ring-purple-200 rounded-xl text-xs font-bold"
                  />
                ) : (
                  <Select
                    value={targetCategory}
                    onValueChange={setTargetCategory}
                    disabled={isLoadingCategories}
                  >
                    <SelectTrigger className="h-10 bg-slate-50/70 border-slate-200 rounded-xl text-xs font-semibold">
                      <SelectValue placeholder="Selecciona destino..." />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl shadow-xl max-h-56">
                      {categories
                        .filter((c) => c.name.toUpperCase() !== sourceCategory.toUpperCase())
                        .map((c) => (
                          <SelectItem key={c.id} value={c.name} className="text-xs font-medium">
                            {c.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            {/* 2. Alcance de la Migración */}
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Alcance de la Migración
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setMigrationScope('all')}
                  className={cn(
                    "flex flex-col items-start p-3 rounded-2xl border text-left transition-all",
                    migrationScope === 'all'
                      ? "border-purple-600 bg-purple-50/50 shadow-sm ring-1 ring-purple-600/30"
                      : "border-slate-200 hover:bg-slate-50/60"
                  )}
                >
                  <span className="text-xs font-bold text-procarni-dark">Todos los materiales</span>
                  <span className="text-[11px] text-slate-500 mt-0.5">
                    Mover todos los {sourceMaterials.length} ítems de {sourceCategory || 'la categoría'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setMigrationScope('specific')}
                  className={cn(
                    "flex flex-col items-start p-3 rounded-2xl border text-left transition-all",
                    migrationScope === 'specific'
                      ? "border-purple-600 bg-purple-50/50 shadow-sm ring-1 ring-purple-600/30"
                      : "border-slate-200 hover:bg-slate-50/60"
                  )}
                >
                  <span className="text-xs font-bold text-procarni-dark">Selección específica</span>
                  <span className="text-[11px] text-slate-500 mt-0.5">
                    Elegir manualmente qué materiales mover ({selectedMaterialIds.length} seleccionados)
                  </span>
                </button>
              </div>
            </div>

            {/* 3. Lista de selección de ítems cuando el alcance es 'specific' */}
            {migrationScope === 'specific' && (
              <div className="space-y-2.5 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <Input
                      placeholder="Filtrar materiales por nombre o código..."
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                      className="h-8 pl-8 text-xs bg-slate-50/80 border-slate-200 rounded-xl"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSelectAll}
                    disabled={filteredMaterials.length === 0}
                    className="h-8 text-[11px] font-bold rounded-xl border-slate-200 text-slate-600 hover:bg-slate-100"
                  >
                    {selectedMaterialIds.length === filteredMaterials.length && filteredMaterials.length > 0 ? (
                      <>
                        <Square className="h-3.5 w-3.5 mr-1" /> Deseleccionar todo
                      </>
                    ) : (
                      <>
                        <CheckSquare className="h-3.5 w-3.5 mr-1 text-purple-600" /> Seleccionar todo ({filteredMaterials.length})
                      </>
                    )}
                  </Button>
                </div>

                <div className="max-h-52 overflow-y-auto rounded-2xl border border-slate-100 bg-slate-50/50 p-2 space-y-1 divide-y divide-slate-100">
                  {isLoadingMaterials ? (
                    <div className="py-8 text-center text-xs text-slate-400">
                      <Loader2 className="h-4 w-4 animate-spin mx-auto mb-1 text-purple-600" />
                      Cargando materiales de {sourceCategory}...
                    </div>
                  ) : filteredMaterials.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-400">
                      No se encontraron materiales que coincidan.
                    </div>
                  ) : (
                    filteredMaterials.map((mat) => {
                      const isSelected = selectedMaterialIds.includes(mat.id);
                      return (
                        <div
                          key={mat.id}
                          onClick={() => toggleMaterial(mat.id)}
                          className={cn(
                            "flex items-center justify-between p-2 rounded-xl cursor-pointer transition-colors text-xs select-none",
                            isSelected
                              ? "bg-purple-100/70 text-purple-900 font-semibold"
                              : "hover:bg-white text-slate-700"
                          )}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div
                              className={cn(
                                "h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                                isSelected
                                  ? "bg-purple-600 border-purple-600 text-white"
                                  : "border-slate-300 bg-white"
                              )}
                            >
                              {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                            </div>
                            <div className="min-w-0 flex-1 truncate">
                              <span className="truncate block font-medium">{mat.name}</span>
                              {mat.code && (
                                <span className="font-mono text-[10px] text-slate-400">
                                  {mat.code}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/80 border border-slate-200 text-slate-500 shrink-0 ml-2">
                            {mat.unit || '—'}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* Aviso informativo de unidades */}
            {['SECA', 'FRESCA', 'EMPAQUE'].includes(effectiveTarget.toUpperCase()) && (
              <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Ajuste de Unidades Automático</p>
                  <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                    La categoría de destino <strong>{effectiveTarget.toUpperCase()}</strong> requiere unidades estandarizadas ({effectiveTarget.toUpperCase() === 'SECA' ? 'KG, LT, GR' : effectiveTarget.toUpperCase() === 'FRESCA' ? 'KG' : 'MT, UND'}). Las unidades no conformes se adaptarán automáticamente durante la migración.
                  </p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="pt-3 border-t border-slate-100 flex items-center justify-between sm:justify-between w-full">
            <span className="text-xs text-slate-500">
              {itemsToMigrateCount > 0 ? (
                <>
                  Se migrarán <strong>{itemsToMigrateCount}</strong> material(es)
                </>
              ) : (
                'Sin materiales seleccionados'
              )}
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={migrationMutation.isPending}
                className="rounded-xl border-slate-200 text-xs font-semibold h-9"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleStartMigration}
                disabled={itemsToMigrateCount === 0 || migrationMutation.isPending}
                className="bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold h-9 shadow-md shadow-purple-600/20"
              >
                {migrationMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Migrando...
                  </>
                ) : (
                  <>
                    <ArrowRightLeft className="h-4 w-4 mr-1.5" /> Migrar {itemsToMigrateCount} ítems
                  </>
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmación Final */}
      <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <AlertDialogContent className="rounded-3xl bg-white border border-slate-100 shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold text-procarni-dark flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-purple-600" />
              ¿Confirmar Migración de Categoría?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-slate-600 space-y-2">
              <p>
                Esta acción moverá <strong>{itemsToMigrateCount}</strong> material(es) desde{' '}
                <strong className="text-procarni-dark underline">{sourceCategory}</strong> hacia{' '}
                <strong className="text-purple-700 underline">{effectiveTarget}</strong>.
              </p>
              <p className="text-[11px] text-slate-500">
                La operación quedará registrada en el registro de auditoría del sistema bajo el usuario Dev.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={migrationMutation.isPending}
              className="rounded-xl text-xs"
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => migrationMutation.mutate()}
              disabled={migrationMutation.isPending}
              className="bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold"
            >
              {migrationMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Procesando...
                </>
              ) : (
                'Sí, ejecutar migración'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default CategoryMigrationModal;
