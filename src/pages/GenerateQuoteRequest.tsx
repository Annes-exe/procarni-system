// src/pages/GenerateQuoteRequest.tsx

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useSession } from '@/components/SessionContextProvider';
import { PlusCircle, ArrowLeft, Loader2, Save, ShoppingCart, Target } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';
import { quoteRequestService } from '@/services/quoteRequestService';
import { searchSuppliers, searchMaterialsBySupplier, searchCompanies } from '@/integrations/supabase/data';
import { MadeWithDyad } from '@/components/made-with-dyad';
import SmartSearch from '@/components/SmartSearch';
import { useLocation, useNavigate } from 'react-router-dom';
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

interface Supplier {
  id: string;
  name: string;
}

const MATERIAL_UNITS = [
  'KG', 'LT', 'ROL', 'PAQ', 'SACO', 'GAL', 'UND', 'MT', 'RESMA', 'PZA', 'TAMB', 'MILL', 'CAJA', 'PAR'
];

const GenerateQuoteRequest = () => {
  const { session } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const isMobile = useIsMobile();

  const [companyId, setCompanyId] = useState<string>('');
  const [companyName, setCompanyName] = useState<string>('');
  const [supplierId, setSupplierId] = useState<string>('');
  const [supplierName, setSupplierName] = useState<string>('');
  const [items, setItems] = useState<QuoteRequestItemForm[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAddMaterialDialogOpen, setIsAddMaterialDialogOpen] = useState(false);
  const [isAddSupplierDialogOpen, setIsAddSupplierDialogOpen] = useState(false);

  const userId = session?.user?.id;
  const userEmail = session?.user?.email;

  const supplierData = location.state?.supplier;
  const materialData = location.state?.material;

  useEffect(() => {
    if (supplierData) {
      setSupplierId(supplierData.id);
      setSupplierName(supplierData.name);
    }
  }, [supplierData]);

  useEffect(() => {
    if (materialData) {
      setItems([{
        material_name: materialData.name,
        quantity: 0,
        description: materialData.specification || '',
        unit: materialData.unit || MATERIAL_UNITS[0],
        // @ts-ignore
        material_id: materialData.id,
      }]);
    }
  }, [materialData]);

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

  const handleSupplierSelect = (supplier: { id: string; name: string }) => {
    setSupplierId(supplier.id);
    setSupplierName(supplier.name);
  };

  const handleSupplierCreated = (supplier: Supplier) => {
    setSupplierId(supplier.id);
    setSupplierName(supplier.name);
    setItems([]);
  };

  const handleMaterialAdded = (material: { id: string; name: string; unit?: string; is_exempt?: boolean; specification?: string }) => {
    // Optionally trigger a refresh or select the new material
    // For now, simpler to just let them search it or if we knew which row triggered it, auto-fill.
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
      const orderData = {
        supplier_id: supplierId,
        company_id: companyId,
        currency: 'USD' as const, // Default to USD for now, strictly typed
        issue_date: new Date().toISOString(),
        deadline_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // +7 days default
        status: 'Draft' as const,
      };

      const formattedItems = items.map(item => ({
        material_id: item.material_id || '', // Should ideally reject if no ID, but for flexible generic items might be empty? NO, we enforced strict materials.
        // If strict materials are Enforced, we need material_id.
        // If the user typed a name that isn't in DB, they should create it.
        // For now, let's assume if they used SmartSearch they have an ID.
        // If they just typed, we might fail or create a "Generic"?
        // The service expects material_id.
        // Let's check if we have IDs.
        quantity: item.quantity,
        unit: item.unit,
        description: item.description,
      }));

      // Validation:
      if (formattedItems.some(i => !i.material_id)) {
        // If we allow ad-hoc items, we might need a "Generic Material" ID or handle it.
        // But the system seems to want strict tracking.
        // Let's warn the user if they didn't select a material from the list.
        showError("Todos los ítems deben estar asociados a un material registrado. Por favor selecciona materiales de la lista.");
        setIsSubmitting(false);
        return;
      }

      await quoteRequestService.create(orderData, formattedItems as any);

      showSuccess('Solicitud de cotización creada exitosamente.');
      navigate('/quote-requests');

    } catch (error: any) {
      console.error('Error creating quote request:', error);
      showError(error.message || 'Error al crear la solicitud.');
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
              Nueva Solicitud (SC)
            </h1>
            <p className="text-xs text-gray-500">Crea una solicitud para recibir precios de proveedores</p>
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
                <div className="flex justify-between items-center">
                  <Label htmlFor="supplier" className="text-sm font-medium text-gray-700">Proveedor <span className="text-red-500">*</span></Label>
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => setIsAddSupplierDialogOpen(true)}
                    className="h-auto p-0 text-xs text-procarni-primary"
                  >
                    + Nuevo Proveedor
                  </Button>
                </div>
                <div className="flex gap-2">
                  <SmartSearch
                    placeholder="Buscar proveedor (RIF o Nombre)..."
                    onSelect={handleSupplierSelect}
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
              <p className="text-sm">No hay ítems agregados a la solicitud.</p>
              <Button variant="link" onClick={handleAddItem}>Añadir el primero</Button>
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
      <SupplierCreationDialog
        isOpen={isAddSupplierDialogOpen}
        onClose={() => setIsAddSupplierDialogOpen(false)}
        onSupplierCreated={handleSupplierCreated}
      />
    </div>
  );
};

export default GenerateQuoteRequest;