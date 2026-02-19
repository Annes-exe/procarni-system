import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSession } from '@/components/SessionContextProvider';
import { PlusCircle, ArrowLeft, Loader2 } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';
import { searchMaterialsBySupplier, searchSuppliers, searchCompanies } from '@/integrations/supabase/data'; // Removed updatePurchaseOrder, getPurchaseOrderDetails
import { purchaseOrderService } from '@/services/purchaseOrderService';
import { useQuery } from '@tanstack/react-query';
import { MadeWithDyad } from '@/components/made-with-dyad';
import { calculateTotals } from '@/utils/calculations';

import { format, parseISO } from "date-fns";
import { es } from 'date-fns/locale'; // Importar la localización en español
import PurchaseOrderItemsTable from '@/components/PurchaseOrderItemsTable';
import PurchaseOrderDetailsForm from '@/components/PurchaseOrderDetailsForm';
import SupplierCreationDialog from '@/components/SupplierCreationDialog'; // NEW IMPORT
import SmartSearch from '@/components/SmartSearch'; // Import SmartSearch
import { Label } from '@/components/ui/label'; // Import Label

interface Company {
  id: string;
  name: string;
  rif: string;
}

interface PurchaseOrderItemForm {
  id?: string;
  material_id?: string;
  material_name: string;
  supplier_code?: string;
  quantity: number;
  unit_price: number;
  tax_rate?: number;
  is_exempt?: boolean;
  unit?: string;
  description?: string;
  sales_percentage?: number;
  discount_percentage?: number;
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

interface Supplier {
  id: string;
  name: string;
}

const EditPurchaseOrder = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { session, isLoadingSession } = useSession();

  const [companyId, setCompanyId] = useState<string>('');
  const [companyName, setCompanyName] = useState<string>('');
  const [supplierId, setSupplierId] = useState<string>('');
  const [supplierName, setSupplierName] = useState<string>('');
  const [currency, setCurrency] = useState<'USD' | 'VES'>('USD');
  const [exchangeRate, setExchangeRate] = useState<number | undefined>(undefined);

  const [deliveryDate, setDeliveryDate] = useState<Date | undefined>(undefined);
  const [paymentTerms, setPaymentTerms] = useState<'Contado' | 'Crédito' | 'Otro'>('Contado');
  const [customPaymentTerms, setCustomPaymentTerms] = useState<string>('');
  const [creditDays, setCreditDays] = useState<number>(0);
  const [observations, setObservations] = useState<string>('');

  const [items, setItems] = useState<PurchaseOrderItemForm[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isAddSupplierDialogOpen, setIsAddSupplierDialogOpen] = useState(false); // NEW STATE

  const userId = session?.user?.id;
  const userEmail = session?.user?.email;

  const { data: initialOrder, isLoading: isLoadingOrder, error: orderError } = useQuery({
    queryKey: ['purchaseOrderDetails', id],
    queryFn: async () => {
      const res = await purchaseOrderService.getById(id!);
      return res as any; // Cast because local component expects specific structure (joins)
    },
    enabled: !!id && !!session && !isLoadingSession,
  });

  useEffect(() => {
    if (initialOrder) {
      setCompanyId(initialOrder.company_id);
      setCompanyName(initialOrder.companies?.name || '');
      setSupplierId(initialOrder.supplier_id);
      setSupplierName(initialOrder.suppliers?.name || '');
      setCurrency(initialOrder.currency as 'USD' | 'VES');
      setExchangeRate(initialOrder.exchange_rate || undefined);

      if (initialOrder.delivery_date) {
        setDeliveryDate(parseISO(initialOrder.delivery_date));
      } else {
        setDeliveryDate(undefined);
      }
      setPaymentTerms((initialOrder.payment_terms as 'Contado' | 'Crédito' | 'Otro') || 'Contado');
      setCustomPaymentTerms(initialOrder.custom_payment_terms || '');
      setCreditDays(initialOrder.credit_days || 0);
      setObservations(initialOrder.observations || '');

      setItems(initialOrder.purchase_order_items.map(item => ({
        id: item.id,
        material_id: item.material_id,
        material_name: item.material_name,
        supplier_code: item.supplier_code || '',
        quantity: item.quantity,
        unit_price: item.unit_price,
        tax_rate: item.tax_rate,
        is_exempt: item.is_exempt,
        unit: item.unit || 'KG',
        description: item.description || '',
        sales_percentage: item.sales_percentage || 0,
        discount_percentage: item.discount_percentage || 0,
      })));
    }
  }, [initialOrder]);

  const handleAddItem = () => {
    setItems((prevItems) => [...prevItems, {
      material_id: undefined,
      material_name: '',
      supplier_code: '',
      quantity: 0,
      unit_price: 0,
      tax_rate: 0.16,
      is_exempt: false,
      unit: 'KG',
      description: '',
      sales_percentage: 0,
      discount_percentage: 0,
    }]);
  };

  const handleItemChange = (index: number, field: keyof PurchaseOrderItemForm, value: any) => {
    setItems((prevItems) =>
      prevItems.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  const handleRemoveItem = (index: number) => {
    setItems((prevItems) => prevItems.filter((_, i) => i !== index));
  };

  const handleMaterialSelect = (index: number, material: MaterialSearchResult) => {
    handleItemChange(index, 'material_id', material.id);
    handleItemChange(index, 'material_name', material.name);
    handleItemChange(index, 'unit', material.unit || 'KG');
    handleItemChange(index, 'is_exempt', material.is_exempt || false);
    if (material.specification) {
      handleItemChange(index, 'description', material.specification);
    }
  };

  const handleCompanySelect = (company: Company) => {
    setCompanyId(company.id);
    setCompanyName(company.name);
  };

  const handleSupplierSelect = (supplier: { id: string; name: string }) => {
    setSupplierId(supplier.id);
    setSupplierName(supplier.name);
  };

  const handleSupplierCreated = (supplier: Supplier) => {
    setSupplierId(supplier.id);
    setSupplierName(supplier.name);
    setItems([]); // Clear items if a new supplier is selected/created
  };

  const totals = calculateTotals(items);

  const totalInUSD = React.useMemo(() => {
    if (currency === 'VES' && exchangeRate && exchangeRate > 0) {
      return (totals.total / exchangeRate).toFixed(2);
    }
    return null;
  }, [currency, exchangeRate, totals.total]);

  const handleSubmit = async () => {
    if (!userId) {
      showError('Usuario no autenticado.');
      return;
    }
    if (!companyId) {
      showError('Por favor, selecciona una empresa de origen.');
      return;
    }
    if (!supplierId) {
      showError('Por favor, selecciona un proveedor.');
      return;
    }
    if (currency === 'VES' && (!exchangeRate || exchangeRate <= 0)) {
      showError('La tasa de cambio es requerida y debe ser mayor que cero para órdenes en Bolívares.');
      return;
    }

    const invalidItem = items.find(item =>
      !item.material_id ||
      !item.material_name ||
      item.quantity <= 0 ||
      item.unit_price <= 0
    );

    if (items.length === 0) {
      showError('Por favor, añade al menos un ítem a la orden.');
      return;
    }

    if (invalidItem) {
      let specificError = 'Por favor, revisa los ítems: ';
      if (!invalidItem.material_id) {
        specificError += `El material "${invalidItem.material_name || 'Nuevo Ítem'}" no ha sido seleccionado correctamente (falta ID).`;
      } else if (invalidItem.quantity <= 0) {
        specificError += `La cantidad del material "${invalidItem.material_name}" debe ser mayor a cero.`;
      } else if (invalidItem.unit_price <= 0) {
        specificError += `El precio unitario del material "${invalidItem.material_name}" debe ser mayor a cero.`;
      }
      showError(specificError);
      return;
    }

    if (paymentTerms === 'Otro' && (!customPaymentTerms || customPaymentTerms.trim() === '')) {
      showError('Debe especificar los términos de pago personalizados.');
      return;
    }
    if (paymentTerms === 'Crédito' && (creditDays === undefined || creditDays <= 0)) {
      showError('Debe especificar los días de crédito.');
      return;
    }
    if (!deliveryDate) {
      showError('Debe seleccionar una fecha de entrega.');
      return;
    }

    setIsSubmitting(true);
    const orderData = {
      supplier_id: supplierId,
      company_id: companyId,
      currency,
      exchange_rate: currency === 'VES' ? exchangeRate : null,
      status: initialOrder.status,
      created_by: userEmail || 'unknown',
      user_id: userId,
      delivery_date: deliveryDate ? format(deliveryDate, 'yyyy-MM-dd') : undefined,
      payment_terms: paymentTerms,
      custom_payment_terms: paymentTerms === 'Otro' ? customPaymentTerms : null,
      credit_days: paymentTerms === 'Crédito' ? creditDays : 0,
      observations: observations || null,
    };

    const updatedOrder = await purchaseOrderService.update(id!, orderData, items as any);

    if (updatedOrder) {
      showSuccess('Orden de compra actualizada exitosamente.');
      navigate(`/purchase-orders/${id}`);
    }
    setIsSubmitting(false);
  };

  if (isLoadingOrder || isLoadingSession) {
    return (
      <div className="container mx-auto p-4 text-center text-muted-foreground">
        Cargando orden de compra para edición...
      </div>
    );
  }

  if (orderError) {
    showError(orderError.message);
    return (
      <div className="container mx-auto p-4 text-center text-destructive">
        Error al cargar la orden de compra: {orderError.message}
        <Button asChild variant="link" className="mt-4">
          <Link to="/purchase-order-management">Volver a la gestión de órdenes</Link>
        </Button>
      </div>
    );
  }

  if (!initialOrder) {
    return (
      <div className="container mx-auto p-4 text-center text-muted-foreground">
        Orden de compra no encontrada.
        <Button asChild variant="link" className="mt-4">
          <Link to="/purchase-order-management">Volver a la gestión de órdenes</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      {/* 1. STICKY ACTION BAR */}
      <div className="relative md:sticky md:top-0 z-20 backdrop-blur-md bg-white/90 border-b border-gray-200 pb-3 pt-4 mb-6 -mx-4 px-4 shadow-sm flex justify-between items-center transition-all duration-200">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-gray-400 hover:text-procarni-dark hover:bg-gray-100 rounded-full h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-procarni-dark tracking-tight">Editar Orden #{initialOrder.sequence_number}</h1>
            <p className="text-[11px] text-gray-500 font-medium">Modificar Detalles de Compra</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !userId || !companyId || !deliveryDate || items.length === 0}
            className="bg-procarni-primary hover:bg-red-800 text-white font-semibold shadow-sm hover:shadow-md transition-all active:scale-95"
          >
            {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando...</> : 'Guardar Cambios'}
          </Button>
        </div>
      </div>

      <Card className="mb-6 border-gray-200 shadow-sm overflow-visible">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="md:col-span-1">
              <Label htmlFor="company">Empresa de Origen</Label>
              <SmartSearch
                placeholder="Buscar empresa por RIF o nombre"
                onSelect={handleCompanySelect}
                fetchFunction={searchCompanies}
                displayValue={companyName}
              />
              {companyName && <p className="text-sm text-muted-foreground mt-1 break-words">Empresa seleccionada: {companyName}</p>}
            </div>
            <div className="md:col-span-1">
              <Label htmlFor="supplier">Proveedor</Label>
              <div className="flex gap-2">
                <SmartSearch
                  placeholder="Buscar proveedor por RIF o nombre"
                  onSelect={handleSupplierSelect}
                  fetchFunction={searchSuppliers}
                  displayValue={supplierName}
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setIsAddSupplierDialogOpen(true)}
                  className="shrink-0"
                  title="Añadir nuevo proveedor"
                >
                  <PlusCircle className="h-4 w-4" />
                </Button>
              </div>
              {supplierName && <p className="text-sm text-muted-foreground mt-1 break-words">Proveedor seleccionado: {supplierName}</p>}
            </div>
          </div>

          <PurchaseOrderDetailsForm
            companyId={companyId}
            companyName={companyName}
            supplierId={supplierId}
            supplierName={supplierName}
            currency={currency}
            exchangeRate={exchangeRate}
            deliveryDate={deliveryDate}
            paymentTerms={paymentTerms}
            customPaymentTerms={customPaymentTerms}
            creditDays={creditDays}
            observations={observations}
            onCompanySelect={handleCompanySelect}
            onCurrencyChange={(checked) => setCurrency(checked ? 'VES' : 'USD')}
            onExchangeRateChange={setExchangeRate}
            onDeliveryDateChange={setDeliveryDate}
            onPaymentTermsChange={setPaymentTerms}
            onCustomPaymentTermsChange={setCustomPaymentTerms}
            onCreditDaysChange={setCreditDays}
            onObservationsChange={setObservations}
          />

          <PurchaseOrderItemsTable
            items={items}
            supplierId={supplierId}
            supplierName={supplierName}
            currency={currency}
            onAddItem={handleAddItem}
            onRemoveItem={handleRemoveItem}
            onItemChange={handleItemChange}
            onMaterialSelect={handleMaterialSelect}
          />

          {/* 5. TOTALS SECTION ("TICKET DE CAJA") */}
          <div className="mt-8 flex justify-end">
            <div className="w-full max-w-sm bg-gray-50/50 rounded-lg border border-gray-100 p-6 space-y-3">

              {/* 2. Discount */}
              {totals.montoDescuento > 0 && (
                <div className="flex justify-between items-center text-sm text-red-600">
                  <span className="font-medium">Descuento</span>
                  <span className="font-mono">- {currency} {totals.montoDescuento.toFixed(2)}</span>
                </div>
              )}

              {/* 3. Base Imponible (Taxable Amount) */}
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500 font-medium">Base Imponible</span>
                <span className="font-mono text-gray-700">{currency} {totals.baseImponible.toFixed(2)}</span>
              </div>

              {/* 5. Sales Percentage / Margin (montoVenta) */}
              {totals.montoVenta > 0 && (
                <div className="flex justify-between items-center text-sm text-blue-600">
                  <span className="font-medium">% de Venta</span>
                  <span className="font-mono">+ {currency} {totals.montoVenta.toFixed(2)}</span>
                </div>
              )}

              {/* 6. IVA */}
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500 font-medium">Monto IVA (16%)</span>
                <span className="font-mono text-gray-700">+ {currency} {totals.montoIVA.toFixed(2)}</span>
              </div>

              <div className="h-px bg-gray-200 my-2" />

              {/* 6. Total Final */}
              <div className="flex justify-between items-center text-lg">
                <span className="font-bold text-procarni-dark">Total Final</span>
                <span className="font-mono font-bold text-procarni-secondary text-xl">{currency} {totals.total.toFixed(2)}</span>
              </div>

              {totalInUSD && currency === 'VES' && (
                <div className="flex justify-end pt-1">
                  <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
                    Ref. USD {totalInUSD}
                  </span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      <MadeWithDyad />
      <SupplierCreationDialog
        isOpen={isAddSupplierDialogOpen}
        onClose={() => setIsAddSupplierDialogOpen(false)}
        onSupplierCreated={handleSupplierCreated}
      />
    </div>
  );
};

export default EditPurchaseOrder;