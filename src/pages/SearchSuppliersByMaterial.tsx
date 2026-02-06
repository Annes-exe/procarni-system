import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { MadeWithDyad } from '@/components/made-with-dyad';
import SmartSearch from '@/components/SmartSearch';
import { searchMaterials, getSuppliersByMaterial } from '@/integrations/supabase/data';
import { showError } from '@/utils/toast';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Phone, Instagram, PlusCircle, Eye, ArrowLeft, Tag, MapPin, Clock, DollarSign } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

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
}

const SearchSuppliersByMaterial = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isMobile = useIsMobile();
  
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierResult[]>([]);
  const [isLoadingSuppliers, setIsLoadingSuppliers] = useState(false);
  const [initialQuery, setInitialQuery] = useState<string | null>(null);

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
    try {
      const fetchedSuppliers = await getSuppliersByMaterial(materialId);
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

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-4">
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver
        </Button>
      </div>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-procarni-primary">Buscar Proveedores por Material</CardTitle>
          <CardDescription>Encuentra proveedores que ofrecen un material específico.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-6 p-4 border rounded-lg bg-muted/50">
            <h3 className="text-md font-semibold mb-2">Selección de Material</h3>
            <SmartSearch
              placeholder="Buscar material por nombre o código"
              onSelect={handleMaterialSelect}
              fetchFunction={searchMaterials}
              displayValue={selectedMaterial?.name || initialQuery || ''} 
              selectedId={selectedMaterial?.id}
            />
            {selectedMaterial && (
              <div className="mt-3 text-sm space-y-1">
                <p className="font-semibold text-procarni-primary flex items-center">
                  <Tag className="mr-2 h-4 w-4 text-procarni-primary" />
                  {selectedMaterial.name} ({selectedMaterial.code})
                </p>
                {selectedMaterial.category && (
                  <p className="text-muted-foreground flex items-center">
                    <MapPin className="mr-2 h-4 w-4" /> Categoría: {selectedMaterial.category}
                  </p>
                )}
              </div>
            )}
          </div>

          {isLoadingSuppliers && (
            <div className="text-center text-muted-foreground">Cargando proveedores...</div>
          )}

          {!isLoadingSuppliers && selectedMaterial && suppliers.length === 0 && (
            <div className="text-center text-muted-foreground">No se encontraron proveedores para este material.</div>
          )}

          {!isLoadingSuppliers && suppliers.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-4">Proveedores que ofrecen "{selectedMaterial?.name}" ({suppliers.length})</h3>
              <Accordion type="single" collapsible className="w-full">
                {suppliers.map((supplier) => (
                  <AccordionItem key={supplier.id} value={supplier.id} className="border-b">
                    <AccordionTrigger className="text-left hover:bg-gray-50 dark:hover:bg-gray-800 rounded-t-lg">
                      <div className="flex flex-col items-start py-1">
                        <span className="font-bold text-lg text-gray-800 dark:text-white">{supplier.name}</span>
                        <span className="text-sm text-muted-foreground">RIF: {supplier.rif} | Cód: {supplier.code || 'N/A'}</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="p-4 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div className="space-y-1">
                          <p className="font-semibold text-procarni-primary">Contacto</p>
                          <p><strong>Email:</strong> {supplier.email || 'N/A'}</p>
                          <p>
                            <strong>Teléfono 1:</strong>{' '}
                            {supplier.phone ? (
                              <a href={`https://wa.me/${formatPhoneNumberForWhatsApp(supplier.phone)}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center">
                                {supplier.phone} <Phone className="ml-1 h-3 w-3" />
                              </a>
                            ) : 'N/A'}
                          </p>
                          <p>
                            <strong>Teléfono 2:</strong>{' '}
                            {supplier.phone_2 ? (
                              <a href={`https://wa.me/${formatPhoneNumberForWhatsApp(supplier.phone_2)}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center">
                                {supplier.phone_2} <Phone className="ml-1 h-3 w-3" />
                              </a>
                            ) : 'N/A'}
                          </p>
                          <p>
                            <strong>Instagram:</strong>{' '}
                            {supplier.instagram ? (
                              <a href={`https://instagram.com/${supplier.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center">
                                {supplier.instagram} <Instagram className="ml-1 h-3 w-3" />
                              </a>
                            ) : 'N/A'}
                          </p>
                        </div>
                        
                        <div className="space-y-1">
                          <p className="font-semibold text-procarni-primary">Condiciones</p>
                          <p className="flex items-center">
                            <DollarSign className="mr-2 h-4 w-4 text-procarni-secondary" />
                            <strong>Términos de Pago:</strong> {supplier.payment_terms}
                          </p>
                          <p className="flex items-center">
                            <Clock className="mr-2 h-4 w-4 text-procarni-secondary" />
                            <strong>Días de Crédito:</strong> {supplier.credit_days}
                          </p>
                          <p><strong>Estado:</strong> {supplier.status}</p>
                        </div>

                        <div className="space-y-1 md:col-span-1">
                          <p className="font-semibold text-procarni-primary">Material</p>
                          <p><strong>Especificación:</strong> {supplier.specification || 'N/A'}</p>
                        </div>
                      </div>
                      
                      <Separator className="my-4" />

                      <div className={cn("flex justify-end gap-2", isMobile && "flex-col")}>
                        <Button 
                          variant="outline" 
                          className={cn("bg-procarni-secondary text-white hover:bg-green-700 hover:text-white", isMobile && "w-full")}
                          onClick={() => handleCreateQuoteRequest(supplier)}
                        >
                          <PlusCircle className="mr-2 h-4 w-4" /> 
                          {isMobile ? 'Crear SC' : 'Crear Solicitud de Cotización'}
                        </Button>
                        <Button 
                          variant="outline" 
                          className={cn("bg-procarni-primary text-white hover:bg-procarni-primary/90 hover:text-white", isMobile && "w-full")}
                          onClick={() => handleViewSupplierDetails(supplier)}
                        >
                          <Eye className={cn(isMobile ? "h-4 w-4" : "mr-2 h-4 w-4")} /> 
                          {!isMobile && 'Ver Detalles'}
                        </Button>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          )}
        </CardContent>
      </Card>
      <MadeWithDyad />
    </div>
  );
};

export default SearchSuppliersByMaterial;