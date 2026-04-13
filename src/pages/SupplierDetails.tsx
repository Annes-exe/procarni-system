import React, { useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Phone, Instagram, PlusCircle, ShoppingCart, FileText, MoreVertical, Check, DollarSign, Edit, Mail, Globe, MapPin, CreditCard, Calendar, Loader2, Search } from 'lucide-react';

import { getSupplierDetails, getFichaTecnicaBySupplierAndProduct, updateSupplier } from '@/integrations/supabase/data';
import { showError, showSuccess } from '@/utils/toast';
import { isGenericRif } from '@/utils/validators';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info, TriangleAlert } from 'lucide-react';
import { FichaTecnica, Supplier } from '@/integrations/supabase/types'; // Import Supplier type
import { useIsMobile } from '@/hooks/use-mobile';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import SupplierPriceHistoryDownloadButton from '@/components/SupplierPriceHistoryDownloadButton';
import SupplierForm from '@/components/SupplierForm'; // Import SupplierForm
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

interface MaterialAssociation {
  id: string; // ID of supplier_materials entry
  material_id: string;
  specification?: string;
  materials: {
    id: string;
    name: string;
    code?: string;
    category?: string;
  };
}

interface SupplierDetailsData {
  id: string;
  code?: string;
  rif: string;
  name: string;
  email?: string;
  phone?: string;
  phone_2?: string;
  instagram?: string;
  address?: string;
  city?: string | null;
  state?: string | null;
  payment_terms: string;
  custom_payment_terms?: string | null;
  credit_days: number;
  status: string;
  user_id: string;
  alert_comment: string | null;
  materials?: MaterialAssociation[];
}

const SupplierDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [currentFichaUrl, setCurrentFichaUrl] = useState('');
  const [currentFichaTitle, setCurrentFichaTitle] = useState('');
  const [isEditOpen, setIsEditOpen] = useState(false); // New state for edit dialog
  const [searchTerm, setSearchTerm] = useState('');

  const { data: supplier, isLoading, error } = useQuery<SupplierDetailsData | null>({
    queryKey: ['supplierDetails', id],
    queryFn: async () => {
      if (!id) throw new Error('Supplier ID is missing.');
      const details = await getSupplierDetails(id);
      if (!details) throw new Error('Supplier not found.');
      return details as SupplierDetailsData;
    },
    enabled: !!id,
  });

  // --- Fetch Ficha Tecnica Status for all materials using useQueries ---
  const materialQueries = supplier?.materials?.map(sm => ({
    queryKey: ['fichaTecnicaStatus', supplier.id, sm.materials.name],
    queryFn: () => getFichaTecnicaBySupplierAndProduct(supplier.id, sm.materials.name),
    select: (data: FichaTecnica | null) => !!data, // Transform result to boolean (hasFicha)
    enabled: !!supplier.id && !!sm.materials.name,
    staleTime: 1000 * 60 * 5,
  })) || [];

  const fichaStatusResults = useQueries({ queries: materialQueries });
  const isLoadingFichaStatus = fichaStatusResults.some(result => result.isLoading);

  // Combine materials with their ficha status to survive filtering
  const materialsWithStatus = useMemo(() => {
    if (!supplier?.materials) return [];
    return supplier.materials.map((sm, index) => ({
      ...sm,
      hasFichaResult: fichaStatusResults[index]?.data as boolean,
      isLoadingFicha: fichaStatusResults[index]?.isLoading
    }));
  }, [supplier?.materials, fichaStatusResults]);

  const filteredMaterials = useMemo(() => {
    if (!materialsWithStatus) return [];
    if (!searchTerm.trim()) return materialsWithStatus;

    const lowerSearch = searchTerm.toLowerCase();
    return materialsWithStatus.filter(sm =>
      sm.materials.name.toLowerCase().includes(lowerSearch) ||
      sm.materials.code?.toLowerCase().includes(lowerSearch) ||
      sm.materials.category?.toLowerCase().includes(lowerSearch)
    );
  }, [materialsWithStatus, searchTerm]);
  // --------------------------------------------------------------------

  // Mutation for updating supplier
  const updateMutation = useMutation({
    mutationFn: ({ id, supplierData, materials }: { id: string; supplierData: Partial<Omit<Supplier, 'id' | 'created_at' | 'updated_at' | 'materials'>>; materials: Array<{ material_id: string; specification?: string }> }) =>
      updateSupplier(id, supplierData, materials),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplierDetails', id] });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] }); // Also update list
      setIsEditOpen(false);
      showSuccess('Proveedor actualizado exitosamente.');
    },
    onError: (err) => {
      showError(`Error al actualizar proveedor: ${err.message}`);
    },
  });

  const handleEditSubmit = async (data: any) => {
    if (!supplier) return;

    const { materials, ...supplierData } = data;
    const materialsPayload = materials?.map((mat: any) => ({
      material_id: mat.material_id,
      specification: mat.specification,
    })) || [];

    await updateMutation.mutateAsync({ id: supplier.id, supplierData, materials: materialsPayload });
  };


  const formatPhoneNumberForWhatsApp = (phone: string) => {
    const digitsOnly = phone.replace(/\D/g, '');
    if (!digitsOnly.startsWith('58')) {
      return `58${digitsOnly}`;
    }
    return digitsOnly;
  };

  const handleGenerateSC = () => {
    if (!supplier) return;
    // Navigate to the quote request creation page with the supplier data
    navigate('/generate-quote', {
      state: {
        supplier: supplier,
      },
    });
  };

  const handleGenerateOC = () => {
    if (!supplier) return;
    // Navigate to the purchase order creation page with the supplier data
    navigate('/generate-po', {
      state: {
        supplier: supplier,
      },
    });
  };

  const handleViewFicha = async (materialName: string) => {
    if (!supplier?.id) {
      showError('ID de proveedor no disponible.');
      return;
    }

    const ficha: FichaTecnica | null = await getFichaTecnicaBySupplierAndProduct(supplier.id, materialName);

    if (ficha && ficha.storage_url) {
      setCurrentFichaUrl(ficha.storage_url);
      setCurrentFichaTitle(`Ficha Técnica: ${materialName}`);
      setIsViewerOpen(true);
    } else {
      // This case should ideally not be reached if the button is only shown when hasFicha is true
      showError(`No se encontró una ficha técnica para el material "${materialName}" de este proveedor.`);
    }
  };

  if (isLoading || isLoadingFichaStatus) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-procarni-secondary" />
        <span className="ml-2 text-gray-500 font-medium">Cargando detalles del proveedor...</span>
      </div>
    );
  }

  if (error) {
    showError(error.message);
    return (
      <div className="container mx-auto p-4 text-center text-destructive">
        Error: {error.message}
        <Button asChild variant="link" className="mt-4">
          <Link to="/supplier-management">Volver a la gestión de proveedores</Link>
        </Button>
      </div>
    );
  }

  if (!supplier) {
    return (
      <div className="container mx-auto p-4 text-center text-muted-foreground">
        Proveedor no encontrado.
        <Button asChild variant="link" className="mt-4">
          <Link to="/supplier-management">Volver a la gestión de proveedores</Link>
        </Button>
      </div>
    );
  }

  const isEditable = true;

  const microLabelClass = "text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-1 block";
  const tableHeaderClass = "text-[10px] uppercase tracking-wider font-semibold text-gray-500";
  const valueClass = "text-procarni-dark font-medium text-sm";

  return (
    <div className="container mx-auto p-4 pb-24 relative min-h-screen">

      {/* PHASE 1: STICKY HEADER & ACTIONS */}
      <div className="relative md:sticky md:top-0 z-20 backdrop-blur-md bg-white/90 border-b border-gray-200 pb-3 pt-4 mb-8 -mx-4 px-4 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-all duration-200">

        {/* Title & Status */}
        <div className="flex flex-col gap-1 w-full md:w-auto">
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-gray-400 hover:text-procarni-dark hover:bg-gray-100 rounded-full h-8 w-8 -ml-2 mr-1">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold text-procarni-dark tracking-tight">
              {supplier.name}
            </h1>
            <Badge className={cn(
              "ml-2 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider shadow-none border",
              supplier.status === 'Activo' ? "bg-green-50 text-procarni-secondary border-green-200" : "bg-gray-50 text-gray-500 border-gray-200"
            )}>
              {supplier.status}
            </Badge>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          <div className="flex items-center gap-2 ml-auto">
            {/* Primary Actions */}
            <Button onClick={() => setIsEditOpen(true)} variant="outline" size="sm" className="gap-2">
              <Edit className="h-4 w-4" />
              <span className="hidden sm:inline">Editar</span>
            </Button>

            <Button onClick={handleGenerateSC} className="bg-procarni-secondary hover:bg-green-700 text-white gap-2 shadow-sm" size="sm">
              <PlusCircle className="h-4 w-4" />
              <span className="hidden sm:inline">Generar SC</span>
            </Button>

            {/* Secondary Actions: Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <MoreVertical className="h-4 w-4" />
                  <span className="hidden sm:inline">Más</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Opciones</DropdownMenuLabel>
                <DropdownMenuSeparator />

                <DropdownMenuItem onSelect={handleGenerateOC} className="cursor-pointer text-blue-600 focus:text-blue-700">
                  <ShoppingCart className="mr-2 h-4 w-4" /> Generar Orden (OC)
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem asChild>
                  <SupplierPriceHistoryDownloadButton
                    supplierId={supplier.id}
                    supplierName={supplier.name}
                    disabled={isLoading}
                    asChild
                  />
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* PHASE 1.5: SUPPLIER ALERT */}
      {supplier.alert_comment && (
        <Alert variant="destructive" className="mb-6 bg-red-50 border-red-200 text-red-900 animate-in fade-in slide-in-from-top-4 duration-500 shadow-sm">
          <TriangleAlert className="h-4 w-4 text-red-600" />
          <AlertTitle className="text-red-800 font-bold flex items-center gap-2">
            Aviso Importante para este Proveedor
          </AlertTitle>
          <AlertDescription className="text-red-700 font-medium mt-1 leading-relaxed">
            {supplier.alert_comment}
          </AlertDescription>
        </Alert>
      )}

      {/* PHASE 2: GENERAL INFORMATION GRID */}
      <div className="mb-10 animate-in fade-in slide-in-from-bottom-2 duration-500">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 px-1">
          {/* Code */}
          <div className="space-y-1">
            <span className={microLabelClass}>Código</span>
            <p className={valueClass}>{supplier.code || 'N/A'}</p>
          </div>

          {/* RIF */}
          <div className="space-y-1">
            <span className={microLabelClass}>RIF</span>
            <p className={cn(valueClass, isGenericRif(supplier.rif) && "text-procarni-alert flex items-center")}>
              {isGenericRif(supplier.rif) ? (
                <>
                  <TriangleAlert className="mr-1 h-3 w-3" /> Faltante
                </>
              ) : supplier.rif}
            </p>
          </div>

          {/* Email */}
          <div className="space-y-1">
            <span className={microLabelClass}>Email</span>
            <p className={cn(valueClass, "truncate max-w-full")}>{supplier.email || 'N/A'}</p>
          </div>

          {/* Phone */}
          <div className="space-y-1">
            <span className={microLabelClass}>Teléfono</span>
            {supplier.phone ? (
              <a href={`https://wa.me/${formatPhoneNumberForWhatsApp(supplier.phone)}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center text-sm font-medium">
                {supplier.phone} <Phone className="ml-1.5 h-3 w-3" />
              </a>
            ) : <p className={valueClass}>N/A</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-10">
          {/* Contact Section */}
          <div className="space-y-6">
            <h4 className="text-[11px] font-bold uppercase tracking-[0.2em] text-gray-400 border-b border-gray-100 pb-2">Contacto Adicional</h4>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Phone className="h-4 w-4 text-gray-400 mt-0.5" />
                <div>
                  <span className={microLabelClass}>Teléfono Secundario</span>
                  {supplier.phone_2 ? (
                    <a href={`https://wa.me/${formatPhoneNumberForWhatsApp(supplier.phone_2)}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm font-medium">
                      {supplier.phone_2}
                    </a>
                  ) : <p className={valueClass}>N/A</p>}
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Instagram className="h-4 w-4 text-gray-400 mt-0.5" />
                <div>
                  <span className={microLabelClass}>Instagram</span>
                  {supplier.instagram ? (
                    <a href={`https://instagram.com/${supplier.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm font-medium">
                      {supplier.instagram}
                    </a>
                  ) : <p className={valueClass}>N/A</p>}
                </div>
              </div>
            </div>
          </div>

          {/* Terms Section */}
          <div className="space-y-6">
            <h4 className="text-[11px] font-bold uppercase tracking-[0.2em] text-gray-400 border-b border-gray-100 pb-2">Condiciones</h4>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <CreditCard className="h-4 w-4 text-gray-400 mt-0.5" />
                <div>
                  <span className={microLabelClass}>Términos de Pago</span>
                  <p className={valueClass}>
                    {supplier.payment_terms === 'Otro' && supplier.custom_payment_terms
                      ? supplier.custom_payment_terms
                      : supplier.payment_terms}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Calendar className="h-4 w-4 text-gray-400 mt-0.5" />
                <div>
                  <span className={microLabelClass}>Días de Crédito</span>
                  <p className={valueClass}>{supplier.credit_days} días</p>
                </div>
              </div>
            </div>
          </div>

          {/* Address Section */}
          <div className="space-y-6">
            <h4 className="text-[11px] font-bold uppercase tracking-[0.2em] text-gray-400 border-b border-gray-100 pb-2">Ubicación</h4>
            <div className="flex items-start gap-3">
              <MapPin className="h-4 w-4 text-gray-400 mt-0.5" />
              <div>
                <span className={microLabelClass}>Dirección Fiscal</span>
                <p className="text-gray-600 text-sm leading-relaxed mb-2">{supplier.address || 'N/A'}</p>
                
                {(supplier.city || supplier.state) && (
                  <div className="flex flex-wrap gap-2">
                    <div className="bg-gray-50 border border-gray-100 px-2 py-0.5 rounded text-[11px] text-gray-600">
                      <span className="font-semibold text-gray-400 mr-1">Ubicación:</span> {supplier.city}{supplier.city && supplier.state ? ', ' : ''}{supplier.state}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* PHASE 3: MATERIALS CARD */}
      <Card className="mb-8 border-gray-200 shadow-sm overflow-hidden">
        <CardHeader className="bg-gray-50/50 pb-4 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle className="text-sm font-bold uppercase tracking-wide text-gray-800 flex items-center">
              Materiales Ofrecidos
            </CardTitle>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Buscar material..."
                className="pl-8 h-9 text-xs bg-white border-gray-200"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {supplier.materials && supplier.materials.length > 0 ? (
            isMobile ? (
              <div className="divide-y divide-gray-100">
                {filteredMaterials.length > 0 ? (
                  filteredMaterials.map((sm, index) => (
                    <div key={sm.id || index} className="p-4 bg-white">
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-semibold text-procarni-dark">{sm.materials.name}</span>
                        {sm.isLoadingFicha ? (
                          <span className="text-[10px] text-gray-400 italic">Cargando...</span>
                        ) : sm.hasFichaResult ? (
                          <Button variant="ghost" size="icon" onClick={() => handleViewFicha(sm.materials.name)} className="h-6 w-6">
                            <FileText className="h-3.5 w-3.5 text-procarni-secondary" />
                          </Button>
                        ) : null}
                      </div>
                      <div className="grid grid-cols-2 gap-y-2 text-xs text-gray-500">
                        <div>
                          <span className="text-[10px] uppercase text-gray-400 block">Código</span>
                          {sm.materials.code || 'N/A'}
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] uppercase text-gray-400 block">Categoría</span>
                          {sm.materials.category || 'N/A'}
                        </div>
                        <div className="col-span-2 pt-1 border-t border-gray-50 mt-1">
                          <span className="text-[10px] uppercase text-gray-400 block">Especificación</span>
                          <span className="italic">{sm.specification || 'N/A'}</span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-gray-400 italic">
                    No se encontraron materiales que coincidan con la búsqueda.
                  </div>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-gray-50/80">
                  <TableRow className="border-b border-gray-100 hover:bg-transparent">
                    <TableHead className={tableHeaderClass + " h-9 py-2 pl-6"}>Código</TableHead>
                    <TableHead className={tableHeaderClass + " h-9 py-2"}>Nombre del Material</TableHead>
                    <TableHead className={tableHeaderClass + " h-9 py-2"}>Categoría</TableHead>
                    <TableHead className={tableHeaderClass + " h-9 py-2"}>Especificación</TableHead>
                    <TableHead className={tableHeaderClass + " h-9 py-2 text-center pr-6"}>Ficha técnica</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMaterials.length > 0 ? (
                    filteredMaterials.map((sm, index) => (
                      <TableRow key={sm.id || index} className="border-b border-gray-50 hover:bg-gray-50/30">
                        <TableCell className="pl-6 font-mono text-[13px] text-gray-500">{sm.materials.code || 'N/A'}</TableCell>
                        <TableCell className="font-medium text-procarni-dark">{sm.materials.name}</TableCell>
                        <TableCell className="text-gray-500">{sm.materials.category || 'N/A'}</TableCell>
                        <TableCell className="text-gray-500 italic text-sm truncate max-w-[200px]">{sm.specification || 'N/A'}</TableCell>
                        <TableCell className="text-center pr-6">
                          {sm.isLoadingFicha ? (
                            <span className="text-[10px] text-gray-400">...</span>
                          ) : sm.hasFichaResult ? (
                            <Button variant="ghost" size="icon" onClick={() => handleViewFicha(sm.materials.name)} className="hover:bg-green-50 rounded-full">
                              <FileText className="h-4 w-4 text-procarni-secondary" />
                            </Button>
                          ) : (
                            <span className="text-[10px] text-gray-300">N/A</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center text-gray-400 italic">
                        No se encontraron materiales que coincidan con la búsqueda.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )
          ) : (
            <div className="p-8 text-center text-gray-400 italic">
              Este proveedor no tiene materiales registrados.
            </div>
          )}
        </CardContent>
      </Card>


      <Dialog open={isViewerOpen} onOpenChange={setIsViewerOpen}>
        <DialogContent className="max-w-5xl h-[95vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{currentFichaTitle}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {currentFichaUrl ? (
              <iframe src={currentFichaUrl} className="w-full h-full border-none" title="PDF Viewer"></iframe>
            ) : (
              <div className="text-center text-destructive">No se pudo cargar el documento.</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* NEW EDIT DIALOG */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[425px] md:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Proveedor</DialogTitle>
          </DialogHeader>
          <SupplierForm
            initialData={supplier as any}
            onSubmit={handleEditSubmit}
            onCancel={() => setIsEditOpen(false)}
            isSubmitting={updateMutation.isPending}
          />
        </DialogContent>
      </Dialog>
    </div >
  );
};

export default SupplierDetails;