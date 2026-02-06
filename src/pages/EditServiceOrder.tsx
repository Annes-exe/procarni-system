
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
interface ServiceOrderDetailsResponse extends ServiceOrder {
    suppliers?: { name: string };
    companies?: { name: string };
    service_order_items: ServiceOrderItem[];
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

    const totals = calculateTotals(items);
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
        if (items.length === 0 || invalidItem) {
            showError('Revise los ítems. Debe haber al menos uno y ser válidos.');
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
            const updatedResult = await updateServiceOrder(id!, orderData, itemsForUpdate);

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
            if (toastId) dismissToast(String(toastId));
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
            <div className="flex justify-between items-center mb-4">
                <Button variant="outline" onClick={() => navigate(-1)}>
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
