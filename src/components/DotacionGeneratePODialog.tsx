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
import { purchaseOrderService, CreatePurchaseOrderItemInput } from '@/services/purchaseOrderService';
import { dotacionSnapshotService } from '@/services/dotacionSnapshotService';
import { getAllCompanies } from '@/integrations/supabase/services/companyService';
import { getAllSuppliers } from '@/integrations/supabase/services/supplierService';
import { useSession } from '@/components/SessionContextProvider';
import { showSuccess, showError } from '@/utils/toast';
import { ShoppingCart, Loader2, Building2, Check, ExternalLink, Calendar, Truck } from 'lucide-react';
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
    const rows: ItemRowState[] = targetCompanyCalc.items
      .filter((it) => it.includedInPeriod && it.bultosToBuy > 0)
      .map((it) => ({
        productId: it.productId,
        materialName: it.productName,
        quantity: it.bultosToBuy,
        unit: 'Bulto',
        unitPrice: 0,
        isExempt: false,
        selected: true,
      }));

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

      const itemsPayload: CreatePurchaseOrderItemInput[] = selectedItems.map((row) => ({
        material_name: row.materialName,
        quantity: row.quantity,
        unit: row.unit,
        unit_price: row.unitPrice,
        tax_rate: row.isExempt ? 0 : 0.16,
        is_exempt: row.isExempt,
        supplier_code: null,
        description: `Dotación quincenal - ${row.quantity} bultos`,
        unit_id: null,
        material_id: null,
        sales_percentage: 0,
        discount_percentage: 0,
        was_recalculated: false,
      }));

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
          totalBultos: selectedItems.reduce((acc, it) => acc + it.quantity, 0),
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
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
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
                    <span className="text-[10px] uppercase font-bold text-procarni-secondary block">Empresa Aliada</span>
                    <span className="text-xs font-extrabold text-slate-900 block truncate">Montano Antilia</span>
                    <span className="text-[11px] font-mono text-slate-500 font-bold mt-1 block">
                      {result.ma.totalBultos} bultos
                    </span>
                  </button>
                </div>
              </div>

              {/* Proveedor Selector */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Proveedor de Alimentos / Aseo
                </Label>
                <Select value={selectedSupplierId} onValueChange={setSelectedSupplierId}>
                  <SelectTrigger className="h-10 text-xs">
                    <SelectValue placeholder="Seleccionar proveedor..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id} className="text-xs">
                        {s.name} ({s.rif || 'S/R'})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-slate-500">
                  Proveedor registrado al cual se le adjudicará el pedido.
                </p>
              </div>
            </div>

            {/* Condiciones Comerciales */}
            <div className="grid grid-cols-3 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
              <div>
                <Label className="text-[10px] font-bold text-slate-500 uppercase">Moneda</Label>
                <Select value={currency} onValueChange={(val) => setCurrency(val as 'USD' | 'VES' | 'EUR')}>
                  <SelectTrigger className="h-8 text-xs mt-1 bg-white">
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
                  <SelectTrigger className="h-8 text-xs mt-1 bg-white">
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
                  className="h-8 text-xs mt-1 bg-white"
                />
              </div>
            </div>

            {/* Tabla de Insumos Pre-cargados */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Insumos a Incluir en la Orden
                </Label>
                <span className="text-[11px] text-slate-500">
                  {itemRows.filter((r) => r.selected).length} de {itemRows.length} ítems seleccionados
                </span>
              </div>
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500">
                      <TableHead className="w-10 text-center">Sel.</TableHead>
                      <TableHead>Insumo</TableHead>
                      <TableHead className="text-center w-28">Cant. (Bultos)</TableHead>
                      <TableHead className="text-center w-28">P. Unit ({currency})</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="text-xs divide-y divide-slate-100">
                    {itemRows.map((row, idx) => (
                      <TableRow key={row.productId} className={row.selected ? 'bg-white' : 'opacity-40 bg-slate-50'}>
                        <TableCell className="text-center">
                          <input
                            type="checkbox"
                            checked={row.selected}
                            onChange={() => handleToggleItem(idx)}
                            className="rounded border-slate-300 text-procarni-primary focus:ring-procarni-primary/20 w-4 h-4 cursor-pointer"
                          />
                        </TableCell>
                        <TableCell className="font-semibold text-slate-800">
                          {row.materialName}
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
                    ))}
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
                className="h-8 text-xs"
                placeholder="Observaciones adicionales..."
              />
            </div>
          </div>
        )}

        <DialogFooter className="pt-2">
          {!createdOrderLink && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
                className="text-xs"
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleCreateOrder}
                disabled={isSubmitting || isLoadingMeta}
                className="text-xs font-bold bg-procarni-primary hover:bg-[#6e0808] text-white"
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
