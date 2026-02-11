import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { PlusCircle, Trash2, Calculator, StickyNote } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Textarea } from '@/components/ui/textarea';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

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

  // --- VISTA MÓVIL: TARJETAS ---
  const renderMobileItem = (item: ServiceOrderItemForm, index: number) => {
    const { subtotal, itemIva, totalItem } = calculateItemTotals(item);

    return (
      <div key={index} className="bg-white border rounded-lg shadow-sm p-4 space-y-4 relative mb-4">
        <div className="flex justify-between items-start border-b pb-3">
          <div className="w-[85%]">
            <label className="text-xs font-bold text-muted-foreground uppercase mb-1 block">Descripción del Servicio</label>
            <Textarea
              value={item.description || ''}
              onChange={(e) => onItemChange(index, 'description', e.target.value)}
              placeholder="Descripción..."
              className="min-h-[60px] resize-none"
            />
          </div>
          <Button variant="ghost" size="icon" onClick={() => onRemoveItem(index)} className="text-destructive h-8 w-8 -mr-2">
            <Trash2 className="h-5 w-5" />
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Cantidad</label>
            <Input type="number" value={item.quantity} onChange={(e) => onItemChange(index, 'quantity', parseFloat(e.target.value))} className="h-9" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Precio ({currency})</label>
            <Input type="number" step="0.01" value={item.unit_price} onChange={(e) => onItemChange(index, 'unit_price', parseFloat(e.target.value))} className="h-9" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Desc %</label>
            <Input type="number" value={item.discount_percentage || ''} onChange={(e) => onItemChange(index, 'discount_percentage', parseFloat(e.target.value))} className="h-9" placeholder="0" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Venta %</label>
            <Input type="number" value={item.sales_percentage || ''} onChange={(e) => onItemChange(index, 'sales_percentage', parseFloat(e.target.value))} className="h-9" placeholder="0" />
          </div>
        </div>

        <div className="bg-gray-50 p-3 rounded-md border border-gray-100 mt-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Exento de IVA</span>
            <Switch checked={item.is_exempt} onCheckedChange={(c) => onItemChange(index, 'is_exempt', c)} />
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

  // --- VISTA DESKTOP: ACORDEÓN ---
  const renderDesktopAccordionItem = (item: ServiceOrderItemForm, index: number) => {
    const { subtotal, itemIva, totalItem } = calculateItemTotals(item);

    return (
      <AccordionItem key={index} value={`item-${index}`} className="group border rounded-lg bg-white shadow-sm mb-3 overflow-hidden transition-all duration-200 hover:shadow-md hover:border-gray-300">

        {/* HEADER: Resumen del Ítem */}
        <AccordionTrigger className="px-5 py-3 hover:bg-gray-50/50 hover:no-underline data-[state=open]:bg-gray-50/80 data-[state=open]:border-b">
          <div className="flex justify-between items-center w-full pr-6">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className={`h-8 w-1 rounded-full ${item.description ? 'bg-procarni-primary' : 'bg-gray-300'}`}></div>
              <div className="flex flex-col items-start text-left min-w-0">
                <span className={`font-semibold text-sm truncate max-w-[400px] ${!item.description && 'text-muted-foreground italic'}`}>
                  {item.description || "Nueva línea de servicio..."}
                </span>
                {item.quantity > 0 && (
                  <div className="flex gap-2 text-[10px] text-muted-foreground">
                    <span>Cant: {item.quantity}</span>
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

            {/* Col 1-6: Descripción */}
            <div className="col-span-6 space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 flex items-center gap-1">
                <StickyNote className="w-3 h-3" /> Descripción
              </label>
              <Textarea
                value={item.description || ''}
                onChange={(e) => onItemChange(index, 'description', e.target.value)}
                className="min-h-[38px] h-[38px] resize-none border-gray-200 focus:bg-white"
                placeholder="Detalle del servicio o costo..."
              />
            </div>

            {/* Col 7-9: Cantidad */}
            <div className="col-span-3 space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Cantidad</label>
              <Input
                type="number" min="0"
                value={item.quantity}
                onChange={(e) => onItemChange(index, 'quantity', parseFloat(e.target.value))}
                className="h-9 font-medium border-gray-200"
              />
            </div>

            {/* Col 10-12: Precio */}
            <div className="col-span-3 space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 flex items-center gap-1">
                <Calculator className="w-3 h-3" /> Precio
              </label>
              <div className="relative">
                <span className="absolute left-2.5 top-2.5 text-xs text-gray-400 font-medium">{currency === 'USD' ? '$' : 'Bs'}</span>
                <Input
                  type="number" step="0.01" min="0"
                  value={item.unit_price}
                  onChange={(e) => onItemChange(index, 'unit_price', parseFloat(e.target.value))}
                  className="h-9 pl-6 text-right font-semibold bg-gray-50/30 border-gray-200"
                />
              </div>
            </div>


            {/* --- SEPARADOR --- */}
            <div className="col-span-12 py-1">
              <Separator className="bg-gray-100" />
            </div>

            {/* --- FILA 2: DETALLES FINANCIEROS Y ACCIONES --- */}

            {/* Col 1-2: Descuento */}
            <div className="col-span-2 space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Desc.</label>
              <div className="relative">
                <Input
                  type="number" min="0" max="100"
                  value={item.discount_percentage || ''}
                  onChange={(e) => onItemChange(index, 'discount_percentage', parseFloat(e.target.value))}
                  className="h-9 text-right pr-6 bg-gray-50/30 border-gray-200"
                  placeholder="0"
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
                  onChange={(e) => onItemChange(index, 'sales_percentage', parseFloat(e.target.value))}
                  className="h-9 text-right pr-6 bg-gray-50/30 border-gray-200"
                  placeholder="0"
                />
                <span className="absolute right-2.5 top-2.5 text-xs text-gray-400">%</span>
              </div>
            </div>

            {/* Col 5-6: Switch Exento */}
            <div className="col-span-2 space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 block">Exento IVA</label>
              <div className="flex items-center justify-between bg-gray-50 px-2 rounded-md border border-gray-100 hover:border-gray-200 transition-colors cursor-pointer h-9 w-full" onClick={() => onItemChange(index, 'is_exempt', !item.is_exempt)}>
                <span className="text-[10px] font-medium text-gray-600 select-none">Sí/No</span>
                <Switch
                  checked={item.is_exempt}
                  onCheckedChange={(c) => onItemChange(index, 'is_exempt', c)}
                  className="scale-75 origin-right data-[state=checked]:bg-orange-500"
                />
              </div>
            </div>

            {/* Col 7-11: Espacio vacío (o futuro uso) */}
            <div className="col-span-5"></div>


            {/* Col 12: Eliminar */}
            <div className="col-span-1 flex items-end justify-center pb-0.5">
              <Button variant="ghost" size="icon" onClick={() => onRemoveItem(index)} className="h-9 w-9 text-gray-400 hover:text-red-600 hover:bg-red-50">
                <Trash2 className="h-4 w-4" />
              </Button>
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
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-lg font-semibold flex items-center gap-2 text-gray-800">
          Ítems de Costo/Servicio
        </h3>
        {/*
        <Button variant="outline" size="sm" onClick={onAddItem} className="text-xs">
          <PlusCircle className="mr-2 h-3.5 w-3.5" /> Nuevo Ítem
        </Button>
        */}
      </div>

      {isMobile ? (
        <div className="space-y-4">
          {items.map(renderMobileItem)}
          <Button variant="outline" onClick={onAddItem} className="w-full h-12 border-dashed">
            <PlusCircle className="mr-2 h-4 w-4" /> Añadir Ítem
          </Button>
        </div>
      ) : (
        <>
          <Accordion type="multiple" className="w-full" defaultValue={items.map((_, i) => `item-${i}`)}>
            {items.map(renderDesktopAccordionItem)}
          </Accordion>

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
        </>
      )}
    </div>
  );
};

export default ServiceOrderItemsTable;