import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PriceInput } from './PriceInput';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { PlusCircle, Trash2, Search, StickyNote, Hash, Calculator, AlertTriangle, Link, Loader2 } from 'lucide-react';
import SmartSearch from '@/components/SmartSearch';
import { searchMaterialsBySupplier, getAllUnits, createSupplierMaterialRelation, searchMaterials } from '@/integrations/supabase/data';
import { useQuery } from '@tanstack/react-query';
import MaterialCreationDialog from '@/components/MaterialCreationDialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useSession } from '@/components/SessionContextProvider';
import { showSuccess, showError } from '@/utils/toast';
import { PriceAlert } from './PriceAlert';
import { LastPriceButton } from './LastPriceButton';

interface PurchaseOrderItemForm {
  id?: string;
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
  sales_percentage?: number;
  discount_percentage?: number;
  was_recalculated?: boolean;
  category?: string;
}

interface MaterialSearchResult {
  id: string;
  name: string;
  code: string;
  category?: string;
  unit?: string;
  is_exempt?: boolean;
  specification?: string;
}


interface PurchaseOrderItemsTableProps {
  items: PurchaseOrderItemForm[];
  supplierId: string;
  supplierName: string;
  currency: 'USD' | 'VES' | 'EUR';
  exchangeRate?: number | null;
  orderId?: string | null;
  onAddItem: () => void;
  onRemoveItem: (index: number) => void;
  onItemChange: (index: number, field: keyof PurchaseOrderItemForm, value: PurchaseOrderItemForm[keyof PurchaseOrderItemForm]) => void;
  onMaterialSelect: (index: number, material: MaterialSearchResult) => void;
  hideHeader?: boolean;
  showAddButton?: boolean;
}

const filterUnitsForCategory = (categoryName: string | undefined, allUnits: any[]) => {
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

const PurchaseOrderItemsTable: React.FC<PurchaseOrderItemsTableProps> = ({
  items,
  supplierId,
  supplierName,
  currency,
  exchangeRate,
  orderId,
  onAddItem,
  onRemoveItem,
  onItemChange,
  onMaterialSelect,
  hideHeader = false,
  showAddButton = true,
}) => {

  const { session } = useSession();
  const userId = session?.user?.id;
  const [isAddMaterialDialogOpen, setIsAddMaterialDialogOpen] = useState(false);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const isMobile = useIsMobile();
  const [isAssociating, setIsAssociating] = useState<string | null>(null);
  const [associatedMaterials, setAssociatedMaterials] = useState<Set<string>>(new Set());
  const [materialNameToCreate, setMaterialNameToCreate] = useState('');

  const { data: associatedMaterialIds = new Set<string>(), refetch: refetchAssociated } = useQuery({
    queryKey: ['supplier_materials_ids', supplierId],
    queryFn: async () => {
      if (!supplierId) return new Set<string>();
      const materials = await searchMaterialsBySupplier(supplierId, '');
      const materialIds = materials.map(m => m.id);
      setAssociatedMaterials(new Set(materialIds));
      return new Set<string>(materialIds);
    },
    enabled: !!supplierId,
  });




  // Sincronizar items expandidos cuando cambia la longitud de la lista (como en Solicitudes de Cotización)
  React.useEffect(() => {
    setExpandedItems(items.map((_, i) => `item-${i}`));
  }, [items.length]);

  const { data: units = [], isLoading: isLoadingUnits } = useQuery({
    queryKey: ['units_of_measure'],
    queryFn: getAllUnits,
  });

  const searchSupplierMaterials = React.useCallback(async (query: string) => {
    if (!supplierId) {
      const all = await searchMaterials(query);
      return all.map(m => ({ ...m, group: 'Otros Materiales' }));
    }

    const associated = await searchMaterialsBySupplier(supplierId, query);
    const associatedIds = new Set(associated.map(m => m.id));

    const all = await searchMaterials(query);

    const results: any[] = [];
    associated.forEach(m => {
      results.push({
        ...m,
        group: 'Sugeridos'
      });
    });

    all.forEach(m => {
      if (!associatedIds.has(m.id)) {
        results.push({
          ...m,
          group: 'Otros Materiales'
        });
      }
    });

    return results;
  }, [supplierId]);

  const handleMaterialAdded = (material: any) => {
    // Lógica post-creación
    refetchAssociated();
  };

  const handleAssociateMaterial = async (materialId: string, unitId: string, materialName: string) => {
    if (!userId || !supplierId || !materialId || !unitId) return;

    setIsAssociating(materialId);
    try {
      const result = await createSupplierMaterialRelation({
        supplier_id: supplierId,
        material_id: materialId,
        unit_id: unitId,
        user_id: userId
      });

      if (result.success) {
        showSuccess(`Material "${materialName}" asociado exitosamente.`);
        await refetchAssociated();
      }
    } catch (error) {
      console.error("Error associating material:", error);
    } finally {
      setIsAssociating(null);
    }
  };



  const calculateItemTotals = (item: PurchaseOrderItemForm) => {
    const itemValue = item.quantity * item.unit_price;
    const discountRate = (item.discount_percentage ?? 0) / 100;
    const discountAmount = itemValue * discountRate;
    const subtotalAfterDiscount = itemValue - discountAmount;
    const salesRate = (item.sales_percentage ?? 0) / 100;
    const salesAmount = subtotalAfterDiscount * salesRate;
    const itemIva = item.is_exempt ? 0 : subtotalAfterDiscount * (item.tax_rate || 0.16);
    const totalItem = subtotalAfterDiscount + salesAmount + itemIva;

    return { subtotal: itemValue, discountAmount, salesAmount, itemIva, totalItem };
  };

  // --- VISTA MÓVIL: TARJETAS MODERNAS MOBILE FIRST ---
  const renderMobileItem = (item: PurchaseOrderItemForm, index: number) => {
    const { subtotal, itemIva, totalItem, discountAmount } = calculateItemTotals(item);

    return (
      <div key={index} className="bg-white/90 backdrop-blur-md border border-slate-200/90 rounded-2xl shadow-sm hover:shadow-md transition-all p-4 space-y-3.5 relative mb-4">
        {/* Card Header: Item Number, Total & Delete */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-black text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-lg border border-slate-200/60">
              #{index + 1}
            </span>
            <div className={`h-3 w-3 rounded-full ${
              !item.material_id ? 'bg-slate-300' : 
              associatedMaterialIds.has(item.material_id) ? 'bg-procarni-secondary' : 'bg-amber-500'
            }`} title={associatedMaterialIds.has(item.material_id || '') ? 'Asociado al proveedor' : 'No asociado'} />
            {item.is_exempt && (
              <Badge variant="secondary" className="text-[10px] font-bold uppercase bg-orange-50 text-orange-700 border-orange-200">
                Exento
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="text-right">
              <span className="text-sm font-black font-mono text-procarni-dark">
                {currency} {totalItem.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onRemoveItem(index)}
              className="text-slate-400 hover:text-red-600 hover:bg-red-50 h-8 w-8 rounded-xl transition-colors shrink-0"
              title="Eliminar ítem"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Material Selection / Full Name Banner */}
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center justify-between">
            <span>Producto / Material</span>
            {item.material_id && item.unit_id && !associatedMaterialIds.has(item.material_id) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-5 px-1.5 text-[10px] text-amber-700 hover:text-amber-800 hover:bg-amber-50 gap-1 font-bold"
                onClick={() => handleAssociateMaterial(item.material_id!, item.unit_id!, item.material_name)}
                disabled={isAssociating === item.material_id}
              >
                {isAssociating === item.material_id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Link className="h-3 w-3" />
                )}
                Vincular
              </Button>
            )}
          </label>

          {/* Full Material Name Card when selected */}
          {item.material_name && (
            <div className="bg-slate-50/90 border border-slate-200/80 rounded-xl p-2.5 mb-2">
              <h4 className="text-xs sm:text-sm font-black text-slate-900 leading-snug break-words">
                {item.material_name}
              </h4>
              <div className="flex flex-wrap gap-1.5 mt-1.5 items-center">
                {item.category && (
                  <span className="text-[10px] font-semibold bg-white border border-slate-200 text-slate-600 px-1.5 py-0.5 rounded-md">
                    {item.category}
                  </span>
                )}
                {item.unit && (
                  <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md">
                    Unidad: {item.unit}
                  </span>
                )}
                {item.supplier_code && (
                  <span className="text-[10px] font-mono text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5 rounded-md">
                    Ref: {item.supplier_code}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Search picker input */}
          <div className="relative">
            <SmartSearch
              placeholder={supplierId ? (item.material_name ? "Cambiar material..." : "Buscar o seleccionar material...") : "Selecciona un proveedor primero"}
              onSelect={(material) => onMaterialSelect(index, material as MaterialSearchResult)}
              fetchFunction={searchSupplierMaterials}
              displayValue={item.material_name}
              selectedId={item.material_id}
              disabled={!supplierId}
              className="w-full h-10 bg-slate-50/60 border-slate-200 focus:bg-white rounded-xl text-xs"
              onCreateItem={(query) => {
                setMaterialNameToCreate(query);
                setIsAddMaterialDialogOpen(true);
              }}
            />
          </div>

          {item.material_id && !associatedMaterialIds.has(item.material_id) && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-50 rounded-xl border border-amber-200/80 text-amber-800 text-[11px] animate-in fade-in slide-in-from-top-1">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
              <span>Material no vinculado a este proveedor.</span>
            </div>
          )}
        </div>

        {/* Quantities, Unit & Price Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Cantidad</label>
            <Input
              type="number"
              min="0"
              value={item.quantity || ''}
              onChange={(e) => onItemChange(index, 'quantity', e.target.value === '' ? 0 : parseFloat(e.target.value))}
              className="h-10 text-xs font-mono font-bold bg-slate-50/60 border-slate-200 rounded-xl focus:bg-white"
              placeholder="0"
              onWheel={(e) => e.currentTarget.blur()}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Unidad</label>
            <Select 
              value={item.unit_id || ''} 
              onValueChange={(v) => {
                const selectedUnit = units.find(u => u.id === v);
                onItemChange(index, 'unit_id', v);
                if (selectedUnit) onItemChange(index, 'unit', selectedUnit.name);
              }}
            >
              <SelectTrigger className="h-10 text-xs bg-slate-50/60 border-slate-200 rounded-xl focus:bg-white font-medium">
                <SelectValue placeholder={isLoadingUnits ? "..." : "Unidad"} />
              </SelectTrigger>
              <SelectContent className="rounded-xl shadow-xl border-slate-100">
                {filterUnitsForCategory(item.category, units).map(u => (
                  <SelectItem key={u.id} value={u.id} className="text-xs">
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-2 space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Precio ({currency})
              </label>
              <div className="flex items-center gap-1">
                <LastPriceButton
                  materialId={item.material_id}
                  unitId={item.unit_id}
                  supplierId={supplierId}
                  currency={currency}
                  exchangeRate={exchangeRate}
                  currentOrderId={orderId}
                  currentPrice={item.unit_price || 0}
                  onApplyPrice={(price) => {
                    onItemChange(index, 'unit_price', price);
                    if (item.was_recalculated) {
                      onItemChange(index, 'was_recalculated', false);
                    }
                  }}
                />
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="sm" 
                  className="h-5 text-[10px] px-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md font-mono disabled:opacity-30"
                  disabled={item.was_recalculated}
                  onClick={(e) => {
                    e.stopPropagation();
                    const price = Number(item.unit_price);
                    if (price > 0) {
                      onItemChange(index, 'unit_price', parseFloat((price / 1.16).toFixed(2)));
                      onItemChange(index, 'was_recalculated', true);
                    }
                  }}
                  title="Extraer IVA (/ 1.16)"
                >
                  / 1.16
                </Button>
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="sm" 
                  className="h-5 text-[10px] px-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md font-mono disabled:opacity-30"
                  disabled={!item.was_recalculated}
                  onClick={(e) => {
                    e.stopPropagation();
                    const price = Number(item.unit_price);
                    if (price > 0) {
                      onItemChange(index, 'unit_price', parseFloat((price * 1.16).toFixed(2)));
                      onItemChange(index, 'was_recalculated', false);
                    }
                  }}
                  title="Revertir (* 1.16)"
                >
                  * 1.16
                </Button>
              </div>
            </div>

            <PriceInput 
              value={item.unit_price || 0} 
              onChange={(val) => {
                onItemChange(index, 'unit_price', val);
                if (item.was_recalculated) {
                  onItemChange(index, 'was_recalculated', false);
                }
              }} 
              className="h-10 text-xs font-mono font-bold bg-slate-50/60 border-slate-200 rounded-xl focus:bg-white" 
              placeholder="0.00" 
            />
            <PriceAlert
              materialId={item.material_id}
              unitId={item.unit_id}
              currentPrice={item.unit_price || 0}
              currency={currency}
              exchangeRate={exchangeRate}
              currentOrderId={orderId}
            />
          </div>
        </div>

        {/* Secondary fields: Code, Discount, Exemption & Notes */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Cód. Proveedor</label>
            <Input 
              value={item.supplier_code || ''} 
              onChange={(e) => onItemChange(index, 'supplier_code', e.target.value)} 
              className="h-9 text-xs bg-slate-50/60 border-slate-200 rounded-xl focus:bg-white font-mono" 
              placeholder="---"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Desc %</label>
            <Input 
              type="number" 
              min="0"
              max="100"
              value={item.discount_percentage || ''} 
              onChange={(e) => onItemChange(index, 'discount_percentage', e.target.value === '' ? 0 : parseFloat(e.target.value))} 
              className="h-9 text-xs bg-slate-50/60 border-slate-200 rounded-xl focus:bg-white font-mono" 
              placeholder="0" 
              onWheel={(e) => e.currentTarget.blur()} 
            />
          </div>

          <div className="col-span-2 sm:col-span-1 space-y-1">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Exento IVA</label>
            <div 
              className="flex items-center justify-between bg-slate-50/80 px-3 h-9 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-100/60 transition-colors"
              onClick={() => onItemChange(index, 'is_exempt', !item.is_exempt)}
            >
              <span className="text-xs font-semibold text-slate-700 select-none">
                {item.is_exempt ? 'Sí (Exento)' : 'No (+16% IVA)'}
              </span>
              <Switch 
                checked={item.is_exempt} 
                onCheckedChange={(c) => onItemChange(index, 'is_exempt', c)} 
                disabled={!item.material_name} 
                className="scale-75 origin-right data-[state=checked]:bg-orange-500"
              />
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Notas / Observaciones</label>
          <Input 
            value={item.description || ''} 
            onChange={(e) => onItemChange(index, 'description', e.target.value)} 
            className="h-9 text-xs bg-slate-50/60 border-slate-200 rounded-xl focus:bg-white" 
            placeholder="Especificaciones adicionales del ítem..." 
          />
        </div>

        {/* Totals Summary Ticket */}
        <div className="bg-slate-50/90 p-3 rounded-xl border border-slate-200/80 space-y-1 text-xs font-mono">
          <div className="flex justify-between text-slate-500">
            <span>Subtotal:</span>
            <span>{currency} {subtotal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          {discountAmount > 0 && (
            <div className="flex justify-between text-red-600 font-semibold">
              <span>Descuento ({item.discount_percentage}%):</span>
              <span>-{currency} {discountAmount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          )}
          {!item.is_exempt && (
            <div className="flex justify-between text-slate-500">
              <span>IVA (16%):</span>
              <span>{currency} {itemIva.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          )}
          <div className="flex justify-between text-procarni-dark font-black text-sm pt-1.5 border-t border-slate-200">
            <span>TOTAL ÍTEM:</span>
            <span className="text-procarni-primary">
              {currency} {totalItem.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>
    );
  };

  // --- VISTA DESKTOP: GRID OPTIMIZADO PARA TABLETS Y PANTALLAS GRANDES ---
  const renderDesktopAccordionItem = (item: PurchaseOrderItemForm, index: number) => {
    const { subtotal, itemIva, totalItem } = calculateItemTotals(item);

    return (
      <AccordionItem key={index} value={`item-${index}`} className="group border border-slate-200/80 rounded-2xl bg-white shadow-xs mb-3 overflow-hidden transition-all duration-200 hover:shadow-md hover:border-slate-300">

        {/* HEADER: Resumen del Ítem con soporte multi-línea y ancho responsive */}
        <AccordionTrigger className="px-4 sm:px-5 py-3.5 hover:bg-slate-50/60 hover:no-underline data-[state=open]:bg-slate-50/80 data-[state=open]:border-b border-slate-100">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center w-full pr-4 gap-2 sm:gap-4">
            <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
              <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md shrink-0">
                #{index + 1}
              </span>
              <div className={`h-8 w-1 shrink-0 rounded-full hidden sm:block ${
                !item.material_id ? 'bg-slate-300' : 
                associatedMaterialIds.has(item.material_id) ? 'bg-procarni-secondary' : 'bg-amber-500'
              }`}></div>
              <div className="flex flex-col items-start text-left min-w-0 flex-1">
                <span className={`font-bold text-sm leading-snug break-words text-slate-900 ${!item.material_name && 'text-slate-400 font-normal italic'}`}>
                  {item.material_name || "Seleccionar ítem / producto..."}
                </span>
                {item.material_name && (
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-slate-500 font-mono mt-0.5">
                    {item.quantity > 0 && <span className="font-semibold text-slate-700">{item.quantity} {item.unit || 'UND'}</span>}
                    {item.unit_price > 0 && <span>× {currency} {item.unit_price.toFixed(2)}</span>}
                    {item.supplier_code && <span>• Ref: {item.supplier_code}</span>}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-100">
              {item.is_exempt && <Badge variant="secondary" className="text-[10px] bg-orange-50 text-orange-700 border-orange-200">Exento</Badge>}
              <div className="text-right">
                <p className="text-sm font-black font-mono text-procarni-dark">{currency} {totalItem.toFixed(2)}</p>
                {!item.is_exempt && <p className="text-[10px] text-slate-400 font-mono">+ IVA {itemIva.toFixed(2)}</p>}
              </div>
            </div>
          </div>
        </AccordionTrigger>

        {/* BODY: Grid de 12 Columnas */}
        <AccordionContent className="p-0 bg-white">
          <div className="grid grid-cols-12 gap-x-4 gap-y-4 p-5">

            {/* --- FILA 1: DATOS CLAVE --- */}

            {/* Col 1-4: BUSCADOR DIRECTO (Reemplaza Lupa) */}
            <div className="col-span-4 space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 flex justify-between items-center">
                <span>Producto / Material
                  {item.material_id && item.unit_id && !associatedMaterialIds.has(item.material_id) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1.5 text-[10px] text-amber-600 hover:text-amber-700 hover:bg-amber-50 gap-1 font-bold animate-pulse-subtle"
                      onClick={() => handleAssociateMaterial(item.material_id!, item.unit_id!, item.material_name)}
                      disabled={isAssociating === item.material_id}
                    >
                      {isAssociating === item.material_id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Link className="h-3 w-3" />
                      )}
                      Vincular
                    </Button>
                  )}
                </span>
              </label>
              <div className="space-y-2">
                <SmartSearch
                  placeholder={supplierId ? "Escribe para buscar..." : "Selecciona prov."}
                  onSelect={(material) => onMaterialSelect(index, material as MaterialSearchResult)}
                  fetchFunction={searchSupplierMaterials}
                  displayValue={item.material_name}
                  selectedId={item.material_id}
                  disabled={!supplierId}
                  className={`w-full h-9 bg-white ${item.material_id && !associatedMaterialIds.has(item.material_id) ? 'border-amber-400 ring-1 ring-amber-100' : 'border-gray-200'}`}
                  icon={<Search className="h-4 w-4 text-gray-400" />}
                  onCreateItem={(query) => {
                    setMaterialNameToCreate(query);
                    setIsAddMaterialDialogOpen(true);
                  }}
                />
                
                {item.material_id && !associatedMaterialIds.has(item.material_id) && (
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-50 rounded border border-amber-100 animate-in fade-in slide-in-from-top-1 duration-300">
                    <AlertTriangle className="h-3 w-3 text-amber-600" />
                    <span className="text-[10px] text-amber-700 font-medium">Este material no está asociado a este proveedor.</span>
                  </div>
                )}
              </div>
            </div>

            {/* Col 5-6: Cantidad */}
            <div className="col-span-2 space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Cantidad</label>
              <Input
                type="number" min="0"
                value={item.quantity || ''}
                onChange={(e) => onItemChange(index, 'quantity', e.target.value === '' ? 0 : parseFloat(e.target.value))}
                className="h-9 font-medium border-gray-200"
                placeholder="0"
                onWheel={(e) => e.currentTarget.blur()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (index === items.length - 1) {
                      onAddItem();
                    }
                  }
                }}
              />
            </div>

            {/* Col 7-8: Unidad */}
            <div className="col-span-2 space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Unidad</label>
              <Select 
                value={item.unit_id || ''} 
                onValueChange={(v) => {
                  const selectedUnit = units.find(u => u.id === v);
                  onItemChange(index, 'unit_id', v);
                  if (selectedUnit) onItemChange(index, 'unit', selectedUnit.name);
                }}
              >
                <SelectTrigger className="h-9 bg-gray-50/50 border-gray-200">
                  <SelectValue placeholder={isLoadingUnits ? "..." : "Ud."} />
                </SelectTrigger>
                 <SelectContent>
                   {filterUnitsForCategory(item.category, units).map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                 </SelectContent>
              </Select>
            </div>

            {/* Col 9-11: Precio */}
            <div className="col-span-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 min-w-0">
                  <label className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 flex items-center gap-1 shrink-0">
                    <Calculator className="w-3 h-3" /> Precio
                  </label>
                  <LastPriceButton
                    materialId={item.material_id}
                    unitId={item.unit_id}
                    supplierId={supplierId}
                    currency={currency}
                    exchangeRate={exchangeRate}
                    currentOrderId={orderId}
                    currentPrice={item.unit_price || 0}
                    onApplyPrice={(price) => {
                      onItemChange(index, 'unit_price', price);
                      if (item.was_recalculated) {
                        onItemChange(index, 'was_recalculated', false);
                      }
                    }}
                  />
                </div>
                <div className="flex gap-1">
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="sm" 
                    className="h-4 text-[9px] px-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded disabled:opacity-30"
                    disabled={item.was_recalculated}
                    onClick={(e) => {
                      e.stopPropagation();
                      const price = Number(item.unit_price);
                      if (price > 0) {
                        onItemChange(index, 'unit_price', parseFloat((price / 1.16).toFixed(2)));
                        onItemChange(index, 'was_recalculated', true);
                      }
                    }}
                    title="Extraer IVA (dividir entre 1.16)"
                  >
                    / 1.16
                  </Button>
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="sm" 
                    className="h-4 text-[9px] px-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded disabled:opacity-30"
                    disabled={!item.was_recalculated}
                    onClick={(e) => {
                      e.stopPropagation();
                      const price = Number(item.unit_price);
                      if (price > 0) {
                        onItemChange(index, 'unit_price', parseFloat((price * 1.16).toFixed(2)));
                        onItemChange(index, 'was_recalculated', false);
                      }
                    }}
                    title="Revertir (multiplicar por 1.16)"
                  >
                    * 1.16
                  </Button>
                </div>
              </div>
              <div className="relative">
                <span className="absolute left-2.5 top-2.5 text-xs text-gray-400 font-medium">{currency === 'USD' ? '$' : currency === 'VES' ? 'Bs' : '€'}</span>
                <PriceInput
                  value={item.unit_price || 0}
                  onChange={(val) => {
                    onItemChange(index, 'unit_price', val);
                    if (item.was_recalculated) {
                      onItemChange(index, 'was_recalculated', false);
                    }
                  }}
                  className="h-9 pl-6 text-right font-semibold bg-gray-50/30 border-gray-200"
                  placeholder="0"
                  min="0"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (index === items.length - 1) {
                        onAddItem();
                      }
                    }
                  }}
                />
              </div>
              <PriceAlert
                materialId={item.material_id}
                unitId={item.unit_id}
                currentPrice={item.unit_price || 0}
                currency={currency}
                exchangeRate={exchangeRate}
                currentOrderId={orderId}
              />
            </div>

            {/* Col 12: Eliminar */}
            <div className="col-span-1 flex items-end justify-center pb-0.5">
              <Button variant="ghost" size="icon" onClick={() => onRemoveItem(index)} className="h-9 w-9 text-gray-400 hover:text-red-600 hover:bg-red-50">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>


            {/* --- SEPARADOR --- */}
            <div className="col-span-12 py-1">
              <Separator className="bg-gray-100" />
            </div>

            {/* --- FILA 2: DETALLES FINANCIEROS Y NOTAS --- */}

            {/* Col 1-2: Ref. (Mover aquí para liberar espacio arriba) */}
            <div className="col-span-2 space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 flex items-center gap-1">
                <Hash className="w-3 h-3" /> Ref.
              </label>
              <Input
                value={item.supplier_code || ''}
                onChange={(e) => onItemChange(index, 'supplier_code', e.target.value)}
                className="h-9 bg-gray-50/50 border-gray-200 focus:bg-white text-xs"
                placeholder="---"
              />
            </div>

            {/* Col 3-4: Descuento */}
            <div className="col-span-2 space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Desc.</label>
              <div className="relative">
                <Input
                  type="number" min="0" max="100"
                  value={item.discount_percentage || ''}
                  onChange={(e) => onItemChange(index, 'discount_percentage', e.target.value === '' ? 0 : parseFloat(e.target.value))}
                  className="h-9 text-right pr-6 bg-gray-50/30 border-gray-200"
                  placeholder="0"
                  onWheel={(e) => e.currentTarget.blur()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (index === items.length - 1) {
                        onAddItem();
                      }
                    }
                  }}
                />
                <span className="absolute right-2.5 top-2.5 text-xs text-gray-400">%</span>
              </div>
            </div>

            {/* Col 5-6: Margen */}
            <div className="col-span-2 space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Margen</label>
              <div className="relative">
                <Input
                  type="number" min="0"
                  value={item.sales_percentage || ''}
                  onChange={(e) => onItemChange(index, 'sales_percentage', e.target.value === '' ? 0 : parseFloat(e.target.value))}
                  className="h-9 text-right pr-6 bg-gray-50/30 border-gray-200"
                  placeholder="0"
                  onWheel={(e) => e.currentTarget.blur()}
                />
                <span className="absolute right-2.5 top-2.5 text-xs text-gray-400">%</span>
              </div>
            </div>

            {/* Col 5-6: Switch Exento (ALINEACIÓN CORREGIDA) */}
            <div className="col-span-2 space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 block">Exento IVA</label>
              <div className="flex items-center justify-between bg-gray-50 px-2 rounded-md border border-gray-100 hover:border-gray-200 transition-colors cursor-pointer h-9 w-full" onClick={() => onItemChange(index, 'is_exempt', !item.is_exempt)}>
                <span className="text-[10px] font-medium text-gray-600 select-none">Sí/No</span>
                <Switch
                  checked={item.is_exempt}
                  onCheckedChange={(c) => onItemChange(index, 'is_exempt', c)}
                  className="scale-75 origin-right data-[state=checked]:bg-orange-500"
                  disabled={!item.material_name}
                />
              </div>
            </div>

            {/* Col 7-12: Descripción */}
            <div className="col-span-6 space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 flex items-center gap-1">
                <StickyNote className="w-3 h-3" /> Notas / Lote
              </label>
              <Input
                value={item.description || ''}
                onChange={(e) => onItemChange(index, 'description', e.target.value)}
                className="h-9 border-dashed focus:border-solid bg-transparent placeholder:text-gray-300 border-gray-300"
                placeholder="Detalles adicionales..."
              />
            </div>

          </div>

          {/* FOOTER: Totales en línea */}
          <div className="bg-gray-50/80 px-5 py-2 border-t flex justify-end items-center gap-6 text-xs text-gray-500">
            <div className="flex gap-2">
              <span>Subtotal:</span>
              <span className="font-medium text-gray-700">{currency} {subtotal.toFixed(2)}</span>
            </div>
            {(item.discount_percentage ?? 0) > 0 && (
              <div className="flex gap-2 text-red-600">
                <span>Desc:</span>
                <span>-{currency} {calculateItemTotals(item).discountAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex gap-2">
              <span>Total Final:</span>
              <span className="font-bold text-gray-900">{currency} {totalItem.toFixed(2)}</span>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    );
  };

  return (
    <div className="space-y-4">
      {!hideHeader && (
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-lg font-semibold flex items-center gap-2 text-gray-800">
            Ítems de la Orden
          </h3>
        </div>
      )}

      {isMobile ? (
        <div className="space-y-4">
          {items.map(renderMobileItem)}
          {showAddButton && (
            <Button
              variant="outline"
              onClick={onAddItem}
              className="w-full h-12 border-dashed border-gray-300 text-gray-500 hover:text-procarni-primary hover:border-procarni-primary/50 hover:bg-procarni-primary/5 transition-all mt-2"
            >
              <PlusCircle className="mr-2 h-4 w-4" /> Añadir Ítem
            </Button>
          )}

        </div>
      ) : (
        <>
          <Accordion 
            type="multiple" 
            className="w-full" 
            value={expandedItems}
            onValueChange={setExpandedItems}
          >
            {items.map(renderDesktopAccordionItem)}
          </Accordion>
          
          {showAddButton && (
            <Button
              variant="outline"
              onClick={onAddItem}
              className="w-full py-8 border-dashed border-gray-300 text-gray-500 hover:text-procarni-primary hover:border-procarni-primary/50 hover:bg-procarni-primary/5 transition-all mt-4 group"
            >
              <div className="flex flex-col items-center gap-1">
                <PlusCircle className="h-6 w-6 group-hover:scale-110 transition-transform" />
                <span className="text-sm font-medium">Añadir nueva línea</span>
              </div>
            </Button>
          )}
        </>
      )}


      <MaterialCreationDialog
        isOpen={isAddMaterialDialogOpen}
        onClose={() => setIsAddMaterialDialogOpen(false)}
        onMaterialCreated={handleMaterialAdded}
        supplierId={supplierId}
        supplierName={supplierName}
        initialName={materialNameToCreate}
      />
    </div>
  );
};

export default PurchaseOrderItemsTable;