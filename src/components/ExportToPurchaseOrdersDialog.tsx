import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Building, Truck, AlertTriangle, Link as LinkIcon, DollarSign, Loader2, CalendarIcon, ArrowRight } from 'lucide-react';
import { purchaseOrderService } from '@/services/purchaseOrderService';
import { getAllCompanies, createSupplierMaterialRelation } from '@/integrations/supabase/data';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from '@/components/SessionContextProvider';
import { showError, showSuccess } from '@/utils/toast';
import { useQueryClient } from '@tanstack/react-query';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import ExchangeRateInput from './ExchangeRateInput';
import { QuoteEntry, ComparisonResult } from '@/integrations/supabase/types';

interface ExportToPurchaseOrdersDialogProps {
    isOpen: boolean;
    onClose: () => void;
    comparisonResults: ComparisonResult[];
    baseCurrency: 'USD' | 'VES' | 'EUR';
    globalExchangeRate?: number;
    onExportSuccess: () => void;
}

interface SupplierGroup {
    supplierId: string;
    supplierName: string;
    items: {
        material: ComparisonResult['material'];
        quote: QuoteEntry;
        selected: boolean;
        quantity: number;
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
    const [step, setStep] = useState(1);
    const queryClient = useQueryClient();
    const [isExporting, setIsExporting] = useState(false);
    const [isAssociating, setIsAssociating] = useState<string | null>(null);

    // Form State
    const [companyId, setCompanyId] = useState<string>('');
    const [deliveryDate, setDeliveryDate] = useState<Date | undefined>(undefined);
    const [localExchangeRate, setLocalExchangeRate] = useState<number>(globalExchangeRate || 0);

    // Sync local exchange rate when prop changes
    useEffect(() => {
        if (globalExchangeRate) {
            setLocalExchangeRate(globalExchangeRate);
        }
    }, [globalExchangeRate]);

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
            const winningQuotes = comp.results.filter(r => r.isBest && r.isValid);

            winningQuotes.forEach(winningQuote => {
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
                    selected: true,
                    quantity: 1
                });
            });
        });

        setSupplierGroups(Array.from(groupsMap.values()));
        setStep(1); 
    }, [isOpen, comparisonResults]);

    const supplierIds = useMemo(() => supplierGroups.map(g => g.supplierId), [supplierGroups]);
    
    const { data: associations, isLoading: isLoadingAssociations } = useQuery({
        queryKey: ['supplierMaterialsMulti', supplierIds],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('supplier_materials')
                .select('supplier_id, material_id, unit_id')
                .in('supplier_id', supplierIds);
            
            if (error) throw error;
            return data;
        },
        enabled: isOpen && supplierIds.length > 0
    });

    const isAssociated = (supplierId: string, materialId: string, unitId: string) => {
        if (!associations) return true; 
        return associations.some(a => a.supplier_id === supplierId && a.material_id === materialId && a.unit_id === unitId);
    };

    const handleAssociateSupplier = async (supplierId: string, materialId: string, unitId: string, supplierName: string) => {
        if (!session?.user?.id || !materialId || !supplierId || !unitId) return;

        const assocKey = `${materialId}-${supplierId}-${unitId}`;
        setIsAssociating(assocKey);
        try {
            const result = await createSupplierMaterialRelation({
                supplier_id: supplierId,
                material_id: materialId,
                unit_id: unitId,
                user_id: session.user.id
            });

            if (result.success) {
                showSuccess(`Material asociado a ${supplierName}.`);
                await queryClient.invalidateQueries({ queryKey: ['supplierMaterialsMulti'] });
                await queryClient.invalidateQueries({ queryKey: ['suppliersByMaterial', materialId] });
            }
        } catch (error) {
            console.error("Error associating supplier:", error);
            showError("No se pudo asociar el material.");
        } finally {
            setIsAssociating(null);
        }
    };

    const toggleItemSelection = (supplierId: string, materialId: string, unitId: string) => {
        setSupplierGroups(prev => prev.map(group => {
            if (group.supplierId === supplierId) {
                return {
                    ...group,
                    items: group.items.map(item =>
                        (item.material.id === materialId && item.quote.unit_id === unitId)
                            ? { ...item, selected: !item.selected }
                            : item
                    )
                };
            }
            return group;
        }));
    };

    const updateItemQuantity = (supplierId: string, materialId: string, unitId: string, quantity: number) => {
        setSupplierGroups(prev => prev.map(group => {
            if (group.supplierId === supplierId) {
                return {
                    ...group,
                    items: group.items.map(item =>
                        (item.material.id === materialId && item.quote.unit_id === unitId)
                            ? { ...item, quantity: isNaN(quantity) ? 0 : Math.max(0, quantity) }
                            : item
                    )
                };
            }
            return group;
        }));
    };

    const handleNextStep = () => {
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

        const selectedGroups = supplierGroups.filter(g => g.items.some(i => i.selected));

        if (selectedGroups.length === 0) {
            showError('Debes seleccionar al menos un material para generar una orden.');
            return;
        }

        const unassociatedItems = selectedGroups.flatMap(g =>
            g.items.filter(i => i.selected && !isAssociated(g.supplierId, i.material.id, i.quote.unit_id))
        );

        if (unassociatedItems.length > 0) {
            showError(`Hay ${unassociatedItems.length} materiales que no están asociados a sus proveedores. Por favor, vincúlalos antes de continuar.`);
            return;
        }



        setStep(2);
    };

    const handleExportClick = async () => {
        setIsExporting(true);

        try {
            let successCount = 0;
            const groupsToProcess = supplierGroups.filter(g => g.items.some(i => i.selected));

            for (const group of groupsToProcess) {
                const selectedItems = group.items.filter(i => i.selected);
                const orderCurrency = selectedItems.every(i => i.quote.currency === 'VES') ? 'VES' : 'USD';

                const orderData = {
                    supplier_id: group.supplierId,
                    company_id: companyId,
                    currency: orderCurrency,
                    exchange_rate: localExchangeRate || null,
                    status: 'Draft' as const,
                    created_by: session.user.email || 'unknown',
                    user_id: session.user.id,
                    delivery_date: format(deliveryDate!, 'yyyy-MM-dd'),
                    payment_terms: 'Contado',
                    credit_days: 0,
                    observations: 'Generada automáticamente desde Comparación de Cotizaciones.',
                };

                const itemsData = selectedItems.map(item => {
                    let finalPrice = item.quote.unitPrice;
                    if (orderCurrency === 'USD' && item.quote.currency === 'VES') {
                        finalPrice = item.quote.convertedPrice || 0;
                    }

                    return {
                        material_id: item.material.id,
                        material_name: item.material.name,
                        quantity: item.quantity || 1,
                        unit_price: finalPrice,
                        tax_rate: 0.16,
                        is_exempt: false,
                        unit: item.quote.unit_name || 'UND',
                        description: '',
                        sales_percentage: 0,
                        discount_percentage: 0,
                        unit_id: item.quote.unit_id,
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

    useEffect(() => {
        if (isOpen) {
            setDeliveryDate(new Date());
            if (companies && companies.length === 1 && !companyId) {
                setCompanyId(companies[0].id);
            }
        }
    }, [isOpen, companies]);

    const totalSelectedItems = supplierGroups.reduce((total, group) => {
        return total + group.items.filter(i => i.selected).length;
    }, 0);

    const totalOrdersToGenerate = supplierGroups.filter(g => g.items.some(i => i.selected)).length;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="w-[95vw] sm:max-w-[800px] h-[95vh] sm:h-auto sm:max-h-[90vh] flex flex-col p-0 sm:p-4 overflow-hidden bg-gray-50 rounded-2xl border-none shadow-2xl">
                <DialogHeader className="text-left bg-white p-4 mx-0 sm:mx-2 mt-0 sm:mt-2 rounded-none sm:rounded-xl shadow-sm border-b sm:border border-gray-100 relative shrink-0">
                    <div className="hidden sm:block absolute top-0 left-0 w-1 rounded-l-xl h-full bg-procarni-secondary/80"></div>
                    <DialogTitle className="text-lg sm:text-xl font-bold text-procarni-dark sm:pl-2">
                        Generar Órdenes de Compra - Paso {step} de 2
                    </DialogTitle>
                    <DialogDescription className="text-sm sm:pl-2 mt-1">
                        {step === 1 
                            ? "Selecciona los materiales y proveedores para generar las órdenes."
                            : "Define las cantidades a comprar para cada ítem seleccionado."}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto min-h-0 px-4 sm:px-2 py-4">

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8 bg-white p-4 rounded-lg border border-gray-100 shadow-sm">
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

                        <div className="space-y-2 md:col-span-2 pt-2 border-t border-gray-100">
                            <Label className="text-gray-700 font-semibold flex items-center mb-1">
                                <DollarSign className="h-4 w-4 mr-2 text-procarni-secondary" />
                                Tasa de Cambio (VES/USD)
                            </Label>
                            <ExchangeRateInput
                                baseCurrency="USD"
                                exchangeRate={localExchangeRate}
                                onExchangeRateChange={(val) => setLocalExchangeRate(val)}
                                compact={true}
                            />
                            <p className="text-[10px] text-muted-foreground italic">
                                Esta tasa se aplicará a todas las órdenes generadas en esta sesión.
                            </p>
                        </div>
                    </div>

                    {step === 1 ? (
                        <>
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-4 px-1 flex items-center">
                                <span className="bg-gray-200 h-px flex-1 mr-4"></span>
                                Materiales asignados por Proveedor
                                <span className="bg-gray-200 h-px flex-1 ml-4"></span>
                            </h3>

                            {supplierGroups.length === 0 ? (
                                <div className="text-center py-12 text-muted-foreground bg-white rounded-xl border border-dashed border-gray-200 shadow-sm">
                                    <Truck className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                                    <p className="font-medium text-gray-900">No hay precios ganadores</p>
                                    <p className="text-xs mt-1">No se encontraron precios ganadores válidos en la comparación actual.</p>
                                </div>
                            ) : (
                                <div className="space-y-6 pb-2">
                                    {supplierGroups.map(group => {
                                        const hasSelected = group.items.some(i => i.selected);

                                        return (
                                            <div key={group.supplierId} className={cn(
                                                "bg-white rounded-xl border shadow-sm overflow-hidden transition-all duration-200 group",
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
                                                    {group.items.map((item) => (
                                                        <label
                                                            key={`${item.material.id}-${item.quote.unit_id}`}
                                                            className="flex items-start gap-3 p-3 sm:p-4 cursor-pointer hover:bg-gray-50/80 transition-colors"
                                                        >
                                                            <div className="mt-0.5 shrink-0">
                                                                <Checkbox
                                                                    checked={item.selected}
                                                                    onCheckedChange={() => toggleItemSelection(group.supplierId, item.material.id, item.quote.unit_id)}
                                                                    className="data-[state=checked]:bg-procarni-secondary data-[state=checked]:border-procarni-secondary h-4 w-4 sm:h-5 sm:w-5"
                                                                />
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1 sm:gap-4">
                                                                    <div className="min-w-0 flex-1">
                                                                        <p className="font-medium text-sm text-gray-900 truncate" title={item.material.name}>
                                                                            {item.material.name} <span className="text-gray-400 font-normal">({item.quote.unit_name || 'N/A'})</span>
                                                                        </p>
                                                                        <p className="text-xs text-gray-500 font-mono mt-0.5 truncate">
                                                                            Ref: {item.material.code}
                                                                        </p>
                                                                    </div>
                                                                    <div className="text-left sm:text-right shrink-0">
                                                                        <p className="font-bold text-sm text-procarni-secondary">
                                                                            {item.quote.currency} {item.quote.unitPrice.toFixed(2)}
                                                                        </p>
                                                                        {item.quote.currency === 'VES' && item.quote.convertedPrice && (
                                                                            <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 font-medium">
                                                                                ≈ USD {item.quote.convertedPrice.toFixed(2)}
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                
                                                                {!isAssociated(group.supplierId, item.material.id, item.quote.unit_id) && (
                                                                    <div className="mt-2 flex items-center justify-between bg-red-50 border border-red-100 rounded-md px-3 py-1.5 animate-pulse-subtle">
                                                                        <span className="text-[10px] text-red-700 font-bold flex items-center gap-1 uppercase tracking-tight">
                                                                            <AlertTriangle className="h-3.5 w-3.5" /> No asociado
                                                                        </span>
                                                                        <Button 
                                                                            size="sm" 
                                                                            variant="secondary" 
                                                                            className="h-7 px-3 text-[10px] bg-procarni-secondary text-white hover:bg-green-700 gap-1 font-bold shadow-sm border-none"
                                                                            onClick={(e) => {
                                                                                e.preventDefault();
                                                                                e.stopPropagation();
                                                                                handleAssociateSupplier(group.supplierId, item.material.id, item.quote.unit_id, group.supplierName);
                                                                            }}
                                                                            disabled={isAssociating === `${item.material.id}-${group.supplierId}-${item.quote.unit_id}`}
                                                                        >
                                                                            {isAssociating === `${item.material.id}-${group.supplierId}-${item.quote.unit_id}` ? (
                                                                                <Loader2 className="h-3 w-3 animate-spin" />
                                                                            ) : (
                                                                                <>
                                                                                    <LinkIcon className="h-3 w-3" />
                                                                                    Vincular Material
                                                                                </>
                                                                            )}
                                                                        </Button>
                                                                    </div>
                                                                )}

                                                            </div>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="space-y-6">
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-4 px-1 flex items-center">
                                <span className="bg-gray-200 h-px flex-1 mr-4"></span>
                                Ajustar Cantidades
                                <span className="bg-gray-200 h-px flex-1 ml-4"></span>
                            </h3>
                            
                            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                                <table className="w-full text-sm text-left border-collapse">
                                    <thead className="bg-gray-50 border-b">
                                        <tr>
                                            <th className="px-4 py-3 font-semibold text-gray-700">Material</th>
                                            <th className="px-4 py-3 font-semibold text-gray-700">Proveedor</th>
                                            <th className="px-4 py-3 font-semibold text-gray-700 w-32">Cantidad</th>
                                            <th className="px-4 py-3 font-semibold text-gray-700 text-right">P. Unitario</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {supplierGroups.flatMap(group => 
                                            group.items.filter(i => i.selected).map(item => (
                                                <tr key={`${group.supplierId}-${item.material.id}-${item.quote.unit_id}`} className="hover:bg-gray-50/50 transition-colors">
                                                    <td className="px-4 py-4">
                                                        <div className="font-medium text-gray-900">{item.material.name}</div>
                                                        <div className="text-xs text-gray-500">{item.quote.unit_name}</div>
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        <div className="text-gray-600">{group.supplierName}</div>
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        <input 
                                                            type="number" 
                                                            min="0.01" 
                                                            step="0.01"
                                                            value={item.quantity}
                                                            onChange={(e) => updateItemQuantity(group.supplierId, item.material.id, item.quote.unit_id, parseFloat(e.target.value))}
                                                            className="w-full px-3 py-1.5 border rounded-md focus:ring-2 focus:ring-procarni-secondary/20 focus:border-procarni-secondary outline-none transition-all text-sm font-medium"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-4 text-right">
                                                        <div className="font-bold text-procarni-secondary">
                                                            {item.quote.currency} {item.quote.unitPrice.toFixed(2)}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter className="p-4 sm:px-6 bg-white sm:bg-transparent border-t border-gray-100 sm:border-none flex-col sm:flex-row gap-3 sm:gap-2 shrink-0">
                    <Button 
                        variant="outline" 
                        onClick={step === 1 ? onClose : () => setStep(1)} 
                        disabled={isExporting} 
                        className="w-full sm:w-auto bg-white hover:bg-gray-50 transition-colors"
                    >
                        {step === 1 ? "Cancelar" : "Atrás"}
                    </Button>
                    
                    {step === 1 ? (
                        <Button
                            onClick={handleNextStep}
                            disabled={totalSelectedItems === 0 || supplierGroups.length === 0}
                            className="bg-procarni-secondary hover:bg-green-700 w-full sm:w-auto shadow-sm group transition-all"
                        >
                            <ArrowRight className="mr-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                            Continuar
                        </Button>
                    ) : (
                        <Button
                            onClick={handleExportClick}
                            disabled={isExporting}
                            className="bg-procarni-secondary hover:bg-green-700 w-full sm:w-auto shadow-sm group transition-all"
                        >
                            {isExporting ? (
                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generando...</>
                            ) : (
                                <><DollarSign className="mr-2 h-4 w-4 group-hover:scale-110 transition-transform" /> Generar {totalOrdersToGenerate} Órden{totalOrdersToGenerate !== 1 ? 'es' : ''}</>
                            )}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default ExportToPurchaseOrdersDialog;
