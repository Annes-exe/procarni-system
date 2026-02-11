import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlusCircle, Trash2, Search, StickyNote, Hash } from 'lucide-react';
import SmartSearch from '@/components/SmartSearch';
import { searchMaterialsBySupplier } from '@/integrations/supabase/data';
import MaterialCreationDialog from '@/components/MaterialCreationDialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';

interface QuoteRequestItemForm {
    id?: string;
    material_name: string;
    quantity: number;
    unit?: string;
    description?: string;
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

interface QuoteRequestItemsTableProps {
    items: QuoteRequestItemForm[];
    supplierId: string;
    supplierName: string;
    onAddItem: () => void;
    onRemoveItem: (index: number) => void;
    onItemChange: (index: number, field: keyof QuoteRequestItemForm, value: any) => void;
    onMaterialSelect: (index: number, material: MaterialSearchResult) => void;
}

const QuoteRequestItemsTable: React.FC<QuoteRequestItemsTableProps> = ({
    items,
    supplierId,
    supplierName,
    onAddItem,
    onRemoveItem,
    onItemChange,
    onMaterialSelect,
}) => {
    const [isAddMaterialDialogOpen, setIsAddMaterialDialogOpen] = useState(false);
    const isMobile = useIsMobile();

    const searchSupplierMaterials = React.useCallback(async (query: string) => {
        if (!supplierId) return [];
        return searchMaterialsBySupplier(supplierId, query);
    }, [supplierId]);

    const handleMaterialAdded = (material: any) => {
        // Lógica post-creación si es necesaria
    };

    // --- VISTA MÓVIL: TARJETAS ---
    const renderMobileItem = (item: QuoteRequestItemForm, index: number) => {
        return (
            <div key={index} className="bg-white border rounded-lg shadow-sm p-4 space-y-4 relative mb-4">
                <div className="flex justify-between items-start border-b pb-3">
                    <div className="w-[85%]">
                        <label className="text-xs font-bold text-muted-foreground uppercase mb-1 block">Material</label>
                        <SmartSearch
                            placeholder={supplierId ? "Buscar material..." : "Selecciona prov."}
                            onSelect={(material) => onMaterialSelect(index, material as MaterialSearchResult)}
                            fetchFunction={searchSupplierMaterials}
                            displayValue={item.material_name}
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
                        <label className="text-xs text-muted-foreground">Cantidad</label>
                        <Input type="number" value={item.quantity} onChange={(e) => onItemChange(index, 'quantity', parseFloat(e.target.value))} className="h-9" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Unidad</label>
                        <Select value={item.unit} onValueChange={(v) => onItemChange(index, 'unit', v)}>
                            <SelectTrigger className="h-9"><SelectValue placeholder="Ud." /></SelectTrigger>
                            <SelectContent>{MATERIAL_UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Descripción / Especificaciones</label>
                    <Textarea
                        value={item.description || ''}
                        onChange={(e) => onItemChange(index, 'description', e.target.value)}
                        className="min-h-[60px] resize-none text-sm"
                        placeholder="Detalles adicionales..."
                    />
                </div>
            </div>
        );
    };

    // --- VISTA DESKTOP: ACORDEÓN ---
    const renderDesktopAccordionItem = (item: QuoteRequestItemForm, index: number) => {
        return (
            <AccordionItem key={index} value={`item-${index}`} className="group border rounded-lg bg-white shadow-sm mb-3 overflow-hidden transition-all duration-200 hover:shadow-md hover:border-gray-300">

                {/* HEADER: Resumen del Ítem */}
                <AccordionTrigger className="px-5 py-3 hover:bg-gray-50/50 hover:no-underline data-[state=open]:bg-gray-50/80 data-[state=open]:border-b">
                    <div className="flex justify-between items-center w-full pr-6">
                        <div className="flex items-center gap-3 overflow-hidden">
                            <div className={`h-8 w-1 rounded-full ${item.material_name ? 'bg-procarni-primary' : 'bg-gray-300'}`}></div>
                            <div className="flex flex-col items-start text-left min-w-0">
                                <span className={`font-semibold text-sm truncate max-w-[400px] ${!item.material_name && 'text-muted-foreground italic'}`}>
                                    {item.material_name || "Seleccionar material..."}
                                </span>
                                {item.material_name && (
                                    <div className="flex gap-2 text-[10px] text-muted-foreground">
                                        {item.quantity > 0 && <span>{item.quantity} {item.unit}</span>}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-6">
                            {/* Espacio para badge o estado si fuera necesario */}
                            <div className="text-right">
                                {/* Espacio para totales si fuera necesario */}
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
                                            disabled={!supplierId}
                                            autoFocus={true}
                                            className="w-full"
                                        />
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>

                        {/* Col 2-3: Cantidad */}
                        <div className="col-span-2 space-y-1.5">
                            <label className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Cantidad</label>
                            <Input
                                type="number" min="0"
                                value={item.quantity}
                                onChange={(e) => onItemChange(index, 'quantity', parseFloat(e.target.value))}
                                className="h-9 font-medium border-gray-200"
                            />
                        </div>

                        {/* Col 4-5: Unidad */}
                        <div className="col-span-2 space-y-1.5">
                            <label className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Unidad</label>
                            <Select value={item.unit} onValueChange={(v) => onItemChange(index, 'unit', v)}>
                                <SelectTrigger className="h-9 bg-gray-50/50 border-gray-200"><SelectValue placeholder="Ud." /></SelectTrigger>
                                <SelectContent>{MATERIAL_UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>

                        {/* Col 6-11: Descripción */}
                        <div className="col-span-6 space-y-1.5">
                            <label className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 flex items-center gap-1">
                                <StickyNote className="w-3 h-3" /> Especificaciones / Notas
                            </label>
                            <Textarea
                                value={item.description || ''}
                                onChange={(e) => onItemChange(index, 'description', e.target.value)}
                                className="min-h-[38px] h-[38px] resize-none border-gray-200 focus:bg-white"
                                placeholder="Detalles adicionales..."
                            />
                        </div>


                        {/* Col 12: Eliminar */}
                        <div className="col-span-1 flex items-end justify-center pb-0.5">
                            <Button variant="ghost" size="icon" onClick={() => onRemoveItem(index)} className="h-9 w-9 text-gray-400 hover:text-red-600 hover:bg-red-50">
                                <Trash2 className="h-4 w-4" />
                            </Button>
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
                    Ítems de la Solicitud
                </h3>
                <Button variant="outline" size="sm" onClick={() => setIsAddMaterialDialogOpen(true)} disabled={!supplierId} className="text-xs">
                    <PlusCircle className="mr-2 h-3.5 w-3.5" /> Crear Producto
                </Button>
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

export default QuoteRequestItemsTable;
