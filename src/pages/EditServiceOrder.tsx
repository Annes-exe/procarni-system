
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSession } from '@/components/SessionContextProvider';
import { calculateTotals } from '@/utils/calculations';
import { ArrowLeft, Loader2, Save, Trash2, PlusCircle, Wrench } from 'lucide-react';
import { showError, showSuccess, showLoading, dismissToast } from '@/utils/toast';
import {
    getServiceOrderDetails,
    updateServiceOrder,
    searchSuppliers
} from '@/integrations/supabase/data';
import { ServiceOrder, ServiceOrderItem } from '@/integrations/supabase/types';
import { MadeWithDyad } from '@/components/made-with-dyad';
import { format } from 'date-fns';
import ServiceOrderDetailsForm from '@/components/ServiceOrderDetailsForm';
import ServiceOrderItemsTable from '@/components/ServiceOrderItemsTable';
import SmartSearch from '@/components/SmartSearch';
import { Label } from '@/components/ui/label';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import PurchaseOrderItemsTable from '@/components/PurchaseOrderItemsTable';
import SupplierCreationDialog from '@/components/SupplierCreationDialog';
import { Package } from 'lucide-react';

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

// Interface correctly matching the joined response from Supabase
// Interface correctly matching the joined response from Supabase
interface ServiceOrderDetailsResponse extends ServiceOrder {
    suppliers?: { name: string };
    companies?: { name: string };
    service_order_items: ServiceOrderItem[];
    service_order_materials: any[]; // We will map this to our form state
}

interface ServiceOrderMaterialForm {
    id?: string;
    material_id?: string;
    material_name: string; // Added for display in PurchaseOrderItemsTable
    supplier_id: string; // The supplier of the spare part
    quantity: number;
    unit_price: number;
    tax_rate: number;
    is_exempt: boolean;
    supplier_code?: string;
    unit?: string;
    description?: string;
    sales_percentage: number | null;
    discount_percentage: number | null;
}

interface SparePartsGroup {
    internalId: string; // For React keys
    supplierId: string;
    supplierName: string;
    items: ServiceOrderMaterialForm[];
}

const SERVICE_TYPES = [
    'Revisión', 'Reparación', 'Instalación', 'Mantenimiento', 'Otro'
];

const DESTINATION_ADDRESSES = [
    'PROCARNI', 'EMPOMACA', 'MONTANO'
];

const EditServiceOrder = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { session } = useSession();

    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form State
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
    const [sequenceNumber, setSequenceNumber] = useState<number>(0);

    const [items, setItems] = useState<ServiceOrderItemForm[]>([]);

    // Spare Parts State
    const [sparePartsGroups, setSparePartsGroups] = useState<SparePartsGroup[]>([]);
    const [sparePartsSupplierId, setSparePartsSupplierId] = useState<string>('');
    const [sparePartsSupplierName, setSparePartsSupplierName] = useState<string>('');
    const [isSparePartsSupplierDialogOpen, setIsSparePartsSupplierDialogOpen] = useState(false);

    useEffect(() => {
        const fetchOrder = async () => {
            if (!id) return;
            setIsLoading(true);
            try {
                // Cast to the extended interface that includes the joined properties
                const order = await getServiceOrderDetails(id) as unknown as ServiceOrderDetailsResponse;
                if (!order) {
                    showError('Orden no encontrada.');
                    navigate('/service-order-management');
                    return;
                }

                // Check editable status
                if (order.status !== 'Draft' && order.status !== 'Sent' && order.status !== 'Rejected') {
                    showError('Esta orden no se puede editar en su estado actual.');
                    navigate(`/service-orders/${id}`);
                    return;
                }

                setCompanyId(order.company_id);
                setCompanyName(order.companies?.name || '');
                setSupplierId(order.supplier_id);
                setSupplierName(order.suppliers?.name || '');
                setCurrency(order.currency);
                setExchangeRate(order.exchange_rate || undefined);
                setIssueDate(order.issue_date ? new Date(order.issue_date + 'T12:00:00') : new Date());
                setServiceDate(order.service_date ? new Date(order.service_date + 'T12:00:00') : undefined);
                setEquipmentName(order.equipment_name);
                setServiceType(order.service_type);
                setDetailedServiceDescription(order.detailed_service_description || '');
                setDestinationAddress(order.destination_address);
                setObservations(order.observations || '');
                setSequenceNumber(order.sequence_number || 0);

                // Map items
                // Map items
                const loadedItems: ServiceOrderItemForm[] = order.service_order_items?.map((item) => ({
                    id: item.id,
                    description: item.description,
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                    tax_rate: item.tax_rate,
                    is_exempt: item.is_exempt,
                    sales_percentage: item.sales_percentage || 0,
                    discount_percentage: item.discount_percentage || 0,
                })) || [];
                setItems(loadedItems);

                // Map Materials to SparePartsGroups
                if (order.service_order_materials && order.service_order_materials.length > 0) {
                    const groups: Record<string, SparePartsGroup> = {};

                    order.service_order_materials.forEach(mat => {
                        const supplierId = mat.supplier_id;
                        // For editing, we rely on the backend join to get supplier name if possible, 
                        // or falls back to 'Proveedor'. Better approach is to ensure backend returns it.
                        // We updated getById to return suppliers(name) for materials.
                        // However, the typed response for getById (ServiceOrder) doesn't strictly have nested joins typed 
                        // unless we cast it properly.
                        // Let's assume the data structure matches what we set up in backend.
                        // @ts-ignore
                        const supName = mat.suppliers?.name || 'Proveedor';

                        if (!groups[supplierId]) {
                            groups[supplierId] = {
                                internalId: Math.random().toString(36).substr(2, 9),
                                supplierId: supplierId,
                                supplierName: supName,
                                items: []
                            };
                        }

                        groups[supplierId].items.push({
                            id: mat.id,
                            material_id: mat.material_id,
                            supplier_id: mat.supplier_id,
                            quantity: mat.quantity,
                            unit_price: mat.unit_price,
                            tax_rate: mat.tax_rate,
                            is_exempt: mat.is_exempt,
                            supplier_code: mat.supplier_code || undefined,
                            unit: mat.unit || undefined,
                            description: mat.description || '',
                            // @ts-ignore
                            material_name: mat.materials?.name || '',
                            sales_percentage: mat.sales_percentage || 0,
                            discount_percentage: mat.discount_percentage || 0,
                        });
                    });
                    setSparePartsGroups(Object.values(groups));
                }

            } catch (error: unknown) {
                console.error("Error loading order:", error);
                showError('Error al cargar la orden.');
            } finally {
                setIsLoading(false);
            }
        };

        fetchOrder();
    }, [id, navigate]);


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

    const handleItemChange = (index: number, field: keyof ServiceOrderItemForm, value: string | number | boolean | null) => {
        setItems((prevItems) =>
            prevItems.map((item, i) => (i === index ? { ...item, [field]: value } : item))
        );
    };

    const handleRemoveItem = (index: number) => {
        setItems((prevItems) => prevItems.filter((_, i) => i !== index));
    };

    const handleCompanySelect = (company: { id: string; name: string }) => {
        setCompanyId(company.id);
        setCompanyName(company.name);
    };

    const handleSupplierSelect = (supplier: { id: string; name: string }) => {
        setSupplierId(supplier.id);
        setSupplierName(supplier.name);
    };

    // Spare Parts Handlers
    const handleAddSparePartsSupplier = (supplier: { id: string; name: string }) => {
        if (!sparePartsGroups.some(group => group.supplierId === supplier.id)) {
            setSparePartsGroups(prev => [...prev, {
                internalId: Math.random().toString(36).substr(2, 9),
                supplierId: supplier.id,
                supplierName: supplier.name,
                items: []
            }]);
        }
        setSparePartsSupplierId('');
        setSparePartsSupplierName('');
    };

    const handleRemoveSparePartsSupplier = (supplierId: string) => {
        setSparePartsGroups(prev => prev.filter(group => group.supplierId !== supplierId));
    };

    const handleSparePartItemChange = (supplierId: string, index: number, field: keyof ServiceOrderMaterialForm, value: any) => {
        setSparePartsGroups(prev => prev.map(group => {
            if (group.supplierId !== supplierId) return group;
            const newItems = [...group.items];
            newItems[index] = { ...newItems[index], [field]: value };
            return { ...group, items: newItems };
        }));
    };

    const handleAddSparePartItem = (supplierId: string) => {
        setSparePartsGroups(prev => prev.map(group => {
            if (group.supplierId !== supplierId) return group;
            return {
                ...group,
                items: [...group.items, {
                    supplier_id: supplierId,
                    material_name: '',
                    quantity: 1,
                    unit_price: 0,
                    tax_rate: 0.16,
                    is_exempt: false,
                    sales_percentage: 0,
                    discount_percentage: 0,
                }]
            };
        }));
    };

    const handleRemoveSparePartItem = (supplierId: string, index: number) => {
        setSparePartsGroups(prev => prev.map(group => {
            if (group.supplierId !== supplierId) return group;
            return {
                ...group,
                items: group.items.filter((_, i) => i !== index)
            };
        }));
    };

    const handleSearchResultSelect = (supplierId: string, index: number, item: any) => {
        setSparePartsGroups(prev => prev.map(group => {
            if (group.supplierId !== supplierId) return group;
            const newItems = [...group.items];
            newItems[index] = {
                ...newItems[index],
                material_id: item.id,
                material_name: item.name,
                description: '', // Reset description or keep it? usually reset or empty if selecting new material
                unit: item.unit,
                is_exempt: item.is_exempt || false,
                // Reset price and quantity? user might want to keep it or it might be in the material?
                // usually material doesn't have a default price in this context unless from price history (not implemented yet for auto-fill)
            };
            return { ...group, items: newItems };
        }));
    };

    const itemsForCalculation = [
        ...items.map(item => ({
            quantity: item.quantity,
            unit_price: item.unit_price,
            tax_rate: item.tax_rate,
            is_exempt: item.is_exempt,
            sales_percentage: item.sales_percentage,
            discount_percentage: item.discount_percentage,
        })),
        ...sparePartsGroups.flatMap(group => group.items.map(item => ({
            quantity: item.quantity,
            unit_price: item.unit_price,
            tax_rate: item.tax_rate,
            is_exempt: item.is_exempt,
            sales_percentage: item.sales_percentage,
            discount_percentage: item.discount_percentage,
        })))
    ];

    const totals = calculateTotals(itemsForCalculation);
    const totalInUSD = React.useMemo(() => {
        if (currency === 'VES' && exchangeRate && exchangeRate > 0) {
            return (totals.total / exchangeRate).toFixed(2);
        }
        return null;
    }, [currency, exchangeRate, totals.total]);


    const handleSubmit = async () => {
        if (!session?.user?.id) {
            showError('Sesión expirada.');
            return;
        }
        if (!companyId) {
            showError('Empresa requerida.');
            return;
        }
        if (!supplierId) {
            showError('Proveedor requerido.');
            return;
        }
        if (!serviceDate) {
            showError('Fecha de servicio requerida.');
            return;
        }
        if (!equipmentName.trim()) {
            showError('Nombre del equipo requerido.');
            return;
        }

        const invalidItem = items.find(item => !item.description || item.quantity <= 0 || item.unit_price <= 0);
        const hasServiceItems = items.length > 0;
        const hasSpareParts = sparePartsGroups.some(g => g.items.length > 0);

        if (!hasServiceItems && !hasSpareParts) {
            showError('Debe haber al menos un servicio o un repuesto.');
            return;
        }

        if (invalidItem) {
            showError('Revise los ítems de servicio. Deben ser válidos.');
            return;
        }

        setIsSubmitting(true);
        const toastId = showLoading('Actualizando orden...');

        try {
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
                // Do not update status here unless explicitly changing state workflow
                // user_id is generally preserved from creation or updated to last editor? usually preserved.
            };

            const itemsForUpdate = items.map(({ id, ...rest }) => rest);

            const materialsForUpdate = sparePartsGroups.flatMap(group =>
                group.items.map(item => ({
                    supplier_id: group.supplierId, // Ensure it matches group
                    material_id: item.material_id || null,
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                    tax_rate: item.tax_rate,
                    is_exempt: item.is_exempt,
                    supplier_code: item.supplier_code || null,
                    unit: item.unit || null,
                    description: item.description || null,
                    sales_percentage: item.sales_percentage,
                    discount_percentage: item.discount_percentage,
                }))
            );

            const updatedResult = await updateServiceOrder(id!, orderData, itemsForUpdate, materialsForUpdate);

            if (updatedResult) {
                showSuccess('Orden actualizada correctamente.');
                navigate(`/service-orders/${id}`);
            } else {
                throw new Error("Fallo en la actualización.");
            }

        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Error al actualizar.';
            showError(errorMessage);
        } finally {
            if (toastId) dismissToast(toastId);
            setIsSubmitting(false);
        }
    };

    // Formatting helper
    const formattedSequence = isLoading ? '...' : `OS-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(sequenceNumber).padStart(3, '0')}`;


    if (isLoading) {
        return <div className="p-8 text-center">Cargando la orden...</div>;
    }

    return (
        <div className="container mx-auto p-4">
            <div className="flex items-center mb-2 -mt-2">
                <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground pl-0">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Cancelar
                </Button>
            </div>

            <Card className="mb-6">
                <CardHeader>
                    <CardTitle className="text-procarni-primary flex items-center">
                        <Wrench className="mr-2 h-6 w-6" /> Editando: {formattedSequence}
                    </CardTitle>
                    <CardDescription>Modifica los detalles de la orden de servicio existente.</CardDescription>
                </CardHeader>
                <CardContent>

                    {/* Reuse similar structure to GenerateServiceOrder */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <div className="md:col-span-1">
                            <Label>Proveedor</Label>
                            <SmartSearch
                                placeholder="Buscar proveedor..."
                                onSelect={handleSupplierSelect}
                                fetchFunction={searchSuppliers}
                                displayValue={supplierName}
                            />
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

                    {/* Spare Parts Section */}
                    <div className="mt-8 border-t pt-6">
                        <h3 className="text-lg font-semibold mb-4 text-procarni-primary flex items-center">
                            <Package className="mr-2 h-5 w-5" /> Repuestos y Adicionales
                        </h3>

                        <div className="space-y-4">
                            {sparePartsGroups.map((group) => (
                                <Accordion type="single" collapsible key={group.internalId} className="border rounded-lg bg-gray-50/50">
                                    <AccordionItem value={group.internalId} className="border-0">
                                        <AccordionTrigger className="px-4 py-2 hover:no-underline">
                                            <div className="flex justify-between items-center w-full pr-4">
                                                <span className="font-semibold text-gray-700">{group.supplierName}</span>
                                                <div
                                                    className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8 w-8 p-0 flex items-center justify-center rounded-md cursor-pointer transition-colors"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleRemoveSparePartsSupplier(group.supplierId);
                                                    }}
                                                    title="Eliminar proveedor y sus ítems"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </div>
                                            </div>
                                        </AccordionTrigger>
                                        <AccordionContent className="px-4 pb-4">
                                            <PurchaseOrderItemsTable
                                                items={group.items.map(item => ({
                                                    ...item,
                                                    id: item.id || Math.random().toString(36).substr(2, 9),
                                                    // Ensure material_name is passed for display if it exists in description or separate field
                                                    // The table likely uses 'description' for the text input value.
                                                    // If we want it to look like a selected material, we might need to populate the SmartSearch inside the table? 
                                                    // Actually PurchaseOrderItemsTable might just use description.
                                                })) as any}
                                                currency={currency}
                                                onAddItem={() => handleAddSparePartItem(group.supplierId)}
                                                onRemoveItem={(index) => handleRemoveSparePartItem(group.supplierId, index)}
                                                onItemChange={(index, field, value) => handleSparePartItemChange(group.supplierId, index, field as any, value)}
                                                supplierId={group.supplierId}
                                                supplierName={group.supplierName}
                                                // @ts-ignore
                                                onMaterialSelect={(index, item) => handleSearchResultSelect(group.supplierId, index, item)}
                                            />
                                        </AccordionContent>
                                    </AccordionItem>
                                </Accordion>
                            ))}

                            <div className="mb-4 max-w-md">
                                <Label>Añadir Proveedor de Repuestos</Label>
                                <div className="flex gap-2 mt-1">
                                    <SmartSearch
                                        placeholder="Buscar proveedor (ej. Ferretería...)"
                                        onSelect={handleAddSparePartsSupplier}
                                        fetchFunction={searchSuppliers}
                                        displayValue={sparePartsSupplierName}
                                        className="w-full"
                                    />
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        onClick={() => setIsSparePartsSupplierDialogOpen(true)}
                                        className="shrink-0"
                                        title="Añadir nuevo proveedor de repuestos"
                                    >
                                        <PlusCircle className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            <SupplierCreationDialog
                                isOpen={isSparePartsSupplierDialogOpen}
                                onClose={() => setIsSparePartsSupplierDialogOpen(false)}
                                onSupplierCreated={handleAddSparePartsSupplier}
                            />
                        </div>
                    </div>

                    {/* Totals Section */}
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
                        <Button onClick={handleSubmit} disabled={isSubmitting} className="bg-procarni-secondary hover:bg-green-700">
                            {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando...</> : <><Save className="mr-2 h-4 w-4" /> Guardar Cambios</>}
                        </Button>
                    </div>

                </CardContent>
            </Card>
            <MadeWithDyad />
        </div>
    );
};

export default EditServiceOrder;
