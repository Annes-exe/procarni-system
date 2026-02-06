// src/components/ServiceOrderItemsTable.tsx

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { PlusCircle, Trash2 } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Textarea } from '@/components/ui/textarea';

interface ServiceOrderItemForm {
  id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate?: number;
  is_exempt?: boolean;
  sales_percentage?: number;
  discount_percentage?: number;
}

interface ServiceOrderItemsTableProps {
  items: ServiceOrderItemForm[];
  currency: 'USD' | 'VES';
  onAddItem: () => void;
  onRemoveItem: (index: number) => void;
  onItemChange: (index: number, field: keyof ServiceOrderItemForm, value: ServiceOrderItemForm[keyof ServiceOrderItemForm]) => void;
}

const ServiceOrderItemsTable: React.FC<ServiceOrderItemsTableProps> = ({
  items,
  currency,
  onAddItem,
  onRemoveItem,
  onItemChange,
}) => {
  const isMobile = useIsMobile();

  const calculateItemTotals = (item: ServiceOrderItemForm) => {
    const quantity = item.quantity ?? 0;
    const unitPrice = item.unit_price ?? 0;
    const itemValue = quantity * unitPrice;

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

  const renderItemRow = (item: ServiceOrderItemForm, index: number) => {
    const { subtotal, discountAmount, salesAmount, itemIva, totalItem } = calculateItemTotals(item);

    if (isMobile) {
      return (
        <div key={index} className="border rounded-md p-3 space-y-3 bg-white shadow-sm">
          <div className="flex justify-between items-center border-b pb-2">
            <h4 className="font-semibold text-procarni-primary truncate">
              Ítem {index + 1}: {item.description || 'Nuevo Costo'}
            </h4>
            <Button variant="destructive" size="icon" onClick={() => onRemoveItem(index)} className="h-8 w-8">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="space-y-1 col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Descripción del Costo/Servicio *</label>
              <Textarea
                value={item.description || ''}
                onChange={(e) => onItemChange(index, 'description', e.target.value)}
                placeholder="Descripción del costo o servicio"
                rows={2}
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
            <div className="flex flex-col justify-end col-span-2">
              <div className="flex items-center justify-between p-2 border rounded-md">
                <label className="text-xs font-medium text-muted-foreground">Exento IVA</label>
                <Switch
                  checked={item.is_exempt}
                  onCheckedChange={(checked) => onItemChange(index, 'is_exempt', checked)}
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
        <td className="px-2 py-2 w-[25%] min-w-[200px]">
          <Textarea
            value={item.description || ''}
            onChange={(e) => onItemChange(index, 'description', e.target.value)}
            placeholder="Descripción del costo o servicio"
            rows={1}
            className="h-8 min-h-8"
          />
        </td>
        <td className="px-2 py-2 whitespace-nowrap w-[8%] min-w-[100px]">
          <Input
            type="number"
            value={item.quantity}
            onChange={(e) => onItemChange(index, 'quantity', parseFloat(e.target.value))}
            min="0"
            className="h-8 w-full"
          />
        </td>
        <td className="px-2 py-2 whitespace-nowrap w-[10%] min-w-[100px]">
          <Input
            type="number"
            step="0.01"
            value={item.unit_price}
            onChange={(e) => onItemChange(index, 'unit_price', parseFloat(e.target.value))}
            min="0"
            className="h-8 w-full min-w-[80px]"
          />
        </td>
        <td className="px-2 py-2 whitespace-nowrap w-[8%] min-w-[80px]">
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
        <td className="px-2 py-2 whitespace-nowrap w-[8%] min-w-[80px]">
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
        <td className="px-2 py-2 whitespace-nowrap text-right text-sm font-medium w-[10%] min-w-[100px]">
          {currency} {subtotal.toFixed(2)}
        </td>
        <td className="px-2 py-2 whitespace-nowrap text-center text-sm w-[8%] min-w-[80px]">
          {currency} {itemIva.toFixed(2)}
        </td>
        <td className="px-2 py-2 whitespace-nowrap text-center w-[8%] min-w-[80px]">
          <Switch
            checked={item.is_exempt}
            onCheckedChange={(checked) => onItemChange(index, 'is_exempt', checked)}
          />
        </td>
        <td className="px-2 py-2 whitespace-nowrap text-right w-[15%] min-w-[100px]">
          <Button variant="destructive" size="icon" onClick={() => onRemoveItem(index)} className="h-8 w-8">
            <Trash2 className="h-4 w-4" />
          </Button>
        </td>
      </tr>
    );
  };

  return (
    <>
      <h3 className="text-lg font-semibold mb-4">Ítems de Costo/Servicio</h3>
      <div className="overflow-x-auto">
        {isMobile ? (
          <div className="space-y-4">
            {items.map(renderItemRow)}
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[25%] min-w-[200px]">Descripción</th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[8%] min-w-[100px]">Cant.</th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[10%] min-w-[100px]">P. Unit.</th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[8%] min-w-[80px]">Desc. (%)</th>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[8%] min-w-[80px]">Venta (%)</th>
                <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-[10%] min-w-[100px]">Monto</th>
                <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-[8%] min-w-[80px]">IVA</th>
                <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-[8%] min-w-[80px]">Exento</th>
                <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-[15%] min-w-[100px]">Acción</th>
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
          <PlusCircle className="mr-2 h-4 w-4" /> Añadir Ítem de Costo/Servicio
        </Button>
      </div>
    </>
  );
};

export default ServiceOrderItemsTable;