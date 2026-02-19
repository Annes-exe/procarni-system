import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSession } from '@/components/SessionContextProvider';
import { useShoppingCart } from '@/context/ShoppingCartContext';
import { calculateTotals } from '@/utils/calculations';
import { PlusCircle, ArrowLeft, Loader2 } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';
import { searchSuppliers, searchCompanies, searchMaterialsBySupplier, getSupplierDetails, updateQuoteRequest } from '@/integrations/supabase/data';
import { purchaseOrderService } from '@/services/purchaseOrderService';
import { MadeWithDyad } from '@/components/made-with-dyad';

import { useLocation, useNavigate } from 'react-router-dom';
import PurchaseOrderItemsTable from '@/components/PurchaseOrderItemsTable';
import PurchaseOrderDetailsForm from '@/components/PurchaseOrderDetailsForm';
import { format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import SupplierCreationDialog from '@/components/SupplierCreationDialog';
import SmartSearch from '@/components/SmartSearch';

interface Company {
  id: string;
  name: string;
  rif: string;
}

const MATERIAL_UNITS = [
  'KG', 'LT', 'ROL', 'PAQ', 'SACO', 'GAL', 'UND', 'MT', 'RESMA', 'PZA', 'TAMB', 'MILL', 'CAJA', 'PAR'
];

interface Supplier {
  id: string;
  name: string;
}

const GeneratePurchaseOrder = () => {
  const { session } = useSession();
  const { items, addItem, updateItem, removeItem, clearCart } = useShoppingCart();
  const location = useLocation();
  const navigate = useNavigate();

  const [companyId, setCompanyId] = React.useState<string>('');
  const [companyName, setCompanyName] = React.useState<string>('');
  const [supplierId, setSupplierId] = React.useState<string>('');
  const [supplierName, setSupplierName] = React.useState<string>('');
  const [currency, setCurrency] = React.useState<'USD' | 'VES'>('USD');
  const [exchangeRate, setExchangeRate] = React.useState<number | undefined>(undefined);
  const [serviceOrderId, setServiceOrderId] = React.useState<string | null>(null);

  const [deliveryDate, setDeliveryDate] = React.useState<Date | undefined>(undefined);
  const [paymentTerms, setPaymentTerms] = React.useState<'Contado' | 'Crédito' | 'Otro'>('Contado');
  const [customPaymentTerms, setCustomPaymentTerms] = React.useState<string>('');
  const [creditDays, setCreditDays] = React.useState<number>(0);
  const [observations, setObservations] = React.useState<string>('');

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isAddSupplierDialogOpen, setIsAddSupplierDialogOpen] = React.useState(false);

  const userId = session?.user?.id;
  const userEmail = session?.user?.email;

  const quoteRequest = location.state?.quoteRequest;
  const supplierData = location.state?.supplier;
  const materialData = location.state?.material;

  React.useEffect(() => {
    const loadQuoteRequestItems = async () => {
      // 1. Handle Quote Request
      if (quoteRequest) {
        setCompanyId(quoteRequest.company_id);
        setCompanyName(quoteRequest.companies?.name || '');
        setSupplierId(quoteRequest.supplier_id);
        setSupplierName(quoteRequest.suppliers?.name || '');
        setCurrency(quoteRequest.currency as 'USD' | 'VES');
        setExchangeRate(quoteRequest.exchange_rate || undefined);
        setObservations(`Generado desde Solicitud de Cotización: ${quoteRequest.id.substring(0, 8)}`);

        clearCart();

        const supplierIdForSearch = quoteRequest.supplier_id;

        for (const item of quoteRequest.quote_request_items) {
          let materialId: string | undefined = undefined;
          let supplierCode: string = '';
          let isExempt: boolean = false;

          if (supplierIdForSearch) {
            try {
              const associatedMaterials = await searchMaterialsBySupplier(supplierIdForSearch, item.material_name);
              const exactMatch = associatedMaterials.find(m => m.name.toLowerCase() === item.material_name.toLowerCase());

              if (exactMatch) {
                materialId = exactMatch.id;
                supplierCode = exactMatch.code || '';
                isExempt = exactMatch.is_exempt || false;
              }
            } catch (e) {
              console.error("Error searching material ID during QR conversion:", e);
            }
          }

          addItem({
            material_id: materialId,
            material_name: item.material_name,
            supplier_code: supplierCode,
            quantity: item.quantity,
            unit_price: 0,
            tax_rate: 0.16,
            is_exempt: isExempt,
            unit: item.unit || MATERIAL_UNITS[0],
            description: item.description || '',
            sales_percentage: 0,
            discount_percentage: 0,
          });
        }
      }
      // 2. Handle Service Order Items
      else if (location.state?.serviceOrderItems && location.state?.serviceOrder) {
        const { serviceOrder, serviceOrderItems, supplier } = location.state;

        setCompanyId(serviceOrder.company_id);
        setCompanyName(serviceOrder.companies?.name || '');
        setServiceOrderId(serviceOrder.id);

        if (supplier) {
          setSupplierId(supplier.id);
          setSupplierName(supplier.name);
        }

        setCurrency(serviceOrder.currency || 'USD');
        setObservations(`Generado desde Orden de Servicio #${serviceOrder.sequence_number || serviceOrder.id.substring(0, 8)}`);

        clearCart();

        for (const item of serviceOrderItems) {
          const materialName = item.materials?.name || item.material_name || item.description || 'Material sin nombre';

          addItem({
            material_id: item.material_id,
            material_name: materialName,
            supplier_code: item.supplier_code || '',
            quantity: item.quantity || 0,
            unit_price: item.unit_price || 0,
            tax_rate: item.tax_rate || 0.16,
            is_exempt: item.is_exempt || false,
            unit: item.unit || 'UND',
            description: item.description || '',
            sales_percentage: item.sales_percentage || 0,
            discount_percentage: item.discount_percentage || 0,
          });
        }
      }
    };

    loadQuoteRequestItems();
  }, [quoteRequest, location.state]);

  React.useEffect(() => {
    if (supplierData) {
      setSupplierId(supplierData.id);
      setSupplierName(supplierData.name);
    }
  }, [supplierData]);

  React.useEffect(() => {
    if (materialData) {
      addItem({
        material_id: materialData.id,
        material_name: materialData.name,
        supplier_code: '',
        quantity: 0,
        unit_price: 0,
        tax_rate: 0.16,
        is_exempt: materialData.is_exempt || false,
        unit: materialData.unit || MATERIAL_UNITS[0],
        description: materialData.specification || '',
        sales_percentage: 0,
        discount_percentage: 0,
      });
    }
  }, [materialData]);

  const { data: supplierDetails } = useQuery({
    queryKey: ['supplierDetails', supplierId],
    queryFn: () => getSupplierDetails(supplierId),
    enabled: !!supplierId,
  });

  React.useEffect(() => {
    if (supplierDetails) {
      const terms = supplierDetails.payment_terms as 'Contado' | 'Crédito' | 'Otro';
      setPaymentTerms(terms);
      setCustomPaymentTerms(supplierDetails.custom_payment_terms || '');
      setCreditDays(supplierDetails.credit_days || 0);
    } else {
      setPaymentTerms('Contado');
      setCustomPaymentTerms('');
      setCreditDays(0);
    }
  }, [supplierDetails]);

  const handleMaterialSelect = (index: number, material: any) => {
    updateItem(index, {
      material_id: material.id,
      material_name: material.name,
      unit: material.unit || MATERIAL_UNITS[0],
      is_exempt: material.is_exempt || false,
      description: material.specification || '',
    });
  };

  const handleAddItem = () => {
    addItem({
      material_id: undefined,
      material_name: '',
      supplier_code: '',
      quantity: 0,
      unit_price: 0,
      tax_rate: 0.16,
      is_exempt: false,
      unit: MATERIAL_UNITS[0],
      description: '',
      sales_percentage: 0,
      discount_percentage: 0,
    });
  };

  const handleItemChange = (index: number, field: keyof typeof items[0], value: any) => {
    updateItem(index, { [field]: value });
  };

  const handleRemoveItem = (index: number) => {
    removeItem(index);
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
    clearCart();
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
      status: 'Draft',
      created_by: userEmail || 'unknown',
      user_id: userId,
      delivery_date: deliveryDate ? format(deliveryDate, 'yyyy-MM-dd') : undefined,
      payment_terms: paymentTerms,
      custom_payment_terms: paymentTerms === 'Otro' ? customPaymentTerms : null,
      credit_days: paymentTerms === 'Crédito' ? creditDays : 0,
      observations: observations || null,
      quote_request_id: quoteRequest?.id || null,
      service_order_id: serviceOrderId || null,
    };

    const createdOrder = await purchaseOrderService.create(orderData as any, items as any);

    if (createdOrder) {
      if (quoteRequest?.id && quoteRequest.quote_request_items) {
        const itemsPayload = quoteRequest.quote_request_items.map((item: any) => ({
          material_name: item.material_name,
          quantity: item.quantity,
          description: item.description,
          unit: item.unit,
        }));

        const updatedQR = await updateQuoteRequest(quoteRequest.id, { status: 'Archived' }, itemsPayload);

        if (updatedQR) {
          console.log(`Quote Request ${quoteRequest.id} archived successfully.`);
        } else {
          showError('Advertencia: No se pudo archivar la Solicitud de Cotización de origen.');
        }
      }

      showSuccess('Orden de compra creada exitosamente.');
      clearCart();
      setCompanyId('');
      setCompanyName('');
      setSupplierId('');
      setSupplierName('');
      setExchangeRate(undefined);
      setDeliveryDate(undefined);
      setPaymentTerms('Contado');
      setCustomPaymentTerms('');
      setCreditDays(0);
      setObservations('');
      // navigate('/purchase-order-management'); // Optional: redirect user
    }
    setIsSubmitting(false);
  };

  // Shared Styles
  const microLabelClass = "text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-1.5 block";

  return (
    <div className="container mx-auto p-4 pb-24 relative min-h-screen">

      {/* 1. STICKY ACTION BAR */}
      <div className="relative md:sticky md:top-0 z-20 backdrop-blur-md bg-white/90 border-b border-gray-200 pb-3 pt-4 mb-6 -mx-4 px-4 shadow-sm flex justify-between items-center transition-all duration-200">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-gray-400 hover:text-procarni-dark hover:bg-gray-100 rounded-full h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-procarni-dark tracking-tight">Generar Orden</h1>
            <p className="text-[11px] text-gray-500 font-medium">Nueva Solicitud de Compra</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !userId || !companyId || !deliveryDate || items.length === 0}
            className="bg-procarni-primary hover:bg-red-800 text-white font-semibold shadow-sm hover:shadow-md transition-all active:scale-95"
          >
            {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando...</> : 'Guardar Orden'}
          </Button>
        </div>
      </div>

      <Card className="mb-6 border-gray-200 shadow-sm overflow-visible">
        <CardContent className="pt-6">

          {/* 2. HEADERS (Company & Supplier) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div>
              <label className={microLabelClass}>Empresa de Origen</label>
              <SmartSearch
                placeholder="Buscar empresa por RIF o nombre"
                onSelect={handleCompanySelect}
                fetchFunction={searchCompanies}
                displayValue={companyName}
                className="bg-gray-50/50 border-gray-200 focus:bg-white"
              />
            </div>
            <div>
              <label className={microLabelClass}>Proveedor</label>
              <div className="flex gap-2">
                <SmartSearch
                  placeholder="Buscar proveedor por RIF o nombre"
                  onSelect={handleSupplierSelect}
                  fetchFunction={searchSuppliers}
                  displayValue={supplierName}
                  className="bg-gray-50/50 border-gray-200 focus:bg-white"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setIsAddSupplierDialogOpen(true)}
                  className="shrink-0 border-dashed border-gray-300 hover:border-procarni-primary hover:text-procarni-primary"
                  title="Añadir nuevo proveedor"
                >
                  <PlusCircle className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* 3. DETAILS FORM */}
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

          {/* 4. ITEMS TABLE */}
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

export default GeneratePurchaseOrder;