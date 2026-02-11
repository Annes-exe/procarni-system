// src/pages/GenerateServiceOrder.tsx

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSession } from '@/components/SessionContextProvider';
import { calculateTotals } from '@/utils/calculations';
import { ArrowLeft, Loader2, FileText, Wrench, PlusCircle } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';
import { createServiceOrder, searchSuppliers } from '@/integrations/supabase/data';
import { MadeWithDyad } from '@/components/made-with-dyad';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import ServiceOrderDetailsForm from '@/components/ServiceOrderDetailsForm';
import ServiceOrderItemsTable from '@/components/ServiceOrderItemsTable';
import SupplierCreationDialog from '@/components/SupplierCreationDialog';
import SmartSearch from '@/components/SmartSearch';
import { Label } from '@/components/ui/label';

interface Company {
  id: string;
  name: string;
  rif: string;
}

interface Supplier {
  id: string;
  name: string;
}

interface ServiceOrderItemForm {
  id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  is_exempt: boolean;
  sales_percentage: number | null;
  discount_percentage: number | null;
}

const SERVICE_TYPES = [
  'Revisión', 'Reparación', 'Instalación', 'Mantenimiento', 'Otro'
];

const DESTINATION_ADDRESSES = [
  'PROCARNI', 'EMPOMACA', 'MONTANO'
];

const GenerateServiceOrder = () => {
  const { session } = useSession();
  const navigate = useNavigate();

  const [companyId, setCompanyId] = useState<string>('');
  const [companyName, setCompanyName] = useState<string>('');
  const [supplierId, setSupplierId] = useState<string>('');
  const [supplierName, setSupplierName] = useState<string>('');
  const [currency, setCurrency] = useState<'USD' | 'VES'>('USD');
  const [exchangeRate, setExchangeRate] = useState<number | undefined>(undefined);

  const [issueDate, setIssueDate] = useState<Date>(new Date());
  const [serviceDate, setServiceDate] = useState<Date | undefined>(undefined);
  const [equipmentName, setEquipmentName] = useState<string>('');
  const [serviceType, setServiceType] = useState<string>(SERVICE_TYPES[0]);
  const [detailedServiceDescription, setDetailedServiceDescription] = useState<string>('');
  const [destinationAddress, setDestinationAddress] = useState<string>(DESTINATION_ADDRESSES[0]);
  const [observations, setObservations] = useState<string>('');

  const [items, setItems] = useState<ServiceOrderItemForm[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAddSupplierDialogOpen, setIsAddSupplierDialogOpen] = useState(false);

  const userId = session?.user?.id;

  const handleAddItem = () => {
    setItems((prevItems) => [...prevItems, {
      description: '',
      quantity: 1,
      unit_price: 0,
      tax_rate: 0.16,
      is_exempt: false,
      sales_percentage: 0,
      discount_percentage: 0,
    }]);
  };

  const handleItemChange = (index: number, field: keyof ServiceOrderItemForm, value: string | number | boolean) => {
    setItems((prevItems) =>
      prevItems.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  const handleRemoveItem = (index: number) => {
    setItems((prevItems) => prevItems.filter((_, i) => i !== index));
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
    if (!serviceDate) {
      showError('Por favor, selecciona una fecha de servicio.');
      return;
    }
    if (!equipmentName.trim()) {
      showError('El nombre del equipo o maquinaria es requerido.');
      return;
    }
    if (!detailedServiceDescription.trim()) {
      showError('El detalle del servicio es requerido.');
      return;
    }
    if (currency === 'VES' && (!exchangeRate || exchangeRate <= 0)) {
      showError('La tasa de cambio es requerida y debe ser mayor que cero para órdenes en Bolívares.');
      return;
    }

    const invalidItem = items.find(item =>
      !item.description ||
      item.quantity <= 0 ||
      item.unit_price <= 0
    );

    if (items.length === 0 || invalidItem) {
      showError('Por favor, añade al menos un ítem de costo/servicio válido con descripción, cantidad y precio unitario mayor a cero.');
      return;
    }

    setIsSubmitting(true);
    const orderData = {
      issue_date: format(issueDate, 'yyyy-MM-dd'),
      service_date: format(serviceDate, 'yyyy-MM-dd'),
      supplier_id: supplierId,
      company_id: companyId,
      equipment_name: equipmentName.trim(),
      service_type: serviceType,
      detailed_service_description: detailedServiceDescription.trim(),
      destination_address: destinationAddress,
      observations: observations || null,
      currency,
      exchange_rate: currency === 'VES' ? exchangeRate : null,
      status: 'Draft' as const,
      user_id: userId,
    };

    const createdOrder = await createServiceOrder(orderData, items);

    if (createdOrder) {
      showSuccess('Orden de Servicio creada exitosamente.');
      // Reset form fields
      setCompanyId('');
      setCompanyName('');
      setSupplierId('');
      setSupplierName('');
      setExchangeRate(undefined);
      setIssueDate(new Date());
      setServiceDate(undefined);
      setEquipmentName('');
      setServiceType(SERVICE_TYPES[0]);
      setDetailedServiceDescription('');
      setDestinationAddress(DESTINATION_ADDRESSES[0]);
      setObservations('');
      setItems([]);
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
          <CardTitle className="text-procarni-primary flex items-center">
            <Wrench className="mr-2 h-6 w-6" /> Generar Orden de Servicio (OS)
          </CardTitle>
          <CardDescription>Crea una nueva orden de servicio para tus proveedores.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="md:col-span-1">
              <Label htmlFor="supplier">Proveedor *</Label>
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

          <ServiceOrderDetailsForm
            companyId={companyId}
            companyName={companyName}
            currency={currency}
            exchangeRate={exchangeRate}
            issueDate={issueDate}
            serviceDate={serviceDate}
            equipmentName={equipmentName}
            serviceType={serviceType}
            detailedServiceDescription={detailedServiceDescription}
            destinationAddress={destinationAddress}
            observations={observations}
            onCompanySelect={handleCompanySelect}
            onCurrencyChange={(checked) => setCurrency(checked ? 'VES' : 'USD')}
            onExchangeRateChange={setExchangeRate}
            onIssueDateChange={setIssueDate}
            onServiceDateChange={setServiceDate}
            onEquipmentNameChange={setEquipmentName}
            onServiceTypeChange={setServiceType}
            onDetailedServiceDescriptionChange={setDetailedServiceDescription}
            onDestinationAddressChange={setDestinationAddress}
            onObservationsChange={setObservations}
          />

          <ServiceOrderItemsTable
            items={items}
            currency={currency}
            onAddItem={handleAddItem}
            onRemoveItem={handleRemoveItem}
            onItemChange={handleItemChange}
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

            <Button onClick={handleSubmit} disabled={isSubmitting || !userId || !companyId || !supplierId || !serviceDate || items.length === 0} className="bg-procarni-secondary hover:bg-green-700">
              {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando...</> : 'Guardar Orden de Servicio'}
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

export default GenerateServiceOrder;