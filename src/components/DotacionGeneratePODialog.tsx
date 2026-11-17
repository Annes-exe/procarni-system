import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DotacionCalculationResult, DotacionMaterialMapping, GeneratedPurchaseOrderLink } from '@/types/dotacion';
import { Company, Material, Supplier } from '@/integrations/supabase/types';
import { purchaseOrderService, CreatePurchaseOrderItemInput, CreatePurchaseOrderInput } from '@/services/purchaseOrderService';
import { dotacionSnapshotService } from '@/services/dotacionSnapshotService';
import { dotacionConfigService } from '@/services/dotacionConfigService';
import { getAllCompanies } from '@/integrations/supabase/services/companyService';
import { getAllSuppliers } from '@/integrations/supabase/services/supplierService';
import { getAllUnits, UnitOfMeasure } from '@/integrations/supabase/services/unitService';
import { getAllSystemMaterials } from '@/integrations/supabase/services/materialService';
import { useSession } from '@/components/SessionContextProvider';
import { showSuccess, showError } from '@/utils/toast';
import { getPriceHistoryByMaterialId } from '@/integrations/supabase/data';
import { ShoppingCart, Loader2, Building2, Check, ExternalLink, Calendar, Truck, ChevronsUpDown, Search, AlertTriangle, Clock } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useNavigate } from 'react-router-dom';
import { format, addDays } from 'date-fns';
import { PriceInput } from '@/components/PriceInput';
import { LastPriceButton, convertPriceToCurrency } from '@/components/LastPriceButton';
import ExchangeRateInput from '@/components/ExchangeRateInput';

interface DotacionGeneratePODialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: DotacionCalculationResult;
  snapshotId?: string;
  onOrderCreated?: (orderLink: GeneratedPurchaseOrderLink) => void;
}

interface ItemRowState {
  productId: string;
  materialName: string;
  materialId: string | null;
  materialCode: string | null;
  unitId: string | null;
  quantity: number;
  unit: string;
  unitPrice: number;
  isExempt: boolean;
  selected: boolean;
  isLoose?: boolean;
}

export const DotacionGeneratePODialog: React.FC<DotacionGeneratePODialogProps> = ({
  open,
  onOpenChange,
  result,
  snapshotId,
  onOrderCreated,
}) => {
  const { session, userName } = useSession();
  const navigate = useNavigate();

  const [selectedCompanyId, setSelectedCompanyId] = useState<'pc' | 'ma'>('pc');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [unitsList, setUnitsList] = useState<UnitOfMeasure[]>([]);
  const [resolvedMappings, setResolvedMappings] = useState<DotacionMaterialMapping[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [supplierComboboxOpen, setSupplierComboboxOpen] = useState<boolean>(false);
  const [baseCurrency, setBaseCurrency] = useState<'USD' | 'EUR'>('USD');
  const [currency, setCurrency] = useState<'USD' | 'VES' | 'EUR'>('USD');
  const [exchangeRate, setExchangeRate] = useState<number | undefined>(undefined);
  const [deliveryDate, setDeliveryDate] = useState<string>(format(addDays(new Date(), 3), 'yyyy-MM-dd'));
  const [paymentTerms, setPaymentTerms] = useState<string>('Contado');
  const [observations, setObservations] = useState<string>('');
  const [isLoadingMeta, setIsLoadingMeta] = useState<boolean>(false);
  const [isApplyingPrices, setIsApplyingPrices] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [createdOrderLink, setCreatedOrderLink] = useState<GeneratedPurchaseOrderLink | null>(null);

  // Load companies, suppliers, units, catalog materials and remote dotacion mappings
  useEffect(() => {
    if (!open) return;
    const fetchMetadata = async () => {
      setIsLoadingMeta(true);
      try {
        const [companiesData, suppliersData, unitsData, materialsData, remoteMappings] = await Promise.all([
          getAllCompanies(),
          getAllSuppliers(),
          getAllUnits(),
          getAllSystemMaterials(),
          dotacionConfigService.fetchRemoteMappings(),
        ]);
        setCompanies(companiesData || []);
        setSuppliers(suppliersData || []);
        const safeUnits = unitsData || [];
        const safeMaterials: Material[] = materialsData || [];
        setUnitsList(safeUnits);

        const baseMappings = remoteMappings || dotacionConfigService.getMappings();
        const finalMappings =
          safeMaterials.length > 0
            ? dotacionConfigService.autoMatchMaterials(safeMaterials, safeUnits, baseMappings)
            : baseMappings;

        dotacionConfigService.saveMappings(finalMappings);
        setResolvedMappings(finalMappings);

        if (suppliersData && suppliersData.length > 0) {
          setSelectedSupplierId((prev) => prev || suppliersData[0].id);
        }
      } catch (err) {
        console.error('Error loading metadata for Dotacion PO:', err);
      } finally {
        setIsLoadingMeta(false);
      }
    };
    fetchMetadata();
  }, [open]);

  // Target company data from calculation
  const targetCompanyCalc = selectedCompanyId === 'pc' ? result.pc : result.ma;

  // Selected supplier object
  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id === selectedSupplierId),
    [suppliers, selectedSupplierId]
  );

  // Helper to format presentation and total calculation for items
  const getItemPresentation = (productId: string, quantity: number, isLoose?: boolean) => {
    const itemCalc = targetCompanyCalc.items.find((it) => it.productId === productId);
    const unitsPerPkg = itemCalc ? itemCalc.unitsPerPackage : 1;

    let unitText = 'und';
    if (productId === 'arroz' || productId === 'azucar' || productId === 'harina') {
      unitText = 'kg';
    } else if (productId === 'papel') {
      unitText = 'rollos';
    } else if (productId === 'jabon') {
      unitText = 'barras';
    }

    if (isLoose) {
      return {
        unitsPerPkg: 1,
        unitText,
        totalUnits: quantity,
        label: `(sueltas) · ${quantity} ${unitText} exactas`,
      };
    }

    const totalUnits = unitsPerPkg * quantity;
    return {
      unitsPerPkg,
      unitText,
      totalUnits,
      label: `Presentación: ${unitsPerPkg} ${unitText}/bulto · Total: ${totalUnits} ${unitText}`,
    };
  };

  // Resolve matching Company record from database
  const targetCompanyRecord = useMemo(() => {
    if (companies.length === 0) return null;
    if (selectedCompanyId === 'pc') {
      return (
        companies.find((c) => c.name.toLowerCase().includes('cárnicos') || c.name.toLowerCase().includes('carnicos')) ||
        companies[0]
      );
    } else {
      return (
        companies.find((c) => c.name.toLowerCase().includes('montano') || c.name.toLowerCase().includes('antilia')) ||
        companies[1] ||
        companies[0]
      );
    }
  }, [companies, selectedCompanyId]);

  // Initialize editable item rows based on selected company
  const [itemRows, setItemRows] = useState<ItemRowState[]>([]);

  useEffect(() => {
    const mappings = resolvedMappings.length > 0 ? resolvedMappings : dotacionConfigService.getMappings();
    const rows: ItemRowState[] = [];

    const undUnit = unitsList.find((u) => {
      const n = u.name.trim().toUpperCase();
      return n === 'UND' || n === 'UNIDAD' || n === 'UNIDADES' || n === 'U';
    });

    const bultoUnit = unitsList.find((u) => {
      const n = u.name.trim().toUpperCase();
      return n === 'BULTO' || n === 'BTO' || n === 'BULTOS';
    });

    targetCompanyCalc.items
      .filter((it) => it.includedInPeriod && (it.bultosToBuy > 0 || it.looseUnitsToBuy > 0))
      .forEach((it) => {
        const mapping = mappings.find((m) => m.productId === it.productId);
        const poName = mapping?.customPoName || mapping?.materialName || it.productName;

        if (it.bultosToBuy > 0) {
          rows.push({
            productId: it.productId,
            materialName: poName,
            materialId: mapping?.materialId || null,
            materialCode: mapping?.materialCode || null,
            unitId: mapping?.bultoUnitId || bultoUnit?.id || mapping?.unitId || null,
            quantity: it.bultosToBuy,
            unit: mapping?.bultoUnitName || bultoUnit?.name || 'BULTO',
            unitPrice: 0,
            isExempt: mapping ? mapping.isExempt : false,
            selected: true,
            isLoose: false,
          });
        }
        if (it.looseUnitsToBuy > 0) {
          rows.push({
            productId: it.productId,
            materialName: poName, // Nombre limpio oficial sin "(Sueltas)"
            materialId: mapping?.materialId || null,
            materialCode: mapping?.materialCode || null,
            unitId: undUnit?.id || mapping?.unitId || null,
            quantity: it.looseUnitsToBuy,
            unit: undUnit?.name || 'UND', // Unidad de medida exacta solicitada: UND
            unitPrice: 0,
            isExempt: mapping ? mapping.isExempt : false,
            selected: true,
            isLoose: true,
          });
        }
      });

    setItemRows(rows);
    setObservations(
      `Orden de Dotación Quincenal (${result.periodLabel}) para ${targetCompanyCalc.companyName}. Requerimiento calculado por Sistema de Compras.`
    );
    setCreatedOrderLink(null);
  }, [selectedCompanyId, result, targetCompanyCalc, unitsList, resolvedMappings]);

  const handleToggleItem = (index: number) => {
    const updated = [...itemRows];
    updated[index].selected = !updated[index].selected;
    setItemRows(updated);
  };

  const handleQuantityChange = (index: number, val: number) => {
    const updated = [...itemRows];
    updated[index].quantity = Math.max(0, val);
    setItemRows(updated);
  };

  const handlePriceChange = (index: number, val: number) => {
    const updated = [...itemRows];
    updated[index].unitPrice = Math.max(0, val);
    setItemRows(updated);
  };

  const handleApplyAllLastPrices = async () => {
    const targetIndices = itemRows
      .map((row, idx) => ({ row, idx }))
      .filter(({ row }) => row.selected && !!row.materialId);

    if (targetIndices.length === 0) return;

    setIsApplyingPrices(true);
    try {
      const results = await Promise.all(
        targetIndices.map(async ({ row, idx }) => {
          const history = await getPriceHistoryByMaterialId(row.materialId!, row.unitId || undefined);
          if (!history || history.length === 0) return { idx, price: null };

          const sameSupplier = selectedSupplierId
            ? history.find((h) => h.supplier_id === selectedSupplierId)
            : undefined;
          const entry = sameSupplier || history[0];
          const converted = convertPriceToCurrency(
            entry.unit_price,
            entry.currency,
            currency,
            exchangeRate,
            entry.exchange_rate
          );
          return { idx, price: converted };
        })
      );

      let appliedCount = 0;
      const updated = [...itemRows];
      results.forEach(({ idx, price }) => {
        if (price !== null && price > 0) {
          updated[idx] = { ...updated[idx], unitPrice: price };
          appliedCount++;
        }
      });
      setItemRows(updated);

      if (appliedCount > 0) {
        showSuccess(`Último precio aplicado a ${appliedCount} ${appliedCount === 1 ? 'ítem' : 'ítems'}.`);
      } else {
        showError('No se encontraron precios históricos registrados para los ítems seleccionados.');
      }
    } catch (err) {
      console.error('[DotacionGeneratePODialog] Error applying last prices:', err);
      showError('Error al consultar el historial de precios.');
    } finally {
      setIsApplyingPrices(false);
    }
  };

  const handleCreateOrder = async () => {
    if (!session?.user?.id) {
      showError('No hay sesión de usuario activa.');
      return;
    }
    if (!targetCompanyRecord) {
      showError('No se encontró la empresa correspondiente en el sistema.');
      return;
    }
    if (!selectedSupplierId) {
      showError('Por favor selecciona un proveedor.');
      return;
    }
    if (!exchangeRate || exchangeRate <= 0) {
      showError('La tasa de cambio es requerida y debe ser mayor a cero.');
      return;
    }

    const selectedItems = itemRows.filter((row) => row.selected && row.quantity > 0);
    if (selectedItems.length === 0) {
      showError('Debes seleccionar al menos un insumo con cantidad mayor a 0.');
      return;
    }

    const unlinkedItem = selectedItems.find((row) => !row.materialId);
    if (unlinkedItem) {
      showError(
        `El ítem "${unlinkedItem.materialName}" no está vinculado a un material oficial del catálogo (falta ID). Revisa Configuración > Vinculación de Ítems.`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const orderData: CreatePurchaseOrderInput & { company_id: string } = {
        user_id: session.user.id,
        company_id: targetCompanyRecord.id,
        supplier_id: selectedSupplierId,
        currency,
        base_currency: baseCurrency,
        exchange_rate: exchangeRate,
        status: 'Draft',
        created_by: userName || 'Sistema Dotación',
        issue_date: format(new Date(), 'yyyy-MM-dd'),
        delivery_date: deliveryDate,
        payment_terms: paymentTerms,
        custom_payment_terms: null,
        credit_days: null,
        payment_date: null,
        paid_amount: null,
        observations,
        quote_request_id: null,
      };

      const itemsPayload: CreatePurchaseOrderItemInput[] = selectedItems.map((row) => {
        const pres = getItemPresentation(row.productId, row.quantity, row.isLoose);
        return {
          material_name: row.materialName,
          quantity: row.quantity,
          unit: row.unit,
          unit_price: row.unitPrice,
          tax_rate: row.isExempt ? 0 : 0.16,
          is_exempt: row.isExempt,
          supplier_code: row.materialCode || null,
          description: pres.label,
          unit_id: row.unitId || null,
          material_id: row.materialId || null,
          sales_percentage: 0,
          discount_percentage: 0,
          was_recalculated: false,
        };
      });

      // Create PO in database
      const createdOrder = await purchaseOrderService.create(orderData as unknown as CreatePurchaseOrderInput, itemsPayload);

      if (createdOrder) {
        const supplierObj = suppliers.find((s) => s.id === selectedSupplierId);
        const orderLink: GeneratedPurchaseOrderLink = {
          orderId: createdOrder.id,
          sequenceNumber: createdOrder.sequence_number || 'Borrador',
          companyName: targetCompanyRecord.name,
          companyId: targetCompanyRecord.id,
          supplierName: supplierObj?.name || 'Proveedor General',
          supplierId: selectedSupplierId,
          totalBultos: selectedItems.filter(it => !it.isLoose).reduce((acc, it) => acc + it.quantity, 0),
          currency,
          createdAt: new Date().toISOString(),
        };

        setCreatedOrderLink(orderLink);

        // If a snapshot is open, link it
        if (snapshotId) {
          await dotacionSnapshotService.linkPurchaseOrder(snapshotId, orderLink);
        }

        if (onOrderCreated) {
          onOrderCreated(orderLink);
        }

        showSuccess(`Orden de Compra creada con éxito (ID: ${createdOrder.id.slice(0, 8)}).`);
      }
    } catch (err) {
      console.error('Error generating purchase order:', err);
      showError('Ocurrió un error al generar la orden de compra.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.5rem)] sm:w-full sm:max-w-4xl lg:max-w-5xl max-h-[94vh] overflow-y-auto p-3.5 sm:p-5">
        <DialogHeader className="pb-1 sm:pb-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-red-100 text-procarni-primary shrink-0">
                <ShoppingCart className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-base sm:text-lg font-bold text-procarni-dark truncate">
                  Generar Orden de Compra desde Dotación Quincenal
                </DialogTitle>
                <DialogDescription className="text-[11px] text-slate-500 truncate">
                  Convierte los bultos calculados en una Orden de Compra formal en estado Borrador.
                </DialogDescription>
              </div>
            </div>
            <Badge variant="outline" className="hidden sm:inline-flex text-[10px] text-slate-600 bg-slate-50 font-mono shrink-0">
              {result.periodLabel}
            </Badge>
          </div>
        </DialogHeader>

        {createdOrderLink ? (
          <div className="py-6 text-center space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-14 h-14 bg-emerald-100 text-procarni-secondary rounded-full flex items-center justify-center mx-auto shadow-sm">
              <Check className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-procarni-dark">¡Orden de Compra Creada Exitosamente!</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                Se ha generado la Orden de Compra con {createdOrderLink.totalBultos} bultos para{' '}
                <strong className="text-slate-700">{createdOrderLink.companyName}</strong>.
              </p>
            </div>
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 max-w-sm mx-auto text-xs text-left space-y-1.5 font-mono">
              <div className="flex justify-between">
                <span className="text-slate-500">ID Orden:</span>
                <span className="font-bold text-procarni-dark">{createdOrderLink.orderId.slice(0, 13)}...</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Proveedor:</span>
                <span className="font-bold text-slate-800 truncate max-w-[180px]">{createdOrderLink.supplierName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total Bultos:</span>
                <span className="font-bold text-procarni-primary">{createdOrderLink.totalBultos} bultos</span>
              </div>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCreatedOrderLink(null)}
                className="text-xs"
              >
                Crear Otra Orden
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  navigate(`/purchase-orders/${createdOrderLink.orderId}`);
                }}
                className="text-xs font-bold bg-procarni-primary hover:bg-[#6e0808] text-white"
              >
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                Ver Orden de Compra
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5 pt-0.5">
            {/* Empresa Selector y Proveedor en fila compacta */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end">
              <div className="md:col-span-5 space-y-1">
                <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  Empresa Compradora
                </Label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedCompanyId('pc')}
                    className={`px-2.5 py-1.5 rounded-lg border text-left transition-all flex items-center justify-between ${
                      selectedCompanyId === 'pc'
                        ? 'border-procarni-blue bg-blue-50/80 ring-1 ring-procarni-blue/30 text-procarni-blue font-bold shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                    }`}
                  >
                    <span className="text-xs truncate">Cárnicos (PC)</span>
                    <span className="text-[10px] font-mono font-extrabold ml-1 px-1.5 py-0.5 rounded bg-white/90 text-procarni-blue shrink-0">
                      {result.pc.totalBultos} bto
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedCompanyId('ma')}
                    className={`px-2.5 py-1.5 rounded-lg border text-left transition-all flex items-center justify-between ${
                      selectedCompanyId === 'ma'
                        ? 'border-procarni-secondary bg-emerald-50/80 ring-1 ring-procarni-secondary/30 text-procarni-secondary font-bold shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                    }`}
                  >
                    <span className="text-xs truncate">Montano (MA)</span>
                    <span className="text-[10px] font-mono font-extrabold ml-1 px-1.5 py-0.5 rounded bg-white/90 text-procarni-secondary shrink-0">
                      {result.ma.totalBultos} bto
                    </span>
                  </button>
                </div>
              </div>

              {/* Proveedor Selector (Combobox con barra de búsqueda) */}
              <div className="md:col-span-7 space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    Proveedor de Alimentos / Aseo
                  </Label>
                  <span className="text-[10px] text-slate-400 truncate max-w-[180px]">
                    Adjudicación de la orden
                  </span>
                </div>
                <Popover open={supplierComboboxOpen} onOpenChange={setSupplierComboboxOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={supplierComboboxOpen}
                      className="w-full justify-between h-8 text-xs bg-white font-normal border-slate-200 hover:bg-slate-50 text-slate-800"
                    >
                      <span className="truncate">
                        {selectedSupplier
                          ? `${selectedSupplier.name} (${selectedSupplier.rif || 'S/R'})`
                          : 'Buscar y seleccionar proveedor...'}
                      </span>
                      <ChevronsUpDown className="ml-1.5 h-3.5 w-3.5 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0 z-[100]" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar proveedor por nombre o RIF..." className="h-8 text-xs" />
                      <CommandList className="max-h-56 overflow-y-auto">
                        <CommandEmpty className="py-2.5 text-center text-xs text-slate-500">
                          No se encontraron proveedores.
                        </CommandEmpty>
                        <CommandGroup>
                          {suppliers.map((s) => (
                            <CommandItem
                              key={s.id}
                              value={`${s.name} ${s.rif || ''}`}
                              onSelect={() => {
                                setSelectedSupplierId(s.id);
                                setSupplierComboboxOpen(false);
                              }}
                              className="text-xs cursor-pointer flex items-center justify-between py-1.5 px-2.5 hover:bg-slate-100"
                            >
                              <div className="flex flex-col min-w-0 pr-2">
                                <span className="font-semibold text-slate-800 truncate">{s.name}</span>
                                <span className="text-[10px] text-slate-400 font-mono">{s.rif || 'Sin RIF'}</span>
                              </div>
                              {selectedSupplierId === s.id && (
                                <Check className="h-4 w-4 text-procarni-primary shrink-0" />
                              )}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Condiciones Comerciales y Tasa de Cambio */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-2 sm:p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 text-xs">
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] font-bold text-slate-500 uppercase">Moneda</Label>
                  {currency === 'VES' && (
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => setBaseCurrency('USD')}
                        className={`px-1 py-0.2 rounded text-[9px] font-bold border transition-colors ${
                          baseCurrency === 'USD'
                            ? 'bg-procarni-primary text-white border-procarni-primary'
                            : 'bg-white text-slate-600 border-slate-200'
                        }`}
                      >
                        USD
                      </button>
                      <button
                        type="button"
                        onClick={() => setBaseCurrency('EUR')}
                        className={`px-1 py-0.2 rounded text-[9px] font-bold border transition-colors ${
                          baseCurrency === 'EUR'
                            ? 'bg-procarni-primary text-white border-procarni-primary'
                            : 'bg-white text-slate-600 border-slate-200'
                        }`}
                      >
                        EUR
                      </button>
                    </div>
                  )}
                </div>
                <Select
                  value={currency}
                  onValueChange={(val) => {
                    const nextCurr = val as 'USD' | 'VES' | 'EUR';
                    setCurrency(nextCurr);
                    if (nextCurr === 'USD' || nextCurr === 'EUR') {
                      setBaseCurrency(nextCurr);
                    }
                  }}
                >
                  <SelectTrigger className="h-8 text-xs mt-0.5 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD ($)</SelectItem>
                    <SelectItem value="VES">VES (Bs.)</SelectItem>
                    <SelectItem value="EUR">EUR (€)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <ExchangeRateInput
                  compact
                  baseCurrency={baseCurrency}
                  exchangeRate={exchangeRate}
                  onExchangeRateChange={setExchangeRate}
                />
              </div>

              <div>
                <Label className="text-[10px] font-bold text-slate-500 uppercase">Condición Pago</Label>
                <Select value={paymentTerms} onValueChange={setPaymentTerms}>
                  <SelectTrigger className="h-8 text-xs mt-0.5 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Contado">Contado</SelectItem>
                    <SelectItem value="Crédito (7 días)">Crédito (7 días)</SelectItem>
                    <SelectItem value="Crédito (15 días)">Crédito (15 días)</SelectItem>
                    <SelectItem value="Crédito (30 días)">Crédito (30 días)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-[10px] font-bold text-slate-500 uppercase">Fecha Entrega</Label>
                <Input
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  className="h-8 text-xs mt-0.5 bg-white"
                />
              </div>
            </div>

            {/* Insumos a Incluir en la Orden */}
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Insumos a Incluir en la Orden
                  </Label>
                  <span className="text-[11px] text-slate-500">
                    ({itemRows.filter((r) => r.selected).length}/{itemRows.length})
                  </span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleApplyAllLastPrices}
                  disabled={isApplyingPrices || isLoadingMeta || itemRows.filter((r) => r.selected && !!r.materialId).length === 0}
                  className="h-7 text-[11px] font-semibold border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-procarni-primary"
                >
                  {isApplyingPrices ? (
                    <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                  ) : (
                    <Clock className="w-3 h-3 mr-1.5 text-procarni-primary" />
                  )}
                  Aplicar Últimos Precios
                </Button>
              </div>

              {!isLoadingMeta && itemRows.some((r) => r.selected && !r.materialId) && (
                <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 flex items-center gap-2 text-[11px] text-amber-900">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    Uno o más ítems no tienen un material oficial vinculado en el catálogo (falta ID). Configúralos en{' '}
                    <strong>Configuración &gt; Vinculación de Ítems de Dotación</strong>.
                  </span>
                </div>
              )}

              {/* MOBILE STACKED CARDS (< md) */}
              <div className="block md:hidden space-y-2 max-h-72 overflow-y-auto pr-1">
                {itemRows.map((row, idx) => {
                  const pres = getItemPresentation(row.productId, row.quantity, row.isLoose);
                  return (
                    <div
                      key={`${row.productId}-${row.unit}-${idx}`}
                      className={`p-2.5 rounded-xl border transition-all ${
                        row.selected ? 'bg-white border-slate-300 shadow-xs' : 'bg-slate-50/70 border-slate-200 opacity-50'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <input
                          type="checkbox"
                          checked={row.selected}
                          onChange={() => handleToggleItem(idx)}
                          className="mt-0.5 rounded border-slate-300 text-procarni-primary focus:ring-procarni-primary/20 w-4 h-4 cursor-pointer shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-slate-900 text-xs truncate">{row.materialName}</span>
                            {row.isLoose && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                Sueltas
                              </span>
                            )}
                            {row.materialCode ? (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-blue-50 text-procarni-blue border border-blue-200">
                                [{row.materialCode}]
                              </span>
                            ) : !isLoadingMeta && !row.materialId ? (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-red-50 text-red-700 border border-red-200">
                                Sin ID
                              </span>
                            ) : null}
                            {row.isExempt ? (
                              <span className="px-1 py-0.2 rounded text-[9px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Exento
                              </span>
                            ) : (
                              <span className="px-1 py-0.2 rounded text-[9px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                +16% IVA
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-500 font-medium block mt-0.5">
                            {pres.label}
                          </span>
                        </div>
                      </div>

                      {row.selected && (
                        <div className="grid grid-cols-2 gap-2 mt-2 pt-1.5 border-t border-slate-100">
                          <div>
                            <Label className="text-[9px] uppercase font-bold text-slate-400 block">
                              Cant. ({row.unit || 'Bultos'})
                            </Label>
                            <Input
                              type="number"
                              min={0}
                              onWheel={(e) => e.currentTarget.blur()}
                              value={row.quantity || ''}
                              placeholder="0"
                              onChange={(e) => handleQuantityChange(idx, e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
                              className="h-8 text-center font-mono font-bold text-xs mt-0.5 bg-white"
                            />
                          </div>
                          <div>
                            <div className="flex items-center justify-between gap-1 flex-wrap">
                              <Label className="text-[9px] uppercase font-bold text-slate-400 block">
                                P. Unit ({currency})
                              </Label>
                              <LastPriceButton
                                materialId={row.materialId}
                                unitId={row.unitId}
                                supplierId={selectedSupplierId}
                                currency={currency}
                                exchangeRate={exchangeRate}
                                currentPrice={row.unitPrice}
                                onApplyPrice={(price) => handlePriceChange(idx, price)}
                              />
                            </div>
                            <PriceInput
                              value={row.unitPrice}
                              onChange={(val) => handlePriceChange(idx, val)}
                              placeholder="0.00"
                              className="h-8 text-center font-mono font-bold text-xs mt-0.5 bg-white"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* DESKTOP TABLE (>= md) */}
              <div className="hidden md:block border border-slate-200 rounded-xl overflow-hidden max-h-[380px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500">
                      <TableHead className="w-10 text-center py-2">Sel.</TableHead>
                      <TableHead className="py-2">Insumo y Presentación</TableHead>
                      <TableHead className="text-center w-28 py-2">Cantidad</TableHead>
                      <TableHead className="text-center w-52 py-2">P. Unit ({currency})</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="text-xs divide-y divide-slate-100">
                    {itemRows.map((row, idx) => {
                      const pres = getItemPresentation(row.productId, row.quantity, row.isLoose);
                      return (
                        <TableRow key={`${row.productId}-${row.unit}-${idx}`} className={row.selected ? 'bg-white' : 'opacity-40 bg-slate-50'}>
                          <TableCell className="text-center py-2">
                            <input
                              type="checkbox"
                              checked={row.selected}
                              onChange={() => handleToggleItem(idx)}
                              className="rounded border-slate-300 text-procarni-primary focus:ring-procarni-primary/20 w-4 h-4 cursor-pointer"
                            />
                          </TableCell>
                          <TableCell className="py-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-slate-800 text-xs">{row.materialName}</span>
                              {row.isLoose && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                  Sueltas
                                </span>
                              )}
                              {row.materialCode ? (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-blue-50 text-procarni-blue border border-blue-200">
                                  [{row.materialCode}]
                                </span>
                              ) : !isLoadingMeta && !row.materialId ? (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-red-50 text-red-700 border border-red-200">
                                  Sin ID catálogo
                                </span>
                              ) : null}
                              {row.isExempt ? (
                                <span className="px-1 py-0.2 rounded text-[9px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  Exento
                                </span>
                              ) : (
                                <span className="px-1 py-0.2 rounded text-[9px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                  +16% IVA
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-500 font-medium block mt-0.5 leading-tight">
                              {pres.label}
                            </span>
                          </TableCell>
                          <TableCell className="text-center py-2">
                            <Input
                              type="number"
                              min={0}
                              onWheel={(e) => e.currentTarget.blur()}
                              value={row.quantity || ''}
                              placeholder="0"
                              disabled={!row.selected}
                              onChange={(e) => handleQuantityChange(idx, e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
                              className="h-7 w-20 mx-auto text-center font-mono text-xs"
                            />
                          </TableCell>
                          <TableCell className="text-center py-2">
                            <div className="flex items-center justify-center gap-1.5">
                              <PriceInput
                                value={row.unitPrice}
                                disabled={!row.selected}
                                onChange={(val) => handlePriceChange(idx, val)}
                                placeholder="0.00"
                                className="h-7 w-20 text-center font-mono text-xs"
                              />
                              {row.selected && (
                                <LastPriceButton
                                  materialId={row.materialId}
                                  unitId={row.unitId}
                                  supplierId={selectedSupplierId}
                                  currency={currency}
                                  exchangeRate={exchangeRate}
                                  currentPrice={row.unitPrice}
                                  onApplyPrice={(price) => handlePriceChange(idx, price)}
                                />
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Observaciones (compacto) */}
            <div className="flex items-center gap-2 pt-0.5">
              <Label htmlFor="obs" className="text-[10px] font-bold text-slate-500 uppercase shrink-0">
                Observaciones:
              </Label>
              <Input
                id="obs"
                value={observations}
                onChange={(e) => setObservations(e.target.value)}
                className="h-7.5 text-xs bg-white"
                placeholder="Observaciones adicionales para la orden..."
              />
            </div>
          </div>
        )}

        <DialogFooter className="pt-3 flex flex-col-reverse sm:flex-row gap-2 sm:gap-2">
          {!createdOrderLink && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
                className="w-full sm:w-auto h-11 sm:h-9 text-xs"
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleCreateOrder}
                disabled={isSubmitting || isLoadingMeta}
                className="w-full sm:w-auto h-11 sm:h-9 text-xs font-bold bg-procarni-primary hover:bg-[#6e0808] text-white"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Creando Orden...
                  </>
                ) : (
                  <>
                    <ShoppingCart className="w-3.5 h-3.5 mr-1.5" />
                    Crear Orden de Compra ({targetCompanyCalc.shortName})
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
