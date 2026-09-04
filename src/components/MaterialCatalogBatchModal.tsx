import React, { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQuery } from '@tanstack/react-query';
import { searchMaterialsBySupplier, searchMaterials, getAllUnits, getAllMaterialCategories } from '@/integrations/supabase/data';
import { Layers, Search, Plus, Minus, Check, Package, CheckSquare, Square, Loader2, Sparkles, AlertCircle, ShoppingCart } from 'lucide-react';
import { UnitOfMeasure } from '@/integrations/supabase/services/unitService';
import { MaterialCategory } from '@/integrations/supabase/types';

export interface BatchItemForm {
  material_id?: string;
  material_name: string;
  supplier_code?: string;
  quantity: number;
  unit_price: number;
  tax_rate?: number;
  is_exempt?: boolean;
  unit?: string;
  unit_id?: string;
  description?: string;
  category?: string;
  sales_percentage?: number;
  discount_percentage?: number;
}

interface MaterialCatalogBatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplierId?: string;
  supplierName?: string;
  currency: 'USD' | 'VES' | 'EUR';
  exchangeRate?: number | null;
  existingMaterialIds?: Set<string>;
  onInsertItems: (items: BatchItemForm[]) => void;
}

interface SelectedItemState {
  quantity: number;
  unitId: string;
  unitName: string;
  unitPrice: number;
  isExempt: boolean;
  supplierCode: string;
  description: string;
}

export const filterUnitsForCategory = (categoryName: string | undefined, allUnits: UnitOfMeasure[]) => {
  if (!categoryName) return allUnits;
  const catUpper = categoryName.toUpperCase();
  if (catUpper === 'SECA') {
    return allUnits.filter(u => ['KG', 'LT', 'GR'].includes(u.name.toUpperCase()));
  }
  if (catUpper === 'FRESCA') {
    return allUnits.filter(u => ['KG'].includes(u.name.toUpperCase()));
  }
  if (catUpper === 'EMPAQUE') {
    return allUnits.filter(u => ['MT', 'UND'].includes(u.name.toUpperCase()));
  }
  return allUnits;
};

const MaterialCatalogBatchModal: React.FC<MaterialCatalogBatchModalProps> = ({
  isOpen,
  onClose,
  supplierId,
  supplierName,
  currency,
  exchangeRate,
  existingMaterialIds = new Set(),
  onInsertItems,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [scope, setScope] = useState<'supplier' | 'all'>(supplierId ? 'supplier' : 'all');
  const [selectedMap, setSelectedMap] = useState<Map<string, SelectedItemState>>(new Map());

  // Reset states when opened
  useEffect(() => {
    if (isOpen) {
      setSelectedMap(new Map());
      setSearchQuery('');
      setSelectedCategory('ALL');
      setScope(supplierId ? 'supplier' : 'all');
    }
  }, [isOpen, supplierId]);

  // Fetch Units
  const { data: units = [] } = useQuery<UnitOfMeasure[]>({
    queryKey: ['units_of_measure'],
    queryFn: getAllUnits,
  });

  // Fetch Categories
  const { data: categories = [] } = useQuery<MaterialCategory[]>({
    queryKey: ['material_categories'],
    queryFn: getAllMaterialCategories,
  });

  // Fetch Supplier Materials
  const { data: supplierMaterials = [], isLoading: isLoadingSupplierMats } = useQuery({
    queryKey: ['supplier_batch_materials', supplierId],
    queryFn: () => (supplierId ? searchMaterialsBySupplier(supplierId, '') : Promise.resolve([])),
    enabled: isOpen && !!supplierId,
  });

  // Fetch All Materials
  const { data: allMaterials = [], isLoading: isLoadingAllMats } = useQuery({
    queryKey: ['all_batch_materials'],
    queryFn: () => searchMaterials(''),
    enabled: isOpen && scope === 'all',
  });

  const rawMaterials = scope === 'supplier' && supplierId ? supplierMaterials : allMaterials;
  const isLoading = scope === 'supplier' && supplierId ? isLoadingSupplierMats : isLoadingAllMats;

  const normalize = (str: string) => {
    return (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  };

  // Filter materials based on search and category
  const filteredMaterials = useMemo(() => {
    const queryNormalized = normalize(searchQuery);
    const words = queryNormalized.split(/\s+/).filter(Boolean);

    return rawMaterials.filter((m: any) => {
      const matchesCat =
        selectedCategory === 'ALL' ||
        (m.category && m.category.toUpperCase() === selectedCategory.toUpperCase());

      if (!matchesCat) return false;
      if (words.length === 0) return true;

      const normName = normalize(m.name || '');
      const normCode = normalize(m.code || '');
      const normCategory = normalize(m.category || '');
      const aliases = (m.search_aliases || []).map((a: string) => normalize(a));

      return words.every((word) =>
        normName.includes(word) ||
        normCode.includes(word) ||
        normCategory.includes(word) ||
        aliases.some((a: string) => a.includes(word))
      );
    });
  }, [rawMaterials, searchQuery, selectedCategory]);

  const handleToggleMaterial = (mat: any) => {
    setSelectedMap(prev => {
      const next = new Map(prev);
      if (next.has(mat.id)) {
        next.delete(mat.id);
      } else {
        // Find default unit
        const validUnits = filterUnitsForCategory(mat.category, units);
        const defaultUnit = validUnits.find(u => u.name === mat.unit) || validUnits[0] || units[0];
        
        next.set(mat.id, {
          quantity: 1,
          unitId: defaultUnit?.id || mat.unit_id || '',
          unitName: defaultUnit?.name || mat.unit || 'UND',
          unitPrice: 0,
          isExempt: !!mat.is_exempt,
          supplierCode: mat.code || '',
          description: mat.specification || '',
        });
      }
      return next;
    });
  };

  const handleUpdateItemState = (materialId: string, field: keyof SelectedItemState, value: any) => {
    setSelectedMap(prev => {
      const next = new Map(prev);
      const current = next.get(materialId);
      if (current) {
        next.set(materialId, { ...current, [field]: value });
      }
      return next;
    });
  };

  const handleSelectAllVisible = () => {
    setSelectedMap(prev => {
      const next = new Map(prev);
      filteredMaterials.forEach((mat: any) => {
        if (!next.has(mat.id)) {
          const validUnits = filterUnitsForCategory(mat.category, units);
          const defaultUnit = validUnits.find(u => u.name === mat.unit) || validUnits[0] || units[0];
          next.set(mat.id, {
            quantity: 1,
            unitId: defaultUnit?.id || mat.unit_id || '',
            unitName: defaultUnit?.name || mat.unit || 'UND',
            unitPrice: 0,
            isExempt: !!mat.is_exempt,
            supplierCode: mat.code || '',
            description: mat.specification || '',
          });
        }
      });
      return next;
    });
  };

  const handleDeselectAll = () => {
    setSelectedMap(new Map());
  };

  const handleConfirmInsert = () => {
    const itemsToInsert: BatchItemForm[] = [];
    
    // Find material details for each selected item
    selectedMap.forEach((state, matId) => {
      const mat = rawMaterials.find((m: any) => m.id === matId) || allMaterials.find((m: any) => m.id === matId);
      if (mat) {
        itemsToInsert.push({
          material_id: mat.id,
          material_name: mat.name,
          supplier_code: state.supplierCode || mat.code || '',
          quantity: state.quantity > 0 ? state.quantity : 1,
          unit_price: state.unitPrice || 0,
          tax_rate: 0.16,
          is_exempt: state.isExempt,
          unit: state.unitName,
          unit_id: state.unitId,
          description: state.description || mat.specification || '',
          category: mat.category,
          sales_percentage: 0,
          discount_percentage: 0,
        });
      }
    });

    if (itemsToInsert.length > 0) {
      onInsertItems(itemsToInsert);
      onClose();
    }
  };

  const totalSelectedCount = selectedMap.size;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-full sm:w-[92vw] sm:max-w-4xl h-[100dvh] sm:h-auto sm:max-h-[90vh] max-w-none flex flex-col p-0 gap-0 rounded-none sm:rounded-3xl overflow-hidden border-none shadow-2xl bg-white/95 backdrop-blur-xl">
        {/* HEADER */}
        <DialogHeader className="p-4 sm:p-6 bg-gradient-to-r from-slate-900 to-[#1B294A] text-white shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-2xl bg-white/10 flex items-center justify-center border border-white/20 text-red-400">
                <Layers className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-2">
                  Explorar Catálogo y Selección Múltiple
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-300 font-medium">
                  {supplierName ? (
                    <span>Proveedor activo: <strong className="text-white">{supplierName}</strong></span>
                  ) : (
                    "Selecciona y añade múltiples materiales a la orden en un solo clic."
                  )}
                </DialogDescription>
              </div>
            </div>

            {totalSelectedCount > 0 && (
              <Badge className="bg-procarni-secondary hover:bg-green-700 text-white font-mono text-xs px-3 py-1 rounded-xl shadow-md animate-in zoom-in-95">
                <Check className="w-3.5 h-3.5 mr-1" />
                {totalSelectedCount} seleccionados
              </Badge>
            )}
          </div>
        </DialogHeader>

        {/* CONTROLS BAR: Search, Scope Switch & Category Pills */}
        <div className="p-4 bg-slate-50/80 border-b border-slate-200/80 space-y-3 shrink-0">
          <div className="flex flex-col sm:flex-row items-center gap-3">
            {/* Search Input */}
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por nombre, código de material o alias..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-10 bg-white border-slate-200 rounded-xl text-xs font-medium focus:ring-procarni-primary/20"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-3 text-xs text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Scope Switch (Supplier vs All) */}
            {supplierId && (
              <div className="flex bg-slate-200/70 p-1 rounded-xl shrink-0 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setScope('supplier')}
                  className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    scope === 'supplier'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Asociados ({supplierMaterials.length})
                </button>
                <button
                  type="button"
                  onClick={() => setScope('all')}
                  className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    scope === 'all'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Todo el Catálogo
                </button>
              </div>
            )}
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1 shrink-0">
              Categoría:
            </span>
            <button
              type="button"
              onClick={() => setSelectedCategory('ALL')}
              className={`px-3 py-1 rounded-lg font-bold text-xs transition-all shrink-0 ${
                selectedCategory === 'ALL'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              TODAS
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.name)}
                className={`px-3 py-1 rounded-lg font-bold text-xs uppercase transition-all shrink-0 ${
                  selectedCategory.toUpperCase() === cat.name.toUpperCase()
                    ? 'bg-procarni-primary text-white shadow-xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* MATERIALS LIST */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50/40 min-h-[300px]">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-procarni-primary" />
              <p className="text-xs font-medium">Cargando catálogo de materiales...</p>
            </div>
          ) : filteredMaterials.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
              <Package className="h-10 w-10 text-slate-300" />
              <p className="text-sm font-semibold text-slate-600">No se encontraron materiales</p>
              <p className="text-xs text-slate-400 max-w-sm text-center">
                Intenta ajustar la búsqueda, cambiar la categoría o cambiar a &quot;Todo el Catálogo&quot;.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredMaterials.map((mat: any) => {
                const isSelected = selectedMap.has(mat.id);
                const isAlreadyInOrder = existingMaterialIds.has(mat.id);
                const itemState = selectedMap.get(mat.id);
                const validUnits = filterUnitsForCategory(mat.category, units);

                return (
                  <div
                    key={mat.id}
                    className={`rounded-2xl border transition-all p-3 bg-white ${
                      isSelected
                        ? 'border-procarni-primary ring-1 ring-procarni-primary/20 shadow-md bg-red-50/10'
                        : 'border-slate-200/80 hover:border-slate-300 hover:shadow-xs'
                    }`}
                  >
                    <div className="flex items-start sm:items-center justify-between gap-3">
                      {/* Left: Checkbox & Name */}
                      <div
                        className="flex items-start sm:items-center gap-3 flex-1 cursor-pointer select-none"
                        onClick={() => handleToggleMaterial(mat)}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => handleToggleMaterial(mat)}
                          className="mt-1 sm:mt-0 data-[state=checked]:bg-procarni-primary data-[state=checked]:border-procarni-primary rounded-md h-5 w-5"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`text-sm font-black leading-snug ${isSelected ? 'text-procarni-primary' : 'text-slate-900'}`}>
                              {mat.name}
                            </span>
                            {isAlreadyInOrder && (
                              <Badge variant="outline" className="text-[9px] bg-slate-100 text-slate-500 border-slate-200">
                                En la orden
                              </Badge>
                            )}
                            {mat.is_exempt && (
                              <Badge variant="secondary" className="text-[9px] bg-orange-50 text-orange-700 border-orange-200 font-bold uppercase">
                                Exento
                              </Badge>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[11px] text-slate-500 font-mono">
                            {mat.code && <span>Cód: <strong>{mat.code}</strong></span>}
                            {mat.category && (
                              <span className="bg-slate-100 px-1.5 py-0.2 rounded text-slate-600 font-sans font-medium text-[10px]">
                                {mat.category}
                              </span>
                            )}
                            {mat.unit && <span>Ud. base: {mat.unit}</span>}
                          </div>
                        </div>
                      </div>

                      {/* Right: Quick Inputs when Selected */}
                      {isSelected && itemState && (
                        <div className="flex items-center gap-2 shrink-0 animate-in fade-in">
                          {/* Quantity Stepper */}
                          <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const newQty = Math.max(0.1, Number((itemState.quantity - 1).toFixed(2)));
                                handleUpdateItemState(mat.id, 'quantity', newQty);
                              }}
                              className="px-2 py-1.5 hover:bg-slate-200 text-slate-600 transition-colors"
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <Input
                              type="number"
                              min="0"
                              step="any"
                              value={itemState.quantity || ''}
                              onChange={(e) => {
                                const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                                handleUpdateItemState(mat.id, 'quantity', val);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="w-16 h-8 text-center text-xs font-mono font-bold border-none bg-white p-1 focus-visible:ring-0"
                              onWheel={(e) => e.currentTarget.blur()}
                            />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const newQty = Number((itemState.quantity + 1).toFixed(2));
                                handleUpdateItemState(mat.id, 'quantity', newQty);
                              }}
                              className="px-2 py-1.5 hover:bg-slate-200 text-slate-600 transition-colors"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          {/* Unit Selector */}
                          <div className="w-24">
                            <Select
                              value={itemState.unitId || ''}
                              onValueChange={(val) => {
                                const matched = units.find(u => u.id === val);
                                handleUpdateItemState(mat.id, 'unitId', val);
                                if (matched) handleUpdateItemState(mat.id, 'unitName', matched.name);
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs bg-white border-slate-200 rounded-xl font-medium">
                                <SelectValue placeholder="Ud" />
                              </SelectTrigger>
                              <SelectContent>
                                {validUnits.map((u) => (
                                  <SelectItem key={u.id} value={u.id} className="text-xs">
                                    {u.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* FOOTER: Actions & Confirm */}
        <DialogFooter className="p-4 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSelectAllVisible}
              className="text-xs rounded-xl h-9 text-slate-600 hover:text-slate-900 border-slate-200"
              disabled={filteredMaterials.length === 0}
            >
              <CheckSquare className="h-3.5 w-3.5 mr-1.5 text-slate-500" />
              Seleccionar visibles ({filteredMaterials.length})
            </Button>

            {totalSelectedCount > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleDeselectAll}
                className="text-xs rounded-xl h-9 text-slate-500 hover:text-red-600"
              >
                Limpiar selección
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1 sm:flex-initial h-10 rounded-xl text-xs font-semibold border-slate-200"
            >
              Cancelar
            </Button>

            <Button
              type="button"
              onClick={handleConfirmInsert}
              disabled={totalSelectedCount === 0}
              className="flex-1 sm:flex-initial h-10 bg-procarni-primary hover:bg-red-800 text-white rounded-xl text-xs font-bold px-6 shadow-md transition-all active:scale-95 disabled:opacity-50"
            >
              <ShoppingCart className="h-4 w-4 mr-2" />
              Insertar Seleccionados ({totalSelectedCount})
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MaterialCatalogBatchModal;
