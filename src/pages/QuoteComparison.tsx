import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, PlusCircle, Scale, Download, X, Loader2, RefreshCw, DollarSign, Save, ListOrdered } from 'lucide-react';

import { useNavigate, useSearchParams } from 'react-router-dom';
import SmartSearch from '@/components/SmartSearch';
import { searchMaterials, createQuoteComparison, updateQuoteComparison, getQuoteComparisonById, getAllUnits } from '@/integrations/supabase/data';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Input } from '@/components/ui/input';
import { showError, showSuccess } from '@/utils/toast';
import MaterialQuoteComparisonRow from '@/components/MaterialQuoteComparisonRow';
import QuoteComparisonPDFButton from '@/components/QuoteComparisonPDFButton';
import { Separator } from '@/components/ui/separator';
import SaveComparisonDialog from '@/components/SaveComparisonDialog';
import { useSession } from '@/components/SessionContextProvider';
import { QuoteRequest, QuoteComparison as QuoteComparisonType, QuoteRequestItem, QuoteEntry, ComparisonResult, QuoteComparisonItem } from '@/integrations/supabase/types';
import ImportQuoteRequestDialog from '@/components/ImportQuoteRequestDialog';
import ExportToPurchaseOrdersDialog from '@/components/ExportToPurchaseOrdersDialog';
import ExchangeRateInput from '@/components/ExchangeRateInput';
import MaterialCreationDialog from '@/components/MaterialCreationDialog';
import { Material } from '@/integrations/supabase/types';

interface MaterialSearchResult {
  id: string;
  name: string;
  code: string;
  category?: string;
  unit?: string;
  unit_id?: string; // ADDED
  is_exempt?: boolean;
  specification?: string;
}

interface MaterialSearchResult {
  id: string;
  name: string;
  code: string;
  category?: string;
  unit?: string;
  unit_id?: string;
  is_exempt?: boolean;
  specification?: string;
}

interface MaterialComparison {
  material: MaterialSearchResult;
  quotes: QuoteEntry[];
}

const QuoteComparison = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { session } = useSession();

  const [comparisonId, setComparisonId] = useState<string | null>(null);
  const [comparisonName, setComparisonName] = useState<string>('Nueva Comparación');
  const [materialsToCompare, setMaterialsToCompare] = useState<MaterialComparison[]>([]);
  const [globalInputCurrency, setGlobalInputCurrency] = useState<'USD' | 'VES' | 'EUR'>('USD');
  const [exchangeRate, setExchangeRate] = useState<number | undefined>(undefined);
  const [eurExchangeRate, setEurExchangeRate] = useState<number | undefined>(undefined);

  const [newMaterialQuery, setNewMaterialQuery] = useState('');
  const [selectedMaterialToAdd, setSelectedMaterialToAdd] = useState<MaterialSearchResult | null>(null);

  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isMaterialDialogOpen, setIsMaterialDialogOpen] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const { data: units = [] } = useQuery({
    queryKey: ['units_of_measure'],
    queryFn: getAllUnits,
  });

  const handleMaterialCreated = (material: Material & { specification?: string }) => {
    // Check if it's already added
    if (materialsToCompare.some(m => m.material.id === material.id)) {
      showError('Este material ya está en la lista de comparación.');
    } else {
      setMaterialsToCompare(prev => [
        ...prev,
        { 
          material: { 
            id: material.id, 
            name: material.name, 
            code: material.code || 'N/A',
            unit_id: material.unit_id || undefined
          }, 
          quotes: [] 
        }
      ]);
      setIsDirty(true);
      showSuccess(`Material "${material.name}" añadido a la comparación.`);
    }
  };

  // --- Data Loading from URL ---
  const comparisonIdFromUrl = searchParams.get('loadId');

  const { data: loadedComparison, isLoading: isLoadingComparison } = useQuery<QuoteComparisonType | null>({
    queryKey: ['quoteComparison', comparisonIdFromUrl],
    queryFn: () => getQuoteComparisonById(comparisonIdFromUrl!),
    enabled: !!comparisonIdFromUrl,
  });

  useEffect(() => {
    if (loadedComparison) {
      setComparisonId(loadedComparison.id);
      setComparisonName(loadedComparison.name);
      setGlobalInputCurrency(loadedComparison.base_currency as 'USD' | 'VES' | 'EUR');
      setExchangeRate(loadedComparison.global_exchange_rate || undefined);

      const loadedMaterials: MaterialComparison[] = loadedComparison.items?.map(item => ({
        material: {
          id: item.material_id,
          name: item.material_name,
          code: item.materials?.code || 'N/A',
          unit_id: item.unit_id || undefined,
        },
        quotes: item.quotes || [],
      })) || [];

      setMaterialsToCompare(loadedMaterials);
      showSuccess(`Comparación "${loadedComparison.name}" cargada exitosamente.`);

      // Clear URL param after loading to prevent re-triggering
      navigate('/quote-comparison', { replace: true });
    }
  }, [loadedComparison, navigate]);
  // -----------------------------
  const renderExchangeRateInput = (currency: 'USD' | 'EUR', currentVal: number | undefined, setter: (val: number | undefined) => void) => (
    <div className="flex flex-col gap-2">
      <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Tasa {currency}/VES</Label>
      <ExchangeRateInput
        baseCurrency={currency}
        exchangeRate={currentVal}
        onExchangeRateChange={(val) => {
          setter(val);
          setIsDirty(true);
        }}
        disableAutoFetch={!!comparisonIdFromUrl && !isDirty}
      />
    </div>
  );

  const handleMaterialSelect = (material: MaterialSearchResult) => {
    setSelectedMaterialToAdd(material);
    setNewMaterialQuery(material.name);
  };

  const handleAddMaterial = () => {
    if (!selectedMaterialToAdd) {
      showError('Por favor, selecciona un material para añadir.');
      return;
    }
    
    // Use material's default unit if available
    const unitId = selectedMaterialToAdd.unit_id || '';

    if (materialsToCompare.some(m => m.material.id === selectedMaterialToAdd.id)) {
      showError('Este material ya está en la lista de comparación.');
      return;
    }

    setMaterialsToCompare(prev => [
      ...prev,
      { material: selectedMaterialToAdd, quotes: [] }
    ]);
    setSelectedMaterialToAdd(null);
    setNewMaterialQuery('');
    setIsDirty(true);
  };

  const handleRemoveMaterial = (materialId: string) => {
    setMaterialsToCompare(prev => prev.filter(m => m.material.id !== materialId));
    setIsDirty(true);
  };

  const handleAddQuoteEntry = (materialId: string, supplierId?: string, supplierName?: string) => {
    setMaterialsToCompare(prev => prev.map(m => {
      if (m.material.id === materialId) {
        return {
          ...m,
          quotes: [...m.quotes, {
            supplierId: supplierId || '',
            supplierName: supplierName || '',
            unitPrice: 0,
            currency: globalInputCurrency,
            exchangeRate: globalInputCurrency === 'EUR' ? eurExchangeRate : exchangeRate,
            unit_id: ''
          }]
        };
      }
      return m;
    }));
    setIsDirty(true);
  };

  const handleRemoveQuoteEntry = (materialId: string, quoteIndex: number) => {
    setMaterialsToCompare(prev => prev.map(m => {
      if (m.material.id === materialId) {
        return {
          ...m,
          quotes: m.quotes.filter((_, i) => i !== quoteIndex)
        };
      }
      return m;
    }));
    setIsDirty(true);
  };

  const handleImportQuoteRequests = (importedRequests: QuoteRequest[]) => {
    // 1. Collect all unique materials from all imported requests
    const uniqueMaterialsMap = new Map<string, MaterialSearchResult>();

    importedRequests.forEach(req => {
      const items = (req as any).quote_request_items as QuoteRequestItem[];
      if (items) {
        items.forEach(item => {
          const matId = item.material_id || item.id;
          const matName = item.materials?.name || item.material_name || 'Desconocido';

          if (!uniqueMaterialsMap.has(matId)) {
            uniqueMaterialsMap.set(matId, {
              id: matId,
              name: matName,
              code: item.materials?.code || (item.material_id ? 'N/A' : 'Sin Código (Legado)'),
            });
          }
        });
      }
    });

    const newMaterialsToAdd = Array.from(uniqueMaterialsMap.values());

    setMaterialsToCompare(prevMaterials => {
      let updatedMaterials = [...prevMaterials];

      // 2. Add any new materials that we don't already have in the comparison
      newMaterialsToAdd.forEach(newMat => {
        if (!updatedMaterials.some(m => m.material.id === newMat.id)) {
          updatedMaterials.push({ material: newMat, quotes: [] });
        }
      });

      // 3. For every imported request, add a quote row for its supplier and its specific unit
      importedRequests.forEach(req => {
        const items = (req as any).quote_request_items as QuoteRequestItem[];
        if (!items) return;

        items.forEach(item => {
          const matId = item.material_id || item.id;
          let unitId = item.unit_id || '';
          
          // Fallback: try to find unitId from units list if missing but name is present
          if (!unitId && item.unit) {
            const matchedUnit = units.find(u => u.name.toLowerCase() === item.unit.toLowerCase());
            if (matchedUnit) {
              unitId = matchedUnit.id;
            }
          }

          updatedMaterials = updatedMaterials.map(matComp => {
            if (matComp.material.id === matId) {
              // Check if this supplier + unit already has a quote entry
              // We check both unit_id and unit (name) to differentiate presentations even if ID is missing
              const hasQuoteAlready = matComp.quotes.some(q => 
                q.supplierId === req.supplier_id && 
                (q.unit_id === unitId || (unitId === '' && q.unit_name === item.unit))
              );

              if (!hasQuoteAlready) {
                return {
                  ...matComp,
                  quotes: [...matComp.quotes, {
                    supplierId: req.supplier_id,
                    // @ts-ignore
                    supplierName: req.suppliers?.name || 'Desconocido',
                    unitPrice: 0,
                    currency: globalInputCurrency,
                    exchangeRate: exchangeRate,
                    unit_id: unitId
                  }]
                };
              }
            }
            return matComp;
          });
        });
      });

      return updatedMaterials;
    });

    setIsImportModalOpen(false);
    setIsDirty(true);
    showSuccess(`${importedRequests.length} SC(s) importadas exitosamente.`);
  };

  const handleQuoteChange = (materialId: string, quoteIndex: number, field: keyof QuoteEntry, value: any) => {
    setMaterialsToCompare(prev => prev.map(m => {
      if (m.material.id === materialId) {
        const updatedQuotes = [...m.quotes];
        updatedQuotes[quoteIndex] = { ...updatedQuotes[quoteIndex], [field]: value };
        return { ...m, quotes: updatedQuotes };
      }
      return m;
    }));
    setIsDirty(true);
  };

  // --- Core Comparison Logic (Memoized) ---
  const comparisonBaseCurrency = 'USD';

  // Fetch units to show names in reports
  const { data: units } = useQuery({
    queryKey: ['allUnits'],
    queryFn: getAllUnits,
  });

  const comparisonResults = useMemo<ComparisonResult[]>(() => {
    return materialsToCompare.map((materialComp) => {
      const results = materialComp.quotes.map((quote) => {
        let rateToUse = quote.exchangeRate || exchangeRate;
        let convertedPrice: number | null = quote.unitPrice;
        let finalRate = quote.exchangeRate;

        // Get unit name for PDF/Export
        const unitName = units?.find(u => u.id === quote.unit_id)?.name;

        if (quote.currency === comparisonBaseCurrency) {
          // No conversion needed
        } else if (quote.currency === 'VES' && comparisonBaseCurrency === 'USD') {
          if (rateToUse && rateToUse > 0) {
            convertedPrice = quote.unitPrice / rateToUse;
            finalRate = rateToUse;
          } else {
            return { ...quote, unit_name: unitName, convertedPrice: null, isValid: false, error: 'Falta Tasa de Cambio para VES a USD.' };
          }
        }

        if (convertedPrice === null || isNaN(convertedPrice)) {
          return { ...quote, unit_name: unitName, convertedPrice: null, isValid: false, error: 'Error de cálculo.' };
        }

        return { ...quote, unit_name: unitName, convertedPrice: convertedPrice, isValid: true, error: null, exchangeRate: finalRate };
      });

      // Group results by unit to find best price per unit
      const unitGroups: Record<string, number> = {};
      results.forEach(r => {
        if (r.isValid && r.convertedPrice !== undefined && r.convertedPrice !== null) {
          const unitKey = r.unit_id || 'default';
          if (!unitGroups[unitKey] || r.convertedPrice < unitGroups[unitKey]) {
            unitGroups[unitKey] = r.convertedPrice;
          }
        }
      });

      // Mark best prices
      const resultsWithBest = results.map(r => {
        const unitKey = r.unit_id || 'default';
        return {
          ...r,
          isBest: r.isValid && r.convertedPrice !== undefined && r.convertedPrice !== null && r.convertedPrice === unitGroups[unitKey]
        };
      });

      return {
        material: materialComp.material,
        results: resultsWithBest as QuoteEntry[],
        unitGroups,
        bestPrice: Math.min(...Object.values(unitGroups).filter(v => v > 0), Infinity)
      };
    });
  }, [materialsToCompare, exchangeRate, units, comparisonBaseCurrency]);
  // -----------------------------

  // --- Save/Update Logic ---
  const saveMutation = useMutation({
    mutationFn: async ({ name, isUpdate }: { name: string; isUpdate: boolean }) => {
      if (!session?.user?.id) throw new Error('User not authenticated.');
      if (materialsToCompare.length === 0) throw new Error('No hay materiales para guardar.');

      const comparisonData = {
        name,
        base_currency: globalInputCurrency,
        global_exchange_rate: exchangeRate || null,
        user_id: session.user.id,
      };

      const itemsPayload = materialsToCompare.map(m => ({
        material_id: m.material.id,
        material_name: m.material.name || 'Material sin nombre',
        unit_id: m.quotes[0]?.unit_id || null, 
        quotes: m.quotes,
      }));

      if (isUpdate && comparisonId) {
        return updateQuoteComparison(comparisonId, comparisonData, itemsPayload);
      } else {
        return createQuoteComparison(comparisonData, itemsPayload);
      }
    },
    onSuccess: (data, variables) => {
      if (data) {
        queryClient.invalidateQueries({ queryKey: ['quoteComparisons'] });
        setComparisonId(data.id);
        setComparisonName(variables.name);
        setIsSaveDialogOpen(false);
        setIsDirty(false);
        showSuccess(`Comparación "${variables.name}" ${variables.isUpdate ? 'actualizada' : 'guardada'} exitosamente.`);
      } else {
        // Error is already handled by service showError
        console.error('Save mutation returned null data');
      }
    },
    onError: (error: any) => {
      showError(error.message || 'Error al guardar la comparación.');
    },
  });

  const handleSaveComparison = (name: string) => {
    saveMutation.mutate({ name, isUpdate: !!comparisonId });
  };

  const handleNewComparison = () => {
    setComparisonId(null);
    setComparisonName('Nueva Comparación');
    setMaterialsToCompare([]);
    setGlobalInputCurrency('USD');
    setExchangeRate(undefined);
    navigate('/quote-comparison', { replace: true });
  };


  const renderComparisonTable = () => {
    if (materialsToCompare.length === 0) {
      return <div className="text-center text-muted-foreground p-8">Añade materiales para empezar la comparación.</div>;
    }

    return (
      <div className="space-y-8">
        {comparisonResults.map((materialComp: ComparisonResult) => (
          <Card key={materialComp.material.id} className="border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-300 rounded-xl overflow-hidden bg-white">
            <div className="p-0 sm:p-2">
              <MaterialQuoteComparisonRow
                material={materialComp.material as any}
                quotes={materialComp.results}
                allUnits={units || []}
                onAddQuote={(supId, supName) => handleAddQuoteEntry(materialComp.material.id, supId, supName)}
                onRemoveQuote={(index) => handleRemoveQuoteEntry(materialComp.material.id, index)}
                onQuoteChange={(index, field, value) => handleQuoteChange(materialComp.material.id, index, field, value)}
                onRemoveMaterial={() => handleRemoveMaterial(materialComp.material.id)}
              />
            </div>
            {/* Individual PDF Download Button */}
            <div className="flex justify-end p-4 border-t border-gray-50 bg-gray-50/50">
              <QuoteComparisonPDFButton
                comparisonResults={[materialComp]}
                baseCurrency={comparisonBaseCurrency}
                globalExchangeRate={exchangeRate}
                label={`Descargar PDF de ${materialComp.material.code}`}
                variant="outline"
                isSingleMaterial={true}
              />
            </div>
          </Card>
        ))}
      </div>
    );
  };

  if (isLoadingComparison) {
    return (
      <div className="container mx-auto p-4 text-center text-muted-foreground">
        Cargando comparación guardada...
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-8 max-w-[1600px] pb-24">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-6">
        <div>
          <h1 className="text-2xl font-bold text-procarni-primary tracking-tight">
            {comparisonId ? `Edición: ${comparisonName}` : 'Comparación de Cotizaciones'}
          </h1>
          <p className="text-muted-foreground text-sm mt-1 max-w-2xl">
            {comparisonId ? 'Modifica y guarda los cambios en esta comparación existente.' : 'Crea una nueva comparación de precios añadiendo materiales y registrando ofertas de proveedores.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-3 w-full md:w-auto">
          {comparisonId && (
            <Button variant="outline" onClick={handleNewComparison} className="flex-1 md:flex-none border-dashed hover:border-solid transition-all">
              <PlusCircle className="mr-2 h-4 w-4 text-procarni-primary" /> Nueva Comparación
            </Button>
          )}
          <Button variant="outline" onClick={() => navigate('/quote-comparison-management')} className="flex-1 md:flex-none shadow-sm hover:shadow-md transition-shadow">
            <ListOrdered className="mr-2 h-4 w-4" /> Ver Guardadas
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 xl:grid-cols-5 gap-8 mb-8">

        {/* Lado Izquierdo: Configuración y Añadir Materiales (1 columna en desktop grande) */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="border-none shadow-md bg-white rounded-2xl overflow-hidden ring-1 ring-black/5">
            <CardHeader className="bg-gray-50/80 border-b border-gray-100 pb-4">
              <CardTitle className="text-base font-semibold text-procarni-dark flex items-center">
                <PlusCircle className="mr-2 h-4 w-4 text-procarni-secondary" />
                Añadir Materiales
              </CardTitle>
              <CardDescription className="text-xs">
                Busca e incorpora ítems para comparar.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <Button
                variant="outline"
                className="w-full bg-slate-50 border-dashed border-2 hover:bg-slate-100 hover:border-slate-300 transition-colors text-slate-600"
                onClick={() => setIsImportModalOpen(true)}
              >
                <Download className="mr-2 h-4 w-4" /> Importar Solicitudes (SC)
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-gray-100" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-muted-foreground">O manual</span>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label htmlFor="material-search" className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Buscar Material</Label>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-6 px-2 text-xs text-procarni-secondary hover:text-procarni-secondary hover:bg-procarni-secondary/10"
                      onClick={() => setIsMaterialDialogOpen(true)}
                    >
                      <PlusCircle className="mr-1 h-3 w-3" /> Nuevo
                    </Button>
                  </div>
                  <div>
                    <SmartSearch
                      placeholder="Nombre o código..."
                      onSelect={handleMaterialSelect}
                      fetchFunction={searchMaterials}
                      displayValue={newMaterialQuery}
                      selectedId={selectedMaterialToAdd?.id}
                    />
                  </div>
                </div>
                <Button
                  onClick={handleAddMaterial}
                  disabled={!selectedMaterialToAdd}
                  className="w-full bg-procarni-secondary hover:bg-green-700 shadow-sm transition-all h-10 group"
                >
                  <PlusCircle className="mr-2 h-4 w-4 group-hover:scale-110 transition-transform" /> Añadir a Comparación
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-md bg-white rounded-2xl overflow-hidden ring-1 ring-black/5">
            <CardHeader className="bg-gray-50/80 border-b border-gray-100 pb-4">
              <CardTitle className="text-base font-semibold text-procarni-dark flex items-center">
                <DollarSign className="mr-2 h-4 w-4 text-blue-500" />
                Configuración Global
              </CardTitle>
              <CardDescription className="text-xs">
                Moneda base y conversiones.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="global-input-currency" className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Moneda de Ingreso</Label>
                <Select value={globalInputCurrency} onValueChange={(value) => setGlobalInputCurrency(value as 'USD' | 'VES' | 'EUR')}>
                  <SelectTrigger id="global-input-currency" className="bg-gray-50 focus:ring-procarni-primary/20">
                    <SelectValue placeholder="Selecciona moneda" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD (Dólares)</SelectItem>
                    <SelectItem value="VES">VES (Bolívares)</SelectItem>
                    {/* <SelectItem value="EUR">EUR (Euros)</SelectItem> */}
                  </SelectContent>
                </Select>
              </div>
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="rates" className="border-none">
                  <AccordionTrigger className="text-[10px] font-bold py-1 px-0 hover:no-underline text-blue-600 hover:text-blue-700 uppercase tracking-widest">
                    Tasas de Cambio (VES)
                  </AccordionTrigger>
                  <AccordionContent className="pt-2 pb-0">
                    <div className="grid grid-cols-1 gap-4">
                      {renderExchangeRateInput('USD', exchangeRate, setExchangeRate)}
                      {/* {renderExchangeRateInput('EUR', eurExchangeRate, setEurExchangeRate)} */}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>
        </div>

        {/* Lado Derecho: Contenido Principal de Comparación (3 columnas en desktop, 4 en xl) */}
        <div className="lg:col-span-3 xl:col-span-4 space-y-6">
          <Card className="border-none shadow-xl bg-white rounded-3xl overflow-hidden ring-1 ring-black/5">
            <CardHeader className="bg-gradient-to-r from-gray-50 to-white border-b border-gray-100 px-6 py-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <CardTitle className="text-lg font-bold flex items-center text-procarni-dark">
                  <Scale className="mr-2 h-5 w-5 text-procarni-secondary" />
                  Matriz de Comparación
                </CardTitle>
                <CardDescription className="mt-1">
                  Evalúa precios, proveedores y rentabilidad. (Base: USD)
                </CardDescription>
              </div>

              <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 w-full sm:w-auto">
                <div className="w-full sm:w-auto flex">
                  <QuoteComparisonPDFButton
                    comparisonResults={comparisonResults}
                    baseCurrency={comparisonBaseCurrency}
                    globalExchangeRate={exchangeRate}
                    label="Reporte General"
                    variant="outline"
                    className="w-full bg-white hover:bg-gray-50 mb-0"
                  />
                </div>
                <Button
                  onClick={() => setIsSaveDialogOpen(true)}
                  disabled={materialsToCompare.length === 0 || saveMutation.isPending}
                  variant="secondary"
                  className="w-full sm:w-auto bg-procarni-primary/10 text-procarni-primary hover:bg-procarni-primary/20 transition-colors"
                >
                  <Save className="mr-2 h-4 w-4" /> {comparisonId ? 'Actualizar' : 'Guardar'}
                </Button>
                <Button
                  onClick={() => setIsExportDialogOpen(true)}
                  disabled={materialsToCompare.length === 0}
                  className="w-full sm:w-auto bg-procarni-secondary hover:bg-green-700 shadow-md hover:shadow-lg transition-all"
                >
                  Generar Órdenes
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-2 sm:p-6 bg-gray-50/30">
              {renderComparisonTable()}
            </CardContent>
          </Card>
        </div>
      </div>





      <SaveComparisonDialog
        isOpen={isSaveDialogOpen}
        onClose={() => setIsSaveDialogOpen(false)}
        onSave={handleSaveComparison}
        isSaving={saveMutation.isPending}
        initialName={comparisonName}
      />

      <ImportQuoteRequestDialog
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImport={handleImportQuoteRequests}
      />

      <ExportToPurchaseOrdersDialog
        isOpen={isExportDialogOpen}
        onClose={() => setIsExportDialogOpen(false)}
        comparisonResults={comparisonResults}
        baseCurrency={comparisonBaseCurrency}
        globalExchangeRate={exchangeRate}
        onExportSuccess={() => {
          setIsExportDialogOpen(false);
          // Optional: redirect to PO management or clear the comparison
          navigate('/purchase-order-management');
        }}
      />

      <MaterialCreationDialog
        isOpen={isMaterialDialogOpen}
        onClose={() => setIsMaterialDialogOpen(false)}
        onMaterialCreated={handleMaterialCreated}
      />
    </div>
  );
};

export default QuoteComparison;