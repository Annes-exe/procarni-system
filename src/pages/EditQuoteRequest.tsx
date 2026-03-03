// src/pages/EditQuoteRequest.tsx

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useSession } from '@/components/SessionContextProvider';
import { ArrowLeft, Loader2, Save, ShoppingCart, Info, Building2, Search, PlusCircle } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';
import { quoteRequestService } from '@/services/quoteRequestService'; // Updated import
import { searchSuppliers, searchMaterialsBySupplier, searchCompanies, getAllUnits } from '@/integrations/supabase/data';
import { useQuery } from '@tanstack/react-query';

import SmartSearch from '@/components/SmartSearch';
import MaterialCreationDialog from '@/components/MaterialCreationDialog';
import SupplierCreationDialog from '@/components/SupplierCreationDialog';
import { useIsMobile } from '@/hooks/use-mobile';
import QuoteRequestItemsTable, { QuoteRequestItemForm } from '@/components/QuoteRequestItemsTable';

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


const EditQuoteRequest = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { session, role, isLoadingSession } = useSession();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const isMobile = useIsMobile();

  const [isAddMaterialDialogOpen, setIsAddMaterialDialogOpen] = useState(false);
  const [isAddSupplierDialogOpen, setIsAddSupplierDialogOpen] = useState(false);

  const [companyId, setCompanyId] = useState<string>('');
  const [companyName, setCompanyName] = useState<string>('');
  const [supplierId, setSupplierId] = useState<string>('');
  const [supplierName, setSupplierName] = useState<string>('');
  const [items, setItems] = useState<QuoteRequestItemForm[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: units = [], isLoading: isLoadingUnits } = useQuery({
    queryKey: ['units_of_measure'],
    queryFn: getAllUnits,
  });

  const userId = session?.user?.id;
  const userEmail = session?.user?.email;

  const { data: initialRequest, isLoading: isLoadingRequest, error: requestError } = useQuery({
    queryKey: ['quoteRequestDetails', id],
    queryFn: () => quoteRequestService.getById(id!), // Using service
    enabled: !!id && !!session && !isLoadingSession,
  });

  useEffect(() => {
    if (initialRequest) {
      // @ts-ignore
      if (initialRequest.status !== 'Draft' && role !== 'admin') {
        showError('No tienes permisos para editar esta solicitud en su estado actual.');
        navigate('/quote-requests');
        return;
      }

      setCompanyId(initialRequest.company_id);
      // @ts-ignore
      setCompanyName(initialRequest.companies?.name || '');
      setSupplierId(initialRequest.supplier_id);
      // @ts-ignore
      setSupplierName(initialRequest.suppliers?.name || '');

      // Map items
      // @ts-ignore
      const mappedItems = initialRequest.quote_request_items?.map(item => ({
        // We need an ID for internal react key if possible, but the form uses index primarily or internal id
        id: item.id,
        material_name: item.materials?.name || 'Material Desconocido',
        quantity: item.quantity,
        description: item.description || '',
        unit: item.unit || (units[0]?.name || ''),
        material_id: item.material_id || undefined,
      })) || [];

      setItems(mappedItems);
    }
  }, [initialRequest]);

  if (isLoadingRequest || isLoadingSession) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-procarni-secondary" />
        <span className="ml-2 text-gray-500 font-medium">Cargando solicitud...</span>
      </div>
    );
  }

  if (requestError) {
    showError(requestError.message);
    return (
      <div className="container mx-auto p-4 text-center text-destructive">
        Error al cargar la solicitud: {requestError.message}
        <Button asChild variant="link" className="mt-4">
          <Link to="/quote-requests">Volver a la gestión</Link>
        </Button>
      </div>
    );
  }

  if (!initialRequest) {
    return (
      <div className="container mx-auto p-4 text-center text-muted-foreground">
        Solicitud no encontrada.
        <Button asChild variant="link" className="mt-4">
          <Link to="/quote-requests">Volver a la gestión</Link>
        </Button>
      </div>
    );
  }

  const handleAddItem = () => {
    setItems((prevItems) => [...prevItems, { material_name: '', quantity: 0, description: '', unit: units[0]?.name || '', material_id: undefined }]);
  };

  const handleItemChange = (index: number, field: keyof QuoteRequestItemForm, value: any) => {
    setItems((prevItems) =>
      prevItems.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  const handleRemoveItem = (index: number) => {
    setItems((prevItems) => prevItems.filter((_, i) => i !== index));
  };

  const handleMaterialSelect = (index: number, material: MaterialSearchResult) => {
    handleItemChange(index, 'material_name', material.name);
    handleItemChange(index, 'unit', material.unit || (units[0]?.name || ''));
    handleItemChange(index, 'material_id', material.id); // Save ID
    if (material.specification) {
      handleItemChange(index, 'description', material.specification);
    }
  };

  const handleCompanySelect = (company: Company) => {
    setCompanyId(company.id);
    setCompanyName(company.name);
  };

  const handleSupplierCreated = (supplier: { id: string; name: string }) => {
    setSupplierId(supplier.id);
    setSupplierName(supplier.name);
  };

  const handleMaterialAdded = (material: { id: string; name: string; unit?: string; is_exempt?: boolean; specification?: string }) => {
    // Material created logic
  };

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

    const invalidItem = items.find(item => !item.material_name || item.quantity <= 0 || !item.unit);
    if (items.length === 0 || invalidItem) {
      showError('Por favor, añade al menos un ítem válido con nombre, cantidad mayor a cero y unidad.');
      return;
    }

    setIsSubmitting(true);

    try {
      const requestData = {
        supplier_id: supplierId,
        company_id: companyId,
        currency: 'USD' as const,
        // status: initialRequest.status, // Keep existing status or allow update?
        // Usually editing resets to Draft if significant changes, or stays same.
        // Let's keep it same for now unless we add status dropdown.
      };

      const formattedItems = items.map(item => ({
        material_id: item.material_id || '', // Strict check again?
        quantity: item.quantity,
        unit: item.unit,
        description: item.description,
      }));

      if (formattedItems.some(i => !i.material_id)) {
        showError("Todos los ítems deben estar asociados a un material registrado.");
        setIsSubmitting(false);
        return;
      }

      // @ts-ignore
      await quoteRequestService.update(id!, requestData, formattedItems);

      showSuccess('Solicitud actualizada exitosamente.');
      navigate(`/quote-requests/${id}`);
    } catch (error: any) {
      console.error('Error updating quote request:', error);
      showError(error.message || 'Error al actualizar la solicitud.');
    } finally {
      setIsSubmitting(false);
    }
  };


  return (
    <div className="container mx-auto p-4 pb-24 relative min-h-screen">

      {/* Action Header - Sticky like GenerateQuoteRequest */}
      <div className="relative md:sticky md:top-0 z-20 backdrop-blur-md bg-white/90 border-b border-gray-200 pb-3 pt-4 mb-6 -mx-4 px-4 shadow-sm flex justify-between items-center transition-all duration-200">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-gray-400 hover:text-procarni-dark hover:bg-gray-100 rounded-full h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-procarni-dark tracking-tight">Editar Solicitud</h1>
            <p className="text-[11px] text-gray-500 font-medium">#{id?.substring(0, 8)}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="bg-procarni-secondary hover:bg-green-700 text-white shadow-sm w-full md:w-auto"
          >
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Guardar Solicitud
          </Button>
        </div>
      </div>

      <div className="grid gap-6">
        {/* General Information Card */}
        <Card className="border-gray-200 shadow-sm overflow-hidden">
          <CardHeader className="bg-gray-50/50 pb-4 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <CardTitle className="text-sm font-bold uppercase tracking-wide text-gray-800 flex items-center">
                Información General
              </CardTitle>
              <div className="flex items-center space-x-2 text-sm text-gray-500">
                <Info className="h-4 w-4" />
                <span>Detalles de la solicitud</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6 md:p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-6">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <Label htmlFor="supplier" className="text-sm font-semibold text-gray-700">
                      Proveedor Principal <span className="text-red-500">*</span>
                    </Label>
                    <div
                      className="text-xs font-semibold text-procarni-primary hover:text-green-700 cursor-pointer flex items-center transition-colors"
                      onClick={() => setIsAddSupplierDialogOpen(true)}
                    >
                      <PlusCircle className="h-3 w-3 mr-1" /> Nuevo Proveedor
                    </div>
                  </div>
                  <SmartSearch
                    placeholder="Buscar proveedor por RIF o nombre"
                    onSelect={(supplier) => {
                      setSupplierId(supplier.id);
                      setSupplierName(supplier.name);
                    }}
                    fetchFunction={searchSuppliers}
                    displayValue={supplierName}
                    className="w-full rounded-lg border-gray-300 focus:ring-2 focus:ring-procarni-primary focus:border-procarni-primary transition shadow-sm placeholder-gray-400 pl-3"
                    icon={<Search className="h-4 w-4 text-gray-400" />}
                  />
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <Label htmlFor="company" className="block text-sm font-semibold text-gray-700 mb-2">
                    Empresa de Origen <span className="text-red-500">*</span>
                  </Label>
                  <SmartSearch
                    placeholder="Buscar empresa por RIF o nombre"
                    onSelect={handleCompanySelect}
                    fetchFunction={searchCompanies}
                    displayValue={companyName}
                    className="w-full rounded-lg border-gray-300 focus:ring-2 focus:ring-procarni-primary focus:border-procarni-primary transition shadow-sm appearance-none pl-3"
                    icon={<Building2 className="h-4 w-4 text-gray-400" />}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Items Card */}
        <Card className="border-gray-200 shadow-sm overflow-hidden">
          <CardHeader className="bg-gray-50/50 pb-4 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-gray-500 flex items-center">
              <ShoppingCart className="h-4 w-4 mr-2" /> Ítems a Cotizar
            </CardTitle>
            <div className="flex gap-2">
              <Button onClick={handleAddItem} variant="secondary" size="sm" className="h-8">
                <PlusCircle className="mr-2 h-3.5 w-3.5" /> Añadir Ítem
              </Button>
              <Button
                onClick={() => setIsAddMaterialDialogOpen(true)}
                variant="secondary"
                size="sm"
                disabled={!supplierId}
              >
                <PlusCircle className="mr-2 h-3.5 w-3.5" /> Crear Producto
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <QuoteRequestItemsTable
              items={items}
              supplierId={supplierId}
              supplierName={supplierName}
              onAddItem={handleAddItem}
              onRemoveItem={handleRemoveItem}
              onItemChange={handleItemChange}
              onMaterialSelect={handleMaterialSelect}
            />
          </CardContent>
          {items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400 bg-white">
              <ShoppingCart className="h-12 w-12 mb-3 text-gray-200" />
              <p className="text-sm">No hay ítems agregados a la solicitud.</p>
              <Button variant="link" onClick={handleAddItem}>Añadir el primero</Button>
            </div>
          )}
        </Card>
      </div>


      <MaterialCreationDialog
        isOpen={isAddMaterialDialogOpen}
        onClose={() => setIsAddMaterialDialogOpen(false)}
        onMaterialCreated={handleMaterialAdded}
        supplierId={supplierId}
        supplierName={supplierName}
      />
      <SupplierCreationDialog
        isOpen={isAddSupplierDialogOpen}
        onClose={() => setIsAddSupplierDialogOpen(false)}
        onSupplierCreated={handleSupplierCreated}
      />
    </div>
  );
};

export default EditQuoteRequest;