// src/pages/EditQuoteRequest.tsx

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useSession } from '@/components/SessionContextProvider';
import { ArrowLeft, Loader2, Save, ShoppingCart, Target, PlusCircle } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';
import { quoteRequestService } from '@/services/quoteRequestService'; // Updated import
import { searchSuppliers, searchMaterialsBySupplier, searchCompanies } from '@/integrations/supabase/data';
import { useQuery } from '@tanstack/react-query';
import { MadeWithDyad } from '@/components/made-with-dyad';
import SmartSearch from '@/components/SmartSearch';
import MaterialCreationDialog from '@/components/MaterialCreationDialog';
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

const MATERIAL_UNITS = [
  'KG', 'LT', 'ROL', 'PAQ', 'SACO', 'GAL', 'UND', 'MT', 'RESMA', 'PZA', 'TAMB', 'MILL', 'CAJA', 'PAR'
];

const EditQuoteRequest = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { session, isLoadingSession } = useSession();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const isMobile = useIsMobile();

  const [isAddMaterialDialogOpen, setIsAddMaterialDialogOpen] = useState(false);

  const [companyId, setCompanyId] = useState<string>('');
  const [companyName, setCompanyName] = useState<string>('');
  const [supplierId, setSupplierId] = useState<string>('');
  const [supplierName, setSupplierName] = useState<string>('');
  const [items, setItems] = useState<QuoteRequestItemForm[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const userId = session?.user?.id;
  const userEmail = session?.user?.email;

  const { data: initialRequest, isLoading: isLoadingRequest, error: requestError } = useQuery({
    queryKey: ['quoteRequestDetails', id],
    queryFn: () => quoteRequestService.getById(id!), // Using service
    enabled: !!id && !!session && !isLoadingSession,
  });

  useEffect(() => {
    if (initialRequest) {
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
        unit: item.unit || MATERIAL_UNITS[0],
        material_id: item.material_id || undefined,
      })) || [];

      setItems(mappedItems);
    }
  }, [initialRequest]);

  if (isLoadingRequest || isLoadingSession) {
    return (
      <div className="container mx-auto p-4 text-center text-muted-foreground animate-pulse mt-10">
        Cargando solicitud...
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
    setItems((prevItems) => [...prevItems, { material_name: '', quantity: 0, description: '', unit: MATERIAL_UNITS[0], material_id: undefined }]);
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
    handleItemChange(index, 'unit', material.unit || MATERIAL_UNITS[0]);
    handleItemChange(index, 'material_id', material.id); // Save ID
    if (material.specification) {
      handleItemChange(index, 'description', material.specification);
    }
  };

  const handleCompanySelect = (company: Company) => {
    setCompanyId(company.id);
    setCompanyName(company.name);
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

      {/* PHASE 1: STICKY HEADER & ACTIONS */}
      <div className="relative md:sticky md:top-0 z-20 backdrop-blur-md bg-white/90 border-b border-gray-200 pb-3 pt-4 mb-4 -mx-4 px-4 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-all duration-200">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-gray-400 hover:text-procarni-dark hover:bg-gray-100 rounded-full h-8 w-8 -ml-2 mr-1">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className='flex flex-col'>
            <h1 className="text-xl font-bold font-mono text-procarni-dark tracking-tight flex items-center gap-2">
              <Target className="h-5 w-5 text-gray-400" />
              Editar Solicitud #{id?.substring(0, 8)}
            </h1>
            <p className="text-xs text-gray-500">Modifica los detalles de la solicitud</p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="bg-procarni-secondary hover:bg-green-700 text-white shadow-sm w-full md:w-auto"
          >
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Guardar Cambios
          </Button>
        </div>
      </div>

      <div className="grid gap-6">
        {/* PHASE 2: GENERAL INFO CARD */}
        <Card className="border-gray-200 shadow-sm overflow-hidden">
          <CardHeader className="bg-gray-50/50 pb-4">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-gray-500 flex items-center">
              Información General
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label htmlFor="company" className="text-sm font-medium text-gray-700">Empresa de Origen <span className="text-red-500">*</span></Label>
                <SmartSearch
                  placeholder="Buscar empresa (RIF o Nombre)..."
                  onSelect={handleCompanySelect}
                  fetchFunction={searchCompanies}
                  displayValue={companyName}
                  className="bg-white"
                />
                {companyName && <p className="text-xs text-green-600 font-medium">✓ {companyName}</p>}
              </div>
              <div className="space-y-3">
                <Label htmlFor="supplier" className="text-sm font-medium text-gray-700">Proveedor <span className="text-red-500">*</span></Label>
                <div className="flex gap-2">
                  <SmartSearch
                    placeholder="Buscar proveedor (RIF o Nombre)..."
                    onSelect={(supplier) => {
                      setSupplierId(supplier.id);
                      setSupplierName(supplier.name);
                    }}
                    fetchFunction={searchSuppliers}
                    displayValue={supplierName}
                    className="bg-white flex-1"
                  />
                </div>
                {supplierName && <p className="text-xs text-green-600 font-medium">✓ {supplierName}</p>}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* PHASE 3: ITEMS TABLE */}
        <Card className="border-gray-200 shadow-sm overflow-hidden min-h-[400px]">
          <CardHeader className="bg-gray-50/50 pb-4 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-gray-500 flex items-center">
              <ShoppingCart className="h-4 w-4 mr-2" /> Ítems a Cotizar
            </CardTitle>
            <Button onClick={handleAddItem} variant="secondary" size="sm" className="h-8">
              <PlusCircle className="mr-2 h-3.5 w-3.5" /> Añadir Ítem
            </Button>
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
            <div className="flex flex-col items-center justify-center py-12 text-gray-400 bg-white">
              <ShoppingCart className="h-12 w-12 mb-3 text-gray-200" />
              <p className="text-sm">No hay ítems registrados.</p>
            </div>
          )}
        </Card>
      </div>

      <MadeWithDyad />
      <MaterialCreationDialog
        isOpen={isAddMaterialDialogOpen}
        onClose={() => setIsAddMaterialDialogOpen(false)}
        onMaterialCreated={handleMaterialAdded}
        supplierId={supplierId}
        supplierName={supplierName}
      />
    </div>
  );
};

export default EditQuoteRequest;