
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSession } from '@/components/SessionContextProvider';
import { calculateTotals } from '@/utils/calculations';
import { ArrowLeft, Loader2, Save, Trash2, PlusCircle, Wrench, Package, Info } from 'lucide-react';
import { showError, showSuccess, showLoading, dismissToast } from '@/utils/toast';
import {
    getServiceOrderDetails,
    updateServiceOrder,
    searchSuppliers
} from '@/integrations/supabase/data';
import { ServiceOrder, ServiceOrderItem } from '@/integrations/supabase/types';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
    'PROCARNI', 'EMPOMACA', 'MONTANO', 'LOCAL'
];

const EditServiceOrder = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { session, role } = useSession();

    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isReminderDialogOpen, setIsReminderDialogOpen] = useState(false);

    // Form State
    const [companyId, setCompanyId] = useState<string>('');
    const [companyName, setCompanyName] = useState<string>('');
    const [supplierId, setSupplierId] = useState<string>('');
    const [supplierName, setSupplierName] = useState<string>('');
    const [baseCurrency, setBaseCurrency] = useState<'USD' | 'EUR'>('USD');
    const [currency, setCurrency] = useState<'USD' | 'VES' | 'EUR'>('USD');
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
                if (order.status !== 'Draft' && role !== 'admin') {
                    showError('No tienes permisos para editar esta orden en su estado actual.');
                    navigate(`/service-orders/${id}`);
                    return;
                }

                setCompanyId(order.company_id);
                setCompanyName(order.companies?.name || '');
                setSupplierId(order.supplier_id);
                setSupplierName(order.suppliers?.name || '');
                const savedCurrency = order.currency;
                setCurrency(savedCurrency);
                setBaseCurrency((order.base_currency as 'USD' | 'EUR') || (savedCurrency === 'EUR' ? 'EUR' : 'USD'));
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
    const totalInBaseCurrency = React.useMemo(() => {
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

        if (!exchangeRate || exchangeRate <= 0) {
            showError('La tasa de cambio es requerida y debe ser mayor que cero.');
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

        setIsReminderDialogOpen(true);
    };

    const confirmSubmit = async () => {
        setIsReminderDialogOpen(false);
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
                base_currency: baseCurrency,
                exchange_rate: exchangeRate,
            };

            const itemsForUpdate = items.map(({ id, ...rest }) => rest);

            const materialsForUpdate = sparePartsGroups.flatMap(group =>
                group.items.map(item => ({
                    supplier_id: group.supplierId,
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
        return (
            <div className="flex h-[400px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-procarni-secondary" />
                <span className="ml-2 text-gray-500 font-medium">Cargando la orden...</span>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-4">
            {/* Action Header - Sticky like GenerateServiceOrder */}
            <div className="relative md:sticky md:top-0 z-20 backdrop-blur-md bg-white/90 border-b border-gray-200 pb-3 pt-4 mb-6 -mx-4 px-4 shadow-sm flex justify-between items-center transition-all duration-200">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-gray-400 hover:text-procarni-dark hover:bg-gray-100 rounded-full h-8 w-8">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <h1 className="text-xl font-bold text-procarni-dark tracking-tight">Editar Orden de Servicio</h1>
                        <p className="text-[11px] text-gray-500 font-medium">{formattedSequence}</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button onClick={handleSubmit} disabled={isSubmitting || !companyId || !supplierId} className="bg-procarni-secondary hover:bg-green-700 shadow-sm">
                        {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando...</> : <><Save className="mr-2 h-4 w-4" /> Guardar Cambios</>}
                    </Button>
                </div>
            </div>

            <div className="space-y-6">
                {/* General Information Card */}
                <Card className="border-gray-200 shadow-sm overflow-hidden">
                    <CardHeader className="bg-gray-50/50 pb-4 border-b border-gray-200">
                        <div className="flex justify-between items-center">
                            <CardTitle className="text-sm font-bold uppercase tracking-wide text-gray-800 flex items-center">
                                Información General
                            </CardTitle>
                            <div className="flex items-center space-x-2 text-sm text-gray-500 font-medium">
                                <Info className="h-4 w-4" />
                                <span>Detalles de la orden</span>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6 md:p-8">


                        <ServiceOrderDetailsForm
                            companyId={companyId}
                            companyName={companyName}
                            baseCurrency={baseCurrency}
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
                            onBaseCurrencyChange={setBaseCurrency}
                            onCurrencyChange={setCurrency}
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
                        />
                    </CardContent>
                </Card>

                {/* Services Card */}
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
                            <div className="flex flex-col items-center justify-center py-10 text-gray-400 bg-white">
                                <Wrench className="h-10 w-10 mb-3 text-gray-200" />
                                <p className="text-sm">No hay servicios agregados a la orden.</p>
                                <Button variant="link" onClick={handleAddItem} className="text-procarni-secondary">Añadir el primero</Button>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Spare Parts Card */}
                <Card className="border-gray-200 shadow-sm overflow-hidden">
                    <CardHeader className="bg-gray-50/50 pb-4 border-b border-gray-200">
                        <div className="flex justify-between items-center">
                            <CardTitle className="text-sm font-bold uppercase tracking-wide text-gray-800 flex items-center">
                                <Package className="mr-2 h-4 w-4" /> Repuestos y Adicionales
                            </CardTitle>
                            <div className="flex items-center space-x-2 text-sm text-gray-500 font-medium">
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
                            <div className="flex flex-col items-center justify-center py-10 text-gray-400 bg-white border border-dashed rounded-lg">
                                <Package className="h-10 w-10 mb-3 text-gray-200" />
                                <p className="text-sm">No hay repuestos agregados a este orden.</p>
                                <Button variant="link" onClick={() => setIsSparePartsSupplierDialogOpen(true)} className="text-procarni-secondary">Añadir el primero</Button>
                            </div>
                        ) : (
                            <Accordion type="multiple" className="w-full space-y-4" defaultValue={sparePartsGroups.map(g => g.internalId)}>
                                {sparePartsGroups.map((group) => (
                                    <AccordionItem key={group.internalId} value={group.internalId} className="border rounded-lg bg-white shadow-sm px-4">
                                        <AccordionTrigger className="hover:no-underline py-4">
                                            <div className="flex justify-between items-center w-full pr-4">
                                                <span className="font-bold text-gray-700">{group.supplierName}</span>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    asChild
                                                    className="text-red-500 hover:text-red-700 hover:bg-red-50 -my-2 cursor-pointer"
                                                >
                                                    <span
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleRemoveSparePartsSupplier(group.supplierId);
                                                        }}
                                                    >
                                                        Quitar Grupo
                                                    </span>
                                                </Button>
                                            </div>
                                        </AccordionTrigger>
                                        <AccordionContent className="pt-2 pb-6">
                                            <PurchaseOrderItemsTable
                                                items={group.items.map(item => ({
                                                    ...item,
                                                    id: item.id || Math.random().toString(36).substr(2, 9),
                                                })) as any}
                                                currency={currency}
                                                onAddItem={() => handleAddSparePartItem(group.supplierId)}
                                                onRemoveItem={(index) => handleRemoveSparePartItem(group.supplierId, index)}
                                                onItemChange={(index, field, value) => handleSparePartItemChange(group.supplierId, index, field as any, value)}
                                                supplierId={group.supplierId}
                                                supplierName={group.supplierName}
                                                onMaterialSelect={(index, item) => handleSearchResultSelect(group.supplierId, index, item)}
                                                hideHeader={true}
                                            />
                                            <div className="px-5 mt-2">
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    onClick={() => handleAddSparePartItem(group.supplierId)}
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

                {/* Totals Section - Unified styling with GenerateServiceOrder */}
                <div className="bg-gray-50 p-6 rounded-lg border border-gray-100 shadow-inner">
                    <div className="flex flex-col gap-3 max-w-sm ml-auto text-right">
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
                            <span className="font-mono text-procarni-secondary cursor-default">+ {currency} {totals.montoVenta.toFixed(2)}</span>
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
                        {totalInBaseCurrency && currency === 'VES' && (
                            <div className="flex justify-end pt-1">
                                <span className="text-sm font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded">
                                    Ref. {baseCurrency}: {totalInBaseCurrency}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex justify-end pt-4 pb-8" />
            </div>
            
            <AlertDialog open={isReminderDialogOpen} onOpenChange={setIsReminderDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Verificar Moneda</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="space-y-3 text-gray-600 pt-2">
                                <p>
                                    ¿Has verificado que la moneda seleccionada (<strong>{currency}</strong>) es la correcta para esta orden de servicio?
                                </p>
                                <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 text-amber-800 text-xs flex items-start gap-2 animate-in fade-in slide-in-from-top-1">
                                    <Info className="h-4 w-4 shrink-0 mt-0.5" />
                                    <p>
                                        <strong>Nota sobre Feriados y Fin de Semana:</strong> En estos días la tasa oficial (BCV) no se suele actualizar. Asegúrate de que la tasa ingresada sea la correcta para el día de la transacción.
                                    </p>
                                </div>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Revisar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmSubmit}
                            className="bg-procarni-primary hover:bg-procarni-primary/90 text-white"
                        >
                            Confirmar y Guardar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};


export default EditServiceOrder;
