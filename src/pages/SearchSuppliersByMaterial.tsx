import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Phone, Instagram, Eye, ArrowLeft, Tag, MapPin, Clock, DollarSign,
  X, Search, Building2, CreditCard, Mail, Info, Package, Loader2,
  FileText, Sparkles, ShoppingCart, MessageCircle, Send, CheckCircle2,
  Layers, Flame, Wrench, Zap, Droplets, Cpu, Filter, ChevronRight
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { searchSuppliersSmart, getAllMaterialCategories } from '@/integrations/supabase/data';
import { showError, showSuccess } from '@/utils/toast';
import { isGenericRif } from '@/utils/validators';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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

const SearchSuppliersByMaterial: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useIsMobile();

  // Search States
  const [searchTerm, setSearchTerm] = useState<string>(() => searchParams.get('query') || '');
  const [selectedCategory, setSelectedCategory] = useState<string>(() => searchParams.get('category') || 'all');
  const [selectedCity, setSelectedCity] = useState<string>('all');
  const [keywordFilter, setKeywordFilter] = useState<string>('');

  // Fetch Categories for Chips Bar
  const { data: dbCategories = [] } = useQuery({
    queryKey: ['material_categories'],
    queryFn: getAllMaterialCategories,
  });

  // Query Suppliers using the Smart Search RPC
  const {
    data: suppliers = [],
    isLoading: isLoadingSuppliers,
    refetch,
  } = useQuery<SmartSupplierResult[]>({
    queryKey: ['suppliers_smart_search', searchTerm, selectedCategory],
    queryFn: async () => {
      const catParam = selectedCategory === 'all' ? null : selectedCategory;
      const termParam = searchTerm.trim() || null;
      const results = await searchSuppliersSmart({
        searchTerm: termParam,
        category: catParam,
        city: null, // We filter city client-side for immediate reactivity
        limit: 150,
      });
      return results as SmartSupplierResult[];
    },
    staleTime: 1000 * 60 * 2, // 2 minutes cache
  });

  // Synchronize URL parameters when search changes
  const updateUrlParams = useCallback((term: string, cat: string) => {
    const params: Record<string, string> = {};
    if (term.trim()) params.query = term.trim();
    if (cat !== 'all') params.category = cat;
    setSearchParams(params, { replace: true });
  }, [setSearchParams]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    updateUrlParams(value, selectedCategory);
  };

  const handleCategorySelect = (catName: string) => {
    const nextCat = selectedCategory === catName ? 'all' : catName;
    setSelectedCategory(nextCat);
    updateUrlParams(searchTerm, nextCat);
  };

  // Sync state if user navigates back/forward in browser history
  useEffect(() => {
    const urlQuery = searchParams.get('query') || '';
    const urlCat = searchParams.get('category') || 'all';
    setSearchTerm(urlQuery);
    setSelectedCategory(urlCat);
  }, [searchParams.toString()]); // Stable dependency

  // WhatsApp link formatter
  const getWhatsAppLink = (phone?: string | null, supplierName?: string) => {
    if (!phone) return null;
    let digits = phone.replace(/\D/g, '');
    if (!digits) return null;
    if (!digits.startsWith('58')) {
      digits = `58${digits}`;
    }
    const queryContext = searchTerm ? ` el producto "${searchTerm}"` : selectedCategory !== 'all' ? ` productos de ${selectedCategory}` : ' cotizaciones de materiales';
    const message = encodeURIComponent(`Hola, le escribo de parte de Procarni C.A. para consultar disponibilidad y precios sobre${queryContext}.`);
    return `https://wa.me/${digits}?text=${message}`;
  };

  // Direct actions
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

  // PDF Export
  const handleExportPDF = () => {
    try {
      const doc = new jsPDF();
      const dateStr = new Date().toLocaleDateString('es-VE');

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(27, 41, 74); // Procarni blue (#1B294A)
      doc.text('PROCARNI', 14, 18);

      doc.setFontSize(8);
      doc.setTextColor(136, 10, 10); // Primary red (#880a0a)
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

  const microLabelClass = "text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-1 block";

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
                  Búsqueda Ágil
                </Badge>
              </div>
              <p className="text-xs text-gray-500 font-medium">
                Encuentra proveedores buscando por material, categoría, rubro o razón social
              </p>
            </div>
          </div>

          {/* MAIN SEARCH INPUT */}
          <div className="w-full md:w-96 relative">
            <div className="relative flex items-center">
              <Search className="absolute left-3.5 h-4 w-4 text-gray-400 pointer-events-none" />
              <Input
                type="text"
                placeholder="Escribe material, rubro, código o proveedor..."
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-10 pr-10 h-10 bg-gray-50/80 border-gray-200 rounded-xl text-sm font-medium text-procarni-dark focus-visible:ring-procarni-primary/20 focus-visible:border-procarni-primary focus-visible:bg-white transition-all shadow-xs"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => handleSearchChange('')}
                  className="absolute right-3 p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-200/50 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
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

      {/* 3. SECONDARY CONTROLS / FILTERS BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 bg-white/70 backdrop-blur-md p-3.5 rounded-xl border border-gray-200/70 shadow-xs">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-400" />
          <span className="text-xs font-bold text-gray-700">
            {isLoadingSuppliers ? 'Buscando...' : `${filteredSuppliers.length} Proveedores Encontrados`}
          </span>
          {selectedCategory !== 'all' && (
            <Badge variant="outline" className="bg-procarni-primary/5 text-procarni-primary border-procarni-primary/20 text-[10px] font-bold">
              Categoría: {selectedCategory}
            </Badge>
          )}
          {searchTerm && (
            <Badge variant="outline" className="bg-blue-50 text-procarni-blue border-blue-200 text-[10px] font-bold">
              Término: "{searchTerm}"
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* City Filter */}
          <Select value={selectedCity} onValueChange={setSelectedCity}>
            <SelectTrigger className="h-8 text-xs w-full sm:w-44 bg-white border-gray-200">
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
            className="h-8 text-xs w-full sm:w-48 bg-white border-gray-200"
          />

          {/* PDF Export Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportPDF}
            disabled={filteredSuppliers.length === 0}
            className="h-8 border-gray-200 text-gray-700 hover:text-procarni-primary hover:bg-slate-50 text-xs font-semibold gap-1.5 shrink-0"
          >
            <FileText className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Exportar PDF</span>
          </Button>
        </div>
      </div>

      {/* 4. RESULTS SECTION */}
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
                      <div className="flex items-center gap-1.5 mb-1">
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
        /* EMPTY STATE */
        <div className="flex flex-col items-center justify-center py-16 px-4 bg-white/70 backdrop-blur-xl rounded-3xl border border-gray-200/70 text-center max-w-xl mx-auto space-y-4">
          <div className="p-4 rounded-2xl bg-procarni-primary/10 text-procarni-primary">
            <Search className="h-8 w-8" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-procarni-dark">No se encontraron proveedores</h3>
            <p className="text-xs text-gray-500 mt-1 max-w-md">
              No encontramos proveedores que coincidan exactamente con "{searchTerm || selectedCategory}". Intenta con un término más general o selecciona una categoría.
            </p>
          </div>

          <div className="pt-2 flex flex-wrap justify-center gap-1.5">
            {dbCategories.slice(0, 6).map((cat) => (
              <Button
                key={cat.id}
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchTerm('');
                  setSelectedCategory(cat.name);
                }}
                className="h-8 text-xs font-semibold rounded-lg"
              >
                {cat.name}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchSuppliersByMaterial;