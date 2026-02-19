// src/pages/GenerateServiceOrder.tsx

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSession } from '@/components/SessionContextProvider';
import { calculateTotals } from '@/utils/calculations';
import { ArrowLeft, Loader2, Wrench, PlusCircle, Package, Save, Info } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';
import { serviceOrderService, CreateServiceOrderInput, CreateServiceOrderItemInput, CreateServiceOrderMaterialInput } from '@/services/serviceOrderService';
import { searchSuppliers } from '@/integrations/supabase/data';
import { MadeWithDyad } from '@/components/made-with-dyad';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import ServiceOrderDetailsForm from '@/components/ServiceOrderDetailsForm';
import ServiceOrderItemsTable from '@/components/ServiceOrderItemsTable';
import SupplierCreationDialog from '@/components/SupplierCreationDialog';
import SmartSearch from '@/components/SmartSearch';
import { Label } from '@/components/ui/label';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import PurchaseOrderItemsTable from '@/components/PurchaseOrderItemsTable';

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

interface SparePartItem {
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

interface SparePartsGroup {
  internalId: string; // Unique ID for React keys
  supplierId: string;
  supplierName: string;
  items: SparePartItem[];
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

  // Spare Parts Groups
  const [sparePartsGroups, setSparePartsGroups] = useState<SparePartsGroup[]>([]);
  const [sparePartsSupplierId, setSparePartsSupplierId] = useState<string>('');
  const [sparePartsSupplierName, setSparePartsSupplierName] = useState<string>('');
  const [supplierListVersion, setSupplierListVersion] = useState(0);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAddSupplierDialogOpen, setIsAddSupplierDialogOpen] = useState(false);
  const [isSparePartsSupplierDialogOpen, setIsSparePartsSupplierDialogOpen] = useState(false);

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
    setSupplierListVersion(v => v + 1);
  };

  // --- SPARE PARTS LOGIC ---
  const handleAddSparePartsSupplier = (supplier: { id: string; name: string }) => {
    if (sparePartsGroups.some(g => g.supplierId === supplier.id)) {
      showError('Este proveedor ya ha sido agregado a la lista de repuestos.');
      setSparePartsSupplierId('');
      setSparePartsSupplierName('');
      return;
    }

    setSparePartsGroups(prev => [
      ...prev,
      {
        internalId: crypto.randomUUID(),
        supplierId: supplier.id,
        supplierName: supplier.name,
        items: []
      }
    ]);
    setSparePartsSupplierId('');
    setSparePartsSupplierName('');
    setSupplierListVersion(v => v + 1);
  };

  const handleAddSparePartItem = (groupIndex: number) => {
    setSparePartsGroups(prev => {
      const newGroups = [...prev];
      newGroups[groupIndex].items.push({
        material_name: '',
        quantity: 1,
        unit_price: 0,
        tax_rate: 0.16,
        is_exempt: false,
        sales_percentage: 0,
        discount_percentage: 0
      });
      return newGroups;
    });
  };

  const handleRemoveSparePartsGroup = (groupIndex: number) => {
    setSparePartsGroups(prev => prev.filter((_, i) => i !== groupIndex));
  };

  const handleRemoveSparePartItem = (groupIndex: number, itemIndex: number) => {
    setSparePartsGroups(prev => {
      const newGroups = [...prev];
      newGroups[groupIndex].items = newGroups[groupIndex].items.filter((_, i) => i !== itemIndex);
      return newGroups;
    });
  };

  const handleSparePartItemChange = (groupIndex: number, itemIndex: number, field: keyof SparePartItem, value: any) => {
    setSparePartsGroups(prev => {
      const newGroups = [...prev];
      newGroups[groupIndex].items[itemIndex] = {
        ...newGroups[groupIndex].items[itemIndex],
        [field]: value
      };
      return newGroups;
    });
  };

  const handleSparePartMaterialSelect = (groupIndex: number, itemIndex: number, material: any) => {
    setSparePartsGroups(prev => {
      const newGroups = [...prev];
      newGroups[groupIndex].items[itemIndex] = {
        ...newGroups[groupIndex].items[itemIndex],
        material_id: material.id,
        material_name: material.name,
        supplier_code: material.specification || '',
        unit: material.unit || 'UND',
        is_exempt: material.is_exempt || false,
        unit_price: 0
      };
      return newGroups;
    });
  };

  // --- TOTALS CALCULATION ---
  const calculateGrandTotals = () => {
    const serviceTotals = calculateTotals(items);

    // Flatten all spare parts items to calculate their totals
    const allSpareParts = sparePartsGroups.flatMap(g => g.items);
    // Cast as any because calculateTotals expects specific fields, which match SparePartItem structurally
    const materialsTotals = calculateTotals(allSpareParts as any);

    return {
      baseImponible: serviceTotals.baseImponible + materialsTotals.baseImponible,
      montoDescuento: serviceTotals.montoDescuento + materialsTotals.montoDescuento,
      montoVenta: serviceTotals.montoVenta + materialsTotals.montoVenta,
      montoIVA: serviceTotals.montoIVA + materialsTotals.montoIVA,
      total: serviceTotals.total + materialsTotals.total
    };
  };

  const totals = calculateGrandTotals();

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

    const invalidServiceItem = items.find(item =>
      !item.description || item.quantity <= 0 || item.unit_price <= 0
    );

    if (items.length === 0 && sparePartsGroups.every(g => g.items.length === 0)) {
      showError('Por favor, añade al menos un servicio o un repuesto.');
      return;
    }

    if (items.length > 0 && invalidServiceItem) {
      showError('Por favor, revisa los ítems de servicio: descripción, cantidad y precio obligatorios.');
      return;
    }

    // Validate spare parts
    for (const group of sparePartsGroups) {
      const invalidPart = group.items.find(item =>
        !item.material_name || item.quantity <= 0 || item.unit_price <= 0
      );
      if (invalidPart) {
        showError(`Revisa los repuestos del proveedor ${group.supplierName}: nombre, cantidad y precio obligatorios.`);
        return;
      }
    }

    setIsSubmitting(true);

    const orderData: CreateServiceOrderInput = {
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
      exchange_rate: currency === 'VES' ? exchangeRate || null : null,
      status: 'Draft',
      user_id: userId,
    };

    const serviceItems: CreateServiceOrderItemInput[] = items.map(item => ({
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      tax_rate: item.tax_rate,
      is_exempt: item.is_exempt,
      sales_percentage: item.sales_percentage,
      discount_percentage: item.discount_percentage,
    }));

    const materialsToSave: CreateServiceOrderMaterialInput[] = sparePartsGroups.flatMap(group =>
      group.items.map(item => ({
        supplier_id: group.supplierId,
        material_id: item.material_id || null,
        description: item.description || null,
        quantity: item.quantity,
        unit_price: item.unit_price,
        tax_rate: item.tax_rate ?? 0.16,
        is_exempt: item.is_exempt ?? false,
        supplier_code: item.supplier_code || null,
        unit: item.unit || null,
        sales_percentage: item.sales_percentage || null,
        discount_percentage: item.discount_percentage || null,
      }))
    );

    const createdOrder = await serviceOrderService.create(orderData, serviceItems, materialsToSave);

    if (createdOrder) {
      showSuccess('Orden de Servicio creada exitosamente.');
      // Reset form
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
      setSparePartsGroups([]);
      setSparePartsSupplierId('');
      setSparePartsSupplierName('');
    }
    setIsSubmitting(false);
  };

  return (
    <div className="container mx-auto p-4">
      {/* Action Header */}
      <div className="relative md:sticky md:top-0 z-20 backdrop-blur-md bg-white/90 border-b border-gray-200 pb-3 pt-4 mb-6 -mx-4 px-4 shadow-sm flex justify-between items-center transition-all duration-200">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-gray-400 hover:text-procarni-dark hover:bg-gray-100 rounded-full h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-procarni-dark tracking-tight">Generar Orden de Servicio</h1>
            <p className="text-[11px] text-gray-500 font-medium">Nueva Solicitud de Servicio</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleSubmit} disabled={isSubmitting || !companyId || !supplierId} className="bg-procarni-secondary hover:bg-green-700 shadow-sm">
            {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando...</> : <><Save className="mr-2 h-4 w-4" /> Guardar Orden</>}
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        <Card className="border-gray-200 shadow-sm overflow-hidden">
          <CardHeader className="bg-gray-50/50 pb-4 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <CardTitle className="text-sm font-bold uppercase tracking-wide text-gray-800 flex items-center">
                Información General
              </CardTitle>
              <div className="flex items-center space-x-2 text-sm text-gray-500">
                <Info className="h-4 w-4" />
                <span>Detalles de la orden</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6 md:p-8">
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
              supplierId={supplierId}
              supplierName={supplierName}
              onSupplierSelect={handleSupplierSelect}
              onAddNewSupplier={() => setIsAddSupplierDialogOpen(true)}
            />
          </CardContent>
        </Card>

        <Card className="border-gray-200 shadow-sm overflow-hidden">
          <CardHeader className="bg-gray-50/50 pb-4 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <CardTitle className="text-sm font-bold uppercase tracking-wide text-gray-800 flex items-center">
                <Wrench className="mr-2 h-4 w-4" /> Servicios
              </CardTitle>
              <Button onClick={handleAddItem} variant="secondary" size="sm" className="h-8">
                <PlusCircle className="mr-2 h-3.5 w-3.5" /> Añadir Servicio
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ServiceOrderItemsTable
              items={items}
              currency={currency}
              onAddItem={handleAddItem}
              onRemoveItem={handleRemoveItem}
              onItemChange={handleItemChange}
            />
            {items.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-gray-400 bg-white">
                <Wrench className="h-10 w-10 mb-3 text-gray-200" />
                <p className="text-sm">No hay servicios agregados a la orden.</p>
                <Button variant="link" onClick={handleAddItem} className="text-procarni-secondary">Añadir el primero</Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-gray-200 shadow-sm overflow-hidden">
          <CardHeader className="bg-gray-50/50 pb-4 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <CardTitle className="text-sm font-bold uppercase tracking-wide text-gray-800 flex items-center">
                <Package className="mr-2 h-4 w-4" /> Repuestos y Adicionales
              </CardTitle>
              <div className="flex items-center space-x-2 text-sm text-gray-500">
                <Info className="h-4 w-4" />
                <span>Materiales adicionales</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="mb-6 max-w-md">
              <div className="flex justify-between items-center">
                <Label className="mb-2 block">Añadir Proveedor de Repuestos</Label>
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => setIsSparePartsSupplierDialogOpen(true)}
                  className="h-auto p-0 text-xs text-procarni-primary mb-2"
                >
                  + Nuevo Proveedor
                </Button>
              </div>
              <div className="flex gap-2">
                <SmartSearch
                  key={`spare-parts-supplier-${supplierListVersion}`}
                  placeholder="Buscar proveedor (ej. Ferretería...)"
                  onSelect={handleAddSparePartsSupplier}
                  fetchFunction={searchSuppliers}
                  displayValue={sparePartsSupplierName}
                  className="w-full"
                />
              </div>
            </div>

            <SupplierCreationDialog
              isOpen={isSparePartsSupplierDialogOpen}
              onClose={() => setIsSparePartsSupplierDialogOpen(false)}
              onSupplierCreated={handleAddSparePartsSupplier}
            />

            {sparePartsGroups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-gray-400 bg-white">
                <Package className="h-10 w-10 mb-3 text-gray-200" />
                <p className="text-sm">No hay repuestos agregados a la orden.</p>
                <Button variant="link" onClick={() => setIsSparePartsSupplierDialogOpen(true)} className="text-procarni-secondary">Añadir el primero</Button>
              </div>
            ) : (
              <Accordion type="multiple" className="w-full space-y-4" defaultValue={sparePartsGroups.map(g => g.internalId)}>
                {sparePartsGroups.map((group, groupIndex) => (
                  <AccordionItem key={group.internalId} value={group.internalId} className="border rounded-lg bg-white shadow-sm px-4">
                    <AccordionTrigger className="hover:no-underline py-4">
                      <div className="flex justify-between items-center w-full pr-4">
                        <span className="font-bold text-gray-700">{group.supplierName}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 -my-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveSparePartsGroup(groupIndex);
                          }}
                        >
                          Quitar Grupo
                        </Button>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-2 pb-6">
                      <PurchaseOrderItemsTable
                        items={group.items as any}
                        supplierId={group.supplierId}
                        supplierName={group.supplierName}
                        currency={currency}
                        onAddItem={() => handleAddSparePartItem(groupIndex)}
                        onRemoveItem={(itemIndex) => handleRemoveSparePartItem(groupIndex, itemIndex)}
                        onItemChange={(itemIndex, field, value) => handleSparePartItemChange(groupIndex, itemIndex, field as any, value)}
                        onMaterialSelect={(itemIndex, material) => handleSparePartMaterialSelect(groupIndex, itemIndex, material)}
                        hideHeader={true}
                      />
                      <div className="px-5 mt-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleAddSparePartItem(groupIndex)}
                          className="w-full border-dashed border-gray-300 text-gray-500 hover:text-procarni-primary hover:bg-procarni-primary/5"
                        >
                          <PlusCircle className="mr-2 h-3.5 w-3.5" /> Añadir Repuesto
                        </Button>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </CardContent>
        </Card>

        {/* Totals Section - Redesigned */}
        <div className="bg-gray-50 p-6 rounded-lg border border-gray-100 shadow-inner">
          <div className="flex flex-col gap-3 max-w-sm ml-auto">
            <div className="flex justify-between text-sm">
              <span className="font-medium text-gray-600">Base Imponible:</span>
              <span className="font-mono">{currency} {totals.baseImponible.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="font-medium text-gray-600">Descuento:</span>
              <span className="font-mono text-procarni-alert">- {currency} {totals.montoDescuento.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="font-medium text-gray-600">Margen Comercial:</span>
              <span className="font-mono text-procarni-secondary">+ {currency} {totals.montoVenta.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="font-medium text-gray-600">IVA (16%):</span>
              <span className="font-mono">+ {currency} {totals.montoIVA.toFixed(2)}</span>
            </div>
            <div className="border-t border-gray-300 pt-3 mt-1">
              <div className="flex justify-between items-center">
                <span className="font-bold text-lg text-procarni-dark">TOTAL:</span>
                <span className="font-bold text-xl text-procarni-dark font-mono">{currency} {totals.total.toFixed(2)}</span>
              </div>
            </div>
            {totalInUSD && currency === 'VES' && (
              <div className="flex justify-end pt-1">
                <span className="text-sm font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded">
                  Ref. USD: {totalInUSD}
                </span>
              </div>
            )}
          </div>
        </div>

      </div>

      <SupplierCreationDialog
        isOpen={isAddSupplierDialogOpen}
        onClose={() => setIsAddSupplierDialogOpen(false)}
        onSupplierCreated={handleSupplierCreated}
      />
    </div>
  );
};

export default GenerateServiceOrder;
