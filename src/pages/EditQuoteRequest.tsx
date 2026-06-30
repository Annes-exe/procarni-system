// src/pages/EditQuoteRequest.tsx

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSession } from '@/components/SessionContextProvider';
import { 
  ArrowLeft, Loader2, Save, ShoppingCart, Info, Building2, Search, PlusCircle, 
  Sparkles, X, AlertCircle, ArrowRight, Mail, Phone, Send 
} from 'lucide-react';
import { showError, showSuccess, showSupplierAlert, dismissToast } from '@/utils/toast';
import { quoteRequestService } from '@/services/quoteRequestService';
import { searchSuppliers, searchCompanies, getAllUnits, getSupplierDetails, getPurchaseHistoryReport, getSuppliersByMaterial } from '@/integrations/supabase/data';
import { useQuery } from '@tanstack/react-query';

import SmartSearch from '@/components/SmartSearch';
import MaterialCreationDialog from '@/components/MaterialCreationDialog';
import SupplierCreationDialog from '@/components/SupplierCreationDialog';
import { useIsMobile } from '@/hooks/use-mobile';
import QuoteRequestItemsTable, { QuoteRequestItemForm } from '@/components/QuoteRequestItemsTable';
import DocumentDatePicker from '@/components/DocumentDatePicker';

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
  const isMobile = useIsMobile();

  const [isAddMaterialDialogOpen, setIsAddMaterialDialogOpen] = useState(false);
  const [isAddSupplierDialogOpen, setIsAddSupplierDialogOpen] = useState(false);

  const [companyId, setCompanyId] = useState<string>('');
  const [companyName, setCompanyName] = useState<string>('');
  const [supplierId, setSupplierId] = useState<string>('');
  const [supplierName, setSupplierName] = useState<string>('');
  const [items, setItems] = useState<QuoteRequestItemForm[]>([]);
  const [issueDate, setIssueDate] = useState<string>('');
  const [deadlineDate, setDeadlineDate] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [sendOptions, setSendOptions] = useState<{ whatsapp: boolean; email: boolean }>({ whatsapp: false, email: false });
  const [whatsappLinks, setWhatsappLinks] = useState<{name: string; url: string}[]>([]);
  const [suggestedSuppliers, setSuggestedSuppliers] = useState<any[]>([]);
  const [supplierEmail, setSupplierEmail] = useState<string>('');
  const [supplierPhone, setSupplierPhone] = useState<string>('');
  const [supplierAlert, setSupplierAlert] = useState<string>('');

  const { data: units = [], isLoading: isLoadingUnits } = useQuery({
    queryKey: ['units_of_measure'],
    queryFn: getAllUnits,
  });

  const userId = session?.user?.id;

  const { data: initialRequest, isLoading: isLoadingRequest, error: requestError } = useQuery({
    queryKey: ['quoteRequestDetails', id],
    queryFn: () => quoteRequestService.getById(id!),
    enabled: !!id && !!session && !isLoadingSession,
  });

  // Effect to populate form and fetch extra info
  useEffect(() => {
    const populateForm = async () => {
      if (initialRequest) {
        // @ts-ignore
        if (initialRequest.status !== 'Draft' && role !== 'admin') {
          showError('No tienes permisos para editar esta solicitud en su estado actual.');
          navigate('/quote-request-management');
          return;
        }

        setCompanyId(initialRequest.company_id);
        // @ts-ignore
        setCompanyName(initialRequest.companies?.name || '');
        setSupplierId(initialRequest.supplier_id);
        // @ts-ignore
        setSupplierName(initialRequest.suppliers?.name || '');

        // Map items and fetch price info
        // @ts-ignore
        const mappedItems = await Promise.all((initialRequest.quote_request_items || []).map(async (item) => {
          let priceInfo = '';
          if (item.material_id) {
            try {
              const history = await getPurchaseHistoryReport({ materialId: item.material_id });
              if (history && history.length > 0) {
                const latest = history[0];
                priceInfo = `Últ. compra: ${latest.unit_price} ${latest.purchase_orders.currency} (${latest.purchase_orders.suppliers.name})`;
              }
            } catch (e) {
              console.error("Error fetching price history for item", e);
            }
          }

          return {
            id: item.id,
            material_name: item.material_name || item.materials?.name || 'Material Desconocido',
            quantity: item.quantity,
            description: item.description || '',
            unit: item.unit || (units[0]?.name || ''),
            unit_id: item.unit_id || (units.find(u => u.name === item.unit)?.id || (units[0]?.id || '')),
            material_id: item.material_id || undefined,
            last_price_info: priceInfo
          };
        }));

        setItems(mappedItems);
        
        if (initialRequest.issue_date) {
          setIssueDate(new Date(initialRequest.issue_date).toISOString().split('T')[0]);
        }
        if (initialRequest.deadline_date) {
          setDeadlineDate(new Date(initialRequest.deadline_date).toISOString().split('T')[0]);
        }

        // Fetch supplier details for alerts and send options
        const details = await getSupplierDetails(initialRequest.supplier_id);
        if (details) {
          setSupplierEmail(details.email || '');
          setSupplierPhone(details.phone || '');
          setSupplierAlert(details.alert_comment || '');
          setSendOptions({
            whatsapp: !!details.phone,
            email: !!details.email
          });
          if (details.alert_comment) {
            showSupplierAlert(details.alert_comment);
          }
        }
      }
    };

    populateForm();
  }, [initialRequest, units]);

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
        
        setSuggestedSuppliers(Array.from(supplierMap.values()).filter(s => s.id && s.id !== supplierId));
      } catch (error) {
        console.error("Error fetching suggestions", error);
      }
    };
    fetchSuggestions();
  }, [items, supplierId]);

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
          <Link to="/quote-request-management">Volver a la gestión</Link>
        </Button>
      </div>
    );
  }

  const handleAddItem = () => {
    setItems((prevItems) => [...prevItems, { 
      material_name: '', 
      quantity: 0, 
      description: '', 
      unit: units[0]?.name || '', 
      unit_id: units[0]?.id || '',
      material_id: undefined 
    }]);
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
    // @ts-ignore
    handleItemChange(index, 'unit_id', material.unit_id || (units.find(u => u.name === material.unit)?.id || (units[0]?.id || '')));
    handleItemChange(index, 'material_id', material.id);
    
    if (material.specification) {
      handleItemChange(index, 'description', material.specification);
    }

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
    setSupplierId(supplier.id);
    setSupplierName(supplier.name);
    
    try {
      const details = await getSupplierDetails(supplier.id);
      if (details) {
        setSupplierEmail(details.email || '');
        setSupplierPhone(details.phone || '');
        setSupplierAlert(details.alert_comment || '');
        setSendOptions({
          whatsapp: !!details.phone,
          email: !!details.email
        });
        
        if (details.alert_comment) {
          showSupplierAlert(details.alert_comment);
        } else {
          dismissToast("supplier-alert");
        }
      }
    } catch (e) {
      console.error("Error fetching supplier details", e);
    }
  };

  const handleMaterialAdded = (material: any) => {
    // This allows the dialog to close without error
    // The user can then search for the newly created material
    console.log("Material created:", material);
  };

  const handleNextStep = () => {
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

    if (deadlineDate < issueDate) {
      showError('La fecha de entrega no puede ser anterior a la fecha de emisión.');
      return;
    }

    setStep(2);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);

    try {
      const requestData = {
        supplier_id: supplierId,
        company_id: companyId,
        currency: 'USD' as const,
        issue_date: issueDate,
        deadline_date: deadlineDate,
      };

      const formattedItems = items.map(item => ({
        material_id: item.material_id || '',
        material_name: item.material_name,
        quantity: item.quantity,
        unit: item.unit,
        unit_id: item.unit_id,
        description: item.description,
      }));

      if (formattedItems.some(i => !i.material_id)) {
        showError("Todos los ítems deben estar asociados a un material registrado.");
        setIsSubmitting(false);
        return;
      }

      // @ts-ignore
      await quoteRequestService.update(id!, requestData, formattedItems);

      // Handle Notifications (Step 2 logic)
      const links: { name: string; url: string }[] = [];
      
      let tempUrl = '';
      
      // WhatsApp Link Generation
      if (sendOptions.whatsapp && supplierPhone) {
        try {
          const tempResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-temp-pdf`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session?.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ orderId: id, type: 'quote_request' }),
          });
          
          if (tempResponse.ok) {
            const tempData = await tempResponse.json();
            tempUrl = tempData.url;
          }
        } catch (e) {
          console.error('Error generating temp link', e);
        }

        const cleanPhone = supplierPhone.replace(/\D/g, '');
        const docUrl = tempUrl || `(Documento #${id?.substring(0, 8)})`;
        const message = `Saludos ${supplierName}, le escribimos de Procarni para enviarle una actualización de la solicitud de cotización. Puede revisar los nuevos detalles en el siguiente enlace:\n\n${docUrl}\n\nQuedamos atentos.`;
        
        links.push({
          name: supplierName,
          url: `https://wa.me/${cleanPhone.startsWith('58') ? cleanPhone : '58' + cleanPhone}?text=${encodeURIComponent(message)}`
        });
      }

      // Email Sending
      if (sendOptions.email && supplierEmail) {
        try {
          const pdfResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-qr-pdf`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session?.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ requestId: id }),
          });

          if (pdfResponse.ok) {
            const pdfBlob = await pdfResponse.blob();
            const pdfBase64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(pdfBlob);
            });

            const emailBody = `
              <h2>Solicitud de Cotización Actualizada #${id?.substring(0, 8)}</h2>
              <p>Estimado proveedor <strong>${supplierName}</strong>,</p>
              <p>Se adjunta el PDF con la versión actualizada de la solicitud de cotización.</p>
              <p>Por favor revise los cambios y responda con su oferta a la brevedad posible.</p>
            `;

            const safeName = supplierName.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_') || 'Proveedor';
            const attachmentFilename = `SC_Update_${id?.substring(0, 8)}_${safeName}.pdf`;

            await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${session?.access_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                to: supplierEmail,
                subject: `Actualización: Solicitud de Cotización #${id?.substring(0, 8)}`,
                body: emailBody,
                attachmentBase64: pdfBase64,
                attachmentFilename,
              }),
            });
          }
        } catch (e) {
          console.error('Error sending email', e);
        }
      }

      showSuccess('Solicitud actualizada exitosamente.');
      
      if (links.length > 0) {
        setWhatsappLinks(links);
        setStep(3);
      } else {
        navigate(`/quote-request-management`);
      }
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
      <div className="relative md:sticky md:top-0 z-20 backdrop-blur-md bg-white/90 border-b border-gray-200 pb-3 pt-4 mb-6 -mx-4 px-4 shadow-sm flex justify-between items-center transition-all duration-200">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-gray-400 hover:text-procarni-dark hover:bg-gray-100 rounded-full h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-procarni-dark tracking-tight">Editar Solicitud</h1>
            <p className="text-[11px] text-gray-500 font-medium">Actualiza los detalles de la solicitud #{id?.substring(0, 8)}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          {step === 2 && (
            <Button
              variant="outline"
              onClick={() => setStep(1)}
              disabled={isSubmitting}
              className="w-full md:w-auto"
            >
              Atrás
            </Button>
          )}
          {step !== 3 && (
            <Button
              onClick={step === 1 ? handleNextStep : handleSubmit}
              disabled={isSubmitting}
              className="bg-procarni-secondary hover:bg-green-700 text-white shadow-sm w-full md:w-auto"
            >
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (step === 1 ? <ArrowRight className="mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />)}
              {step === 1 ? "Siguiente" : "Guardar y Enviar"}
            </Button>
          )}
        </div>
      </div>

      {step === 1 ? (

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
                  <CardDescription className="text-white/70 text-[10px]">Modifica los productos de esta solicitud</CardDescription>
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleAddItem} variant="secondary" size="sm" className="h-8 bg-white/10 hover:bg-white/20 border-none text-white text-[10px]">
                  <PlusCircle className="mr-2 h-3.5 w-3.5" /> Añadir Ítem
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
                supplierId={supplierId}
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

        {/* COLUMNA LATERAL: INFORMACIÓN Y PROVEEDOR */}
        <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-24">
          
          {/* INFORMACIÓN GENERAL */}
          <Card className="border-none shadow-sm overflow-hidden bg-white">
            <CardHeader className="bg-gray-50 border-b border-gray-100 py-3">
              <CardTitle className="text-xs font-bold uppercase tracking-widest text-gray-500 flex items-center">
                <Building2 className="h-3.5 w-3.5 mr-2" /> Empresa Solicitante
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="space-y-4">
                <SmartSearch
                  placeholder="Buscar empresa..."
                  onSelect={handleCompanySelect}
                  fetchFunction={searchCompanies}
                  displayValue={companyName}
                  className="w-full text-sm"
                  icon={<Building2 className="h-4 w-4 text-gray-400" />}
                />

                <div className="grid grid-cols-2 gap-4">
                  <DocumentDatePicker
                    label="Fecha Emisión"
                    id="issue_date"
                    date={issueDate ? new Date(issueDate + 'T12:00:00') : undefined}
                    onDateChange={(d) => setIssueDate(d ? d.toISOString().split('T')[0] : '')}
                    className="w-full"
                  />
                  <DocumentDatePicker
                    label="Fecha Entrega"
                    id="deadline_date"
                    date={deadlineDate ? new Date(deadlineDate + 'T12:00:00') : undefined}
                    onDateChange={(d) => setDeadlineDate(d ? d.toISOString().split('T')[0] : '')}
                    className="w-full"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* PROVEEDOR */}
          <Card className="border-none shadow-md overflow-hidden bg-white">
            <CardHeader className="bg-procarni-blue text-white py-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="bg-white/20 p-1.5 rounded-md">
                    <Search className="h-4 w-4" />
                  </div>
                  <CardTitle className="text-sm font-bold uppercase tracking-wider">2. Proveedor</CardTitle>
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
                <Label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Proveedor de la Solicitud</Label>
                <SmartSearch
                  placeholder="RIF o nombre..."
                  onSelect={handleSupplierSelect}
                  fetchFunction={searchSuppliers}
                  displayValue={supplierName}
                  className="w-full text-sm"
                  icon={<Search className="h-4 w-4 text-gray-400" />}
                />
              </div>

              {suggestedSuppliers.length > 0 && (
                <div className="bg-procarni-blue/5 p-4 rounded-xl border border-procarni-blue/10">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="h-3.5 w-3.5 text-procarni-blue" />
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-procarni-blue">Cambiar Proveedor</h4>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {suggestedSuppliers.map(sup => (
                      <Badge 
                        key={sup.id} 
                        variant="outline"
                        className="cursor-pointer px-3 py-1.5 bg-white hover:bg-procarni-blue/5 border-procarni-blue/20 text-procarni-blue transition-all flex flex-col items-start gap-0.5"
                        onClick={() => handleSupplierSelect(sup)}
                      >
                        <div className="flex items-center w-full justify-between gap-1.5">
                          <span className="font-semibold text-[10px]">{sup.name}</span>
                          <PlusCircle className="h-2.5 w-2.5 shrink-0 text-procarni-blue/40" />
                        </div>
                        <span className="text-[8px] opacity-70">Distribuye estos materiales</span>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-gray-100">
                <div className="flex items-start gap-3 p-4 rounded-xl bg-procarni-blue/5 border border-procarni-blue/10">
                  <Info className="h-5 w-5 text-procarni-blue shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-procarni-blue">Edición Individual</p>
                    <p className="text-[10px] text-gray-500 mt-1">Estás editando una solicitud específica. Si cambias el proveedor, se actualizará este documento.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      ) : step === 2 ? (
        <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <Card className="border-none shadow-md overflow-hidden bg-white/80 backdrop-blur-sm">
            <CardHeader className="bg-procarni-primary text-white py-6">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2 rounded-lg">
                  <Send className="h-6 w-6 text-white" />
                </div>
                <div>
                  <CardTitle className="text-xl uppercase tracking-wider">2. Configurar Envío</CardTitle>
                  <CardDescription className="text-white/70">Selecciona el canal de notificación para el proveedor.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="p-5 border border-gray-100 rounded-xl bg-gray-50 hover:bg-white transition-colors shadow-sm flex flex-col sm:flex-row sm:items-center justify-between">
                <div className="mb-4 sm:mb-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-procarni-dark text-base">{supplierName}</h4>
                    {supplierAlert && (
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] py-0 px-2 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> Alerta
                      </Badge>
                    )}
                  </div>
                  {supplierAlert && (
                    <p className="text-[10px] text-amber-600 mt-1 italic font-medium">"{supplierAlert}"</p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    {supplierEmail || supplierPhone ? 'Datos de contacto disponibles' : 'Sin datos de contacto registrados'}
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-8">
                  <label className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${!supplierPhone ? 'opacity-40 cursor-not-allowed grayscale' : 'cursor-pointer hover:bg-green-50'}`}>
                    <input
                      type="checkbox"
                      disabled={!supplierPhone}
                      checked={sendOptions.whatsapp}
                      onChange={(e) => setSendOptions(prev => ({ ...prev, whatsapp: e.target.checked }))}
                      className="w-5 h-5 text-green-600 rounded border-gray-300 focus:ring-green-600 focus:ring-offset-0 disabled:bg-gray-100"
                    />
                    <div className="flex items-center gap-1.5">
                      <Phone className="w-4 h-4 text-green-600" />
                      <div>
                        <span className="text-sm font-semibold text-gray-700 block">WhatsApp</span>
                        <span className="text-[10px] text-gray-500">{supplierPhone || 'No registrado'}</span>
                      </div>
                    </div>
                  </label>
                  
                  <label className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${!supplierEmail ? 'opacity-40 cursor-not-allowed grayscale' : 'cursor-pointer hover:bg-blue-50'}`}>
                    <input
                      type="checkbox"
                      disabled={!supplierEmail}
                      checked={sendOptions.email}
                      onChange={(e) => setSendOptions(prev => ({ ...prev, email: e.target.checked }))}
                      className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-600 focus:ring-offset-0 disabled:bg-gray-100"
                    />
                    <div className="flex items-center gap-1.5">
                      <Mail className="w-4 h-4 text-blue-600" />
                      <div>
                        <span className="text-sm font-semibold text-gray-700 block">Correo Electrónico</span>
                        <span className="text-[10px] text-gray-500">{supplierEmail || 'No registrado'}</span>
                      </div>
                    </div>
                  </label>
                </div>
              </div>
              
              <div className="pt-6 border-t flex justify-end">
                <Button
                  className="h-12 px-8 bg-procarni-secondary hover:bg-green-700 text-white font-bold text-sm shadow-lg shadow-green-100 transition-all active:scale-[0.98]"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Procesando...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-5 w-5" />
                      Guardar y Enviar Notificaciones
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <Card className="border-none shadow-md overflow-hidden bg-white/80 backdrop-blur-sm text-center py-10">
            <CardHeader>
              <div className="mx-auto bg-green-100 p-4 rounded-full w-20 h-20 flex items-center justify-center mb-4">
                <Send className="h-10 w-10 text-green-600" />
              </div>
              <CardTitle className="text-2xl text-procarni-dark">¡Solicitud Actualizada!</CardTitle>
              <CardDescription className="text-base mt-2">
                Los cambios se han guardado y las notificaciones automáticas se han procesado.
                <br/>A continuación tienes los enlaces de WhatsApp para enviar los mensajes:
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 max-w-lg mx-auto">
              {whatsappLinks.map((link, idx) => (
                <Button 
                  key={idx} 
                  variant="outline" 
                  className="w-full h-14 justify-between border-green-200 hover:bg-green-50 hover:text-green-700 hover:border-green-300"
                  onClick={() => window.open(link.url, '_blank')}
                >
                  <div className="flex items-center gap-3">
                    <div className="bg-green-100 p-2 rounded-lg text-green-600">
                      <Phone className="h-5 w-5" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold">{link.name}</p>
                      <p className="text-[10px] text-gray-500">Enviar documento por WhatsApp</p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-green-400" />
                </Button>
              ))}
              <Button 
                variant="ghost" 
                className="w-full mt-6 text-gray-400"
                onClick={() => navigate('/quote-request-management')}
              >
                Volver a la Gestión
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      <SupplierCreationDialog
        isOpen={isAddSupplierDialogOpen}
        onClose={() => setIsAddSupplierDialogOpen(false)}
        onSupplierCreated={handleSupplierSelect}
      />
    </div>
  );
};

export default EditQuoteRequest;