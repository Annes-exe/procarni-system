import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useSession } from '@/components/SessionContextProvider';
import { PlusCircle, ArrowLeft, Loader2 } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';
import { createQuoteRequest, searchSuppliers, searchMaterialsBySupplier, searchCompanies } from '@/integrations/supabase/data';
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
      }]);
    }
  }, [materialData]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const searchSupplierMaterials = React.useCallback(async (query: string) => {
    if (!supplierId) return [];
    return searchMaterialsBySupplier(supplierId, query);
  }, [supplierId]);

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
    const requestData = {
      supplier_id: supplierId,
      company_id: companyId,
      currency: 'USD' as const,
      exchange_rate: null,
      created_by: userEmail || 'unknown',
      user_id: userId,
      status: 'Draft' // Fixed from 'pending'
    };

    // @ts-ignore - The createQuoteRequest type definition might be missing status in Omit but it's required by DB
    const createdRequest = await createQuoteRequest(requestData, items);

    if (createdRequest) {
      showSuccess('Solicitud de cotización creada exitosamente.');
      setCompanyId('');
      setCompanyName('');
      setSupplierId('');
      setSupplierName('');
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
          <CardTitle className="text-procarni-primary">Generar Solicitud de Cotización (SC)</CardTitle>
          <CardDescription>Crea una nueva solicitud de cotización para tus proveedores.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 p-4 border rounded-lg bg-muted/50">
            <div>
              <Label htmlFor="company">Empresa de Origen *</Label>
              <SmartSearch
                placeholder="Buscar empresa por RIF o nombre"
                onSelect={handleCompanySelect}
                fetchFunction={searchCompanies}
                displayValue={companyName}
              />
              {companyName && <p className="text-sm text-muted-foreground mt-1 break-words">Empresa seleccionada: {companyName}</p>}
            </div>
            <div>
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

          <QuoteRequestItemsTable
            items={items}
            supplierId={supplierId}
            supplierName={supplierName}
            onAddItem={handleAddItem}
            onRemoveItem={handleRemoveItem}
            onItemChange={handleItemChange}
            onMaterialSelect={handleMaterialSelect}
          />

          <div className="flex justify-end gap-2 mt-6">
            <Button onClick={handleSubmit} disabled={isSubmitting || !userId || !companyId || items.length === 0} className="bg-procarni-secondary hover:bg-green-700">
              {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando...</> : 'Guardar Solicitud de Cotización'}
            </Button>
          </div>
        </CardContent>
      </Card>
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