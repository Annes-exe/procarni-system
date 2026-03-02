import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, PlusCircle, Scale, Download, X, Loader2, RefreshCw, DollarSign, Save, ListOrdered } from 'lucide-react';
import { MadeWithDyad } from '@/components/made-with-dyad';
import { useNavigate, useSearchParams } from 'react-router-dom';
import SmartSearch from '@/components/SmartSearch';
import { searchMaterials, createQuoteComparison, updateQuoteComparison, getQuoteComparisonById } from '@/integrations/supabase/data';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { showError, showSuccess } from '@/utils/toast';
import MaterialQuoteComparisonRow from '@/components/MaterialQuoteComparisonRow';
import QuoteComparisonPDFButton from '@/components/QuoteComparisonPDFButton';
import { Separator } from '@/components/ui/separator';
import SaveComparisonDialog from '@/components/SaveComparisonDialog';
import { useSession } from '@/components/SessionContextProvider';
import { QuoteRequest, QuoteComparison as QuoteComparisonType, QuoteRequestItem } from '@/integrations/supabase/types';
import ImportQuoteRequestDialog from '@/components/ImportQuoteRequestDialog';
import ExportToPurchaseOrdersDialog from '@/components/ExportToPurchaseOrdersDialog';

interface MaterialSearchResult {
  id: string;
  name: string;
  code: string;
  category?: string;
  unit?: string;
}

interface QuoteEntry {
  supplierId: string;
  supplierName: string;
  unitPrice: number;
  currency: 'USD' | 'VES';
  exchangeRate?: number;
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
  const [globalInputCurrency, setGlobalInputCurrency] = useState<'USD' | 'VES'>('USD');
  const [exchangeRate, setExchangeRate] = useState<number | undefined>(undefined);

  const [dailyRate, setDailyRate] = useState<number | undefined>(undefined);
  const [rateSource, setRateSource] = useState<'custom' | 'daily'>('custom');
  const [isLoadingRate, setIsLoadingRate] = useState(false);

  const [newMaterialQuery, setNewMaterialQuery] = useState('');
  const [selectedMaterialToAdd, setSelectedMaterialToAdd] = useState<MaterialSearchResult | null>(null);

  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);

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
      setGlobalInputCurrency(loadedComparison.base_currency as 'USD' | 'VES');
      setExchangeRate(loadedComparison.global_exchange_rate || undefined);

      const loadedMaterials: MaterialComparison[] = loadedComparison.items?.map(item => ({
        material: {
          id: item.material_id,
          name: item.material_name,
          code: item.materials?.code || 'N/A',
        },
        quotes: item.quotes,
      })) || [];

      setMaterialsToCompare(loadedMaterials);
      showSuccess(`Comparación "${loadedComparison.name}" cargada exitosamente.`);

      // Clear URL param after loading to prevent re-triggering
      navigate('/quote-comparison', { replace: true });
    }
  }, [loadedComparison, navigate]);
  // -----------------------------

  const fetchDailyRate = useCallback(async () => {
    setIsLoadingRate(true);
    try {
      const response = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
      if (!response.ok) {
        throw new Error('Failed to fetch daily rate');
      }
      const data = await response.json();

      const rate = data.promedio || data.valor;

      if (typeof rate === 'number' && rate > 0) {
        setDailyRate(rate);
        showSuccess(`Tasa del día cargada: ${rate.toFixed(2)} VES/USD`);
      } else {
        throw new Error('Formato de tasa de cambio inválido.');
      }
      return rate;
    } catch (e: any) {
      console.error('[QuoteComparison] Error fetching daily rate:', e);
      showError(`Error al cargar la tasa del día: ${e.message}`);
      setDailyRate(undefined);
      return undefined;
    } finally {
      setIsLoadingRate(false);
    }
  }, []);

  useEffect(() => {
    if (globalInputCurrency === 'VES' && !comparisonIdFromUrl) {
      fetchDailyRate().then(rate => {
        if (rate) {
          setRateSource('daily');
          setExchangeRate(rate);
        } else {
          setRateSource('custom');
          setExchangeRate(undefined);
        }
      });
    } else if (globalInputCurrency === 'USD') {
      setDailyRate(undefined);
      setRateSource('custom');
      setExchangeRate(undefined);
    }
  }, [globalInputCurrency, fetchDailyRate, comparisonIdFromUrl]);

  useEffect(() => {
    if (globalInputCurrency === 'VES') {
      if (rateSource === 'daily' && dailyRate !== undefined) {
        setExchangeRate(dailyRate);
      }
    } else {
      setExchangeRate(undefined);
    }
  }, [globalInputCurrency, rateSource, dailyRate]);


  const handleMaterialSelect = (material: MaterialSearchResult) => {
    setSelectedMaterialToAdd(material);
    setNewMaterialQuery(material.name);
  };

  const handleAddMaterial = () => {
    if (!selectedMaterialToAdd) {
      showError('Por favor, selecciona un material para añadir.');
      return;
    }
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
  };

  const handleRemoveMaterial = (materialId: string) => {
    setMaterialsToCompare(prev => prev.filter(m => m.material.id !== materialId));
  };

  const handleAddQuoteEntry = (materialId: string) => {
    setMaterialsToCompare(prev => prev.map(m => {
      if (m.material.id === materialId) {
        return {
          ...m,
          quotes: [...m.quotes, {
            supplierId: '',
            supplierName: '',
            unitPrice: 0,
            currency: globalInputCurrency,
            exchangeRate: globalInputCurrency === 'VES' ? exchangeRate : undefined
          }]
        };
      }
      return m;
    }));
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
  };

  const handleImportQuoteRequests = (importedRequests: QuoteRequest[]) => {
    // 1. Collect all unique materials from all imported requests
    const uniqueMaterialsMap = new Map<string, MaterialSearchResult>();

    importedRequests.forEach(req => {
      // @ts-ignore: quote_request_items populated via join in service
      const items = req.quote_request_items as QuoteRequestItem[];

      if (items) {
        items.forEach(item => {
          const matId = item.material_id || item.id;
          const matName = item.materials?.name || item.material_name || 'Desconocido';

          if (!uniqueMaterialsMap.has(matId)) {
            uniqueMaterialsMap.set(matId, {
              id: matId,
              name: matName,
              code: item.materials?.code || (item.material_id ? 'N/A' : 'Sin Código (Legado)')
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

      // 3. For every imported request, add a quote row for its supplier against all its materials
      importedRequests.forEach(req => {
        // @ts-ignore
        const items = req.quote_request_items as QuoteRequestItem[];
        if (!items) return;

        items.forEach(item => {
          const matId = item.material_id || item.id;

          updatedMaterials = updatedMaterials.map(matComp => {
            if (matComp.material.id === matId) {
              // Check if this supplier already has a quote entry for this material
              const hasSupplierAlready = matComp.quotes.some(q => q.supplierId === req.supplier_id);

              if (!hasSupplierAlready) {
                return {
                  ...matComp,
                  quotes: [...matComp.quotes, {
                    supplierId: req.supplier_id,
                    // @ts-ignore
                    supplierName: req.suppliers?.name || 'Desconocido',
                    unitPrice: 0, // Prepopulate with 0, user will fill it
                    currency: globalInputCurrency,
                    exchangeRate: globalInputCurrency === 'VES' ? exchangeRate : undefined
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
    showSuccess(`${importedRequests.length} SC(s) importadas exitosamente.`);
  };

  const handleQuoteChange = (materialId: string, quoteIndex: number, field: keyof QuoteEntry, value: any, supplierName?: string) => {
    setMaterialsToCompare(prev => prev.map(m => {
      if (m.material.id === materialId) {
        const updatedQuotes = m.quotes.map((q, i) => {
          if (i === quoteIndex) {
            const newQuote = { ...q, [field]: value };

            if (field === 'currency' && value === 'USD') {
              newQuote.exchangeRate = undefined;
            }

            if (field === 'supplierId' && supplierName) {
              newQuote.supplierName = supplierName;
            }

            return newQuote;
          }
          return q;
        });
        return { ...m, quotes: updatedQuotes };
      }
      return m;
    }));
  };

  // --- Core Comparison Logic (Memoized) ---
  const comparisonBaseCurrency = 'USD';

  const comparisonResults = useMemo(() => {
    return materialsToCompare.map(materialComp => {
      const results = materialComp.quotes.map(quote => {

        // Use the rate explicitly set on the quote, or the global rate if the quote currency is VES
        const rateToUse = quote.currency === 'VES' ? (quote.exchangeRate || exchangeRate) : undefined;

        if (!quote.supplierId || quote.unitPrice <= 0) {
          return { ...quote, convertedPrice: null, isValid: false, error: 'Datos incompletos o inválidos.' };
        }

        if (quote.currency === 'VES' && (!rateToUse || rateToUse <= 0)) {
          return { ...quote, convertedPrice: null, isValid: false, error: 'Falta Tasa de Cambio para VES a USD.' };
        }

        let convertedPrice: number | null = quote.unitPrice;
        let finalRate = quote.exchangeRate;

        if (quote.currency === comparisonBaseCurrency) {
          // USD -> USD
        } else if (quote.currency === 'VES' && comparisonBaseCurrency === 'USD') {
          if (rateToUse && rateToUse > 0) {
            convertedPrice = quote.unitPrice / rateToUse;
            finalRate = rateToUse;
          } else {
            return { ...quote, convertedPrice: null, isValid: false, error: 'Falta Tasa de Cambio para VES a USD.' };
          }
        }

        if (convertedPrice === null || isNaN(convertedPrice)) {
          return { ...quote, convertedPrice: null, isValid: false, error: 'Error de cálculo.' };
        }

        return { ...quote, convertedPrice: convertedPrice, isValid: true, error: null, exchangeRate: finalRate };
      });

      const validResults = results.filter(r => r.isValid && r.convertedPrice !== null);
      const bestPrice = validResults.length > 0
        ? Math.min(...validResults.map(r => r.convertedPrice!))
        : null;

      return {
        material: materialComp.material,
        results: results,
        bestPrice: bestPrice,
      };
    });
  }, [materialsToCompare, exchangeRate]);
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
        material_name: m.material.name,
        quotes: m.quotes,
      }));

      if (isUpdate && comparisonId) {
        return updateQuoteComparison(comparisonId, comparisonData, itemsPayload);
      } else {
        return createQuoteComparison(comparisonData, itemsPayload);
      }
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['quoteComparisons'] });
      setComparisonId(data?.id || null);
      setComparisonName(variables.name);
      setIsSaveDialogOpen(false);
      showSuccess(`Comparación "${variables.name}" ${variables.isUpdate ? 'actualizada' : 'guardada'} exitosamente.`);
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
    setRateSource('custom');
    navigate('/quote-comparison', { replace: true });
  };

  const renderExchangeRateInput = () => {
    if (globalInputCurrency === 'USD') {
      return (
        <div className="text-sm text-muted-foreground mt-1">
          Tasa no requerida si la moneda de ingreso es USD.
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <Select value={rateSource} onValueChange={(value) => setRateSource(value as 'custom' | 'daily')}>
          <SelectTrigger id="rate-source">
            <SelectValue placeholder="Selecciona fuente de tasa" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="daily" disabled={dailyRate === undefined}>
              Tasa del día {dailyRate ? `(${dailyRate.toFixed(2)} VES/USD)` : '(Cargando...)'}
            </SelectItem>
            <SelectItem value="custom">Tasa personalizada</SelectItem>
          </SelectContent>
        </Select>

        {rateSource === 'daily' && (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              step="0.01"
              value={exchangeRate || dailyRate || ''}
              placeholder="Tasa del día"
              disabled
              className="bg-gray-100 dark:bg-gray-700"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={fetchDailyRate}
              disabled={isLoadingRate}
            >
              {isLoadingRate ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        )}

        {rateSource === 'custom' && (
          <Input
            id="exchange-rate"
            type="number"
            step="0.01"
            placeholder="Ingresa tasa personalizada"
            value={exchangeRate || ''}
            onChange={(e) => setExchangeRate(parseFloat(e.target.value) || undefined)}
          />
        )}
        <p className="text-xs text-muted-foreground mt-1">
          Tasa actual utilizada: {exchangeRate ? exchangeRate.toFixed(4) : 'N/A'} VES/USD
        </p>
      </div>
    );
  };

  const renderComparisonTable = () => {
    if (materialsToCompare.length === 0) {
      return <div className="text-center text-muted-foreground p-8">Añade materiales para empezar la comparación.</div>;
    }

    return (
      <div className="space-y-8">
        {comparisonResults.map(materialComp => (
          <Card key={materialComp.material.id} className="border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-300 rounded-xl overflow-hidden bg-white">
            <div className="p-0 sm:p-2">
              <MaterialQuoteComparisonRow
                comparisonData={materialComp}
                baseCurrency={comparisonBaseCurrency}
                globalExchangeRate={exchangeRate}
                onAddQuoteEntry={handleAddQuoteEntry}
                onRemoveQuoteEntry={handleRemoveQuoteEntry}
                onQuoteChange={handleQuoteChange}
                onRemoveMaterial={handleRemoveMaterial}
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
    <div className="container mx-auto p-4 md:p-8 max-w-7xl pb-24">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-6">
        <div>
          <h1 className="text-3xl font-extrabold text-procarni-dark tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-procarni-primary to-procarni-dark">
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

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 mb-8">

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
                  <Label htmlFor="material-search" className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Buscar Material</Label>
                  <div className="mt-1">
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
                <Select value={globalInputCurrency} onValueChange={(value) => setGlobalInputCurrency(value as 'USD' | 'VES')}>
                  <SelectTrigger id="global-input-currency" className="bg-gray-50 focus:ring-procarni-primary/20">
                    <SelectValue placeholder="Selecciona moneda" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD (Dólares)</SelectItem>
                    <SelectItem value="VES">VES (Bolívares)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="exchange-rate" className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Tasa Global (USD/VES)</Label>
                {renderExchangeRateInput()}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Lado Derecho: Contenido Principal de Comparación (3 columnas en desktop grande) */}
        <div className="lg:col-span-3 space-y-6">
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

              <div className="flex flex-wrap items-center gap-2">
                <QuoteComparisonPDFButton
                  comparisonResults={comparisonResults}
                  baseCurrency={comparisonBaseCurrency}
                  globalExchangeRate={exchangeRate}
                  label="Reporte General"
                  variant="outline"
                />
                <Button
                  onClick={() => setIsSaveDialogOpen(true)}
                  disabled={materialsToCompare.length === 0 || saveMutation.isPending}
                  variant="secondary"
                  className="bg-procarni-primary/10 text-procarni-primary hover:bg-procarni-primary/20 transition-colors"
                >
                  <Save className="mr-2 h-4 w-4" /> {comparisonId ? 'Actualizar' : 'Guardar'}
                </Button>
                <Button
                  onClick={() => setIsExportDialogOpen(true)}
                  disabled={materialsToCompare.length === 0}
                  className="bg-procarni-secondary hover:bg-green-700 shadow-md hover:shadow-lg transition-all"
                >
                  Generar Órdenes
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0 sm:p-6 bg-gray-50/30">
              {renderComparisonTable()}
            </CardContent>
          </Card>
        </div>
      </div>




      <MadeWithDyad />

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
    </div>
  );
};

export default QuoteComparison;