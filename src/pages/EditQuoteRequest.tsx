import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useSession } from '@/components/SessionContextProvider';
import { PlusCircle, Trash2, ArrowLeft, FileText, Loader2, CheckCircle } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';
import { getQuoteRequestDetails, searchSuppliers, searchMaterialsBySupplier, searchCompanies, updateQuoteRequest } from '@/integrations/supabase/data';
import { useQuery } from '@tanstack/react-query';
import { MadeWithDyad } from '@/components/made-with-dyad';
import SmartSearch from '@/components/SmartSearch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import QuoteRequestPreviewModal from '@/components/QuoteRequestPreviewModal';
import MaterialCreationDialog from '@/components/MaterialCreationDialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale'; // Importar la localización en español

interface Company {
  id: string;
  name: string;
  rif: string;
}

interface QuoteRequestItemForm {
  id?: string;
  material_name: string;
  quantity: number;
  description?: string;
  unit?: string;
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
  const isMobile = useIsMobile();
  const [isModalOpen, setIsModalOpen] = useState(false);
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
    queryFn: () => getQuoteRequestDetails(id!),
    enabled: !!id && !!session && !isLoadingSession,
  });

  useEffect(() => {
    if (initialRequest) {
      setCompanyId(initialRequest.company_id);
      setCompanyName(initialRequest.companies?.name || '');
      setSupplierId(initialRequest.supplier_id);
      setSupplierName(initialRequest.suppliers?.name || '');
      setItems(initialRequest.quote_request_items.map(item => ({
        id: item.id,
        material_name: item.material_name,
        quantity: item.quantity,
        description: item.description || '',
        unit: item.unit || MATERIAL_UNITS[0],
      })));
    }
  }, [initialRequest]);

  const searchSupplierMaterials = React.useCallback(async (query: string) => {
    if (!supplierId) return [];
    return searchMaterialsBySupplier(supplierId, query);
  }, [supplierId]);

  if (isLoadingRequest || isLoadingSession) {
    return (
      <div className="container mx-auto p-4 text-center text-muted-foreground">
        Cargando solicitud de cotización para edición...
      </div>
    );
  }

  if (requestError) {
    showError(requestError.message);
    return (
      <div className="container mx-auto p-4 text-center text-destructive">
        Error al cargar la solicitud de cotización: {requestError.message}
        <Button asChild variant="link" className="mt-4">
          <Link to="/quote-request-management">Volver a la gestión de solicitudes</Link>
        </Button>
      </div>
    );
  }

  if (!initialRequest) {
    return (
      <div className="container mx-auto p-4 text-center text-muted-foreground">
        Solicitud de cotización no encontrada.
        <Button asChild variant="link" className="mt-4">
          <Link to="/quote-request-management">Volver a la gestión de solicitudes</Link>
        </Button>
      </div>
    );
  }

  const handleAddItem = () => {
    setItems((prevItems) => [...prevItems, { material_name: '', quantity: 0, description: '', unit: MATERIAL_UNITS[0] }]);
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
    if (material.specification) {
      handleItemChange(index, 'description', material.specification);
    }
  };

  const handleCompanySelect = (company: Company) => {
    setCompanyId(company.id);
    setCompanyName(company.name);
  };

  const handleMaterialAdded = (material: { id: string; name: string; unit?: string; is_exempt?: boolean; specification?: string }) => {
    // Material created and associated, user can now select it via SmartSearch.
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
    };

    const updatedRequest = await updateQuoteRequest(id!, requestData, items);

    if (updatedRequest) {
      showSuccess('Solicitud de cotización actualizada exitosamente.');
      navigate(`/quote-requests/${id}`);
    }
    setIsSubmitting(false);
  };

  const generateFileName = () => {
    if (!initialRequest) return '';
    const supplierName = initialRequest.suppliers?.name?.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_') || 'Proveedor';
    const date = new Date(initialRequest.created_at).toLocaleDateString('es-VE').replace(/\//g, '-');
    return `SC_${initialRequest.id.substring(0, 8)}_${supplierName}_${date}.pdf`;
  };

  const renderItemFields = (item: QuoteRequestItemForm, index: number) => {
    const isMaterialSelected = !!item.material_name;

    if (isMobile) {
      return (
        <div key={item.id || index} className="border rounded-md p-3 space-y-3 bg-white shadow-sm">
          <div className="flex justify-between items-center border-b pb-2">
            <h4 className="font-semibold text-procarni-primary truncate flex items-center">
              {item.material_name || 'Nuevo Ítem'}
            </h4>
            <div className="flex gap-1">
              <Button variant="outline" size="icon" onClick={() => setIsAddMaterialDialogOpen(true)} disabled={!supplierId} className="h-8 w-8">
                <PlusCircle className="h-4 w-4" />
              </Button>
              <Button variant="destructive" size="icon" onClick={() => handleRemoveItem(index)} className="h-8 w-8">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="space-y-1 col-span-2">
              <label className="text-xs font-medium text-muted-foreground flex items-center">
                Material
                {isMaterialSelected && <CheckCircle className="ml-2 h-4 w-4 text-green-600" />}
              </label>
              <SmartSearch
                placeholder={supplierId ? "Buscar material asociado al proveedor" : "Selecciona un proveedor primero"}
                onSelect={(material) => handleMaterialSelect(index, material as MaterialSearchResult)}
                fetchFunction={searchSupplierMaterials}
                displayValue={item.material_name}
                disabled={!supplierId}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Cantidad</label>
              <Input
                id={`quantity-${index}`}
                type="number"
                value={item.quantity}
                onChange={(e) => handleItemChange(index, 'quantity', parseFloat(e.target.value))}
                min="0"
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Unidad</label>
              <Select value={item.unit} onValueChange={(value) => handleItemChange(index, 'unit', value)}>
                <SelectTrigger id={`unit-${index}`} className="h-9">
                  <SelectValue placeholder="Unidad" />
                </SelectTrigger>
                <SelectContent>
                  {MATERIAL_UNITS.map(unitOption => (
                    <SelectItem key={unitOption} value={unitOption}>{unitOption}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Descripción</label>
              <Textarea
                id={`description-${index}`}
                value={item.description}
                onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                placeholder="Especificación, marca, etc."
                rows={2}
              />
            </div>
          </div>
        </div>
      );
    }

    // Desktop/Tablet View
    return (
      <div key={item.id || index} className="grid grid-cols-7 gap-4 items-end border p-3 rounded-md bg-white shadow-sm">
        <div className="col-span-2">
          <Label htmlFor={`material_name-${index}`} className="flex items-center">
            Material
            {isMaterialSelected && <CheckCircle className="ml-2 h-4 w-4 text-green-600" />}
          </Label>
          <SmartSearch
            placeholder={supplierId ? "Buscar material asociado al proveedor" : "Selecciona un proveedor primero"}
            onSelect={(material) => handleMaterialSelect(index, material as MaterialSearchResult)}
            fetchFunction={searchSupplierMaterials}
            displayValue={item.material_name}
            disabled={!supplierId}
          />
        </div>
        <div className="col-span-1">
          <Label htmlFor={`quantity-${index}`}>Cantidad</Label>
          <Input
            id={`quantity-${index}`}
            type="number"
            value={item.quantity}
            onChange={(e) => handleItemChange(index, 'quantity', parseFloat(e.target.value))}
            min="0"
          />
        </div>
        <div className="col-span-1">
          <Label htmlFor={`unit-${index}`}>Unidad</Label>
          <Select value={item.unit} onValueChange={(value) => handleItemChange(index, 'unit', value)}>
            <SelectTrigger id={`unit-${index}`}>
              <SelectValue placeholder="Unidad" />
            </SelectTrigger>
            <SelectContent>
              {MATERIAL_UNITS.map(unitOption => (
                <SelectItem key={unitOption} value={unitOption}>{unitOption}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2">
          <Label htmlFor={`description-${index}`}>Descripción</Label>
          <Textarea
            id={`description-${index}`}
            value={item.description}
            onChange={(e) => handleItemChange(index, 'description', e.target.value)}
            placeholder="Especificación, marca, etc."
            rows={1}
            className="min-h-10"
          />
        </div>
        <div className="flex flex-col space-y-2 col-span-1 justify-end">
          <Button variant="outline" size="icon" onClick={() => setIsAddMaterialDialogOpen(true)} disabled={!supplierId} className="h-8 w-8">
            <PlusCircle className="h-4 w-4" />
          </Button>
          <Button variant="destructive" size="icon" onClick={() => handleRemoveItem(index)} className="h-8 w-8">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
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
          <CardTitle className="text-procarni-primary">Editar Solicitud de Cotización #{id?.substring(0, 8)}</CardTitle>
          <CardDescription>Modifica los detalles de esta solicitud de cotización.</CardDescription>
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
              {companyName && <p className="text-sm text-muted-foreground mt-1">Empresa seleccionada: {companyName}</p>}
            </div>
            <div>
              <Label htmlFor="supplier">Proveedor *</Label>
              <SmartSearch
                placeholder="Buscar proveedor por RIF o nombre"
                onSelect={(supplier) => {
                  setSupplierId(supplier.id);
                  setSupplierName(supplier.name);
                }}
                fetchFunction={searchSuppliers}
                displayValue={supplierName}
              />
              {supplierName && <p className="text-sm text-muted-foreground mt-1">Proveedor seleccionado: {supplierName}</p>}
            </div>
          </div>

          <h3 className="text-lg font-semibold mb-4 text-procarni-primary">Ítems de la Solicitud</h3>
          <div className="space-y-4">
            {items.map(renderItemFields)}
            <div className="flex justify-between">
              <Button variant="outline" onClick={handleAddItem} className="w-full">
                <PlusCircle className="mr-2 h-4 w-4" /> Añadir Ítem
              </Button>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
              <DialogTrigger asChild>
                <Button variant="secondary" disabled={isSubmitting || !companyId || items.length === 0}>
                  <FileText className="mr-2 h-4 w-4" /> Previsualizar PDF
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-5xl h-[95vh] flex flex-col">
                <DialogHeader>
                  <DialogTitle>Previsualización de Solicitud de Cotización</DialogTitle>
                </DialogHeader>
                <QuoteRequestPreviewModal
                  requestId={id!}
                  onClose={() => setIsModalOpen(false)}
                  fileName={generateFileName()}
                />
              </DialogContent>
            </Dialog>
            <Button onClick={handleSubmit} disabled={isSubmitting || !userId || !companyId || items.length === 0} className="bg-procarni-secondary hover:bg-green-700">
              {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando...</> : 'Guardar Cambios'}
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
    </div>
  );
};

export default EditQuoteRequest;