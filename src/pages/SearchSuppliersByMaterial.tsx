import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  Phone, Instagram, Eye, ArrowLeft, Tag, MapPin, Clock, DollarSign,
  X, Search, Building2, CreditCard, Mail, Info, Package, Loader2,
  FileText, Sparkles, ShoppingCart, MessageCircle, Send, CheckCircle2,
  Layers, Flame, Wrench, Zap, Droplets, Cpu, Filter, ChevronRight,
  Globe, ExternalLink, UserPlus, ShieldCheck, RefreshCw, Compass, Key
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { searchSuppliersSmart, getAllMaterialCategories } from '@/integrations/supabase/data';
import { showError, showSuccess } from '@/utils/toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  searchWebSuppliers,
  WebSupplierCandidate,
  AiProviderType,
  getCustomSerperApiKey,
  saveCustomSerperApiKey,
  removeCustomSerperApiKey,
  getSerperApiKey,
  getCustomGeminiApiKey,
  saveCustomGeminiApiKey,
  removeCustomGeminiApiKey,
  getAllGeminiApiKeys,
  getCustomGroqApiKey,
  saveCustomGroqApiKey,
  removeCustomGroqApiKey,
  getGroqApiKey,
  getCustomOpenRouterApiKey,
  saveCustomOpenRouterApiKey,
  removeCustomOpenRouterApiKey,
  getOpenRouterApiKey,
  getAiProviderPreference,
  saveAiProviderPreference,
} from '@/services/webSupplierService';
import { getGeminiApiKey } from '@/services/invoiceExtractionService';
import SupplierCreationDialog from '@/components/SupplierCreationDialog';
import { SupplierFormInitialData } from '@/components/SupplierForm';
import { Supplier } from '@/integrations/supabase/types';

export interface SmartSupplierResult {
  id: string;
  name: string;
  rif: string;
  code?: string | null;
  city?: string | null;
  email?: string | null;
  phone?: string | null;
  phone_2?: string | null;
  instagram?: string | null;
  payment_terms: string;
  credit_days: number | null;
  status: string;
  rubros?: string | null;
  total_materials: number;
  matched_materials_sample: string[];
  matched_categories: string[];
  match_type: 'nombre' | 'rif' | 'rubro' | 'material' | 'categoria' | 'general';
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  'EMPAQUE': <Package className="h-3.5 w-3.5" />,
  'FRESCA': <Flame className="h-3.5 w-3.5" />,
  'SECA': <Layers className="h-3.5 w-3.5" />,
  'FERRETERIA Y CONSTRUCCION': <Wrench className="h-3.5 w-3.5" />,
  'ELECTRICIDAD': <Zap className="h-3.5 w-3.5" />,
  'INSUMOS DE LIMPIEZA': <Droplets className="h-3.5 w-3.5" />,
  'MECANICA Y SELLOS': <Cpu className="h-3.5 w-3.5" />,
};

const VENEZUELA_REGIONS = [
  'Eje Central (Aragua, Carabobo, Caracas, Lara)',
  'Aragua (Maracay / Cagua / Turmero / La Victoria)',
  'Carabobo (Valencia / Guacara / Pto. Cabello)',
  'Gran Caracas (Dtto. Capital / Miranda)',
  'Lara (Barquisimeto / Cabudare)',
  'Toda Venezuela (Nacional)',
  'Zulia (Maracaibo / San Francisco)',
  'Oriente (Anzoátegui / Monagas)',
];

const LOADING_STEPS = [
  '🔍 Rastreando empresas y distribuidores en Maracay, Valencia, Caracas y Barquisimeto...',
  '📍 Filtrando empresas por zona geográfica y descartando resultados extranjeros...',
  '📋 Extrayendo teléfonos venezolanos (+58), WhatsApp de ventas y redes sociales...',
  '✨ Normalizando catálogo de productos y fuentes de verificación...',
];

const SearchSuppliersByMaterial: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useIsMobile();

  // Mode Selection: 'internal' (PostgreSQL) vs 'web' (Gemini AI Grounding)
  const [activeTab, setActiveTab] = useState<'internal' | 'web'>(() => {
    return searchParams.get('mode') === 'web' ? 'web' : 'internal';
  });

  // Internal Search States
  const [searchTerm, setSearchTerm] = useState<string>(() => searchParams.get('query') || '');
  const [selectedCategory, setSelectedCategory] = useState<string>(() => searchParams.get('category') || 'all');
  const [selectedCity, setSelectedCity] = useState<string>('all');
  const [keywordFilter, setKeywordFilter] = useState<string>('');

  // Web AI Search States
  const [webSearchTerm, setWebSearchTerm] = useState<string>(() => searchParams.get('query') || '');
  const [selectedRegion, setSelectedRegion] = useState<string>('Eje Central (Aragua, Carabobo, Caracas, Lara)');
  const [webCandidates, setWebCandidates] = useState<WebSupplierCandidate[]>([]);
  const [isSearchingWeb, setIsSearchingWeb] = useState<boolean>(false);
  const [hasSearchedWeb, setHasSearchedWeb] = useState<boolean>(false);
  const [webSearchError, setWebSearchError] = useState<string | null>(null);
  const [loadingStepIndex, setLoadingStepIndex] = useState<number>(0);

  // Multi-Provider & API Key Management State
  const [selectedAiProvider, setSelectedAiProvider] = useState<AiProviderType>(() => getAiProviderPreference());
  const [isApiKeyDialogOpen, setIsApiKeyDialogOpen] = useState<boolean>(false);
  const [customKeyInput, setCustomKeyInput] = useState<string>('');
  const [customGroqInput, setCustomGroqInput] = useState<string>('');
  const [customOpenRouterInput, setCustomOpenRouterInput] = useState<string>('');
  const [customSerperInput, setCustomSerperInput] = useState<string>('');

  const [activeGeminiStatus, setActiveGeminiStatus] = useState<string>('');
  const [activeGroqStatus, setActiveGroqStatus] = useState<string>('');
  const [activeOpenRouterStatus, setActiveOpenRouterStatus] = useState<string>('');
  const [activeSerperStatus, setActiveSerperStatus] = useState<string>('');

  // Supplier Creation Dialog State
  const [isRegisterDialogOpen, setIsRegisterDialogOpen] = useState<boolean>(false);
  const [supplierPrefillData, setSupplierPrefillData] = useState<SupplierFormInitialData | undefined>(undefined);

  // Fetch Categories for Chips Bar
  const { data: dbCategories = [] } = useQuery({
    queryKey: ['material_categories'],
    queryFn: getAllMaterialCategories,
    staleTime: 1000 * 60 * 30,
  });

  // Intelligent Smart Search Query (Internal DB)
  const {
    data: suppliers = [],
    isLoading: isLoadingSuppliers,
  } = useQuery<SmartSupplierResult[]>({
    queryKey: ['suppliers_smart_search', searchTerm, selectedCategory],
    queryFn: async () => {
      const catParam = selectedCategory === 'all' ? null : selectedCategory;
      const termParam = searchTerm.trim() || null;
      const results = await searchSuppliersSmart({
        searchTerm: termParam,
        category: catParam,
        city: null,
        limit: 150,
      });
      return results as SmartSupplierResult[];
    },
    staleTime: 1000 * 60 * 2,
  });

  // Synchronize URL parameters
  const updateUrlParams = useCallback((term: string, cat: string, mode: 'internal' | 'web') => {
    const params: Record<string, string> = {};
    if (term.trim()) params.query = term.trim();
    if (cat !== 'all') params.category = cat;
    if (mode === 'web') params.mode = 'web';
    setSearchParams(params, { replace: true });
  }, [setSearchParams]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setWebSearchTerm(value);
    updateUrlParams(value, selectedCategory, activeTab);
  };

  const handleCategorySelect = (catName: string) => {
    const nextCat = selectedCategory === catName ? 'all' : catName;
    setSelectedCategory(nextCat);
    updateUrlParams(searchTerm, nextCat, activeTab);
  };

  const handleTabChange = (tab: 'internal' | 'web') => {
    setActiveTab(tab);
    updateUrlParams(searchTerm, selectedCategory, tab);
  };

  // Sync state if user navigates back/forward in browser history
  useEffect(() => {
    const urlQuery = searchParams.get('query') || '';
    const urlCat = searchParams.get('category') || 'all';
    const urlMode = searchParams.get('mode') === 'web' ? 'web' : 'internal';
    setSearchTerm(urlQuery);
    setWebSearchTerm(urlQuery);
    setSelectedCategory(urlCat);
    setActiveTab(urlMode);
  }, [searchParams.toString()]);

  // Update API Keys status display
  useEffect(() => {
    setSelectedAiProvider(getAiProviderPreference());

    const getLocalHint = (key: string | null) => {
      if (!key) return '';
      const trimmed = key.trim();
      if (trimmed.length <= 4) return trimmed;
      return `...${trimmed.slice(-4)}`;
    };

    // Serper.dev
    const customSerper = getCustomSerperApiKey();
    if (customSerper) {
      setActiveSerperStatus(`${getLocalHint(customSerper)} (Personalizada en navegador)`);
    } else if (getSerperApiKey()) {
      setActiveSerperStatus('API key predeterminada (lista y activa)');
    } else {
      setActiveSerperStatus('No configurada (Recomendada para Google)');
    }

    // Gemini
    const customGemini = getCustomGeminiApiKey();
    if (customGemini) {
      setActiveGeminiStatus(`${getLocalHint(customGemini)} (Personalizada en navegador)`);
    } else {
      const geminiPool = getAllGeminiApiKeys();
      if (geminiPool.length > 0) {
        setActiveGeminiStatus(`API key predeterminada (lista y activa${geminiPool.length > 1 ? ` - Pool de ${geminiPool.length} keys` : ''})`);
      } else {
        setActiveGeminiStatus('No configurada');
      }
    }

    // Groq
    const customGroq = getCustomGroqApiKey();
    if (customGroq) {
      setActiveGroqStatus(`${getLocalHint(customGroq)} (Personalizada en navegador)`);
    } else if (getGroqApiKey()) {
      setActiveGroqStatus('API key predeterminada (lista y activa)');
    } else {
      setActiveGroqStatus('No configurada');
    }

    // OpenRouter
    const customOr = getCustomOpenRouterApiKey();
    if (customOr) {
      setActiveOpenRouterStatus(`${getLocalHint(customOr)} (Personalizada en navegador)`);
    } else if (getOpenRouterApiKey()) {
      setActiveOpenRouterStatus('API key predeterminada (lista y activa)');
    } else {
      setActiveOpenRouterStatus('No configurada');
    }
  }, [isApiKeyDialogOpen]);

  // Loading steps timer
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isSearchingWeb) {
      setLoadingStepIndex(0);
      interval = setInterval(() => {
        setLoadingStepIndex((prev) => (prev + 1) % LOADING_STEPS.length);
      }, 2000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isSearchingWeb]);

  // Save Custom Key Handler
  const handleSaveApiKey = () => {
    saveAiProviderPreference(selectedAiProvider);

    if (customSerperInput.trim()) {
      saveCustomSerperApiKey(customSerperInput.trim());
      showSuccess('Clave Serper.dev (Google Search) guardada con éxito.');
    }
    if (customKeyInput.trim()) {
      saveCustomGeminiApiKey(customKeyInput.trim());
      showSuccess('Clave(s) Gemini API guardada(s) con éxito.');
    }
    if (customGroqInput.trim()) {
      saveCustomGroqApiKey(customGroqInput.trim());
      showSuccess('Clave Groq API guardada con éxito.');
    }
    if (customOpenRouterInput.trim()) {
      saveCustomOpenRouterApiKey(customOpenRouterInput.trim());
      showSuccess('Clave OpenRouter API guardada con éxito.');
    }
    setIsApiKeyDialogOpen(false);
    setCustomSerperInput('');
    setCustomKeyInput('');
    setCustomGroqInput('');
    setCustomOpenRouterInput('');
  };

  // Execute Web Search with Multi-Provider AI
  const handleExecuteWebSearch = async (termToSearch?: string, regionOverride?: string) => {
    const query = (termToSearch !== undefined ? termToSearch : webSearchTerm).trim();
    const regionToUse = regionOverride || selectedRegion;
    if (!query) {
      showError('Por favor ingresa un material, producto o rubro a buscar en la web.');
      return;
    }

    setIsSearchingWeb(true);
    setHasSearchedWeb(true);
    setWebSearchError(null);

    try {
      const candidates = await searchWebSuppliers({
        searchTerm: query,
        category: selectedCategory !== 'all' ? selectedCategory : undefined,
        region: regionToUse,
        provider: selectedAiProvider,
      });

      setWebCandidates(candidates);
      if (candidates.length === 0) {
        showSuccess('La búsqueda finalizó sin coincidencias directas. Intenta ampliar la región o usar un término más general.');
      } else {
        showSuccess(`Se localizaron ${candidates.length} proveedores en la web.`);
      }
    } catch (error: unknown) {
      console.error('[WebSupplierSearch] Error:', error);
      const msg = error instanceof Error ? error.message : 'Error al buscar en la web.';
      setWebSearchError(msg);
      showError(msg);
    } finally {
      setIsSearchingWeb(false);
    }
  };

  // Trigger web search from internal 0-results CTA
  const handleJumpToWebSearch = (termOverride?: string) => {
    const q = termOverride || searchTerm || (selectedCategory !== 'all' ? selectedCategory : '');
    setActiveTab('web');
    setWebSearchTerm(q);
    updateUrlParams(q, selectedCategory, 'web');
    if (q) {
      handleExecuteWebSearch(q);
    }
  };

  // WhatsApp link formatter
  const getWhatsAppLink = (phone?: string | null, supplierName?: string, queryContextTerm?: string) => {
    if (!phone) return null;
    let digits = phone.replace(/\D/g, '');
    if (!digits) return null;
    if (!digits.startsWith('58')) {
      digits = `58${digits}`;
    }
    const currentQuery = queryContextTerm || searchTerm || (selectedCategory !== 'all' ? selectedCategory : '');
    const queryContext = currentQuery ? ` el producto "${currentQuery}"` : ' cotizaciones de materiales';
    const message = encodeURIComponent(`Hola, le escribo de parte de Procarni C.A. para consultar disponibilidad y precios sobre${queryContext}.`);
    return `https://wa.me/${digits}?text=${message}`;
  };

  // Direct Internal actions
  const handleCreateQuoteRequest = (supplier: SmartSupplierResult, targetMaterialName?: string) => {
    navigate('/generate-quote', {
      state: {
        supplier: {
          id: supplier.id,
          name: supplier.name,
          email: supplier.email,
          phone: supplier.phone,
        },
        material: targetMaterialName ? { name: targetMaterialName } : undefined,
      },
    });
  };

  const handleCreatePurchaseOrder = (supplier: SmartSupplierResult, targetMaterialName?: string) => {
    navigate('/generate-po', {
      state: {
        supplier: {
          id: supplier.id,
          name: supplier.name,
        },
        material: targetMaterialName ? { name: targetMaterialName } : undefined,
      },
    });
  };

  // Handle "Registrar Proveedor" from Web Candidate
  const handleOpenRegisterCandidate = (candidate: WebSupplierCandidate) => {
    const prefill: SupplierFormInitialData = {
      name: candidate.name,
      rif: candidate.rif || 'SR',
      city: candidate.city || null,
      state: candidate.state || null,
      phone: candidate.phone || candidate.whatsapp || '',
      phone_2: candidate.phone_2 || '',
      email: candidate.email || '',
      website: candidate.website || '',
      instagram: candidate.instagram || '',
      rubros: candidate.products_detected.length > 0
        ? candidate.products_detected.join(', ')
        : candidate.summary,
      payment_terms: 'Contado',
      status: 'Active',
    };

    setSupplierPrefillData(prefill);
    setIsRegisterDialogOpen(true);
  };

  // Extract available cities from results
  const availableCities = useMemo(() => {
    const citiesSet = new Set<string>();
    suppliers.forEach((s) => {
      if (s.city && s.city.trim()) citiesSet.add(s.city.trim());
    });
    return Array.from(citiesSet).sort();
  }, [suppliers]);

  // Filtered Suppliers in Memory
  const filteredSuppliers = useMemo(() => {
    return suppliers.filter((s) => {
      const matchesCity = selectedCity === 'all' || s.city === selectedCity;
      const matchesKeyword =
        !keywordFilter.trim() ||
        s.name.toLowerCase().includes(keywordFilter.toLowerCase()) ||
        (s.rif && s.rif.toLowerCase().includes(keywordFilter.toLowerCase())) ||
        (s.rubros && s.rubros.toLowerCase().includes(keywordFilter.toLowerCase())) ||
        s.matched_materials_sample.some((m) => m.toLowerCase().includes(keywordFilter.toLowerCase()));
      return matchesCity && matchesKeyword;
    });
  }, [suppliers, selectedCity, keywordFilter]);

  // Matching internal suppliers for hybrid web display
  const matchingInternalSuppliers = useMemo(() => {
    const term = (webSearchTerm || searchTerm).toLowerCase().trim();
    if (!term) return suppliers;
    return suppliers.filter((s) => {
      return (
        s.name.toLowerCase().includes(term) ||
        (s.rif && s.rif.toLowerCase().includes(term)) ||
        (s.rubros && s.rubros.toLowerCase().includes(term)) ||
        s.matched_materials_sample.some((m) => m.toLowerCase().includes(term)) ||
        s.matched_categories.some((c) => c.toLowerCase().includes(term))
      );
    });
  }, [suppliers, webSearchTerm, searchTerm]);

  // PDF Export
  const handleExportPDF = () => {
    try {
      const doc = new jsPDF();
      const dateStr = new Date().toLocaleDateString('es-VE');

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(27, 41, 74);
      doc.text('PROCARNI', 14, 18);

      doc.setFontSize(8);
      doc.setTextColor(136, 10, 10);
      doc.text('SISTEMA DE COMPRAS', 14, 22);

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(15, 23, 42);
      doc.text('Reporte de Proveedores y Materiales', 200, 18, { align: 'right' });

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);

      const searchSummary = searchTerm
        ? `Búsqueda: "${searchTerm}"`
        : selectedCategory !== 'all'
        ? `Categoría: ${selectedCategory}`
        : 'Todos los proveedores activos';

      doc.text(searchSummary, 14, 29);
      const cityFilterText = selectedCity === 'all' ? 'Todas las ciudades' : `Ciudad: ${selectedCity}`;
      doc.text(`Filtro: ${cityFilterText} | Fecha: ${dateStr}`, 200, 29, { align: 'right' });

      const tableData = filteredSuppliers.map((supplier) => {
        const contactInfo = [
          supplier.phone ? `Telf: ${supplier.phone}` : '',
          supplier.email ? `Email: ${supplier.email}` : '',
        ].filter(Boolean).join('\n');

        const paymentInfo = [
          supplier.payment_terms || 'Contado',
          supplier.credit_days ? `(${supplier.credit_days} d)` : '',
        ].filter(Boolean).join(' ');

        const materialsSample = supplier.matched_materials_sample.slice(0, 3).join(', ') || supplier.rubros || 'Sin detalle';

        return [
          supplier.name,
          supplier.rif || 'S/R',
          supplier.city || 'N/A',
          contactInfo || 'N/A',
          paymentInfo,
          materialsSample,
        ];
      });

      autoTable(doc, {
        startY: 35,
        head: [['Proveedor', 'RIF', 'Ciudad', 'Contacto', 'Pago', 'Materiales / Rubros']],
        body: tableData,
        theme: 'plain',
        headStyles: {
          fillColor: [248, 250, 252],
          textColor: [71, 85, 105],
          fontStyle: 'bold',
          fontSize: 8,
          lineWidth: { bottom: 1 },
          lineColor: [226, 232, 240],
        },
        bodyStyles: {
          textColor: [15, 23, 42],
          fontSize: 7.5,
          lineWidth: { bottom: 0.5 },
          lineColor: [241, 245, 249],
        },
        columnStyles: {
          0: { cellWidth: 45 },
          3: { cellWidth: 40 },
          5: { cellWidth: 55 },
        },
      });

      const fileDate = new Date().toISOString().split('T')[0];
      const fileNameTag = (searchTerm || selectedCategory || 'general').replace(/\s+/g, '_');
      doc.save(`Proveedores_${fileNameTag}_${fileDate}.pdf`);
      showSuccess('Reporte PDF generado exitosamente.');
    } catch (error) {
      console.error('PDF Export Error:', error);
      showError('Ocurrió un error al generar el PDF.');
    }
  };

  return (
    <div className="container mx-auto p-4 pb-24 relative min-h-screen">
      {/* 1. TOP STICKY BAR & SEARCH HEADER */}
      <div className="relative md:sticky md:top-0 z-20 backdrop-blur-xl bg-white/95 border-b border-gray-200/80 pb-4 pt-4 mb-6 -mx-4 px-4 shadow-xs transition-all">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(-1)}
              className="text-gray-400 hover:text-procarni-dark hover:bg-gray-100 rounded-full h-9 w-9 -ml-1"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl md:text-2xl font-black text-procarni-dark tracking-tight">
                  Localizar Proveedores
                </h1>
                <Badge className="bg-procarni-primary/10 text-procarni-primary border-none text-[10px] font-bold uppercase tracking-wider">
                  Inteligencia de Compras
                </Badge>
              </div>
              <p className="text-xs text-gray-500 font-medium">
                Encuentra distribuidores en el catálogo interno de Procarni o explora el mercado abierto con IA
              </p>
            </div>
          </div>

          {/* MODE TABS & API KEY SETTINGS */}
          <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="flex items-center bg-gray-100/90 p-1 rounded-xl border border-gray-200/80 shadow-2xs flex-1 md:flex-initial">
              <button
                type="button"
                onClick={() => handleTabChange('internal')}
                className={cn(
                  "flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all",
                  activeTab === 'internal'
                    ? "bg-white text-procarni-dark shadow-sm"
                    : "text-gray-500 hover:text-gray-800"
                )}
              >
                <Building2 className="h-3.5 w-3.5 text-procarni-blue" />
                <span>Base Interna</span>
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5 bg-gray-100 text-gray-700">
                  {suppliers.length}
                </Badge>
              </button>

              <button
                type="button"
                onClick={() => handleTabChange('web')}
                className={cn(
                  "flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all relative",
                  activeTab === 'web'
                    ? "bg-procarni-primary text-white shadow-sm"
                    : "text-gray-500 hover:text-gray-800"
                )}
              >
                <Globe className="h-3.5 w-3.5 text-amber-300" />
                <span>Explorador Web IA</span>
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              </button>
            </div>

            {/* API Key Config Button */}
            <Button
              variant="outline"
              size="icon"
              onClick={() => setIsApiKeyDialogOpen(true)}
              title="Configurar Claves IA / Búsqueda Web"
              className="h-10 w-10 rounded-xl border-gray-200 text-gray-600 hover:text-procarni-primary hover:bg-gray-50 shrink-0"
            >
              <Key className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* 2. CATEGORY PILLS BAR (HORIZONTAL SCROLL) */}
        <div className="mt-4 pt-3 border-t border-gray-100 flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
          <button
            type="button"
            onClick={() => handleCategorySelect('all')}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 active:scale-95",
              selectedCategory === 'all'
                ? "bg-procarni-blue text-white shadow-sm"
                : "bg-gray-100/80 hover:bg-gray-200/70 text-gray-600"
            )}
          >
            <Sparkles className="h-3 w-3" />
            <span>Todas las Categorías</span>
          </button>

          {dbCategories.map((cat) => {
            const isSelected = selectedCategory.toUpperCase() === cat.name.toUpperCase();
            const icon = CATEGORY_ICONS[cat.name.toUpperCase()] || <Tag className="h-3 w-3" />;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleCategorySelect(cat.name)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 active:scale-95 border",
                  isSelected
                    ? "bg-procarni-primary text-white border-procarni-primary shadow-xs"
                    : "bg-white hover:bg-gray-50 text-gray-700 border-gray-200"
                )}
              >
                {icon}
                <span>{cat.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* VIEW A: INTERNAL CATALOG TAB                                              */}
      {/* ========================================================================= */}
      {activeTab === 'internal' && (
        <div className="space-y-6">
          {/* SEARCH BAR & CONTROLS */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white/70 backdrop-blur-md p-3.5 rounded-2xl border border-gray-200/70 shadow-xs">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <Input
                type="text"
                placeholder="Escribe material, rubro, código o razón social..."
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-10 pr-10 h-10 bg-white border-gray-200 rounded-xl text-sm font-medium text-procarni-dark focus-visible:ring-procarni-primary/20 focus-visible:border-procarni-primary shadow-2xs"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => handleSearchChange('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-200/50 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              {/* City Filter */}
              <Select value={selectedCity} onValueChange={setSelectedCity}>
                <SelectTrigger className="h-10 text-xs w-full sm:w-44 bg-white border-gray-200 rounded-xl">
                  <SelectValue placeholder="Ciudad" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las ciudades</SelectItem>
                  {availableCities.map((city) => (
                    <SelectItem key={city} value={city}>
                      {city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* In-Memory Filter */}
              <Input
                placeholder="Filtrar en resultados..."
                value={keywordFilter}
                onChange={(e) => setKeywordFilter(e.target.value)}
                className="h-10 text-xs w-full sm:w-44 bg-white border-gray-200 rounded-xl"
              />

              {/* PDF Export Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportPDF}
                disabled={filteredSuppliers.length === 0}
                className="h-10 border-gray-200 text-gray-700 hover:text-procarni-primary hover:bg-slate-50 text-xs font-semibold gap-1.5 rounded-xl shrink-0"
              >
                <FileText className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Exportar PDF</span>
              </Button>
            </div>
          </div>

          {/* RESULTS SECTION */}
          {isLoadingSuppliers ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3 bg-white/40 backdrop-blur-sm rounded-3xl border border-gray-200/50">
              <Loader2 className="h-10 w-10 animate-spin text-procarni-primary" />
              <p className="text-sm text-gray-500 font-semibold animate-pulse">Localizando los mejores proveedores...</p>
            </div>
          ) : filteredSuppliers.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredSuppliers.map((supplier) => {
                const whatsAppLink = getWhatsAppLink(supplier.phone || supplier.phone_2, supplier.name);
                const primaryMaterial = supplier.matched_materials_sample[0];

                return (
                  <Card
                    key={supplier.id}
                    className="border border-gray-200/90 bg-white/90 backdrop-blur-xl shadow-xs hover:shadow-md transition-all flex flex-col justify-between rounded-2xl overflow-hidden group hover:border-procarni-blue/30"
                  >
                    <CardHeader className="p-5 pb-3 bg-gradient-to-br from-gray-50/50 to-transparent border-b border-gray-100">
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                            <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-bold py-0 px-1.5 shadow-none">
                              <CheckCircle2 className="h-2.5 w-2.5 mr-1 text-emerald-600" /> Registrado
                            </Badge>
                            <span className="text-[10px] font-mono font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                              {supplier.rif || 'S/R'}
                            </span>
                            {supplier.city && (
                              <span className="inline-flex items-center text-[10px] font-medium text-gray-500 gap-0.5">
                                <MapPin className="h-2.5 w-2.5 text-gray-400" /> {supplier.city}
                              </span>
                            )}
                          </div>
                          <h3
                            onClick={() => navigate(`/suppliers/${supplier.id}`)}
                            className="font-bold text-procarni-dark text-base leading-tight truncate hover:text-procarni-primary cursor-pointer transition-colors"
                            title={supplier.name}
                          >
                            {supplier.name}
                          </h3>
                        </div>

                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-bold shrink-0 shadow-none",
                            supplier.payment_terms === 'Crédito'
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-slate-50 text-slate-700 border-slate-200"
                          )}
                        >
                          <CreditCard className="h-2.5 w-2.5 mr-1" />
                          {supplier.payment_terms || 'Contado'}
                          {supplier.credit_days ? ` (${supplier.credit_days}d)` : ''}
                        </Badge>
                      </div>
                    </CardHeader>

                    <CardContent className="p-5 pt-3.5 space-y-3.5 flex-1">
                      {/* MATCHED MATERIALS SECTION */}
                      {supplier.matched_materials_sample && supplier.matched_materials_sample.length > 0 ? (
                        <div className="space-y-1.5">
                          <span className="text-[9px] font-black uppercase tracking-wider text-procarni-primary flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3 text-procarni-secondary" /> Materiales Coincidentes ({supplier.matched_materials_sample.length})
                          </span>
                          <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto no-scrollbar pt-0.5">
                            {supplier.matched_materials_sample.slice(0, 4).map((mat, idx) => (
                              <Badge
                                key={idx}
                                variant="secondary"
                                className="bg-procarni-primary/5 text-procarni-dark hover:bg-procarni-primary/10 border-procarni-primary/20 text-[11px] font-medium transition-colors cursor-default"
                              >
                                {mat}
                              </Badge>
                            ))}
                            {supplier.matched_materials_sample.length > 4 && (
                              <span className="text-[10px] font-bold text-gray-400 self-center">
                                +{supplier.matched_materials_sample.length - 4} más
                              </span>
                            )}
                          </div>
                        </div>
                      ) : supplier.rubros ? (
                        <div className="space-y-1">
                          <span className="text-[9px] font-black uppercase tracking-wider text-gray-400">Rubros / Especialidad</span>
                          <p className="text-xs text-gray-600 font-medium line-clamp-2">{supplier.rubros}</p>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <span className="text-[9px] font-black uppercase tracking-wider text-gray-400">Catálogo General</span>
                          <p className="text-xs text-gray-500 italic">Proveedor registrado sin desglose específico</p>
                        </div>
                      )}

                      {/* TOTAL MATERIALS BADGE & CONTACTS */}
                      <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-600">
                          <Package className="h-3.5 w-3.5 text-procarni-blue" />
                          {supplier.total_materials} {supplier.total_materials === 1 ? 'material' : 'materiales'}
                        </span>

                        <div className="flex items-center gap-1">
                          {supplier.phone && (
                            <a
                              href={`tel:${supplier.phone}`}
                              title={`Llamar: ${supplier.phone}`}
                              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 hover:text-procarni-primary transition-colors"
                            >
                              <Phone className="h-3.5 w-3.5" />
                            </a>
                          )}
                          {supplier.email && (
                            <a
                              href={`mailto:${supplier.email}`}
                              title={`Email: ${supplier.email}`}
                              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 hover:text-procarni-blue transition-colors"
                            >
                              <Mail className="h-3.5 w-3.5" />
                            </a>
                          )}
                          {whatsAppLink && (
                            <a
                              href={whatsAppLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Enviar WhatsApp"
                              className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 transition-colors"
                            >
                              <MessageCircle className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    </CardContent>

                    <CardFooter className="p-3 bg-gray-50/70 border-t border-gray-100 gap-2 flex">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleCreateQuoteRequest(supplier, primaryMaterial)}
                        className="flex-1 h-8 text-xs font-bold border-gray-200 text-gray-700 hover:bg-white hover:text-procarni-blue shadow-2xs gap-1"
                      >
                        <Send className="h-3 w-3" />
                        Cotizar
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleCreatePurchaseOrder(supplier, primaryMaterial)}
                        className="flex-1 h-8 text-xs font-bold bg-procarni-primary hover:bg-red-800 text-white shadow-2xs gap-1"
                      >
                        <ShoppingCart className="h-3 w-3" />
                        Comprar
                      </Button>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          ) : (
            /* SMART FALLBACK EMPTY STATE (JUMP TO WEB AI) */
            <div className="flex flex-col items-center justify-center py-16 px-6 bg-white/80 backdrop-blur-xl rounded-3xl border border-gray-200/80 text-center max-w-xl mx-auto space-y-5 shadow-sm">
              <div className="p-4 rounded-2xl bg-amber-50 text-amber-700 border border-amber-200/60 shadow-2xs">
                <Search className="h-8 w-8" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-lg font-bold text-procarni-dark">
                  Sin proveedores registrados para este criterio
                </h3>
                <p className="text-xs text-gray-500 max-w-md leading-relaxed">
                  No se encontraron empresas en la base de datos interna de Procarni que coincidan con <span className="font-semibold text-procarni-dark">"{searchTerm || selectedCategory}"</span>.
                </p>
              </div>

              <div className="pt-2 w-full max-w-sm space-y-2.5">
                <Button
                  type="button"
                  onClick={() => handleJumpToWebSearch()}
                  className="w-full h-11 bg-gradient-to-r from-procarni-primary to-procarni-blue text-white font-bold text-xs rounded-xl shadow-md hover:scale-[1.01] active:scale-[0.99] transition-all gap-2"
                >
                  <Globe className="h-4 w-4 text-amber-300 animate-spin-slow" />
                  Buscar Proveedores en la Web con IA
                </Button>
                <p className="text-[11px] text-gray-400">
                  Rastrea en tiempo real distribuidores y fabricantes en toda Venezuela
                </p>
              </div>

              {dbCategories.length > 0 && (
                <div className="pt-3 border-t border-gray-100 w-full">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-2">
                    O prueba con otra categoría:
                  </span>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {dbCategories.slice(0, 5).map((cat) => (
                      <Button
                        key={cat.id}
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSearchTerm('');
                          setSelectedCategory(cat.name);
                        }}
                        className="h-7 text-[11px] font-medium rounded-lg border-gray-200"
                      >
                        {cat.name}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW B: WEB AI EXPLORER TAB                                               */}
      {/* ========================================================================= */}
      {activeTab === 'web' && (
        <div className="space-y-6">
          {/* WEB SEARCH BAR & REGION SELECTOR */}
          <div className="bg-white/80 backdrop-blur-xl p-5 rounded-3xl border border-gray-200/80 shadow-md space-y-4">
            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
              {/* Search input */}
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <Input
                  type="text"
                  placeholder="¿Qué material, empaque, repuesto o insumo necesitas encontrar en Venezuela?..."
                  value={webSearchTerm}
                  onChange={(e) => setWebSearchTerm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleExecuteWebSearch();
                    }
                  }}
                  className="pl-10 pr-10 h-11 bg-white border-gray-200 rounded-xl text-sm font-medium text-procarni-dark focus-visible:ring-procarni-primary/20 focus-visible:border-procarni-primary shadow-xs"
                />
                {webSearchTerm && (
                  <button
                    type="button"
                    onClick={() => setWebSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-200/50 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Region Selector */}
              <div className="w-full md:w-72">
                <Select value={selectedRegion} onValueChange={setSelectedRegion}>
                  <SelectTrigger className="h-11 text-xs font-semibold bg-white border-gray-200 rounded-xl">
                    <div className="flex items-center gap-1.5 truncate">
                      <MapPin className="h-3.5 w-3.5 text-procarni-primary shrink-0" />
                      <SelectValue placeholder="Zona geográfica" />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {VENEZUELA_REGIONS.map((region) => (
                      <SelectItem key={region} value={region} className="text-xs font-medium">
                        {region}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Search Action Button */}
              <Button
                type="button"
                onClick={() => handleExecuteWebSearch()}
                disabled={isSearchingWeb || !webSearchTerm.trim()}
                className="h-11 px-6 bg-procarni-primary hover:bg-red-800 text-white font-bold text-xs rounded-xl shadow-md gap-2 shrink-0 transition-all hover:scale-[1.01] active:scale-[0.99]"
              >
                {isSearchingWeb ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                    <span>Rastreando Mercado...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 text-amber-300" />
                    <span>Rastrear con IA</span>
                  </>
                )}
              </Button>
            </div>

            {/* AI Grounding & Multi-Provider Status Notice */}
            <div className="flex items-center justify-between text-[11px] text-gray-500 pt-2 border-t border-gray-100 flex-wrap gap-2">
              <div className="flex items-center gap-2 font-medium">
                <div className="flex items-center gap-1.5 text-emerald-700">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>Rastreo Web Real en Vivo</span>
                </div>
                <span className="text-gray-300">•</span>
                <span className="inline-flex items-center text-[10px] font-bold text-procarni-blue bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md">
                  {selectedAiProvider === 'auto'
                    ? '⚡ Modo Auto (Groq / Gemini / OpenRouter)'
                    : selectedAiProvider === 'groq'
                    ? '⚡ Groq (Llama 3.3 70B)'
                    : selectedAiProvider === 'openrouter'
                    ? '⚡ OpenRouter (Free)'
                    : '⚡ Google Gemini (Flash)'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsApiKeyDialogOpen(true)}
                  className="h-7 text-procarni-primary hover:text-red-800 hover:bg-procarni-primary/5 font-bold text-[11px] px-2.5 rounded-lg border-procarni-primary/20 gap-1.5 shadow-2xs"
                >
                  <Key className="h-3 w-3" />
                  Configurar Proveedores IA
                </Button>
              </div>
            </div>
          </div>

          {/* LOADING STATE WITH STEP PROGRESSION */}
          {isSearchingWeb && (
            <div className="flex flex-col items-center justify-center py-20 px-6 bg-white/70 backdrop-blur-xl rounded-3xl border border-gray-200/80 shadow-md text-center max-w-lg mx-auto space-y-4">
              <div className="relative">
                <div className="h-16 w-16 rounded-2xl bg-procarni-primary/10 flex items-center justify-center text-procarni-primary">
                  <Compass className="h-8 w-8 animate-spin" style={{ animationDuration: '3s' }} />
                </div>
                <span className="absolute -top-1 -right-1 flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-procarni-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-procarni-primary text-[8px] text-white font-bold items-center justify-center">
                    IA
                  </span>
                </span>
              </div>

              <div className="space-y-1">
                <h4 className="text-base font-bold text-procarni-dark">Explorando Mercado Abierto</h4>
                <p className="text-xs text-gray-600 font-medium animate-pulse min-h-[20px]">
                  {LOADING_STEPS[loadingStepIndex]}
                </p>
              </div>

              <div className="w-48 bg-gray-100 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-procarni-primary h-full transition-all duration-500 rounded-full"
                  style={{ width: `${((loadingStepIndex + 1) / LOADING_STEPS.length) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* ERROR NOTIFICATION BANNER */}
          {webSearchError && !isSearchingWeb && (
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-amber-900 shadow-2xs">
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-amber-600 shrink-0" />
                <span>{webSearchError}</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsApiKeyDialogOpen(true)}
                className="h-8 border-amber-300 text-amber-900 bg-white hover:bg-amber-100 text-xs font-bold shrink-0 gap-1.5"
              >
                <Key className="h-3.5 w-3.5" />
                Configurar Clave
              </Button>
            </div>
          )}

          {/* CONSOLIDATED HYBRID VIEW: SECCIÓN A & SECCIÓN B */}
          {!isSearchingWeb && hasSearchedWeb && (
            <div className="space-y-8">
              {/* SECCIÓN A: PROVEEDORES REGISTRADOS (CON BADGE VERDE) */}
              <div className="space-y-3 bg-emerald-50/40 p-4 rounded-3xl border border-emerald-200/70">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-emerald-600 text-white border-none font-bold text-xs py-1 px-2.5 shadow-sm">
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                      Sección A: Proveedores Registrados ({matchingInternalSuppliers.length})
                    </Badge>
                    <span className="text-xs text-gray-600 font-medium">
                      Coincidencias en base de datos de Procarni
                    </span>
                  </div>
                  {matchingInternalSuppliers.length > 0 && (
                    <span className="text-[11px] text-emerald-800 font-semibold">
                      Disponibles para cotización u O/C inmediata
                    </span>
                  )}
                </div>

                {matchingInternalSuppliers.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                    {matchingInternalSuppliers.slice(0, 6).map((supplier) => {
                      const whatsAppLink = getWhatsAppLink(supplier.phone || supplier.phone_2, supplier.name, webSearchTerm);
                      return (
                        <Card
                          key={`reg-${supplier.id}`}
                          className="border border-emerald-200 bg-white shadow-2xs hover:shadow-md transition-all flex flex-col justify-between rounded-2xl overflow-hidden group"
                        >
                          <CardHeader className="p-4 pb-2 bg-gradient-to-br from-emerald-50/50 to-transparent border-b border-gray-100">
                            <div className="flex justify-between items-start gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                  <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[9px] font-bold py-0 px-1.5 shadow-none">
                                    <CheckCircle2 className="h-2.5 w-2.5 mr-1 text-emerald-700" /> Registrado
                                  </Badge>
                                  <span className="text-[10px] font-mono font-bold text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                                    {supplier.rif || 'S/R'}
                                  </span>
                                  {supplier.city && (
                                    <span className="inline-flex items-center text-[10px] font-medium text-gray-500 gap-0.5">
                                      <MapPin className="h-2.5 w-2.5 text-gray-400" /> {supplier.city}
                                    </span>
                                  )}
                                </div>
                                <h3
                                  onClick={() => navigate(`/suppliers/${supplier.id}`)}
                                  className="font-bold text-procarni-dark text-sm truncate hover:text-procarni-primary cursor-pointer transition-colors"
                                  title={supplier.name}
                                >
                                  {supplier.name}
                                </h3>
                              </div>
                              <Badge variant="outline" className="text-[9px] font-bold shrink-0 bg-slate-50 text-slate-700">
                                {supplier.payment_terms || 'Contado'}
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="p-4 pt-2.5 space-y-2 flex-1 text-xs">
                            <p className="text-gray-600 font-medium line-clamp-2">
                              {supplier.rubros || supplier.matched_materials_sample.join(', ') || 'Proveedor verificado en base de datos interna.'}
                            </p>
                          </CardContent>
                          <CardFooter className="p-2.5 bg-gray-50/80 border-t border-gray-100 gap-2 flex">
                            {whatsAppLink && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                asChild
                                className="flex-1 h-8 text-[11px] font-bold border-emerald-200 text-emerald-700 hover:bg-emerald-50 gap-1"
                              >
                                <a href={whatsAppLink} target="_blank" rel="noopener noreferrer">
                                  <MessageCircle className="h-3 w-3" /> WhatsApp
                                </a>
                              </Button>
                            )}
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => navigate(`/suppliers/${supplier.id}`)}
                              className="flex-1 h-8 text-[11px] font-bold bg-procarni-blue hover:bg-slate-800 text-white gap-1"
                            >
                              <Eye className="h-3 w-3" /> Ver Ficha
                            </Button>
                          </CardFooter>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-3 bg-white border border-emerald-200/80 rounded-2xl text-xs text-gray-600 flex items-center gap-2">
                    <Info className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>Sin proveedores previamente registrados en Procarni para "{webSearchTerm}". Explora a continuación los nuevos prospectos web encontrados.</span>
                  </div>
                )}
              </div>

              {/* SECCIÓN B: NUEVOS PROSPECTOS WEB (CON BADGE AZUL Y 1-CLICK REGISTRATION) */}
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-blue-600 text-white border-none font-bold text-xs py-1 px-2.5 shadow-sm">
                      <Globe className="h-3.5 w-3.5 mr-1" />
                      Sección B: Nuevos Prospectos Web ({webCandidates.length})
                    </Badge>
                    <span className="text-xs text-gray-500 font-medium">
                      Google Search ({selectedRegion}) estructurado con IA
                    </span>
                  </div>
                  {webCandidates.length > 0 && (
                    <span className="text-[11px] text-blue-800 font-semibold">
                      Haz clic en "Registrar Proveedor con 1-Click" para guardar en Procarni
                    </span>
                  )}
                </div>

                {webCandidates.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {webCandidates.map((candidate) => {
                      const whatsAppLink = getWhatsAppLink(candidate.whatsapp || candidate.phone, candidate.name, webSearchTerm);

                      return (
                        <Card
                          key={candidate.id}
                          className="border border-blue-200/90 bg-white/95 backdrop-blur-xl shadow-xs hover:shadow-lg transition-all flex flex-col justify-between rounded-2xl overflow-hidden group hover:border-blue-400"
                        >
                          <CardHeader className="p-5 pb-3 bg-gradient-to-br from-blue-50/40 via-white to-transparent border-b border-gray-100">
                            <div className="flex justify-between items-start gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                  <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] font-bold py-0 px-1.5 shadow-none">
                                    <Globe className="h-2.5 w-2.5 mr-1 text-blue-600" /> Encontrado en la Web
                                  </Badge>

                                  {candidate.ai_provider && (
                                    <span className="text-[9px] font-semibold text-purple-700 bg-purple-50 border border-purple-200/80 px-1.5 py-0.5 rounded">
                                      {candidate.ai_provider}
                                    </span>
                                  )}

                                  {candidate.city && (
                                    <span className="inline-flex items-center text-[10px] font-medium text-gray-600 gap-0.5 bg-gray-100/80 px-1.5 py-0.5 rounded border border-gray-200">
                                      <MapPin className="h-2.5 w-2.5 text-procarni-primary" /> {candidate.city}{candidate.state ? `, ${candidate.state}` : ''}
                                    </span>
                                  )}

                                  {candidate.rif && candidate.rif !== 'SR' && (
                                    <span className="text-[10px] font-mono font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                                      {candidate.rif}
                                    </span>
                                  )}
                                </div>

                                <h3
                                  className="font-bold text-procarni-dark text-base leading-snug line-clamp-1 group-hover:text-procarni-primary transition-colors"
                                  title={candidate.name}
                                >
                                  {candidate.name}
                                </h3>
                              </div>
                            </div>
                          </CardHeader>

                          <CardContent className="p-5 pt-3.5 space-y-3.5 flex-1">
                            {/* Summary */}
                            <div className="space-y-1">
                              <span className="text-[9px] font-black uppercase tracking-wider text-gray-400">
                                Perfil & Capacidad
                              </span>
                              <p className="text-xs text-gray-600 font-medium line-clamp-3 leading-relaxed">
                                {candidate.summary}
                              </p>
                            </div>

                            {/* Products Detected */}
                            {candidate.products_detected && candidate.products_detected.length > 0 && (
                              <div className="space-y-1.5">
                                <span className="text-[9px] font-black uppercase tracking-wider text-procarni-blue flex items-center gap-1">
                                  <Package className="h-3 w-3" /> Productos Detectados
                                </span>
                                <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto no-scrollbar">
                                  {candidate.products_detected.map((prod, idx) => (
                                    <Badge
                                      key={idx}
                                      variant="secondary"
                                      className="bg-blue-50 text-blue-800 border-blue-200 text-[10px] font-semibold"
                                    >
                                      {prod}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Verified Sources */}
                            {candidate.source_urls && candidate.source_urls.length > 0 && (
                              <div className="pt-2 border-t border-gray-100">
                                <span className="text-[9px] font-black uppercase tracking-wider text-gray-400 block mb-1">
                                  Fuentes Web Verificadas
                                </span>
                                <div className="flex flex-wrap gap-1">
                                  {candidate.source_urls.slice(0, 2).map((src, sIdx) => {
                                    let hostname = src.title || src.url;
                                    try {
                                      hostname = new URL(src.url).hostname.replace('www.', '');
                                    } catch {
                                      // fallback
                                    }
                                    return (
                                      <a
                                        key={sIdx}
                                        href={src.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-50 hover:bg-gray-100 text-[10px] text-gray-600 border border-gray-200 transition-colors"
                                      >
                                        <ExternalLink className="h-2.5 w-2.5 text-gray-400" />
                                        <span className="truncate max-w-[120px]">{hostname}</span>
                                      </a>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Contact Icons Bar */}
                            <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                              <span className="text-[11px] font-medium text-gray-500">Contacto directo:</span>
                              <div className="flex items-center gap-1">
                                {candidate.phone && (
                                  <a
                                    href={`tel:${candidate.phone}`}
                                    title={`Llamar: ${candidate.phone}`}
                                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 hover:text-procarni-primary transition-colors"
                                  >
                                    <Phone className="h-3.5 w-3.5" />
                                  </a>
                                )}
                                {candidate.email && (
                                  <a
                                    href={`mailto:${candidate.email}`}
                                    title={`Email: ${candidate.email}`}
                                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 hover:text-procarni-blue transition-colors"
                                  >
                                    <Mail className="h-3.5 w-3.5" />
                                  </a>
                                )}
                                {candidate.instagram && (
                                  <a
                                    href={
                                      candidate.instagram.startsWith('http')
                                        ? candidate.instagram
                                        : `https://instagram.com/${candidate.instagram.replace('@', '')}`
                                    }
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={`Instagram: ${candidate.instagram}`}
                                    className="p-1.5 rounded-lg hover:bg-pink-50 text-gray-600 hover:text-pink-600 transition-colors"
                                  >
                                    <Instagram className="h-3.5 w-3.5" />
                                  </a>
                                )}
                                {candidate.website && (
                                  <a
                                    href={candidate.website}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="Sitio Web Oficial"
                                    className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-600 hover:text-blue-600 transition-colors"
                                  >
                                    <Globe className="h-3.5 w-3.5" />
                                  </a>
                                )}
                                {whatsAppLink && (
                                  <a
                                    href={whatsAppLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="Enviar WhatsApp"
                                    className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 transition-colors"
                                  >
                                    <MessageCircle className="h-3.5 w-3.5" />
                                  </a>
                                )}
                              </div>
                            </div>
                          </CardContent>

                          <CardFooter className="p-3 bg-gray-50/80 border-t border-gray-100 gap-2 flex">
                            {whatsAppLink && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                asChild
                                className="flex-1 h-9 text-xs font-bold border-emerald-200 text-emerald-700 hover:bg-emerald-50 shadow-2xs gap-1.5"
                              >
                                <a href={whatsAppLink} target="_blank" rel="noopener noreferrer">
                                  <MessageCircle className="h-3.5 w-3.5" />
                                  WhatsApp
                                </a>
                              </Button>
                            )}

                            <Button
                              type="button"
                              size="sm"
                              onClick={() => handleOpenRegisterCandidate(candidate)}
                              className="flex-1 h-9 text-xs font-bold bg-procarni-primary hover:bg-red-800 text-white shadow-2xs gap-1.5"
                            >
                              <UserPlus className="h-3.5 w-3.5" />
                              Registrar Proveedor con 1-Click
                            </Button>
                          </CardFooter>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 px-6 bg-white/70 backdrop-blur-xl rounded-3xl border border-gray-200/80 text-center max-w-md mx-auto space-y-3 shadow-xs">
                    <div className="p-3 rounded-2xl bg-amber-50 text-amber-600">
                      <Search className="h-6 w-6" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-procarni-dark">No se detectaron nuevos proveedores web</h4>
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                        No obtuvimos coincidencias específicas para "{webSearchTerm}" en {selectedRegion}.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const nationalRegion = 'Toda Venezuela (Nacional)';
                        setSelectedRegion(nationalRegion);
                        handleExecuteWebSearch(webSearchTerm, nationalRegion);
                      }}
                      className="text-xs font-semibold rounded-xl border-gray-200"
                    >
                      Buscar en Toda Venezuela
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* INITIAL WEB HERO (BEFORE SEARCHING) */}
          {!isSearchingWeb && !hasSearchedWeb && (
            <div className="flex flex-col items-center justify-center py-16 px-6 bg-white/70 backdrop-blur-xl rounded-3xl border border-gray-200/80 text-center max-w-xl mx-auto space-y-4 shadow-sm">
              <div className="p-4 rounded-2xl bg-procarni-primary/10 text-procarni-primary">
                <Globe className="h-10 w-10 text-procarni-primary" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-lg font-bold text-procarni-dark">
                  Explorador de Mercado con Inteligencia Artificial
                </h3>
                <p className="text-xs text-gray-500 max-w-md leading-relaxed">
                  Busca materiales industriales, empaques, tripas, condimentos, repuestos y servicios en todo el mercado venezolano.
                  Podrás ver números de contacto, WhatsApp y guardar el proveedor en el sistema en 1 solo clic.
                </p>
              </div>

              <div className="pt-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-2">
                  Búsquedas sugeridas del sector:
                </span>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {[
                    'Tripas de colágeno para embutidos',
                    'Bolsas termoencogibles al vacío',
                    'Cuchillas para molino de carne',
                    'Malla elástica cárnica',
                    'Condimentos y sales de curado',
                    'Grasas y aditivos alimentarios',
                  ].map((sugg, idx) => (
                    <Button
                      key={idx}
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setWebSearchTerm(sugg);
                        handleExecuteWebSearch(sugg);
                      }}
                      className="h-7 text-[11px] font-medium rounded-lg border-gray-200 hover:border-procarni-primary/30 hover:bg-procarni-primary/5"
                    >
                      {sugg}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. SUPPLIER CREATION MODAL (PRE-FILLED FROM WEB CANDIDATE) */}
      <SupplierCreationDialog
        isOpen={isRegisterDialogOpen}
        onClose={() => setIsRegisterDialogOpen(false)}
        initialData={supplierPrefillData}
        onSupplierCreated={(newSupplier: Supplier) => {
          showSuccess(`Proveedor "${newSupplier.name}" registrado correctamente en el catálogo interno.`);
          setIsRegisterDialogOpen(false);
          refetch();
        }}
      />

      {/* 4. API KEY & MULTI-PROVIDER CONFIGURATION MODAL */}
      <Dialog open={isApiKeyDialogOpen} onOpenChange={setIsApiKeyDialogOpen}>
        <DialogContent className="sm:max-w-lg rounded-3xl bg-white/95 backdrop-blur-xl border border-gray-200/80 shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
          <DialogHeader className="space-y-1 pb-2 border-b border-gray-100">
            <DialogTitle className="text-lg font-bold text-procarni-dark flex items-center gap-2">
              <Key className="h-5 w-5 text-procarni-primary" />
              Configurar Proveedores de IA & Búsqueda
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-500">
              Personaliza el motor de IA para el rastreo y estructuración inteligente de proveedores.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-3">
            {/* Capa 1: Buscador de Verdad (Serper.dev Google Search Scraper) */}
            <div className="space-y-2 bg-blue-50/70 p-4 rounded-2xl border border-blue-200/80">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold uppercase tracking-wider text-blue-900 flex items-center gap-1.5">
                  <Globe className="h-4 w-4 text-blue-700" />
                  <span>Capa 1: Buscador Web Serper.dev (Google Venezuela)</span>
                </label>
                <Badge className="bg-blue-600 text-white border-none text-[9px] py-0 px-2 font-bold">
                  Buscador de Verdad
                </Badge>
              </div>
              <p className="text-[11px] text-blue-800/90 leading-relaxed">
                Scraper de Google Search configurado para Venezuela (gl: 've', hl: 'es'). Rastrea resultados 100% reales en Google sin inventar datos.
              </p>
              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] text-blue-700 font-semibold">API Key de Serper:</span>
                <a
                  href="https://serper.dev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-procarni-primary hover:underline font-bold inline-flex items-center gap-0.5"
                >
                  Obtener 2.500 Búsquedas Gratis <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </div>
              <Input
                type="password"
                placeholder="Ingresa tu clave de serper.dev..."
                value={customSerperInput}
                onChange={(e) => setCustomSerperInput(e.target.value)}
                className="h-9 text-xs font-mono rounded-xl bg-white border-blue-200"
              />
              <div className="flex justify-between items-center text-[10px] text-gray-500 pt-0.5">
                <span>Estado: <strong className="text-gray-700">{activeSerperStatus}</strong></span>
                {getCustomSerperApiKey() && (
                  <button
                    type="button"
                    onClick={() => {
                      removeCustomSerperApiKey();
                      setActiveSerperStatus(getSerperApiKey() ? 'API key predeterminada (lista y activa)' : 'No configurada (Recomendada para Google)');
                      showSuccess('Clave Serper.dev local eliminada.');
                    }}
                    className="text-red-500 hover:underline font-semibold"
                  >
                    Borrar
                  </button>
                )}
              </div>
            </div>

            {/* Capa 2: Selector de Motor de IA */}
            <div className="space-y-1.5 bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
              <label className="text-[10px] font-bold uppercase tracking-wider text-procarni-dark block">
                Capa 2: Motor de Extracción IA (RAG Estructurado)
              </label>
              <Select
                value={selectedAiProvider}
                onValueChange={(val) => setSelectedAiProvider(val as AiProviderType)}
              >
                <SelectTrigger className="h-10 text-xs bg-white border-slate-200 rounded-xl font-medium">
                  <SelectValue placeholder="Selecciona motor de IA" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="gemini" className="text-xs font-semibold text-blue-700">
                    ✨ Google Gemini (Flash 3.6 & 3.5 Lite) [Recomendado]
                  </SelectItem>
                  <SelectItem value="auto" className="text-xs font-semibold text-emerald-800">
                    ⚡ Auto-Cascade (Gemini + Groq + OpenRouter)
                  </SelectItem>
                  <SelectItem value="groq" className="text-xs font-semibold text-orange-700">
                    🚀 Groq (Llama 3.3 & DeepSeek Distill - Ultra Rápido)
                  </SelectItem>
                  <SelectItem value="openrouter" className="text-xs font-semibold text-purple-700">
                    🌐 OpenRouter (DeepSeek Chat & Llama 3.3)
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-gray-500 leading-normal">
                El motor de IA analiza los fragmentos de Google y extrae el JSON limpio con teléfonos venezolanos, WhatsApp y productos.
              </p>
            </div>

            {/* Groq API Key */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold uppercase tracking-wider text-orange-800 flex items-center gap-1.5">
                  <span>Clave Groq API (Llama 3.3 70B)</span>
                  <Badge className="bg-orange-100 text-orange-800 border-none text-[9px] py-0 px-1.5">Ultra Rápido</Badge>
                </label>
                <a
                  href="https://console.groq.com/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-procarni-primary hover:underline font-semibold inline-flex items-center gap-0.5"
                >
                  Obtener Gratis <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </div>
              <Input
                type="password"
                placeholder="gsk_..."
                value={customGroqInput}
                onChange={(e) => setCustomGroqInput(e.target.value)}
                className="h-9 text-xs font-mono rounded-xl bg-gray-50 border-gray-200"
              />
              <div className="flex justify-between items-center text-[10px] text-gray-400">
                <span>Estado: <strong className="text-gray-600">{activeGroqStatus}</strong></span>
                {getCustomGroqApiKey() && (
                  <button
                    type="button"
                    onClick={() => {
                      removeCustomGroqApiKey();
                      setActiveGroqStatus(getGroqApiKey() ? 'API key predeterminada (lista y activa)' : 'No configurada');
                      showSuccess('Clave Groq local eliminada.');
                    }}
                    className="text-red-500 hover:underline"
                  >
                    Borrar
                  </button>
                )}
              </div>
            </div>

            {/* Google Gemini API Key */}
            <div className="space-y-1.5 pt-2 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold uppercase tracking-wider text-blue-800 flex items-center gap-1.5">
                  <span>Clave(s) Google Gemini API</span>
                  <Badge className="bg-blue-100 text-blue-800 border-none text-[9px] py-0 px-1.5">gemini-3.6 / 3.5-flash-lite</Badge>
                </label>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-procarni-primary hover:underline font-semibold inline-flex items-center gap-0.5"
                >
                  Obtener Gratis <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </div>
              <Input
                type="password"
                placeholder="AIzaSy... (o varias separadas por coma)"
                value={customKeyInput}
                onChange={(e) => setCustomKeyInput(e.target.value)}
                className="h-9 text-xs font-mono rounded-xl bg-gray-50 border-gray-200"
              />
              <div className="flex justify-between items-center text-[10px] text-gray-400">
                <span>Estado: <strong className="text-gray-600">{activeGeminiStatus}</strong></span>
                {getCustomGeminiApiKey() && (
                  <button
                    type="button"
                    onClick={() => {
                      removeCustomGeminiApiKey();
                      const pool = getAllGeminiApiKeys();
                      setActiveGeminiStatus(pool.length > 0 ? `API key predeterminada (lista y activa${pool.length > 1 ? ` - Pool de ${pool.length} keys` : ''})` : 'No configurada');
                      showSuccess('Clave Gemini local eliminada.');
                    }}
                    className="text-red-500 hover:underline"
                  >
                    Borrar
                  </button>
                )}
              </div>
            </div>

            {/* OpenRouter API Key */}
            <div className="space-y-1.5 pt-2 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold uppercase tracking-wider text-purple-800 flex items-center gap-1.5">
                  <span>Clave OpenRouter API (Último Recurso)</span>
                  <Badge className="bg-purple-100 text-purple-800 border-none text-[9px] py-0 px-1.5">DeepSeek / Llama</Badge>
                </label>
                <a
                  href="https://openrouter.ai/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-procarni-primary hover:underline font-semibold inline-flex items-center gap-0.5"
                >
                  Obtener Gratis <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </div>
              <Input
                type="password"
                placeholder="sk-or-..."
                value={customOpenRouterInput}
                onChange={(e) => setCustomOpenRouterInput(e.target.value)}
                className="h-9 text-xs font-mono rounded-xl bg-gray-50 border-gray-200"
              />
              <div className="flex justify-between items-center text-[10px] text-gray-400">
                <span>Estado: <strong className="text-gray-600">{activeOpenRouterStatus}</strong></span>
                {getCustomOpenRouterApiKey() && (
                  <button
                    type="button"
                    onClick={() => {
                      removeCustomOpenRouterApiKey();
                      setActiveOpenRouterStatus(getOpenRouterApiKey() ? 'API key predeterminada (lista y activa)' : 'No configurada');
                      showSuccess('Clave OpenRouter local eliminada.');
                    }}
                    className="text-red-500 hover:underline"
                  >
                    Borrar
                  </button>
                )}
              </div>
            </div>

            {/* Security Notice */}
            <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl text-[10px] text-gray-500 flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                <strong>Seguridad y Privacidad</strong>: Tus claves API se guardan exclusivamente en el almacenamiento local aislado (<code className="text-[9px] bg-gray-200 px-1 py-0.5 rounded font-mono">localStorage</code>) de tu navegador. Nunca se transmiten a servidores externos ni a GitHub; viajan directamente por HTTPS cifrado a las APIs oficiales de cada proveedor.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-gray-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                removeCustomSerperApiKey();
                removeCustomGeminiApiKey();
                removeCustomGroqApiKey();
                removeCustomOpenRouterApiKey();
                showSuccess('Todas las claves personalizadas fueron restablecidas.');
                setIsApiKeyDialogOpen(false);
              }}
              className="text-xs font-semibold text-gray-600 border-gray-200 rounded-xl"
            >
              Restablecer Todas
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSaveApiKey}
              className="text-xs font-bold bg-procarni-primary hover:bg-red-800 text-white rounded-xl shadow-xs"
            >
              Guardar Configuración
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SearchSuppliersByMaterial;