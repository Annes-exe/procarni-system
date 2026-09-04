import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Building, Truck, AlertTriangle, Link as LinkIcon, DollarSign, Loader2, CalendarIcon, ArrowRight, CheckCircle2, ShoppingCart } from 'lucide-react';
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

interface MaterialExportItem {
  id: string;
  material: ComparisonResult['material'];
  availableQuotes: QuoteEntry[];
  selectedQuoteIndex: number;
  selected: boolean;
  quantity: number;
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
  const { session, profile, userName } = useSession();
  const [step, setStep] = useState(1);
  const queryClient = useQueryClient();
  const [isExporting, setIsExporting] = useState(false);
  const [isAssociating, setIsAssociating] = useState<string | null>(null);

  // Form State
  const [companyId, setCompanyId] = useState<string>('');
  const [deliveryDate, setDeliveryDate] = useState<Date | undefined>(undefined);
  const [localExchangeRate, setLocalExchangeRate] = useState<number>(globalExchangeRate || 0);

  // Material Items State (allows choosing quote per material)
  const [materialItems, setMaterialItems] = useState<MaterialExportItem[]>([]);

  // Sync local exchange rate when prop changes
  useEffect(() => {
    if (globalExchangeRate) {
      setLocalExchangeRate(globalExchangeRate);
    }
  }, [globalExchangeRate]);

  const { data: companies, isLoading: isLoadingCompanies } = useQuery({
    queryKey: ['companies', 'ExportModal'],
    queryFn: getAllCompanies,
    enabled: isOpen,
  });

  // Initialize material items from comparison results
  useEffect(() => {
    if (!isOpen || comparisonResults.length === 0) return;

    const items: MaterialExportItem[] = [];

    comparisonResults.forEach(comp => {
      const validQuotes = comp.results.filter(r => r.isValid && r.unitPrice > 0);
      if (validQuotes.length === 0) return;

      // Find the lowest price quote index, or default to 0
      let defaultQuoteIndex = validQuotes.findIndex(q => q.isBest);
      if (defaultQuoteIndex === -1) defaultQuoteIndex = 0;

      items.push({
        id: comp.material.id,
        material: comp.material,
        availableQuotes: validQuotes,
        selectedQuoteIndex: defaultQuoteIndex,
        selected: true,
        quantity: 1,
      });
    });

    setMaterialItems(items);
    setStep(1);
  }, [isOpen, comparisonResults]);

  // Derive supplier groups from currently selected quotes
  const supplierGroups = useMemo<SupplierGroup[]>(() => {
    const groupsMap = new Map<string, SupplierGroup>();

    materialItems.forEach(item => {
      if (!item.selected) return;
      const chosenQuote = item.availableQuotes[item.selectedQuoteIndex];
      if (!chosenQuote || !chosenQuote.supplierId) return;

      if (!groupsMap.has(chosenQuote.supplierId)) {
        groupsMap.set(chosenQuote.supplierId, {
          supplierId: chosenQuote.supplierId,
          supplierName: chosenQuote.supplierName || 'Proveedor Desconocido',
          items: []
        });
      }

      groupsMap.get(chosenQuote.supplierId)!.items.push({
        material: item.material,
        quote: chosenQuote,
        selected: true,
        quantity: item.quantity,
      });
    });

    return Array.from(groupsMap.values());
  }, [materialItems]);

  const activeSupplierIds = useMemo(() => {
    const ids = new Set<string>();
    materialItems.forEach(item => {
      if (item.selected) {
        const quote = item.availableQuotes[item.selectedQuoteIndex];
        if (quote?.supplierId) ids.add(quote.supplierId);
      }
    });
    return Array.from(ids);
  }, [materialItems]);

  const { data: associations } = useQuery({
    queryKey: ['supplierMaterialsMulti', activeSupplierIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('supplier_materials')
        .select('supplier_id, material_id, unit_id')
        .in('supplier_id', activeSupplierIds);

      if (error) throw error;
      return data;
    },
    enabled: isOpen && activeSupplierIds.length > 0
  });

  const isAssociated = (supplierId: string, materialId: string, unitId?: string) => {
    if (!associations) return true;
    return associations.some(a => a.supplier_id === supplierId && a.material_id === materialId && (!unitId || a.unit_id === unitId));
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

  const toggleMaterialSelection = (materialId: string) => {
    setMaterialItems(prev => prev.map(item =>
      item.id === materialId ? { ...item, selected: !item.selected } : item
    ));
  };

  const handleQuoteSelect = (materialId: string, quoteIndex: number) => {
    setMaterialItems(prev => prev.map(item =>
      item.id === materialId ? { ...item, selectedQuoteIndex: quoteIndex } : item
    ));
  };

  const updateItemQuantity = (materialId: string, quantity: number) => {
    setMaterialItems(prev => prev.map(item =>
      item.id === materialId ? { ...item, quantity: isNaN(quantity) ? 0 : Math.max(0, quantity) } : item
    ));
  };

  const handleNextStep = () => {
    if (!companyId) {
      showError('Debes seleccionar una empresa solicitante.');
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

    const selectedItems = materialItems.filter(i => i.selected);

    if (selectedItems.length === 0) {
      showError('Debes seleccionar al menos un material para generar una orden.');
      return;
    }

    // Check if any selected item is not associated
    const unassociated = selectedItems.filter(item => {
      const quote = item.availableQuotes[item.selectedQuoteIndex];
      return quote && !isAssociated(quote.supplierId, item.material.id, quote.unit_id);
    });

    if (unassociated.length > 0) {
      showError(`Hay ${unassociated.length} material(es) sin vincular con el proveedor seleccionado. Por favor, vincúlalos antes de continuar.`);
      return;
    }

    setStep(2);
  };

  const handleExportClick = async () => {
    setIsExporting(true);

    try {
      let successCount = 0;

      for (const group of supplierGroups) {
        if (group.items.length === 0) continue;

        const orderCurrency = group.items.every(i => i.quote.currency === 'VES') ? 'VES' : 'USD';

        const orderData = {
          supplier_id: group.supplierId,
          company_id: companyId,
          currency: orderCurrency,
          exchange_rate: localExchangeRate || null,
          status: 'Draft' as const,
          created_by: userName || [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() || profile?.username || session?.user?.user_metadata?.full_name || session?.user?.email?.split('@')[0] || 'Sistema',
          user_id: session?.user?.id,
          delivery_date: format(deliveryDate!, 'yyyy-MM-dd'),
          payment_terms: 'Contado',
          credit_days: 0,
          observations: 'Generada automáticamente desde Comparación de Cotizaciones.',
        };

        const itemsData = group.items.map(item => {
          let finalPrice = item.quote.unitPrice;
          if (orderCurrency === 'USD' && item.quote.currency === 'VES') {
            finalPrice = item.quote.convertedPrice || (localExchangeRate > 0 ? item.quote.unitPrice / localExchangeRate : item.quote.unitPrice);
          } else if (orderCurrency === 'USD' && item.quote.currency === 'EUR' && item.quote.convertedPrice) {
            finalPrice = item.quote.convertedPrice;
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
  }, [isOpen, companies, companyId]);

  const totalSelectedItems = materialItems.filter(i => i.selected).length;
  const totalOrdersToGenerate = supplierGroups.length;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[95vw] sm:max-w-[850px] h-[95vh] sm:h-auto sm:max-h-[90vh] flex flex-col p-0 sm:p-4 overflow-hidden bg-gray-50 rounded-2xl border-none shadow-2xl">
        <DialogHeader className="text-left bg-white p-4 mx-0 sm:mx-2 mt-0 sm:mt-2 rounded-none sm:rounded-xl shadow-sm border-b sm:border border-gray-100 relative shrink-0">
          <div className="hidden sm:block absolute top-0 left-0 w-1 rounded-l-xl h-full bg-procarni-secondary/80"></div>
          <DialogTitle className="text-lg sm:text-xl font-bold text-procarni-dark sm:pl-2">
            Generar Órdenes de Compra - Paso {step} de 2
          </DialogTitle>
          <DialogDescription className="text-sm sm:pl-2 mt-1">
            {step === 1
              ? "Selecciona los materiales y el proveedor elegido para cada ítem."
              : "Define las cantidades a comprar para cada ítem seleccionado."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 px-4 sm:px-2 py-4 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 bg-white p-4 rounded-lg border border-gray-100 shadow-sm">
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
                onExchangeRateChange={(val) => setLocalExchangeRate(val || 0)}
                compact={true}
              />
              <p className="text-[10px] text-muted-foreground italic">
                Esta tasa se aplicará a las conversiones de órdenes generadas en esta sesión.
              </p>
            </div>
          </div>

          {step === 1 ? (
            <>
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 flex items-center">
                  Selección de Ofertas por Material
                </h3>
                <span className="text-xs text-muted-foreground">
                  {totalSelectedItems} de {materialItems.length} seleccionados
                </span>
              </div>

              {materialItems.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground bg-white rounded-xl border border-dashed border-gray-200 shadow-sm">
                  <ShoppingCart className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                  <p className="font-medium text-gray-900">No hay ofertas válidas</p>
                  <p className="text-xs mt-1">No se encontraron cotizaciones con precios registrados en la comparación.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {materialItems.map((item) => {
                    const chosenQuote = item.availableQuotes[item.selectedQuoteIndex];
                    const isLinked = chosenQuote ? isAssociated(chosenQuote.supplierId, item.material.id, chosenQuote.unit_id) : true;

                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "bg-white rounded-xl border shadow-sm p-4 transition-all duration-200",
                          item.selected
                            ? "border-procarni-secondary/40 ring-1 ring-procarni-secondary/10"
                            : "border-gray-200 opacity-60 bg-gray-50/50"
                        )}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <Checkbox
                              checked={item.selected}
                              onCheckedChange={() => toggleMaterialSelection(item.id)}
                              className="mt-1 data-[state=checked]:bg-procarni-secondary data-[state=checked]:border-procarni-secondary h-5 w-5 shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="font-bold text-sm text-procarni-dark truncate" title={item.material.name}>
                                {item.material.name}
                              </p>
                              <p className="text-xs text-gray-400 font-mono">
                                Ref: {item.material.code}
                              </p>
                            </div>
                          </div>

                          {/* Quote Selector Dropdown */}
                          <div className="flex flex-col sm:items-end gap-1.5 w-full sm:w-auto">
                            {item.availableQuotes.length > 1 ? (
                              <Select
                                value={String(item.selectedQuoteIndex)}
                                onValueChange={(val) => handleQuoteSelect(item.id, parseInt(val, 10))}
                                disabled={!item.selected}
                              >
                                <SelectTrigger className="w-full sm:w-[320px] bg-white border-gray-200 text-xs h-9 font-medium focus:ring-procarni-secondary/20">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {item.availableQuotes.map((q, qIdx) => (
                                    <SelectItem key={qIdx} value={String(qIdx)}>
                                      <div className="flex items-center justify-between gap-2 w-full text-xs">
                                        <span className="font-medium text-gray-900 truncate max-w-[140px]">{q.supplierName}</span>
                                        <span className="text-gray-600 font-bold">
                                          {q.currency} {q.unitPrice.toFixed(2)} ({q.unit_name || 'UND'})
                                        </span>
                                        {q.isBest && (
                                          <Badge className="bg-green-100 text-green-800 text-[9px] hover:bg-green-100 px-1 py-0 border-none font-bold">
                                            Mejor
                                          </Badge>
                                        )}
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-gray-800">
                                  {chosenQuote?.supplierName}
                                </span>
                                <span className="text-xs font-bold text-procarni-secondary">
                                  {chosenQuote?.currency} {chosenQuote?.unitPrice.toFixed(2)} ({chosenQuote?.unit_name || 'UND'})
                                </span>
                                {chosenQuote?.isBest && (
                                  <Badge className="bg-green-100 text-green-800 text-[9px] border-none font-bold">
                                    Mejor Precio
                                  </Badge>
                                )}
                              </div>
                            )}

                            {chosenQuote && chosenQuote.currency === 'VES' && chosenQuote.convertedPrice && (
                              <span className="text-[11px] text-gray-400 font-medium">
                                ≈ USD {chosenQuote.convertedPrice.toFixed(2)}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Unassociated Warning & Quick Link */}
                        {item.selected && chosenQuote && !isLinked && (
                          <div className="mt-3 flex items-center justify-between bg-red-50/80 border border-red-100 rounded-lg px-3 py-2">
                            <span className="text-xs text-red-700 font-medium flex items-center gap-1.5">
                              <AlertTriangle className="h-3.5 w-3.5 text-red-600 shrink-0" />
                              Material no vinculado a {chosenQuote.supplierName}
                            </span>
                            <Button
                              size="sm"
                              variant="secondary"
                              className="h-7 px-3 text-[11px] bg-procarni-secondary text-white hover:bg-green-700 gap-1.5 font-bold shadow-sm border-none"
                              onClick={() => handleAssociateSupplier(chosenQuote.supplierId, item.material.id, chosenQuote.unit_id, chosenQuote.supplierName)}
                              disabled={isAssociating === `${item.material.id}-${chosenQuote.supplierId}-${chosenQuote.unit_id}`}
                            >
                              {isAssociating === `${item.material.id}-${chosenQuote.supplierId}-${chosenQuote.unit_id}` ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <>
                                  <LinkIcon className="h-3 w-3" /> Vincular
                                </>
                              )}
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Summary of Orders that will be generated */}
              {supplierGroups.length > 0 && (
                <div className="bg-gradient-to-r from-blue-50/50 to-indigo-50/50 border border-blue-100 rounded-xl p-4 mt-6">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="h-4 w-4 text-blue-600" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-blue-900">
                      Resumen de Órdenes a Generar ({supplierGroups.length})
                    </h4>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                    {supplierGroups.map(group => (
                      <div key={group.supplierId} className="bg-white/80 rounded-lg p-2.5 border border-blue-100/80 flex justify-between items-center text-xs">
                        <span className="font-semibold text-gray-800 truncate pr-2">{group.supplierName}</span>
                        <Badge variant="outline" className="text-blue-700 bg-blue-50 border-blue-200 shrink-0">
                          {group.items.length} {group.items.length === 1 ? 'ítem' : 'ítems'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-6">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-4 px-1 flex items-center">
                <span className="bg-gray-200 h-px flex-1 mr-4"></span>
                Ajustar Cantidades a Comprar
                <span className="bg-gray-200 h-px flex-1 ml-4"></span>
              </h3>

              <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <table className="w-full text-sm text-left border-collapse">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-gray-700">Material</th>
                      <th className="px-4 py-3 font-semibold text-gray-700">Proveedor Elegido</th>
                      <th className="px-4 py-3 font-semibold text-gray-700 w-32">Cantidad</th>
                      <th className="px-4 py-3 font-semibold text-gray-700 text-right">P. Unitario</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {materialItems.filter(i => i.selected).map(item => {
                      const quote = item.availableQuotes[item.selectedQuoteIndex];
                      return (
                        <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-4 py-4">
                            <div className="font-medium text-gray-900">{item.material.name}</div>
                            <div className="text-xs text-gray-500">{quote?.unit_name || 'UND'}</div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="text-gray-700 font-medium">{quote?.supplierName}</div>
                          </td>
                          <td className="px-4 py-4">
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={item.quantity}
                              onChange={(e) => updateItemQuantity(item.id, parseFloat(e.target.value))}
                              className="w-full px-3 py-1.5 border rounded-md focus:ring-2 focus:ring-procarni-secondary/20 focus:border-procarni-secondary outline-none transition-all text-sm font-medium"
                            />
                          </td>
                          <td className="px-4 py-4 text-right">
                            <div className="font-bold text-procarni-secondary">
                              {quote?.currency} {quote?.unitPrice.toFixed(2)}
                            </div>
                            {quote?.currency === 'VES' && quote.convertedPrice && (
                              <div className="text-[10px] text-gray-400 font-medium">
                                ≈ USD {quote.convertedPrice.toFixed(2)}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
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
              disabled={totalSelectedItems === 0}
              className="bg-procarni-secondary hover:bg-green-700 w-full sm:w-auto shadow-sm group transition-all"
            >
              <ArrowRight className="mr-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
              Continuar
            </Button>
          ) : (
            <Button
              onClick={handleExportClick}
              disabled={isExporting || totalOrdersToGenerate === 0}
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
