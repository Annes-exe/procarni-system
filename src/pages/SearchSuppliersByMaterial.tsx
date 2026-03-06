import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

import SmartSearch from '@/components/SmartSearch';
import { searchMaterials, searchSuppliersByMaterial } from '@/integrations/supabase/data';
import { showError } from '@/utils/toast';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Phone, Instagram, PlusCircle, Eye, ArrowLeft, Tag, MapPin, Clock, DollarSign,
  X, Search, Building2, CreditCard, Mail, Globe, Info, Package, Loader2
} from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
}

const SearchSuppliersByMaterial = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isMobile = useIsMobile();

  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierResult[]>([]);
  const [isLoadingSuppliers, setIsLoadingSuppliers] = useState(false);
  const [initialQuery, setInitialQuery] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState<string>('all');

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

  const handleMaterialSelect = async (material: Material) => {
    setSelectedMaterial(material);
    setInitialQuery(null);
    await fetchSuppliers(material.id);
  };

  useEffect(() => {
    const queryFromUrl = searchParams.get('query');
    if (queryFromUrl) {
      setInitialQuery(queryFromUrl);
      const searchAndLoad = async () => {
        try {
          const results = await searchMaterials(queryFromUrl);
          if (results.length > 0) {
            const material = results[0];
            setSelectedMaterial(material);
            await fetchSuppliers(material.id);
          } else {
            showError(`No se encontró un material que coincida con "${queryFromUrl}".`);
          }
        } catch (error) {
          console.error('Error searching material on initial load:', error);
          showError('Error al buscar el material inicial.');
        }
      };
      searchAndLoad();
    }
  }, [searchParams]);

  const handleCreateQuoteRequest = (supplier: SupplierResult) => {
    if (!selectedMaterial) {
      showError('No se ha seleccionado un material.');
      return;
    }
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

  const microLabelClass = "text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-1 block";
  const valueClass = "text-procarni-dark font-medium text-sm";

  const availableCities = Array.from(new Set(suppliers.map(s => s.city).filter(Boolean))).sort() as string[];
  const filteredSuppliers = suppliers.filter(s => selectedCity === 'all' || s.city === selectedCity);

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
              placeholder="¿Qué material buscas?"
              onSelect={handleMaterialSelect}
              fetchFunction={searchMaterials}
              displayValue={selectedMaterial?.name || initialQuery || ''}
              selectedId={selectedMaterial?.id}
            />
            {!selectedMaterial && !initialQuery && (
              <Search className="absolute right-3 top-2.5 h-4 w-4 text-gray-300 pointer-events-none group-focus-within:text-procarni-secondary" />
            )}
            {selectedMaterial && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1 h-7 w-7 text-gray-400 hover:text-red-500 rounded-full"
                onClick={() => {
                  setSelectedMaterial(null);
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

      {/* PHASE 3: RESULTS SECTION */}
      {isLoadingSuppliers ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-procarni-secondary" />
          <p className="text-gray-400 font-medium animate-pulse">Buscando los mejores proveedores...</p>
        </div>
      ) : selectedMaterial ? (
        suppliers.length > 0 ? (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between px-1 gap-4">
              <h3 className="text-sm font-bold uppercase tracking-widest text-gray-400">
                Proveedores Disponibles ({filteredSuppliers.length})
              </h3>

              {availableCities.length > 0 && (
                <div className="w-full sm:w-64">
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
                          <Badge variant="outline" className="text-[9px] font-mono uppercase tracking-tighter text-gray-400 border-gray-200 bg-white">
                            RIF: {supplier.rif}
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
                          <span className={microLabelClass}>Especificación</span>
                          <p className="text-[13px] text-gray-500 italic line-clamp-2 leading-relaxed">
                            {supplier.specification || 'Sin especificación detallada'}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="space-y-3">
                          <span className={microLabelClass}>Condiciones</span>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-[13px] text-gray-600">
                              <CreditCard className="h-3.5 w-3.5 text-gray-300 shrink-0" />
                              <span>{supplier.payment_terms}</span>
                            </div>
                            <div className="flex items-center gap-2 text-[13px] text-gray-600">
                              <Clock className="h-3.5 w-3.5 text-gray-300 shrink-0" />
                              <span>{supplier.credit_days} días crédito</span>
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
              <p className="text-sm text-gray-400 max-w-[280px]">No hemos encontrado proveedores que ofrezcan "{selectedMaterial.name}" actualmente.</p>
            </div>
            <Button variant="outline" className="mt-2 text-procarni-primary bg-white border-gray-200" onClick={() => setSelectedMaterial(null)}>
              Probar con otro material
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
              Ingresa el nombre o código del producto que necesitas para listar los proveedores recomendados.
            </p>
          </div>
        </div>
      )}


    </div>
  );
};

export default SearchSuppliersByMaterial;