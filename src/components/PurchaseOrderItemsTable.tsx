import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { PlusCircle, Trash2, Search, StickyNote, Hash, Calculator } from 'lucide-react';
import SmartSearch from '@/components/SmartSearch';
import { searchMaterialsBySupplier } from '@/integrations/supabase/data';
import MaterialCreationDialog from '@/components/MaterialCreationDialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

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
  description?: string;
  sales_percentage?: number;
  discount_percentage?: number;
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

const MATERIAL_UNITS = [
  'KG', 'LT', 'ROL', 'PAQ', 'SACO', 'GAL', 'UND', 'MT', 'RESMA', 'PZA', 'TAMB', 'MILL', 'CAJA', 'PAR'
];

interface PurchaseOrderItemsTableProps {
  items: PurchaseOrderItemForm[];
  supplierId: string;
  supplierName: string;
  currency: 'USD' | 'VES';
  onAddItem: () => void;
  onRemoveItem: (index: number) => void;
  onItemChange: (index: number, field: keyof PurchaseOrderItemForm, value: PurchaseOrderItemForm[keyof PurchaseOrderItemForm]) => void;
  onMaterialSelect: (index: number, material: MaterialSearchResult) => void;
  hideHeader?: boolean;
}

const PurchaseOrderItemsTable: React.FC<PurchaseOrderItemsTableProps> = ({
  items,
  supplierId,
  supplierName,
  currency,
  onAddItem,
  onRemoveItem,
  onItemChange,
  onMaterialSelect,
  hideHeader = false,
}) => {
  const [isAddMaterialDialogOpen, setIsAddMaterialDialogOpen] = useState(false);
  const isMobile = useIsMobile();

  const searchSupplierMaterials = React.useCallback(async (query: string) => {
    if (!supplierId) return [];
    return searchMaterialsBySupplier(supplierId, query);
  }, [supplierId]);

  const handleMaterialAdded = (material: any) => {
    // Lógica post-creación
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

  // --- VISTA MÓVIL: TARJETAS (MANTENIDA) ---
  const renderMobileItem = (item: PurchaseOrderItemForm, index: number) => {
    const { subtotal, itemIva, totalItem } = calculateItemTotals(item);

    return (
      <div key={index} className="bg-white border rounded-lg shadow-sm p-4 space-y-4 relative mb-4">
        <div className="flex justify-between items-start border-b pb-3">
          <div className="w-[85%]">
            <label className="text-xs font-bold text-muted-foreground uppercase mb-1 block">Producto</label>
            <SmartSearch
              placeholder={supplierId ? "Buscar material..." : "Selecciona prov."}
              onSelect={(material) => onMaterialSelect(index, material as MaterialSearchResult)}
              fetchFunction={searchSupplierMaterials}
              displayValue={item.material_name}
              selectedId={item.material_id}
              disabled={!supplierId}
              className="w-full"
            />
          </div>
          <Button variant="ghost" size="icon" onClick={() => onRemoveItem(index)} className="text-destructive h-8 w-8 -mr-2">
            <Trash2 className="h-5 w-5" />
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Código Prov.</label>
            <Input value={item.supplier_code || ''} onChange={(e) => onItemChange(index, 'supplier_code', e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Unidad</label>
            <Select value={item.unit || ''} onValueChange={(v) => onItemChange(index, 'unit', v)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Ud." /></SelectTrigger>
              <SelectContent>{MATERIAL_UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Cantidad</label>
            <Input type="number" value={item.quantity || ''} onChange={(e) => onItemChange(index, 'quantity', e.target.value === '' ? 0 : parseFloat(e.target.value))} className="h-9" placeholder="0" onWheel={(e) => e.currentTarget.blur()} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Precio ({currency})</label>
            <Input type="number" step="0.01" value={item.unit_price || ''} onChange={(e) => onItemChange(index, 'unit_price', e.target.value === '' ? 0 : parseFloat(e.target.value))} className="h-9" placeholder="0" onWheel={(e) => e.currentTarget.blur()} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Desc %</label>
            <Input type="number" value={item.discount_percentage || ''} onChange={(e) => onItemChange(index, 'discount_percentage', e.target.value === '' ? 0 : parseFloat(e.target.value))} className="h-9" placeholder="0" onWheel={(e) => e.currentTarget.blur()} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Venta %</label>
            <Input type="number" value={item.sales_percentage || ''} onChange={(e) => onItemChange(index, 'sales_percentage', e.target.value === '' ? 0 : parseFloat(e.target.value))} className="h-9" placeholder="0" onWheel={(e) => e.currentTarget.blur()} />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Descripción Adicional</label>
          <Input value={item.description || ''} onChange={(e) => onItemChange(index, 'description', e.target.value)} className="h-9" placeholder="Notas..." />
        </div>

        <div className="bg-gray-50 p-3 rounded-md border border-gray-100 mt-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Exento de IVA</span>
            <Switch checked={item.is_exempt} onCheckedChange={(c) => onItemChange(index, 'is_exempt', c)} disabled={!item.material_name} />
          </div>
          <div className="space-y-1 text-right text-sm">
            <div className="flex justify-between text-muted-foreground"><span>Subtotal:</span> <span>{currency} {subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between h-5 items-center">
              {!item.is_exempt ? (
                <><span>IVA (16%):</span> <span className="text-muted-foreground">{currency} {itemIva.toFixed(2)}</span></>
              ) : (
                <span className="invisible">.</span>
              )}
            </div>
            <div className="flex justify-between font-bold text-base pt-1 border-t"><span>Total:</span> <span>{currency} {totalItem.toFixed(2)}</span></div>
          </div>
        </div>
      </div>
    );
  };

  // --- VISTA DESKTOP: GRID OPTIMIZADO PARA TABLETS ---
  const renderDesktopAccordionItem = (item: PurchaseOrderItemForm, index: number) => {
    const { subtotal, itemIva, totalItem } = calculateItemTotals(item);

    return (
      <AccordionItem key={index} value={`item-${index}`} className="group border rounded-lg bg-white shadow-sm mb-3 overflow-hidden transition-all duration-200 hover:shadow-md hover:border-gray-300">

        {/* HEADER: Resumen del Ítem */}
        <AccordionTrigger className="px-5 py-3 hover:bg-gray-50/50 hover:no-underline data-[state=open]:bg-gray-50/80 data-[state=open]:border-b">
          <div className="flex justify-between items-center w-full pr-6">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className={`h-8 w-1 rounded-full ${item.material_name ? 'bg-procarni-primary' : 'bg-gray-300'}`}></div>
              <div className="flex flex-col items-start text-left min-w-0">
                <span className={`font-semibold text-sm truncate max-w-[400px] ${!item.material_name && 'text-muted-foreground italic'}`}>
                  {item.material_name || "Seleccionar ítem..."}
                </span>
                {item.material_name && (
                  <div className="flex gap-2 text-[10px] text-muted-foreground">
                    {item.quantity > 0 && <span>{item.quantity} {item.unit}</span>}
                    {item.supplier_code && <span>• Ref: {item.supplier_code}</span>}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-6">
              {item.is_exempt && <Badge variant="secondary" className="text-[10px] bg-orange-50 text-orange-700 hover:bg-orange-100 border-orange-200">Exento</Badge>}
              <div className="text-right">
                <p className="text-sm font-bold text-gray-900">{currency} {totalItem.toFixed(2)}</p>
                {!item.is_exempt && <p className="text-[10px] text-muted-foreground">+ IVA {itemIva.toFixed(2)}</p>}
              </div>
            </div>
          </div>
        </AccordionTrigger>

        {/* BODY: Grid de 12 Columnas */}
        <AccordionContent className="p-0 bg-white">
          <div className="grid grid-cols-12 gap-x-4 gap-y-4 p-5">

            {/* --- FILA 1: DATOS CLAVE --- */}

            {/* Col 1: BUSCADOR (Botón Lupa) - Compacto */}
            <div className="col-span-1 space-y-1.5 flex flex-col items-center">
              <label className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 w-full text-center">
                Buscar
              </label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="icon" className="h-9 w-9 shrink-0 border-dashed border-gray-300 hover:border-procarni-primary hover:text-procarni-primary" disabled={!supplierId}>
                    <Search className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-2" align="start">
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm text-muted-foreground mb-1">Buscar Material</h4>
                    <SmartSearch
                      placeholder="Escribe para buscar..."
                      onSelect={(material) => onMaterialSelect(index, material as MaterialSearchResult)}
                      fetchFunction={searchSupplierMaterials}
                      displayValue=""
                      selectedId={item.material_id}
                      disabled={!supplierId}
                      autoFocus={true}
                      className="w-full"
                    />
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Col 2-4: Cantidad (AMPLIADO a 3 columnas para Tablets) */}
            <div className="col-span-3 space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Cantidad</label>
              <Input
                type="number" min="0"
                value={item.quantity || ''}
                onChange={(e) => onItemChange(index, 'quantity', e.target.value === '' ? 0 : parseFloat(e.target.value))}
                className="h-9 font-medium border-gray-200"
                placeholder="0"
                onWheel={(e) => e.currentTarget.blur()}
              />
            </div>

            {/* Col 5-6: Unidad */}
            <div className="col-span-2 space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Unidad</label>
              <Select value={item.unit || ''} onValueChange={(v) => onItemChange(index, 'unit', v)}>
                <SelectTrigger className="h-9 bg-gray-50/50 border-gray-200"><SelectValue placeholder="Ud." /></SelectTrigger>
                <SelectContent>{MATERIAL_UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {/* Col 7-9: Precio (AMPLIADO a 3 columnas para Tablets) */}
            <div className="col-span-3 space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 flex items-center gap-1">
                <Calculator className="w-3 h-3" /> Precio
              </label>
              <div className="relative">
                <span className="absolute left-2.5 top-2.5 text-xs text-gray-400 font-medium">{currency === 'USD' ? '$' : 'Bs'}</span>
                <Input
                  type="number" step="0.01" min="0"
                  value={item.unit_price || ''}
                  onChange={(e) => onItemChange(index, 'unit_price', e.target.value === '' ? 0 : parseFloat(e.target.value))}
                  className="h-9 pl-6 text-right font-semibold bg-gray-50/30 border-gray-200"
                  placeholder="0"
                  onWheel={(e) => e.currentTarget.blur()}
                />
              </div>
            </div>

            {/* Col 10-11: Código Prov. */}
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

            {/* Col 1-2: Descuento */}
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
                />
                <span className="absolute right-2.5 top-2.5 text-xs text-gray-400">%</span>
              </div>
            </div>

            {/* Col 3-4: Margen */}
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
          <Button variant="outline" size="sm" onClick={() => setIsAddMaterialDialogOpen(true)} disabled={!supplierId} className="text-xs">
            <PlusCircle className="mr-2 h-3.5 w-3.5" /> Crear Producto
          </Button>
        </div>
      )}

      {isMobile ? (
        <div className="space-y-4">
          {items.map(renderMobileItem)}
          {!hideHeader && (
            <Button variant="outline" onClick={onAddItem} className="w-full h-12 border-dashed">
              <PlusCircle className="mr-2 h-4 w-4" /> Añadir Ítem
            </Button>
          )}
        </div>
      ) : (
        <>
          <Accordion type="multiple" className="w-full" defaultValue={items.map((_, i) => `item-${i}`)}>
            {items.map(renderDesktopAccordionItem)}
          </Accordion>

          {!hideHeader && (
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
      />
    </div>
  );
};

export default PurchaseOrderItemsTable;