import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import SmartSearch from '@/components/SmartSearch';
import { searchMaterialsAndCategories, searchSuppliersByMaterial, searchSuppliersByCategory } from '@/integrations/supabase/data';
import { showError, showSuccess } from '@/utils/toast';
import { isGenericRif } from '@/utils/validators';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Phone, Instagram, PlusCircle, Eye, ArrowLeft, Tag, MapPin, Clock, DollarSign,
  X, Search, Building2, CreditCard, Mail, Globe, Info, Package, Loader2, AlertTriangle,
  FileText
} from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';

interface Material {
  id: string;
  name: string;
  code: string;
  category?: string;
}

interface SupplierResult {
  id: string;
  name: string;
  rif: string;
  email?: string;
  phone?: string;
  phone_2?: string;
  instagram?: string;
  payment_terms: string;
  credit_days: number;
  status: string;
  specification: string;
  city?: string | null;
  rubros?: string | null;
}

const SearchSuppliersByMaterial = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isMobile = useIsMobile();

  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierResult[]>([]);
  const [isLoadingSuppliers, setIsLoadingSuppliers] = useState(false);
  const [initialQuery, setInitialQuery] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState<string>('all');
  const [rubroFilter, setRubroFilter] = useState<string>('');

  const formatPhoneNumberForWhatsApp = (phone: string) => {
    const digitsOnly = phone.replace(/\D/g, '');
    if (!digitsOnly.startsWith('58')) {
      return `58${digitsOnly}`;
    }
    return digitsOnly;
  };

  const fetchSuppliers = async (materialId: string) => {
    setIsLoadingSuppliers(true);
    setSuppliers([]);
    setSelectedCity('all');
    setRubroFilter('');
    try {
      const fetchedSuppliers = await searchSuppliersByMaterial(materialId, '');
      setSuppliers(fetchedSuppliers);
    } catch (error) {
      console.error('Error fetching suppliers by material:', error);
      showError('Error al cargar los proveedores para este material.');
    } finally {
      setIsLoadingSuppliers(false);
    }
  };

  const fetchSuppliersByCategoryName = async (categoryName: string) => {
    setIsLoadingSuppliers(true);
    setSuppliers([]);
    setSelectedCity('all');
    setRubroFilter('');
    try {
      const fetchedSuppliers = await searchSuppliersByCategory(categoryName, '');
      setSuppliers(fetchedSuppliers);
    } catch (error) {
      console.error('Error fetching suppliers by category:', error);
      showError('Error al cargar los proveedores para esta categoría.');
    } finally {
      setIsLoadingSuppliers(false);
    }
  };

  const handleMaterialSelect = async (item: any) => {
    setInitialQuery(null);
    if (item?.isCategory) {
      setSelectedMaterial(null);
      setSelectedCategory(item.category);
      await fetchSuppliersByCategoryName(item.category);
    } else {
      setSelectedCategory(null);
      setSelectedMaterial(item);
      if (item?.id) {
        await fetchSuppliers(item.id);
      } else {
        setSuppliers([]);
      }
    }
  };

  useEffect(() => {
    const queryFromUrl = searchParams.get('query');
    if (queryFromUrl) {
      setInitialQuery(queryFromUrl);
      const searchAndLoad = async () => {
        try {
          const results = await searchMaterialsAndCategories(queryFromUrl);
          if (results.length > 0) {
            const cleanQuery = queryFromUrl.replace(/^Categoría:\s*/i, '').trim();
            const exactCategoryMatch = results.find(
              r => r.isCategory && r.category.toLowerCase() === cleanQuery.toLowerCase()
            );

            if (exactCategoryMatch) {
              setSelectedMaterial(null);
              setSelectedCategory(exactCategoryMatch.category);
              await fetchSuppliersByCategoryName(exactCategoryMatch.category);
            } else {
              const match = results[0];
              if (match.isCategory) {
                setSelectedMaterial(null);
                setSelectedCategory(match.category);
                await fetchSuppliersByCategoryName(match.category);
              } else {
                setSelectedCategory(null);
                setSelectedMaterial(match);
                await fetchSuppliers(match.id);
              }
            }
          } else {
            showError(`No se encontró un material o categoría que coincida con "${queryFromUrl}".`);
          }
        } catch (error) {
          console.error('Error searching material/category on initial load:', error);
          showError('Error al buscar el material o categoría inicial.');
        }
      };
      searchAndLoad();
    }
  }, [searchParams]);

  const handleCreateQuoteRequest = (supplier: SupplierResult) => {
    navigate('/generate-quote', {
      state: {
        supplier: supplier,
        material: selectedMaterial,
      },
    });
  };

  const handleViewSupplierDetails = (supplier: SupplierResult) => {
    navigate(`/suppliers/${supplier.id}`);
  };

  const handleExportPDF = () => {
    try {
      const doc = new jsPDF();
      const dateStr = new Date().toLocaleDateString('es-VE');

      // Title & Header setup
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(20);
      doc.setTextColor(27, 41, 74); // Procarni blue (#1B294A)
      doc.text('PROCARNI', 14, 20);

      doc.setFontSize(8);
      doc.setTextColor(136, 10, 10); // Primary red (#880a0a)
      doc.text('SYSTEM', 14, 24);

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(15, 23, 42); // Dark slate (#0f172a)
      doc.text('Reporte de Proveedores por Material', 200, 18, { align: 'right' });

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      
      const searchCriteria = selectedMaterial 
        ? `Material: ${selectedMaterial.name} (${selectedMaterial.code})` 
        : `Categoría: ${selectedCategory}`;
      
      doc.text(searchCriteria, 14, 32);
      
      const cityFilterText = selectedCity === 'all' ? 'Todas las ciudades' : `Ciudad: ${selectedCity}`;
      doc.text(`Filtro: ${cityFilterText}`, 200, 23, { align: 'right' });
      doc.text(`Fecha Emisión: ${dateStr}`, 200, 28, { align: 'right' });

      const tableData = filteredSuppliers.map((supplier) => {
        const contactInfo = [
          supplier.phone ? `Telf: ${supplier.phone}` : '',
          supplier.email ? `Email: ${supplier.email}` : '',
          supplier.instagram ? `IG: ${supplier.instagram}` : ''
        ].filter(Boolean).join('\n');

        const paymentInfo = [
          supplier.payment_terms || 'No especificado',
          supplier.credit_days !== undefined && supplier.credit_days !== null ? `${supplier.credit_days} días` : ''
        ].filter(Boolean).join(' - ');

        return [
          supplier.name,
          supplier.rif || 'S/R',
          supplier.city || 'No especificado',
          contactInfo,
          paymentInfo,
          [supplier.rubros, supplier.specification].filter(Boolean).join(' / ') || 'Sin rubros'
        ];
      });

      autoTable(doc, {
        startY: 38,
        head: [['Proveedor', 'RIF', 'Ciudad', 'Contacto', 'Condiciones de Pago', 'Rubros']],
        body: tableData,
        theme: 'plain',
        headStyles: {
          fillColor: [248, 250, 252],
          textColor: [71, 85, 105],
          fontStyle: 'bold',
          fontSize: 8.5,
          lineWidth: { bottom: 1 },
          lineColor: [226, 232, 240],
        },
        bodyStyles: {
          textColor: [15, 23, 42],
          fontSize: 8,
          lineWidth: { bottom: 0.5 },
          lineColor: [241, 245, 249],
        },
        alternateRowStyles: {
          fillColor: [250, 250, 250],
        },
        margin: { top: 38 },
        columnStyles: {
          3: { cellWidth: 45 }, // Contact column
          5: { cellWidth: 50 }  // Rubros column
        }
      });

      const finalY = (doc as any).lastAutoTable?.finalY || 40;
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text('Reporte generado automáticamente desde la Búsqueda de Proveedores por Material - Procarni.', 14, finalY + 15);

      const fileDate = new Date().toISOString().split('T')[0];
      const searchName = selectedMaterial ? selectedMaterial.name : (selectedCategory || 'material');
      doc.save(`Proveedores_${searchName.replace(/\s+/g, '_')}_${fileDate}.pdf`);
      showSuccess('Reporte PDF descargado exitosamente.');
    } catch (error) {
      console.error('PDF Export Error:', error);
      showError('Ocurrió un error al generar el PDF de proveedores.');
    }
  };

  const microLabelClass = "text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-1 block";
  const valueClass = "text-procarni-dark font-medium text-sm";

  const availableCities = Array.from(new Set(suppliers.map(s => s.city).filter(Boolean))).sort() as string[];
  const filteredSuppliers = suppliers.filter(s => {
    const matchesCity = selectedCity === 'all' || s.city === selectedCity;
    const matchesRubro = !rubroFilter.trim() || 
      (s.specification && s.specification.toLowerCase().includes(rubroFilter.toLowerCase())) ||
      (s.rubros && s.rubros.toLowerCase().includes(rubroFilter.toLowerCase()));
    return matchesCity && matchesRubro;
  });

  return (
    <div className="container mx-auto p-4 pb-24 relative min-h-screen">

      {/* PHASE 1: STICKY HEADER & SEARCH BAR */}
      <div className="relative md:sticky md:top-0 z-20 backdrop-blur-md bg-white/90 border-b border-gray-200 pb-3 pt-4 mb-8 -mx-4 px-4 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-all duration-200">
        <div className="flex flex-col gap-1 w-full md:w-auto">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-gray-400 hover:text-procarni-dark hover:bg-gray-100 rounded-full h-8 w-8 -ml-2 mr-1">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold text-procarni-dark tracking-tight">
              Buscar Proveedores
            </h1>
          </div>
          <p className="text-xs text-gray-400 ml-8 font-medium">Búsqueda rápida por material específico</p>
        </div>

        <div className="w-full md:w-80 lg:w-96">
          <div className="relative group">
            <SmartSearch
              placeholder="¿Qué material o categoría buscas?"
              onSelect={handleMaterialSelect}
              fetchFunction={searchMaterialsAndCategories}
              displayValue={selectedMaterial?.name || (selectedCategory ? `Categoría: ${selectedCategory}` : '') || initialQuery || ''}
              selectedId={selectedMaterial?.id || (selectedCategory ? `category:${selectedCategory}` : undefined)}
            />
            {!selectedMaterial && !selectedCategory && !initialQuery && (
              <Search className="absolute right-3 top-2.5 h-4 w-4 text-gray-300 pointer-events-none group-focus-within:text-procarni-secondary" />
            )}
            {(selectedMaterial || selectedCategory) && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1 h-7 w-7 text-gray-400 hover:text-red-500 rounded-full"
                onClick={() => {
                  setSelectedMaterial(null);
                  setSelectedCategory(null);
                  setSuppliers([]);
                }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* PHASE 2: SELECTION SUMMARY */}
      {selectedMaterial && (
        <div className="mb-10 animate-in fade-in slide-in-from-top-1 duration-300">
          <div className="flex items-center gap-4 bg-procarni-primary/5 border border-procarni-primary/10 p-4 rounded-xl">
            <div className="bg-procarni-primary/10 p-2 rounded-lg">
              <Package className="h-5 w-5 text-procarni-primary" />
            </div>
            <div className="flex-1">
              <span className={microLabelClass}>Material Seleccionado</span>
              <div className="flex items-baseline gap-2">
                <h2 className="text-lg font-bold text-procarni-dark">{selectedMaterial.name}</h2>
                <Badge variant="outline" className="text-[10px] font-mono border-gray-200 text-gray-500 bg-white">
                  {selectedMaterial.code}
                </Badge>
              </div>
            </div>
            {selectedMaterial.category && (
              <div className="hidden sm:block text-right">
                <span className={microLabelClass}>Categoría</span>
                <Badge className="bg-procarni-secondary/10 text-procarni-secondary border-procarni-secondary/20 shadow-none text-[10px] uppercase font-bold tracking-wider">
                  {selectedMaterial.category}
                </Badge>
              </div>
            )}
          </div>
        </div>
      )}

      {selectedCategory && (
        <div className="mb-10 animate-in fade-in slide-in-from-top-1 duration-300">
          <div className="flex items-center gap-4 bg-procarni-secondary/5 border border-procarni-secondary/10 p-4 rounded-xl">
            <div className="bg-procarni-secondary/10 p-2 rounded-lg">
              <Tag className="h-5 w-5 text-procarni-secondary" />
            </div>
            <div className="flex-1">
              <span className={microLabelClass}>Categoría Seleccionada</span>
              <div className="flex items-baseline gap-2">
                <h2 className="text-lg font-bold text-procarni-dark">{selectedCategory}</h2>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PHASE 3: RESULTS SECTION */}
      {isLoadingSuppliers ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-procarni-secondary" />
          <p className="text-gray-400 font-medium animate-pulse">Buscando los mejores proveedores...</p>
        </div>
      ) : (selectedMaterial || selectedCategory) ? (
        suppliers.length > 0 ? (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between px-1 gap-4">
              <h3 className="text-sm font-bold uppercase tracking-widest text-gray-400">
                Proveedores Disponibles ({filteredSuppliers.length})
              </h3>

              <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
                <Input
                  placeholder="Filtrar por rubro o palabra clave..."
                  value={rubroFilter}
                  onChange={(e) => setRubroFilter(e.target.value)}
                  className="h-9 w-full sm:w-56 text-xs border-gray-200"
                />

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportPDF}
                  className="h-9 border-gray-200 text-gray-700 hover:text-procarni-primary hover:bg-slate-50 transition-all flex items-center gap-2 w-full sm:w-auto shrink-0"
                >
                  <FileText className="h-4 w-4 text-procarni-primary" />
                  <span>Exportar PDF</span>
                </Button>

                {availableCities.length > 0 && (
                  <div className="w-full sm:w-48 shrink-0">
                    <Select value={selectedCity} onValueChange={setSelectedCity}>
                      <SelectTrigger className="h-9">
                        <div className="flex items-center gap-2 text-gray-600">
                          <MapPin className="h-4 w-4" />
                          <SelectValue placeholder="Filtrar por ciudad" />
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas las ciudades</SelectItem>
                        {availableCities.map(city => (
                          <SelectItem key={city} value={city}>{city}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-12">
              {filteredSuppliers.map((supplier) => (
                <Card
                  key={supplier.id}
                  className="group hover:shadow-lg hover:shadow-gray-200/50 transition-all duration-300 border-gray-100 flex flex-col"
                >
                  <CardHeader className="pb-3 border-b border-gray-50 bg-gray-50/50 group-hover:bg-white transition-colors duration-300">
                    <div className="flex justify-between items-start gap-2">
                      <div className="space-y-1">
                        <CardTitle className="text-lg font-bold text-procarni-dark leading-tight line-clamp-1">
                          {supplier.name}
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={cn("text-[9px] font-mono uppercase tracking-tighter border-gray-200 bg-white", isGenericRif(supplier.rif) ? "text-procarni-alert border-procarni-alert/30" : "text-gray-400")}>
                            RIF: {isGenericRif(supplier.rif) ? (
                              <span className="flex items-center">
                                <AlertTriangle className="mr-1 h-2.5 w-2.5" /> Faltante
                              </span>
                            ) : supplier.rif}
                          </Badge>
                          {supplier.status === 'Activo' && (
                            <Badge className="bg-green-50 text-procarni-secondary border-green-200 text-[9px] uppercase font-bold shadow-none">
                              {supplier.status}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity rounded-full hover:bg-procarni-primary/5 hover:text-procarni-primary"
                        onClick={() => handleViewSupplierDetails(supplier)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>

                  <CardContent className="pt-5 pb-6 flex-1">
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div className="space-y-3">
                          <span className={microLabelClass}>Contacto</span>
                          <div className="space-y-2">
                            {supplier.phone && (
                              <a
                                href={`https://wa.me/${formatPhoneNumberForWhatsApp(supplier.phone)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 text-[13px] text-gray-600 hover:text-procarni-secondary transition-colors"
                              >
                                <Phone className="h-3.5 w-3.5 text-gray-300" />
                                <span className="truncate">{supplier.phone}</span>
                              </a>
                            )}
                            {supplier.email && (
                              <div className="flex items-center gap-2 text-[13px] text-gray-600 truncate">
                                <Mail className="h-3.5 w-3.5 text-gray-300 shrink-0" />
                                <span className="truncate" title={supplier.email}>{supplier.email}</span>
                              </div>
                            )}
                            {supplier.instagram && (
                              <a
                                href={`https://instagram.com/${supplier.instagram.replace('@', '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 text-[13px] text-gray-600 hover:text-blue-500 transition-colors"
                              >
                                <Instagram className="h-3.5 w-3.5 text-gray-300" />
                                <span className="truncate">{supplier.instagram}</span>
                              </a>
                            )}
                            {supplier.city && (
                              <div className="flex items-center gap-2 text-[13px] text-gray-600 truncate">
                                <MapPin className="h-3.5 w-3.5 text-procarni-secondary shrink-0" />
                                <span className="truncate font-medium">{supplier.city}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <span className={microLabelClass}>Rubros</span>
                          <p className="text-[13px] text-gray-500 italic line-clamp-2 leading-relaxed">
                            {[supplier.rubros, supplier.specification].filter(Boolean).join(' / ') || 'Sin rubros definidos'}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="space-y-3">
                          <span className={microLabelClass}>Condiciones</span>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-[13px] text-gray-600">
                              <CreditCard className="h-3.5 w-3.5 text-gray-300 shrink-0" />
                              <span>{supplier.payment_terms || 'No especificado'}</span>
                            </div>
                            <div className="flex items-center gap-2 text-[13px] text-gray-600">
                              <Clock className="h-3.5 w-3.5 text-gray-300 shrink-0" />
                              <span>{supplier.credit_days !== undefined && supplier.credit_days !== null ? `${supplier.credit_days} días crédito` : 'Sin días de crédito'}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>

                  <CardFooter className="pt-0 pb-4 px-4 bg-gray-50/30 group-hover:bg-transparent transition-colors duration-300">
                    <Button
                      className="w-full bg-procarni-secondary hover:bg-green-700 text-white shadow-sm border-none group/btn transition-all duration-300 h-10"
                      onClick={() => handleCreateQuoteRequest(supplier)}
                    >
                      <PlusCircle className="mr-2 h-4 w-4 transition-transform group-hover/btn:scale-110" />
                      Generar Solicitud (SC)
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 gap-4 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-100">
            <div className="bg-white p-4 rounded-full shadow-sm text-gray-300">
              <Search className="h-10 w-10" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-gray-800 font-bold">Sin proveedores vinculados</h3>
              <p className="text-sm text-gray-400 max-w-[280px]">
                No hemos encontrado proveedores que ofrezcan {selectedMaterial ? `"${selectedMaterial.name}"` : `artículos de la categoría "${selectedCategory}"`} actualmente.
              </p>
            </div>
            <Button 
              variant="outline" 
              className="mt-2 text-procarni-primary bg-white border-gray-200" 
              onClick={() => {
                setSelectedMaterial(null);
                setSelectedCategory(null);
                setSuppliers([]);
              }}
            >
              Probar con otro material o categoría
            </Button>
          </div>
        )
      ) : (
        <div className="flex flex-col items-center justify-center py-32 gap-6">
          <div className="relative">
            <div className="absolute inset-0 bg-procarni-primary/10 rounded-full blur-3xl animate-pulse"></div>
            <div className="relative bg-white p-6 rounded-full shadow-xl shadow-gray-200/50">
              <Building2 className="h-16 w-16 text-procarni-primary/20" />
              <Search className="absolute bottom-2 right-2 h-8 w-8 text-procarni-secondary bg-white p-1 rounded-full shadow-md" />
            </div>
          </div>
          <div className="text-center space-y-2">
            <h3 className="text-2xl font-bold text-procarni-dark">Comienza tu búsqueda</h3>
            <p className="text-gray-400 max-w-[400px]">
              Ingresa el nombre o código del producto o categoría que necesitas para listar los proveedores recomendados.
            </p>
          </div>
        </div>
      )}


    </div>
  );
};

export default SearchSuppliersByMaterial;