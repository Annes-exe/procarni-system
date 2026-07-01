import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlusCircle, Trash2, Search, StickyNote, Hash } from 'lucide-react';
import SmartSearch from '@/components/SmartSearch';
import { searchMaterials, getAllUnits, searchMaterialsBySupplier } from '@/integrations/supabase/data';
import { useQuery } from '@tanstack/react-query';
import { useIsMobile } from '@/hooks/use-mobile';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import MaterialCreationDialog from '@/components/MaterialCreationDialog';

export interface QuoteRequestItemForm {
    id?: string;
    material_name: string;
    quantity: number;
    unit?: string;
    unit_id?: string; // ADDED
    description?: string;
    material_id?: string; // Added for name update propagation
    last_price_info?: string; // NEW: information about last purchase price
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


interface QuoteRequestItemsTableProps {
    items: QuoteRequestItemForm[];
    supplierId?: string;
    supplierName?: string;
    supplierIds?: string[];
    onAddItem: () => void;
    onRemoveItem: (index: number) => void;
    onItemChange: (index: number, field: keyof QuoteRequestItemForm, value: any) => void;
    onMaterialSelect: (index: number, material: MaterialSearchResult) => void;
}

const QuoteRequestItemsTable: React.FC<QuoteRequestItemsTableProps> = ({
    items,
    supplierId,
    supplierName,
    supplierIds,
    onAddItem,
    onRemoveItem,
    onItemChange,
    onMaterialSelect,
}) => {
    const isMobile = useIsMobile();

    const [isAddMaterialDialogOpen, setIsAddMaterialDialogOpen] = React.useState(false);
    const [materialNameToCreate, setMaterialNameToCreate] = React.useState('');
    const [activeItemIndex, setActiveItemIndex] = React.useState<number | null>(null);

    const { data: units = [], isLoading: isLoadingUnits } = useQuery({
        queryKey: ['units_of_measure'],
        queryFn: getAllUnits,
    });

    const fetchMaterials = React.useCallback(async (query: string) => {
        const hasSuppliers = supplierId || (supplierIds && supplierIds.length > 0);
        if (!hasSuppliers) {
            const all = await searchMaterials(query);
            return all.map(m => ({ ...m, group: 'Otros Materiales' }));
        }

        const ids = supplierId ? [supplierId] : (supplierIds || []);
        
        const associatedPromises = ids.map(id => searchMaterialsBySupplier(id, query));
        const associatedResults = await Promise.all(associatedPromises);
        
        const associatedMap = new Map<string, any>();
        associatedResults.forEach(list => {
            list.forEach(m => {
                associatedMap.set(m.id, m);
            });
        });

        const all = await searchMaterials(query);

        const results: any[] = [];
        associatedMap.forEach(m => {
            results.push({ ...m, group: 'Sugeridos' });
        });

        all.forEach(m => {
            if (!associatedMap.has(m.id)) {
                results.push({ ...m, group: 'Otros Materiales' });
            }
        });

        return results;
    }, [supplierId, supplierIds]);

    const handleMaterialAdded = (material: any) => {
        if (activeItemIndex !== null) {
            onMaterialSelect(activeItemIndex, {
                id: material.id,
                name: material.name,
                code: material.code || 'N/A',
                unit_id: material.unit_id || undefined,
                unit: material.unit || undefined,
                is_exempt: material.is_exempt || false,
                specification: material.specification || undefined
            });
        }
        setIsAddMaterialDialogOpen(false);
        setMaterialNameToCreate('');
        setActiveItemIndex(null);
    };

    // --- VISTA MÓVIL: TARJETAS ---
    const renderMobileItem = (item: QuoteRequestItemForm, index: number) => {
        return (
            <div key={index} className="bg-white border rounded-lg shadow-sm p-4 space-y-4 relative mb-4">
                <div className="flex justify-between items-start border-b pb-3">
                    <div className="w-[85%]">
                        <label className="text-xs font-bold text-muted-foreground uppercase mb-1 block">Material</label>
                        <SmartSearch
                            placeholder="Buscar material..."
                            onSelect={(material) => onMaterialSelect(index, material as MaterialSearchResult)}
                            fetchFunction={fetchMaterials}
                            displayValue={item.material_name}
                            className="w-full"
                            onCreateItem={(query) => {
                                setMaterialNameToCreate(query);
                                setActiveItemIndex(index);
                                setIsAddMaterialDialogOpen(true);
                            }}
                        />
                        {item.last_price_info && (
                            <p className="text-[10px] text-procarni-secondary font-medium mt-1">
                                {item.last_price_info}
                            </p>
                        )}
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => onRemoveItem(index)} className="text-destructive h-8 w-8 -mr-2">
                        <Trash2 className="h-5 w-5" />
                    </Button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Cantidad</label>
                        <Input type="number" value={item.quantity || ''} onChange={(e) => onItemChange(index, 'quantity', e.target.value === '' ? 0 : parseFloat(e.target.value))} className="h-9" placeholder="0" onWheel={(e) => e.currentTarget.blur()} />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Unidad</label>
                        <Select 
                            value={item.unit_id} 
                            onValueChange={(v) => {
                                const unit = units.find(u => u.id === v);
                                onItemChange(index, 'unit_id', v);
                                if (unit) onItemChange(index, 'unit', unit.name);
                            }}
                        >
                            <SelectTrigger className="h-9">
                                <SelectValue placeholder={isLoadingUnits ? "..." : "Ud."} />
                            </SelectTrigger>
                            <SelectContent>
                                {units.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                            </SelectContent>
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
                                {item.last_price_info && (
                                    <span className="text-[10px] text-procarni-secondary font-medium animate-in fade-in slide-in-from-left-1">
                                        {item.last_price_info}
                                    </span>
                                )}
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
                                    <Button variant="outline" size="icon" className="h-9 w-9 shrink-0 border-dashed border-gray-300 hover:border-procarni-primary hover:text-procarni-primary">
                                        <Search className="h-4 w-4" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[300px] p-2" align="start">
                                    <div className="space-y-2">
                                        <h4 className="font-medium text-sm text-muted-foreground mb-1">Buscar Material</h4>
                                        <SmartSearch
                                            placeholder="Escribe para buscar..."
                                            onSelect={(material) => onMaterialSelect(index, material as MaterialSearchResult)}
                                            fetchFunction={fetchMaterials}
                                            displayValue=""
                                            autoFocus={true}
                                            className="w-full"
                                            onCreateItem={(query) => {
                                                setMaterialNameToCreate(query);
                                                setActiveItemIndex(index);
                                                setIsAddMaterialDialogOpen(true);
                                            }}
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
                                value={item.quantity || ''}
                                onChange={(e) => onItemChange(index, 'quantity', e.target.value === '' ? 0 : parseFloat(e.target.value))}
                                className="h-9 font-medium border-gray-200"
                                placeholder="0"
                                onWheel={(e) => e.currentTarget.blur()}
                            />
                        </div>

                        {/* Col 4-5: Unidad */}
                        <div className="col-span-2 space-y-1.5">
                            <label className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Unidad</label>
                            <Select 
                                value={item.unit_id} 
                                onValueChange={(v) => {
                                    const unit = units.find(u => u.id === v);
                                    onItemChange(index, 'unit_id', v);
                                    if (unit) onItemChange(index, 'unit', unit.name);
                                }}
                            >
                                <SelectTrigger className="h-9 bg-gray-50/50 border-gray-200">
                                    <SelectValue placeholder={isLoadingUnits ? "..." : "Ud."} />
                                </SelectTrigger>
                                <SelectContent>
                                    {units.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                                </SelectContent>
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

    const [expandedItems, setExpandedItems] = React.useState<string[]>([]);

    // Sincronizar items expandidos cuando cambia la longitud de la lista
    React.useEffect(() => {
        setExpandedItems(items.map((_, i) => `item-${i}`));
    }, [items.length]);

    return (
        <div className="space-y-4">
            {isMobile ? (
                <div className="space-y-4">
                    {items.map(renderMobileItem)}
                    <Button variant="outline" onClick={onAddItem} className="w-full h-12 border-dashed">
                        <PlusCircle className="mr-2 h-4 w-4" /> Añadir Ítem
                    </Button>
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

                    <Button
                        variant="outline"
                        onClick={onAddItem}
                        className="w-full py-8 border-dashed border-gray-300 text-gray-500 hover:text-procarni-primary hover:border-procarni-primary/50 hover:bg-procarni-primary/5 transition-all mt-4 group"
                    >
                        <div className="flex flex-col items-center gap-1">
                            <PlusCircle className="h-6 w-6 group-hover:scale-110 transition-transform" />
                            <span className="text-sm font-medium">Añadir nueva línea de presupuesto</span>
                        </div>
                    </Button>
                </>
            )}

            <MaterialCreationDialog
                isOpen={isAddMaterialDialogOpen}
                onClose={() => {
                    setIsAddMaterialDialogOpen(false);
                    setMaterialNameToCreate('');
                    setActiveItemIndex(null);
                }}
                onMaterialCreated={handleMaterialAdded}
                supplierId={supplierId}
                supplierName={supplierName}
                initialName={materialNameToCreate}
            />
        </div>
    );
};

export default QuoteRequestItemsTable;
