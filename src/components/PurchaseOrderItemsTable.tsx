import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { PlusCircle, Trash2, CheckCircle } from 'lucide-react'; // Import CheckCircle
import SmartSearch from '@/components/SmartSearch';
import { searchMaterialsBySupplier } from '@/integrations/supabase/data';
import MaterialCreationDialog from '@/components/MaterialCreationDialog';
import { useIsMobile } from '@/hooks/use-mobile'; // Importar hook de móvil
import { Textarea } from '@/components/ui/textarea'; // Import Textarea

interface PurchaseOrderItemForm {
  id?: string;
  material_id?: string; // NEW: Added material_id
  material_name: string;
  supplier_code?: string;
  quantity: number;
  unit_price: number;
  tax_rate?: number;
  is_exempt?: boolean;
  unit?: string;
  description?: string; // ADDED
  sales_percentage?: number; // NEW
  discount_percentage?: number; // NEW
}

interface MaterialSearchResult {
  id: string;
  name: string;
  code: string;
  category?: string;
  unit?: string;
  is_exempt?: boolean;
  specification?: string; // Added specification field
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
  onItemChange: (index: number, field: keyof PurchaseOrderItemForm, value: any) => void;
  onMaterialSelect: (index: number, material: MaterialSearchResult) => void;
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
}) => {
  const [isAddMaterialDialogOpen, setIsAddMaterialDialogOpen] = useState(false);
  const isMobile = useIsMobile();

  // Memoize the search function so it only changes when supplierId changes
  const searchSupplierMaterials = React.useCallback(async (query: string) => {
    if (!supplierId) return [];
    return searchMaterialsBySupplier(supplierId, query);
  }, [supplierId]);

  // Updated signature to match MaterialCreationDialog callback
  const handleMaterialAdded = (material: { id: string; name: string; unit?: string; is_exempt?: boolean; specification?: string }) => {
    // Since the material is created and associated immediately in the dialog (because supplierId is present), 
    // we rely on the user searching/selecting it via SmartSearch.
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

    return {
      subtotal: itemValue,
      discountAmount: discountAmount,
      salesAmount: salesAmount,
      itemIva: itemIva,
      totalItem: totalItem,
    };
  };

  const renderItemRow = (item: PurchaseOrderItemForm, index: number) => {
    const { subtotal, discountAmount, salesAmount, itemIva, totalItem } = calculateItemTotals(item);
    const isMaterialSelected = !!item.material_id; // Check if material ID is present

    if (isMobile) {
      return (
        <div key={index} className="border rounded-md p-3 space-y-3 bg-white shadow-sm">
          <div className="flex justify-between items-center border-b pb-2">
            <h4 className="font-semibold text-procarni-primary truncate flex items-center">
              {item.material_name || 'Nuevo Ítem'}
            </h4>
            <div className="flex gap-1">
              <Button variant="outline" size="icon" onClick={() => setIsAddMaterialDialogOpen(true)} disabled={!supplierId} className="h-8 w-8">
                <PlusCircle className="h-4 w-4" />
              </Button>
              <Button variant="destructive" size="icon" onClick={() => onRemoveItem(index)} className="h-8 w-8">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="space-y-1 col-span-2">
              <label className="text-xs font-medium text-muted-foreground flex items-center">
                Producto
                {isMaterialSelected && <CheckCircle className="ml-2 h-4 w-4 text-green-600" />}
              </label>
              <SmartSearch
                placeholder={supplierId ? "Buscar material asociado" : "Selecciona proveedor"}
                onSelect={(material) => onMaterialSelect(index, material as MaterialSearchResult)}
                fetchFunction={searchSupplierMaterials}
                displayValue={item.material_name}
                selectedId={item.material_id} // Pass selected ID
                disabled={!supplierId}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Código Prov.</label>
              <Input
                type="text"
                value={item.supplier_code || ''}
                onChange={(e) => onItemChange(index, 'supplier_code', e.target.value)}
                placeholder="Cód. Prov."
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Cantidad</label>
              <Input
                type="number"
                value={item.quantity}
                onChange={(e) => onItemChange(index, 'quantity', parseFloat(e.target.value))}
                min="0"
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Unidad</label>
              <Select value={item.unit} onValueChange={(value) => onItemChange(index, 'unit', value)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Unidad" />
                </SelectTrigger>
                <SelectContent>
                  {MATERIAL_UNITS.map(unitOption => (
                    <SelectItem key={unitOption} value={unitOption}>{unitOption}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Precio Unit. ({currency})</label>
              <Input
                type="number"
                step="0.01"
                value={item.unit_price}
                onChange={(e) => onItemChange(index, 'unit_price', parseFloat(e.target.value))}
                min="0"
                className="h-9"
              />
            </div>
            
            {/* NEW FIELDS */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Desc. (%)</label>
              <Input
                type="number"
                step="0.01"
                value={item.discount_percentage || ''}
                onChange={(e) => onItemChange(index, 'discount_percentage', parseFloat(e.target.value) || undefined)}
                min="0"
                max="100"
                placeholder="0%"
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Venta (%)</label>
              <Input
                type="number"
                step="0.01"
                value={item.sales_percentage || ''}
                onChange={(e) => onItemChange(index, 'sales_percentage', parseFloat(e.target.value) || undefined)}
                min="0"
                placeholder="0%"
                className="h-9"
              />
            </div>
            {/* END NEW FIELDS */}

            <div className="space-y-1 col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Descripción Adicional</label>
              <Textarea
                value={item.description || ''}
                onChange={(e) => onItemChange(index, 'description', e.target.value)}
                placeholder="Detalles adicionales del ítem"
                rows={2}
              />
            </div>
            <div className="flex flex-col justify-end">
              <div className="flex items-center justify-between p-2 border rounded-md">
                <label className="text-xs font-medium text-muted-foreground">Exento IVA</label>
                <Switch
                  checked={item.is_exempt}
                  onCheckedChange={(checked) => onItemChange(index, 'is_exempt', checked)}
                  disabled={!item.material_name}
                />
              </div>
            </div>
          </div>
          
          <div className="flex flex-col pt-2 border-t mt-3 text-right">
            <span className="text-xs text-muted-foreground">Subtotal: {currency} {subtotal.toFixed(2)}</span>
            {discountAmount > 0 && <span className="text-xs text-red-600">Descuento: -{currency} {discountAmount.toFixed(2)}</span>}
            {salesAmount > 0 && <span className="text-xs text-blue-600">Venta: +{currency} {salesAmount.toFixed(2)}</span>}
            {itemIva > 0 && <span className="text-xs text-muted-foreground">IVA: +{currency} {itemIva.toFixed(2)}</span>}
            <span className="font-bold text-sm mt-1">Total Ítem: {currency} {totalItem.toFixed(2)}</span>
          </div>
        </div>
      );
    }

    // Desktop/Tablet View (Original Table)
    return (
      <tr key={index}>
        <td className="px-2 py-2 whitespace-nowrap flex items-center w-[15%] min-w-[180px]">
          <SmartSearch
            placeholder={supplierId ? "Buscar material asociado" : "Selecciona proveedor"}
            onSelect={(material) => onMaterialSelect(index, material as MaterialSearchResult)}
            fetchFunction={searchSupplierMaterials}
            displayValue={item.material_name}
            selectedId={item.material_id} // Pass selected ID
            disabled={!supplierId}
          />
          {isMaterialSelected && <CheckCircle className="ml-2 h-4 w-4 text-green-600" />}
        </td>
        <td className="px-2 py-2 whitespace-nowrap w-[6%] min-w-[80px]">
          <Input
            type="text"
            value={item.supplier_code || ''}
            onChange={(e) => onItemChange(index, 'supplier_code', e.target.value)}
            placeholder="Cód. Prov."
            className="h-8"
          />
        </td>
        <td className="px-2 py-2 whitespace-nowrap w-[6%] min-w-[70px]">
          <Input
            type="number"
            value={item.quantity}
            onChange={(e) => onItemChange(index, 'quantity', parseFloat(e.target.value))}
            min="0"
            className="h-8 w-full"
          />
        </td>
        <td className="px-2 py-2 whitespace-nowrap w-[6%] min-w-[70px]">
          <Select value={item.unit} onValueChange={(value) => onItemChange(index, 'unit', value)}>
            <SelectTrigger className="h-8">
              <SelectValue placeholder="Unidad" />
            </SelectTrigger>
            <SelectContent>
              {MATERIAL_UNITS.map(unitOption => (
                <SelectItem key={unitOption} value={unitOption}>{unitOption}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </td>
        <td className="px-2 py-2 whitespace-nowrap w-[8%] min-w-[100px]">
          <Input
            type="number"
            step="0.01"
            value={item.unit_price}
            onChange={(e) => onItemChange(index, 'unit_price', parseFloat(e.target.value))}
            min="0"
            className="h-8 w-full min-w-[80px]"
          />
        </td>
        {/* NEW COLUMNS: Discount % and Sales % */}
        <td className="px-2 py-2 whitespace-nowrap w-[6%] min-w-[80px]">
          <Input
            type="number"
            step="0.01"
            value={item.discount_percentage || ''}
            onChange={(e) => onItemChange(index, 'discount_percentage', parseFloat(e.target.value) || undefined)}
            min="0"
            max="100"
            placeholder="0%"
            className="h-8 w-full"
          />
        </td>
        <td className="px-2 py-2 whitespace-nowrap w-[6%] min-w-[80px]">
          <Input
            type="number"
            step="0.01"
            value={item.sales_percentage || ''}
            onChange={(e) => onItemChange(index, 'sales_percentage', parseFloat(e.target.value) || undefined)}
            min="0"
            placeholder="0%"
            className="h-8 w-full"
          />
        </td>
        {/* END NEW COLUMNS */}
        <td className="px-2 py-2 whitespace-nowrap text-right text-sm font-medium w-[8%] min-w-[100px]">
          {currency} {subtotal.toFixed(2)}
        </td>
        <td className="px-2 py-2 whitespace-nowrap text-center text-sm w-[6%] min-w-[80px]">
          {currency} {itemIva.toFixed(2)}
        </td>
        <td className="px-2 py-2 whitespace-nowrap text-center w-[6%] min-w-[80px]">
          <Switch
            checked={item.is_exempt}
            onCheckedChange={(checked) => onItemChange(index, 'is_exempt', checked)}
            disabled={!item.material_name}
          />
        </td>
        <td className="px-2 py-2 whitespace-nowrap w-[15%] min-w-[150px]">
          <Textarea
            value={item.description || ''}
            onChange={(e) => onItemChange(index, 'description', e.target.value)}
            placeholder="Detalles adicionales"
            rows={1}
            className="h-8 min-h-8"
          />
        </td>
        <td className="px-2 py-2 whitespace-nowrap text-right w-[8%] min-w-[100px]">
          <Button variant="outline" size="icon" onClick={() => setIsAddMaterialDialogOpen(true)} disabled={!supplierId} className="h-8 w-8 mr-1">
            <PlusCircle className="h-4 w-4" />
          </Button>
          <Button variant="destructive" size="icon" onClick={() => onRemoveItem(index)} className="h-8 w-8">
            <Trash2 className="h-4 w-4" />
          </Button>
        </td>
      </tr>
    );
  };

  return (
    <>
      <h3 className="text-lg font-semibold mb-4">Ítems de la Orden</h3>
      <div className="overflow-x-auto">
        {isMobile ? (
          <div className="space-y-4">
            {items.map(renderItemRow)}
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[15%] min-w-[180px]">Producto</th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[6%] min-w-[80px]">Cód. Prov.</th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[6%] min-w-[70px]">Cant.</th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[6%] min-w-[70px]">Unidad</th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[8%] min-w-[100px]">P. Unit.</th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[6%] min-w-[80px]">Desc. (%)</th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[6%] min-w-[80px]">Venta (%)</th>
                <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-[8%] min-w-[100px]">Monto</th>
                <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-[6%] min-w-[80px]">IVA</th>
                <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-[6%] min-w-[80px]">Exento</th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[15%] min-w-[150px]">Descripción</th>
                <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-[8%] min-w-[100px]">Acción</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {items.map(renderItemRow)}
            </tbody>
          </table>
        )}
      </div>
      <div className="flex justify-between mt-4">
        <Button variant="outline" onClick={onAddItem} className="w-full mr-2">
          <PlusCircle className="mr-2 h-4 w-4" /> Añadir Ítem
        </Button>
      </div>
      <MaterialCreationDialog
        isOpen={isAddMaterialDialogOpen}
        onClose={() => setIsAddMaterialDialogOpen(false)}
        onMaterialCreated={handleMaterialAdded}
        supplierId={supplierId}
        supplierName={supplierName}
      />
    </>
  );
};

export default PurchaseOrderItemsTable;