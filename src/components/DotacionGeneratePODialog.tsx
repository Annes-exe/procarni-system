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
import { DotacionCalculationResult, GeneratedPurchaseOrderLink } from '@/types/dotacion';
import { Company, Supplier } from '@/integrations/supabase/types';
import { purchaseOrderService, CreatePurchaseOrderItemInput, CreatePurchaseOrderInput } from '@/services/purchaseOrderService';
import { dotacionSnapshotService } from '@/services/dotacionSnapshotService';
import { getAllCompanies } from '@/integrations/supabase/services/companyService';
import { getAllSuppliers } from '@/integrations/supabase/services/supplierService';
import { useSession } from '@/components/SessionContextProvider';
import { showSuccess, showError } from '@/utils/toast';
import { ShoppingCart, Loader2, Building2, Check, ExternalLink, Calendar, Truck, ChevronsUpDown, Search } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useNavigate } from 'react-router-dom';
import { format, addDays } from 'date-fns';

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
  quantity: number;
  unit: string;
  unitPrice: number;
  isExempt: boolean;
  selected: boolean;
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
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [supplierComboboxOpen, setSupplierComboboxOpen] = useState<boolean>(false);
  const [currency, setCurrency] = useState<'USD' | 'VES' | 'EUR'>('USD');
  const [exchangeRate, setExchangeRate] = useState<number>(1);
  const [deliveryDate, setDeliveryDate] = useState<string>(format(addDays(new Date(), 3), 'yyyy-MM-dd'));
  const [paymentTerms, setPaymentTerms] = useState<string>('Contado');
  const [observations, setObservations] = useState<string>('');
  const [isLoadingMeta, setIsLoadingMeta] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [createdOrderLink, setCreatedOrderLink] = useState<GeneratedPurchaseOrderLink | null>(null);

  // Load companies and suppliers
  useEffect(() => {
    if (!open) return;
    const fetchMetadata = async () => {
      setIsLoadingMeta(true);
      try {
        const [companiesData, suppliersData] = await Promise.all([
          getAllCompanies(),
          getAllSuppliers(),
        ]);
        setCompanies(companiesData || []);
        setSuppliers(suppliersData || []);

        if (suppliersData && suppliersData.length > 0) {
          setSelectedSupplierId((prev) => prev || suppliersData[0].id);
        }
      } catch (err) {
        console.error('Error loading companies/suppliers:', err);
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
  const getItemPresentation = (productId: string, quantity: number, unit?: string) => {
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

    if (unit && unit !== 'Bulto') {
      return {
        unitsPerPkg: 1,
        unitText,
        totalUnits: quantity,
        label: `Unidades sueltas exactas · Total: ${quantity} ${unitText}`,
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
    const rows: ItemRowState[] = [];
    targetCompanyCalc.items
      .filter((it) => it.includedInPeriod && (it.bultosToBuy > 0 || it.looseUnitsToBuy > 0))
      .forEach((it) => {
        if (it.bultosToBuy > 0) {
          rows.push({
            productId: it.productId,
            materialName: it.productName,
            quantity: it.bultosToBuy,
            unit: 'Bulto',
            unitPrice: 0,
            isExempt: false,
            selected: true,
          });
        }
        if (it.looseUnitsToBuy > 0) {
          const unitWord = it.productId === 'azucar' || it.productId === 'arroz'
            ? 'Kg'
            : (it.productId === 'papel' ? 'Rollo' : (it.productId === 'jabon' ? 'Barra' : 'Und'));
          rows.push({
            productId: it.productId,
            materialName: `${it.productName} (Sueltas)`,
            quantity: it.looseUnitsToBuy,
            unit: unitWord,
            unitPrice: 0,
            isExempt: false,
            selected: true,
          });
        }
      });

    setItemRows(rows);
    setObservations(
      `Orden de Dotación Quincenal (${result.periodLabel}) para ${targetCompanyCalc.companyName}. Requerimiento calculado por Sistema de Compras.`
    );
    setCreatedOrderLink(null);
  }, [selectedCompanyId, result, targetCompanyCalc]);

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

    const selectedItems = itemRows.filter((row) => row.selected && row.quantity > 0);
    if (selectedItems.length === 0) {
      showError('Debes seleccionar al menos un insumo con cantidad mayor a 0.');
      return;
    }

    setIsSubmitting(true);
    try {
      const orderData: CreatePurchaseOrderInput & { company_id: string } = {
        user_id: session.user.id,
        company_id: targetCompanyRecord.id,
        supplier_id: selectedSupplierId,
        currency,
        base_currency: currency === 'EUR' ? 'EUR' : 'USD',
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
        const pres = getItemPresentation(row.productId, row.quantity, row.unit);
        return {
          material_name: row.materialName,
          quantity: row.quantity,
          unit: row.unit,
          unit_price: row.unitPrice,
          tax_rate: row.isExempt ? 0 : 0.16,
          is_exempt: row.isExempt,
          supplier_code: null,
          description: pres.label,
          unit_id: null,
          material_id: null,
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
          totalBultos: selectedItems.filter(it => it.unit === "Bulto").reduce((acc, it) => acc + it.quantity, 0),
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
      <DialogContent className="w-[calc(100vw-1.5rem)] sm:w-full sm:max-w-4xl lg:max-w-5xl max-h-[92vh] overflow-y-auto p-3.5 sm:p-6">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-red-100 text-procarni-primary">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-procarni-dark">
                Generar Orden de Compra desde Dotación Quincenal
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Convierte los bultos calculados en una Orden de Compra formal en estado Borrador.
              </DialogDescription>
            </div>
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
          <div className="space-y-5 pt-2">
            {/* Empresa Selector */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Empresa Compradora
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedCompanyId('pc')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      selectedCompanyId === 'pc'
                        ? 'border-procarni-blue bg-blue-50/60 ring-2 ring-procarni-blue/20'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <span className="text-[10px] uppercase font-bold text-procarni-blue block">Empresa Principal</span>
                    <span className="text-xs font-extrabold text-slate-900 block truncate">Productos Cárnicos</span>
                    <span className="text-[11px] font-mono text-slate-500 font-bold mt-1 block">
                      {result.pc.totalBultos} bultos
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedCompanyId('ma')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      selectedCompanyId === 'ma'
                        ? 'border-procarni-secondary bg-emerald-50/60 ring-2 ring-procarni-secondary/20'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <span className="text-[10px] uppercase font-bold text-procarni-secondary block">Empresa Principal</span>
                    <span className="text-xs font-extrabold text-slate-900 block truncate">Montano Antilia</span>
                    <span className="text-[11px] font-mono text-slate-500 font-bold mt-1 block">
                      {result.ma.totalBultos} bultos
                    </span>
                  </button>
                </div>
              </div>

              {/* Proveedor Selector (Combobox con barra de búsqueda) */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Proveedor de Alimentos / Aseo
                </Label>
                <Popover open={supplierComboboxOpen} onOpenChange={setSupplierComboboxOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={supplierComboboxOpen}
                      className="w-full justify-between h-10 text-xs bg-white font-normal border-slate-200 hover:bg-slate-50 text-slate-800"
                    >
                      <span className="truncate">
                        {selectedSupplier
                          ? `${selectedSupplier.name} (${selectedSupplier.rif || 'S/R'})`
                          : 'Buscar y seleccionar proveedor...'}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0 z-[100]" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar proveedor por nombre o RIF..." className="h-9 text-xs" />
                      <CommandList className="max-h-60 overflow-y-auto">
                        <CommandEmpty className="py-3 text-center text-xs text-slate-500">
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
                              className="text-xs cursor-pointer flex items-center justify-between py-2 px-3 hover:bg-slate-100"
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
                <p className="text-[10px] text-slate-500">
                  Proveedor registrado al cual se le adjudicará el pedido.
                </p>
              </div>
            </div>

            {/* Condiciones Comerciales */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
              <div>
                <Label className="text-[10px] font-bold text-slate-500 uppercase">Moneda</Label>
                <Select value={currency} onValueChange={(val) => setCurrency(val as 'USD' | 'VES' | 'EUR')}>
                  <SelectTrigger className="h-10 sm:h-8 text-xs mt-1 bg-white">
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
                <Label className="text-[10px] font-bold text-slate-500 uppercase">Condición Pago</Label>
                <Select value={paymentTerms} onValueChange={setPaymentTerms}>
                  <SelectTrigger className="h-10 sm:h-8 text-xs mt-1 bg-white">
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
                  className="h-10 sm:h-8 text-xs mt-1 bg-white"
                />
              </div>
            </div>

            {/* Insumos a Incluir en la Orden */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Insumos a Incluir en la Orden
                </Label>
                <span className="text-[11px] text-slate-500">
                  {itemRows.filter((r) => r.selected).length} de {itemRows.length} ítems seleccionados
                </span>
              </div>

              {/* MOBILE STACKED CARDS (< md) */}
              <div className="block md:hidden space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {itemRows.map((row, idx) => {
                  const pres = getItemPresentation(row.productId, row.quantity);
                  return (
                    <div
                      key={row.productId}
                      className={`p-3 rounded-xl border transition-all ${
                        row.selected ? 'bg-white border-slate-300 shadow-xs' : 'bg-slate-50/70 border-slate-200 opacity-50'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <input
                          type="checkbox"
                          checked={row.selected}
                          onChange={() => handleToggleItem(idx)}
                          className="mt-0.5 rounded border-slate-300 text-procarni-primary focus:ring-procarni-primary/20 w-5 h-5 cursor-pointer shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <span className="font-bold text-slate-900 text-xs block truncate">{row.materialName}</span>
                          <span className="text-[11px] text-slate-500 font-medium block mt-0.5">
                            {pres.label}
                          </span>
                        </div>
                      </div>

                      {row.selected && (
                        <div className="grid grid-cols-2 gap-2 mt-2.5 pt-2 border-t border-slate-100">
                          <div>
                            <Label className="text-[10px] uppercase font-bold text-slate-400 block">
                              Cant. (Bultos)
                            </Label>
                            <Input
                              type="number"
                              min={0}
                              value={row.quantity}
                              onChange={(e) => handleQuantityChange(idx, parseInt(e.target.value) || 0)}
                              className="h-10 text-center font-mono font-bold text-sm mt-1 bg-white"
                            />
                          </div>
                          <div>
                            <Label className="text-[10px] uppercase font-bold text-slate-400 block">
                              P. Unit ({currency})
                            </Label>
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              value={row.unitPrice}
                              onChange={(e) => handlePriceChange(idx, parseFloat(e.target.value) || 0)}
                              placeholder="0.00"
                              className="h-10 text-center font-mono font-bold text-sm mt-1 bg-white"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* DESKTOP TABLE (>= md) */}
              <div className="hidden md:block border border-slate-200 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500">
                      <TableHead className="w-10 text-center">Sel.</TableHead>
                      <TableHead>Insumo y Presentación</TableHead>
                      <TableHead className="text-center w-28">Cant. (Bultos)</TableHead>
                      <TableHead className="text-center w-28">P. Unit ({currency})</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="text-xs divide-y divide-slate-100">
                    {itemRows.map((row, idx) => {
                      const pres = getItemPresentation(row.productId, row.quantity);
                      return (
                        <TableRow key={row.productId} className={row.selected ? 'bg-white' : 'opacity-40 bg-slate-50'}>
                          <TableCell className="text-center">
                            <input
                              type="checkbox"
                              checked={row.selected}
                              onChange={() => handleToggleItem(idx)}
                              className="rounded border-slate-300 text-procarni-primary focus:ring-procarni-primary/20 w-4 h-4 cursor-pointer"
                            />
                          </TableCell>
                          <TableCell className="py-2.5">
                            <span className="font-bold text-slate-800 block text-xs">{row.materialName}</span>
                            <span className="text-[11px] text-slate-500 font-medium block mt-0.5">
                              {pres.label}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <Input
                              type="number"
                              min={0}
                              value={row.quantity}
                              disabled={!row.selected}
                              onChange={(e) => handleQuantityChange(idx, parseInt(e.target.value) || 0)}
                              className="h-7 w-20 mx-auto text-center font-mono text-xs"
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              value={row.unitPrice}
                              disabled={!row.selected}
                              onChange={(e) => handlePriceChange(idx, parseFloat(e.target.value) || 0)}
                              placeholder="0.00"
                              className="h-7 w-24 mx-auto text-center font-mono text-xs"
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Observaciones */}
            <div className="space-y-1">
              <Label htmlFor="obs" className="text-[10px] font-bold text-slate-500 uppercase">
                Observaciones de la Orden
              </Label>
              <Input
                id="obs"
                value={observations}
                onChange={(e) => setObservations(e.target.value)}
                className="h-10 sm:h-8 text-xs"
                placeholder="Observaciones adicionales..."
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
