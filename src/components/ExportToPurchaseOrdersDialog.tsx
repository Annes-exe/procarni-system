import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, CalendarIcon, ArrowRight, Building, Truck } from 'lucide-react';
import { purchaseOrderService } from '@/services/purchaseOrderService';
import { getAllCompanies } from '@/integrations/supabase/data';
import { useSession } from '@/components/SessionContextProvider';
import { showError, showSuccess } from '@/utils/toast';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

interface QuoteEntry {
    supplierId: string;
    supplierName: string;
    unitPrice: number;
    currency: 'USD' | 'VES';
    exchangeRate?: number;
    convertedPrice: number | null;
    isValid: boolean;
}

interface MaterialSearchResult {
    id: string;
    name: string;
    code: string;
}

interface ComparisonResult {
    material: MaterialSearchResult;
    results: QuoteEntry[];
    bestPrice: number | null;
}

interface ExportToPurchaseOrdersDialogProps {
    isOpen: boolean;
    onClose: () => void;
    comparisonResults: ComparisonResult[];
    baseCurrency: 'USD' | 'VES';
    globalExchangeRate?: number;
    onExportSuccess: () => void;
}

// Data structure to hold the selected quotes mapped by Supplier
interface SupplierGroup {
    supplierId: string;
    supplierName: string;
    items: {
        material: MaterialSearchResult;
        quote: QuoteEntry;
        selected: boolean;
    }[];
}

const ExportToPurchaseOrdersDialog: React.FC<ExportToPurchaseOrdersDialogProps> = ({
    isOpen,
    onClose,
    comparisonResults,
    baseCurrency,
    globalExchangeRate,
    onExportSuccess
}) => {
    const { session } = useSession();
    const [isExporting, setIsExporting] = useState(false);

    // Form State
    const [companyId, setCompanyId] = useState<string>('');
    const [deliveryDate, setDeliveryDate] = useState<Date | undefined>(undefined);

    // Grouped suppliers state
    const [supplierGroups, setSupplierGroups] = useState<SupplierGroup[]>([]);

    const { data: companies, isLoading: isLoadingCompanies } = useQuery({
        queryKey: ['companies', 'ExportModal'],
        queryFn: getAllCompanies,
        enabled: isOpen,
    });

    // Calculate default winners when the modal opens or data changes
    useEffect(() => {
        if (!isOpen || comparisonResults.length === 0) return;

        const groupsMap = new Map<string, SupplierGroup>();

        comparisonResults.forEach(comp => {
            if (!comp.bestPrice) return; // Skip if no valid best price

            // Find the quote that matches the best price
            const winningQuote = comp.results.find(r => r.convertedPrice === comp.bestPrice && r.isValid);

            if (winningQuote) {
                if (!groupsMap.has(winningQuote.supplierId)) {
                    groupsMap.set(winningQuote.supplierId, {
                        supplierId: winningQuote.supplierId,
                        supplierName: winningQuote.supplierName || 'Proveedor Desconocido',
                        items: []
                    });
                }

                groupsMap.get(winningQuote.supplierId)!.items.push({
                    material: comp.material,
                    quote: winningQuote,
                    selected: true // Pre-select by default
                });
            }
        });

        setSupplierGroups(Array.from(groupsMap.values()));
    }, [isOpen, comparisonResults]);

    const toggleItemSelection = (supplierId: string, materialId: string) => {
        setSupplierGroups(prev => prev.map(group => {
            if (group.supplierId === supplierId) {
                return {
                    ...group,
                    items: group.items.map(item =>
                        item.material.id === materialId
                            ? { ...item, selected: !item.selected }
                            : item
                    )
                };
            }
            return group;
        }));
    };

    const handleExportClick = async () => {
        if (!companyId) {
            showError('Debes seleccionar una empresa de origen.');
            return;
        }
        if (!deliveryDate) {
            showError('Debes seleccionar una fecha de entrega esperada.');
            return;
        }
        if (!session?.user?.id) {
            showError('Usuario no autenticado.');
            return;
        }

        // Filter to only include groups that have at least one selected item
        const groupsToProcess = supplierGroups.filter(g => g.items.some(i => i.selected));

        if (groupsToProcess.length === 0) {
            showError('Debes seleccionar al menos un material para generar una orden.');
            return;
        }

        setIsExporting(true);

        try {
            let successCount = 0;

            for (const group of groupsToProcess) {
                const selectedItems = group.items.filter(i => i.selected);

                // Find if this group requires VES (if any quote is in VES) to set the order currency appropriately
                // Or default to USD if mixed, but let's just use the quote's native currency for the order if possible.
                // For simplicity, we create the order in USD if mixed, or the native one if uniform.
                const orderCurrency = selectedItems.every(i => i.quote.currency === 'VES') ? 'VES' : 'USD';

                // Prepare Order Data
                const orderData = {
                    supplier_id: group.supplierId,
                    company_id: companyId,
                    currency: orderCurrency,
                    exchange_rate: orderCurrency === 'VES' ? globalExchangeRate || null : null,
                    status: 'Draft' as const,
                    created_by: session.user.email || 'unknown',
                    user_id: session.user.id,
                    delivery_date: format(deliveryDate, 'yyyy-MM-dd'),
                    payment_terms: 'Contado', // Default
                    credit_days: 0,
                    observations: 'Generada automáticamente desde Comparación de Cotizaciones.',
                };

                // Prepare Items Data
                const itemsData = selectedItems.map(item => {
                    // If order is USD but quote was VES, we need the converted price
                    let finalPrice = item.quote.unitPrice;
                    if (orderCurrency === 'USD' && item.quote.currency === 'VES') {
                        finalPrice = item.quote.convertedPrice || 0;
                    }

                    return {
                        material_id: item.material.id,
                        material_name: item.material.name,
                        quantity: 1, // Default quantity, user will adjust in PO draft
                        unit_price: finalPrice,
                        tax_rate: 0.16, // Default
                        is_exempt: false,
                        unit: 'UND', // Default, we might not have it here
                        description: '',
                        sales_percentage: 0,
                        discount_percentage: 0,
                    };
                });

                const createdOrder = await purchaseOrderService.create(orderData as any, itemsData as any);
                if (createdOrder) {
                    successCount++;
                }
            }

            showSuccess(`Se generaron ${successCount} Órdenes de Compra en estado Borrador.`);
            onExportSuccess();
            onClose();
        } catch (error: any) {
            console.error("Error exporting to POs:", error);
            showError(`Error durante la exportación: ${error.message}`);
        } finally {
            setIsExporting(false);
        }
    };

    // Reset state when modal opens
    useEffect(() => {
        if (isOpen) {
            setDeliveryDate(new Date()); // Default to today
            // Find default company if only 1 exists
            if (companies && companies.length === 1 && !companyId) {
                setCompanyId(companies[0].id);
            }
        }
    }, [isOpen, companies]);

    // Calculate total selected items for the generate button
    const totalSelectedItems = supplierGroups.reduce((total, group) => {
        return total + group.items.filter(i => i.selected).length;
    }, 0);

    const totalOrdersToGenerate = supplierGroups.filter(g => g.items.some(i => i.selected)).length;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[800px] max-h-[90vh] flex flex-col p-0 overflow-hidden bg-gray-50/50">
                <DialogHeader className="p-6 pb-4 bg-white border-b border-gray-100">
                    <DialogTitle className="text-xl text-procarni-primary">Generar Órdenes de Compra</DialogTitle>
                    <DialogDescription>
                        El sistema ha preseleccionado los precios más bajos. Revisa la distribución y los datos de la orden antes de generarlas en estado Borrador.
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="flex-1 px-6 py-4">

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 bg-white p-4 rounded-lg border border-gray-100 shadow-sm">
                        <div className="space-y-2">
                            <Label htmlFor="company-select" className="text-gray-700 font-semibold flex items-center">
                                <Building className="h-4 w-4 mr-2 text-procarni-secondary" />
                                Empresa Solicitante
                            </Label>
                            <Select value={companyId} onValueChange={setCompanyId} disabled={isLoadingCompanies}>
                                <SelectTrigger id="company-select" className="bg-gray-50">
                                    <SelectValue placeholder="Selecciona una empresa" />
                                </SelectTrigger>
                                <SelectContent>
                                    {companies?.map((company) => (
                                        <SelectItem key={company.id} value={company.id}>
                                            {company.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-gray-700 font-semibold flex items-center">
                                <Truck className="h-4 w-4 mr-2 text-procarni-secondary" />
                                Fecha Esperada de Entrega
                            </Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant={"outline"}
                                        className={cn("w-full justify-start text-left font-normal bg-gray-50", !deliveryDate && "text-muted-foreground")}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {deliveryDate ? format(deliveryDate, 'PPP', { locale: es }) : <span>Seleccionar fecha</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0 z-[100]" align="start">
                                    <Calendar
                                        mode="single"
                                        selected={deliveryDate}
                                        onSelect={setDeliveryDate}
                                        initialFocus
                                        locale={es}
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>

                    <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-4 px-1">
                        Materiales asignados por Proveedor
                    </h3>

                    {supplierGroups.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground bg-white rounded-lg border border-dashed border-gray-200">
                            No se encontraron precios ganadores válidos en la comparación actual.
                        </div>
                    ) : (
                        <div className="space-y-6 pb-2">
                            {supplierGroups.map(group => {
                                const hasSelected = group.items.some(i => i.selected);

                                return (
                                    <div key={group.supplierId} className={cn(
                                        "bg-white rounded-lg border shadow-sm overflow-hidden transition-all duration-200",
                                        hasSelected ? "border-procarni-secondary/30 ring-1 ring-procarni-secondary/10" : "border-gray-200 opacity-60"
                                    )}>
                                        <div className="bg-gray-50/80 px-4 py-3 border-b flex justify-between items-center">
                                            <div className="flex items-center gap-2">
                                                <Building className="h-4 w-4 text-gray-500" />
                                                <h4 className="font-semibold text-procarni-dark">{group.supplierName}</h4>
                                            </div>
                                            <Badge variant={hasSelected ? "secondary" : "outline"} className={cn(
                                                hasSelected ? "bg-procarni-secondary/10 text-procarni-secondary hover:bg-procarni-secondary/20" : ""
                                            )}>
                                                {group.items.filter(i => i.selected).length} ítems
                                            </Badge>
                                        </div>
                                        <div className="divide-y divide-gray-100">
                                            {group.items.map(item => (
                                                <label
                                                    key={item.material.id}
                                                    className="flex items-start gap-3 p-4 cursor-pointer hover:bg-gray-50/50 transition-colors"
                                                >
                                                    <div className="mt-0.5">
                                                        <Checkbox
                                                            checked={item.selected}
                                                            onCheckedChange={() => toggleItemSelection(group.supplierId, item.material.id)}
                                                            className="data-[state=checked]:bg-procarni-secondary data-[state=checked]:border-procarni-secondary"
                                                        />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex justify-between items-start">
                                                            <div>
                                                                <p className="font-medium text-sm text-gray-900 truncate">
                                                                    {item.material.name}
                                                                </p>
                                                                <p className="text-xs text-gray-500 font-mono mt-0.5">
                                                                    Ref: {item.material.code}
                                                                </p>
                                                            </div>
                                                            <div className="text-right ml-4 shrink-0">
                                                                <p className="font-bold text-sm text-procarni-secondary">
                                                                    {item.quote.currency} {item.quote.unitPrice.toFixed(2)}
                                                                </p>
                                                                {item.quote.currency === 'VES' && item.quote.convertedPrice && (
                                                                    <p className="text-[10px] text-gray-500 mt-0.5">
                                                                        ≈ USD {item.quote.convertedPrice.toFixed(2)}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                </ScrollArea>

                <DialogFooter className="p-4 bg-gray-50 border-t border-gray-100 flex-col sm:flex-row gap-3 sm:gap-0">
                    <Button variant="outline" onClick={onClose} disabled={isExporting} className="w-full sm:w-auto">
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleExportClick}
                        disabled={isExporting || totalSelectedItems === 0 || supplierGroups.length === 0}
                        className="bg-procarni-primary hover:bg-red-800 w-full sm:w-auto shadow-sm"
                    >
                        {isExporting ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generando...</>
                        ) : (
                            <><ArrowRight className="mr-2 h-4 w-4" /> Generar {totalOrdersToGenerate} Órden{totalOrdersToGenerate !== 1 ? 'es' : ''}</>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default ExportToPurchaseOrdersDialog;
