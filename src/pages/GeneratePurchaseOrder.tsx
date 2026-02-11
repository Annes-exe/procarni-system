import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSession } from '@/components/SessionContextProvider';
import { useShoppingCart } from '@/context/ShoppingCartContext';
import { calculateTotals } from '@/utils/calculations';
import { PlusCircle, Trash2, ArrowLeft, Loader2, FileText } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';
import { createPurchaseOrder, searchSuppliers, searchCompanies, searchMaterialsBySupplier, getSupplierDetails, updateQuoteRequest } from '@/integrations/supabase/data';
import { MadeWithDyad } from '@/components/made-with-dyad';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

import { useLocation, useNavigate } from 'react-router-dom';
import PurchaseOrderItemsTable from '@/components/PurchaseOrderItemsTable';
import PurchaseOrderDetailsForm from '@/components/PurchaseOrderDetailsForm';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useQuery } from '@tanstack/react-query';
import SupplierCreationDialog from '@/components/SupplierCreationDialog';
import SmartSearch from '@/components/SmartSearch';
import { Label } from '@/components/ui/label';

interface Company {
  id: string;
  name: string;
  rif: string;
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

const MATERIAL_UNITS = [
  'KG', 'LT', 'ROL', 'PAQ', 'SACO', 'GAL', 'UND', 'MT', 'RESMA', 'PZA', 'TAMB', 'MILL', 'CAJA', 'PAR'
];

const GeneratePurchaseOrder = () => {
  const { session, isLoadingSession } = useSession();
  const { items, addItem, updateItem, removeItem, clearCart } = useShoppingCart();
  const location = useLocation();
  const navigate = useNavigate();

  const [companyId, setCompanyId] = React.useState<string>('');
  const [companyName, setCompanyName] = React.useState<string>('');
  const [supplierId, setSupplierId] = React.useState<string>('');
  const [supplierName, setSupplierName] = React.useState<string>('');
  const [currency, setCurrency] = React.useState<'USD' | 'VES'>('USD');
  const [exchangeRate, setExchangeRate] = React.useState<number | undefined>(undefined);

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
    };

    loadQuoteRequestItems();
  }, [quoteRequest]);

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

  const handleMaterialSelect = (index: number, material: MaterialSearchResult) => {
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
    };

    const createdOrder = await createPurchaseOrder(orderData, items);

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
    }
    setIsSubmitting(false);
  };

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-4">
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver
        </Button>
      </div>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-procarni-primary">Generar Orden de Compra (OC)</CardTitle>
          <CardDescription>Crea una nueva orden de compra para tus proveedores.</CardDescription>
        </CardHeader>
        <CardContent>
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

          <div className="mt-8 border-t pt-4">
            <div className="flex justify-end items-center mb-2">
              <span className="font-semibold mr-2">Base Imponible:</span>
              <span>{currency} {totals.baseImponible.toFixed(2)}</span>
            </div>
            <div className="flex justify-end items-center mb-2">
              <span className="font-semibold mr-2">Monto Descuento:</span>
              <span className="text-red-600">- {currency} {totals.montoDescuento.toFixed(2)}</span>
            </div>
            <div className="flex justify-end items-center mb-2">
              <span className="font-semibold mr-2">Monto Venta:</span>
              <span className="text-blue-600">+ {currency} {totals.montoVenta.toFixed(2)}</span>
            </div>
            <div className="flex justify-end items-center mb-2">
              <span className="font-semibold mr-2">Monto IVA:</span>
              <span>+ {currency} {totals.montoIVA.toFixed(2)}</span>
            </div>
            <div className="flex justify-end items-center text-xl font-bold">
              <span className="mr-2">TOTAL:</span>
              <span>{currency} {totals.total.toFixed(2)}</span>
            </div>
            {totalInUSD && currency === 'VES' && (
              <div className="flex justify-end items-center text-lg font-bold text-blue-600 mt-1">
                <span className="mr-2">TOTAL (USD):</span>
                <span>USD {totalInUSD}</span>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 mt-6">

            <Button onClick={handleSubmit} disabled={isSubmitting || !userId || !companyId || !deliveryDate || items.length === 0} className="bg-procarni-secondary hover:bg-green-700">
              {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando...</> : 'Guardar Orden de Compra'}
            </Button>
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