// src/pages/GenerateQuoteRequest.tsx

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSession } from '@/components/SessionContextProvider';
import { PlusCircle, ArrowLeft, Loader2, Save, ShoppingCart, Info, Building2, Search, Sparkles, X } from 'lucide-react';
import { showError, showSuccess, showSupplierAlert, dismissToast } from '@/utils/toast';
import { quoteRequestService } from '@/services/quoteRequestService';
import { searchSuppliers, searchCompanies, getAllUnits, getSupplierDetails, getPurchaseHistoryReport, getSuppliersByMaterial } from '@/integrations/supabase/data';
import { useQuery } from '@tanstack/react-query';

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

const GenerateQuoteRequest = () => {
  const { session } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [companyId, setCompanyId] = useState<string>('');
  const [companyName, setCompanyName] = useState<string>('');
  const [selectedSuppliers, setSelectedSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<QuoteRequestItemForm[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAddMaterialDialogOpen, setIsAddMaterialDialogOpen] = useState(false);
  const [isAddSupplierDialogOpen, setIsAddSupplierDialogOpen] = useState(false);
  
  const [suggestedSuppliers, setSuggestedSuppliers] = useState<any[]>([]);

  const { data: units = [], isLoading: isLoadingUnits } = useQuery({
    queryKey: ['units_of_measure'],
    queryFn: getAllUnits,
  });

  const userId = session?.user?.id;

  const supplierData = location.state?.supplier;
  const materialData = location.state?.material;

  // Handle location state
  useEffect(() => {
    if (supplierData) {
      if (!selectedSuppliers.find(s => s.id === supplierData.id)) {
        setSelectedSuppliers(prev => [...prev, supplierData]);
      }
    }
  }, [supplierData]);

  useEffect(() => {
    if (materialData) {
      const initialItem: QuoteRequestItemForm = {
        material_name: materialData.name,
        quantity: 0,
        description: materialData.specification || '',
        unit: materialData.unit || (units[0]?.name || ''),
        material_id: materialData.id,
      };
      setItems([initialItem]);
      
      // Fetch price info for initial material
      getPurchaseHistoryReport({ materialId: materialData.id }).then(history => {
        if (history && history.length > 0) {
          const latest = history[0];
          const info = `Últ. compra: ${latest.unit_price} ${latest.purchase_orders.currency} (${latest.purchase_orders.suppliers.name})`;
          setItems([{ ...initialItem, last_price_info: info }]);
        }
      });
    } else if (units.length > 0 && items.length === 0) {
      // Si no hay material inicial y ya cargaron las unidades, abrir un ítem por defecto
      handleAddItem();
    }
  }, [materialData, units, items.length]);

  // Fetch suggested suppliers when items change
  useEffect(() => {
    const fetchSuggestions = async () => {
      const validIds = items.map(i => i.material_id).filter(Boolean) as string[];
      if (validIds.length === 0) {
        setSuggestedSuppliers([]);
        return;
      }
      try {
        const [allPurchases, allRelations] = await Promise.all([
           Promise.all(validIds.map(id => getPurchaseHistoryReport({ materialId: id }))),
           Promise.all(validIds.map(id => getSuppliersByMaterial(id)))
        ]);

        const supplierMap = new Map();
        
        // Add suppliers that supply the material (without price yet)
        allRelations.flat().forEach((rel: any) => {
          if (rel && rel.id) {
             supplierMap.set(rel.id, {
               id: rel.id,
               name: rel.name,
               lastPrice: null,
               currency: null,
               isPurchase: false
             });
          }
        });
        
        // Add/Overwrite with actual purchase history that have prices
        allPurchases.flat().forEach((poItem: any) => {
          const order = poItem.purchase_orders;
          if (order && order.suppliers) {
            const current = supplierMap.get(order.suppliers.id);
            if (!current || !current.isPurchase) {
              supplierMap.set(order.suppliers.id, {
                 id: order.suppliers.id,
                 name: order.suppliers.name,
                 lastPrice: poItem.unit_price,
                 currency: order.currency,
                 isPurchase: true
              });
            }
          }
        });
        
        setSuggestedSuppliers(Array.from(supplierMap.values()).filter(s => s.id));
      } catch (error) {
        console.error("Error fetching suggestions", error);
      }
    };
    fetchSuggestions();
  }, [items]);

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

  const handleMaterialSelect = async (index: number, material: MaterialSearchResult) => {
    handleItemChange(index, 'material_name', material.name);
    handleItemChange(index, 'unit', material.unit || (units[0]?.name || ''));
    handleItemChange(index, 'material_id', material.id); // Save ID

    if (material.specification && material.specification !== material.code) {
      handleItemChange(index, 'description', material.specification);
    }

    // Fetch latest price info for the selected material
    try {
      const history = await getPurchaseHistoryReport({ materialId: material.id });
      if (history && history.length > 0) {
        const latest = history[0];
        const info = `Últ. compra: ${latest.unit_price} ${latest.purchase_orders.currency} (${latest.purchase_orders.suppliers.name})`;
        handleItemChange(index, 'last_price_info', info);
      }
    } catch (e) {
      console.error("Error fetching price history for item", e);
    }
  };

  const handleCompanySelect = (company: Company) => {
    setCompanyId(company.id);
    setCompanyName(company.name);
  };

  const handleSupplierSelect = async (supplier: { id: string; name: string }) => {
    if (!supplier || !supplier.id) return;
    
    if (!selectedSuppliers.find(s => s.id === supplier.id)) {
      setSelectedSuppliers(prev => [...prev, supplier]);
      
      // Fetch details to check for alerts
      try {
        const details = await getSupplierDetails(supplier.id);
        if (details?.alert_comment) {
          showSupplierAlert(details.alert_comment);
        }
      } catch (e) {
        console.error("Error fetching supplier details for alert", e);
      }
    }
  };
  
  const removeSupplier = (id: string) => {
    setSelectedSuppliers(prev => prev.filter(s => s.id !== id));
    dismissToast("supplier-alert");
  };

  const handleSupplierCreated = (supplier: Supplier) => {
    if (!selectedSuppliers.find(s => s.id === supplier.id)) {
      setSelectedSuppliers(prev => [...prev, supplier]);
    }
  };

  const handleMaterialAdded = (material: { id: string; name: string; unit?: string; is_exempt?: boolean; specification?: string }) => {
    // Optionally trigger a refresh or select the new material
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
    if (selectedSuppliers.length === 0) {
      showError('Por favor, selecciona al menos un proveedor.');
      return;
    }

    const invalidItem = items.find(item => !item.material_name || item.quantity <= 0 || !item.unit);
    if (items.length === 0 || invalidItem) {
      showError('Por favor, añade al menos un ítem válido con nombre, cantidad mayor a cero y unidad.');
      return;
    }

    setIsSubmitting(true);

    try {
      const baseOrderData = {
        company_id: companyId,
        currency: 'USD' as const,
        issue_date: new Date().toISOString(),
        deadline_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'Draft' as const,
      };

      const formattedItems = items.map(item => ({
        material_id: item.material_id || '',
        quantity: item.quantity,
        unit: item.unit,
        description: item.description,
      }));

      if (formattedItems.some(i => !i.material_id)) {
        showError("Todos los ítems deben estar asociados a un material registrado. Por favor selecciona materiales de la lista.");
        setIsSubmitting(false);
        return;
      }

      // Create a Quote Request for each selected supplier
      const promises = selectedSuppliers.map(supplier => {
        const orderData = { ...baseOrderData, supplier_id: supplier.id };
        return quoteRequestService.create(orderData, formattedItems as any);
      });

      await Promise.all(promises);

      showSuccess(`Se han creado ${selectedSuppliers.length} solicitudes de cotización exitosamente.`);
      navigate('/quote-request-management');

    } catch (error: any) {
      console.error('Error creating quote request:', error);
      showError(error.message || 'Error al crear las solicitudes.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto p-4 pb-24 relative min-h-screen">

      {/* PHASE 1: STICKY HEADER & ACTIONS */}
      <div className="relative md:sticky md:top-0 z-20 backdrop-blur-md bg-white/90 border-b border-gray-200 pb-3 pt-4 mb-6 -mx-4 px-4 shadow-sm flex justify-between items-center transition-all duration-200">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-gray-400 hover:text-procarni-dark hover:bg-gray-100 rounded-full h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-procarni-dark tracking-tight">Generar Solicitud Múltiple</h1>
            <p className="text-[11px] text-gray-500 font-medium">Cotiza con varios proveedores a la vez</p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="bg-procarni-secondary hover:bg-green-700 text-white shadow-sm w-full md:w-auto"
          >
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Guardar Solicitudes
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* COLUMNA PRINCIPAL: ITEMS */}
        <div className="lg:col-span-8 space-y-6">
          <Card className="border-none shadow-md overflow-hidden bg-white/80 backdrop-blur-sm">
            <CardHeader className="bg-procarni-primary text-white py-4 flex flex-row items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2 rounded-lg">
                  <ShoppingCart className="h-5 w-5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-base uppercase tracking-wider">1. Ítems a Cotizar</CardTitle>
                  <CardDescription className="text-white/70 text-[10px]">Añade los productos para esta solicitud</CardDescription>
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleAddItem} variant="secondary" size="sm" className="h-8 bg-white/10 hover:bg-white/20 border-none text-white text-[10px]">
                  <PlusCircle className="mr-2 h-3.5 w-3.5" /> Añadir Ítem
                </Button>
                <Button
                  onClick={() => setIsAddMaterialDialogOpen(true)}
                  variant="secondary"
                  size="sm"
                  className="h-8 bg-white/10 hover:bg-white/20 border-none text-white text-[10px]"
                >
                  <PlusCircle className="mr-2 h-3.5 w-3.5" /> Crear Producto
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <QuoteRequestItemsTable
                items={items}
                onAddItem={handleAddItem}
                onRemoveItem={handleRemoveItem}
                onItemChange={handleItemChange}
                onMaterialSelect={handleMaterialSelect}
              />
              {items.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400 bg-gray-50/30">
                  <ShoppingCart className="h-12 w-12 mb-3 text-gray-200" />
                  <p className="text-sm font-medium">No hay ítems agregados</p>
                  <Button variant="link" onClick={handleAddItem} className="text-procarni-primary">Añadir el primero</Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* COLUMNA LATERAL: PROVEEDORES Y AJUSTES */}
        <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-24">
          
          {/* INFORMACIÓN GENERAL */}
          <Card className="border-none shadow-sm overflow-hidden bg-white">
            <CardHeader className="bg-gray-50 border-b border-gray-100 py-3">
              <CardTitle className="text-xs font-bold uppercase tracking-widest text-gray-500 flex items-center">
                <Building2 className="h-3.5 w-3.5 mr-2" /> Empresa Solicitante
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <SmartSearch
                placeholder="Buscar empresa..."
                onSelect={handleCompanySelect}
                fetchFunction={searchCompanies}
                displayValue={companyName}
                className="w-full text-sm"
                icon={<Building2 className="h-4 w-4 text-gray-400" />}
              />
            </CardContent>
          </Card>

          {/* PROVEEDORES */}
          <Card className="border-none shadow-md overflow-hidden bg-white">
            <CardHeader className="bg-procarni-blue text-white py-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="bg-white/20 p-1.5 rounded-md">
                    <Search className="h-4 w-4" />
                  </div>
                  <CardTitle className="text-sm font-bold uppercase tracking-wider">2. Proveedores</CardTitle>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-7 text-[10px] text-white hover:bg-white/10"
                  onClick={() => setIsAddSupplierDialogOpen(true)}
                >
                  <PlusCircle className="h-3 w-3 mr-1" /> Nuevo
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-5 space-y-6">
              
              <div className="space-y-4">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Buscar en el Directorio</Label>
                <SmartSearch
                  placeholder="RIF o nombre..."
                  onSelect={handleSupplierSelect}
                  fetchFunction={searchSuppliers}
                  displayValue=""
                  className="w-full text-sm"
                  icon={<Search className="h-4 w-4 text-gray-400" />}
                />
              </div>

              {suggestedSuppliers.length > 0 && (
                <div className="bg-procarni-blue/5 p-4 rounded-xl border border-procarni-blue/10">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="h-3.5 w-3.5 text-procarni-blue" />
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-procarni-blue">Sugerencias</h4>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {suggestedSuppliers.map(sup => {
                      const isSelected = selectedSuppliers.some(s => s.id === sup.id);
                      return (
                        <Badge 
                          key={sup.id} 
                          variant={isSelected ? "default" : "outline"}
                          className={`cursor-pointer px-3 py-1.5 transition-all flex flex-col items-start gap-0.5 ${isSelected ? 'bg-procarni-secondary hover:bg-green-700 shadow-sm border-none' : 'bg-white hover:bg-procarni-blue/5 border-procarni-blue/20 text-procarni-blue'}`}
                          onClick={() => {
                            if (!isSelected) {
                              handleSupplierSelect(sup);
                            } else {
                              removeSupplier(sup.id);
                            }
                          }}
                        >
                          <div className="flex items-center w-full justify-between gap-1.5">
                            <span className="font-semibold text-[10px]">{sup.name}</span>
                            {isSelected ? <X className="h-2.5 w-2.5 shrink-0" /> : <PlusCircle className="h-2.5 w-2.5 shrink-0 text-procarni-blue/40" />}
                          </div>
                          <span className="text-[8px] opacity-70">Distribuye este material</span>
                        </Badge>
                      )
                    })}
                  </div>
                  <p className="text-[8px] text-procarni-blue/60 mt-3 italic">Basado en historial de compras</p>
                </div>
              )}

              {selectedSuppliers.length > 0 && (
                <div className="pt-2 border-t border-gray-100">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3 block">Seleccionados ({selectedSuppliers.length})</Label>
                  <div className="flex flex-wrap gap-2">
                    {selectedSuppliers.map(supplier => (
                      <Badge 
                        key={supplier.id} 
                        variant="secondary"
                        className="pl-3 pr-1 py-1 text-[11px] bg-procarni-primary/5 text-procarni-primary border-procarni-primary/10 flex items-center gap-1 group"
                      >
                        {supplier.name}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-4 w-4 hover:bg-procarni-primary/10 rounded-full"
                          onClick={() => removeSupplier(supplier.id)}
                        >
                          <X className="h-2.5 w-2.5" />
                        </Button>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-4">
                <Button
                  className="w-full h-12 bg-procarni-secondary hover:bg-green-700 text-white font-bold text-sm shadow-lg shadow-green-100 transition-all active:scale-[0.98]"
                  onClick={handleSubmit}
                  disabled={isSubmitting || items.length === 0 || selectedSuppliers.length === 0 || !companyId}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Procesando...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-5 w-5" />
                      Enviar Solicitudes ({selectedSuppliers.length})
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <MaterialCreationDialog
        isOpen={isAddMaterialDialogOpen}
        onClose={() => setIsAddMaterialDialogOpen(false)}
        onMaterialCreated={handleMaterialAdded}
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