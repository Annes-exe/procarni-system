import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Phone, Instagram, PlusCircle, ShoppingCart, FileText, MoreVertical, Check, DollarSign, Edit } from 'lucide-react';
import { MadeWithDyad } from '@/components/made-with-dyad';
import { getSupplierDetails, getFichaTecnicaBySupplierAndProduct, updateSupplier } from '@/integrations/supabase/data';
import { showError, showSuccess } from '@/utils/toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
  payment_terms: string;
  custom_payment_terms?: string | null;
  credit_days: number;
  status: string;
  user_id: string;
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
      <div className="container mx-auto p-4 text-center text-muted-foreground">
        Cargando detalles del proveedor...
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

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-2 -mt-2 flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground pl-0">
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" className={cn(isMobile ? 'w-10 h-10 p-0' : '')}>
              <MoreVertical className={cn("h-4 w-4", !isMobile && "mr-2")} />
              {!isMobile && 'Acciones'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>Opciones de Proveedor</DropdownMenuLabel>
            <DropdownMenuSeparator />

            {/* 1. Generar SC */}
            <DropdownMenuItem onSelect={handleGenerateSC} className="cursor-pointer text-procarni-secondary focus:text-green-700">
              <PlusCircle className="mr-2 h-4 w-4" /> Generar Solicitud (SC)
            </DropdownMenuItem>

            {/* 2. Generar OC */}
            <DropdownMenuItem onSelect={handleGenerateOC} className="cursor-pointer text-blue-600 focus:text-blue-700">
              <ShoppingCart className="mr-2 h-4 w-4" /> Generar Orden (OC)
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            {/* 3. Editar Proveedor */}
            <DropdownMenuItem onSelect={() => setIsEditOpen(true)} className="cursor-pointer">
              <Edit className="mr-2 h-4 w-4" /> Editar Proveedor
            </DropdownMenuItem>

            {/* 4. Historial de Precios (Download Button as DropdownMenuItem) */}
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

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-procarni-primary">{supplier.name}</CardTitle>
          <CardDescription>Detalles completos del proveedor.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <p><strong>Código:</strong> {supplier.code || 'N/A'}</p>
            <p><strong>RIF:</strong> {supplier.rif}</p>
            <p><strong>Email:</strong> {supplier.email || 'N/A'}</p>
            <p>
              <strong>Teléfono Principal:</strong>{' '}
              {supplier.phone ? (
                <a href={`https://wa.me/${formatPhoneNumberForWhatsApp(supplier.phone)}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center">
                  {supplier.phone} <Phone className="ml-1 h-3 w-3" />
                </a>
              ) : 'N/A'}
            </p>
            <p>
              <strong>Teléfono Secundario:</strong>{' '}
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
            <p className="md:col-span-2"><strong>Dirección:</strong> {supplier.address || 'N/A'}</p>
            <p>
              <strong>Términos de Pago:</strong>{' '}
              {supplier.payment_terms === 'Otro' && supplier.custom_payment_terms
                ? supplier.custom_payment_terms
                : supplier.payment_terms}
            </p>
            <p><strong>Días de Crédito:</strong> {supplier.credit_days}</p>
            <p><strong>Estado:</strong> {supplier.status}</p>
          </div>

          <h3 className="text-lg font-semibold mt-8 mb-4">Materiales Ofrecidos</h3>
          {supplier.materials && supplier.materials.length > 0 ? (
            isMobile ? (
              <div className="space-y-3">
                {supplier.materials.map((sm, index) => {
                  const { data: hasFicha, isLoading: isLoadingFicha } = fichaStatusResults[index];

                  return (
                    <Card key={sm.id || index} className="p-3">
                      <p className="font-semibold text-procarni-primary">{sm.materials.name}</p>
                      <div className="text-sm mt-1 space-y-0.5">
                        <p><strong>Código:</strong> {sm.materials.code || 'N/A'}</p>
                        <p><strong>Categoría:</strong> {sm.materials.category || 'N/A'}</p>
                        <p><strong>Especificación:</strong> {sm.specification || 'N/A'}</p>
                      </div>
                      <div className="mt-3 flex justify-end">
                        {isLoadingFicha ? (
                          <span className="text-sm text-muted-foreground">Cargando estado...</span>
                        ) : hasFicha ? (
                          <Button variant="outline" size="sm" onClick={() => handleViewFicha(sm.materials.name)}>
                            <FileText className="mr-2 h-4 w-4" />
                            Ver Ficha Técnica
                          </Button>
                        ) : (
                          <span className="text-sm text-muted-foreground">Sin Ficha Técnica</span>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Nombre del Material</TableHead>
                      <TableHead>Categoría</TableHead>
                      <TableHead>Especificación del Proveedor</TableHead>
                      <TableHead className="text-right">Ficha Técnica</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {supplier.materials.map((sm, index) => {
                      const { data: hasFicha, isLoading: isLoadingFicha } = fichaStatusResults[index];

                      return (
                        <TableRow key={sm.id || index}>
                          <TableCell>{sm.materials.code || 'N/A'}</TableCell>
                          <TableCell>{sm.materials.name}</TableCell>
                          <TableCell>{sm.materials.category || 'N/A'}</TableCell>
                          <TableCell>{sm.specification || 'N/A'}</TableCell>
                          <TableCell className="text-right">
                            {isLoadingFicha ? (
                              <span className="text-xs text-muted-foreground">Cargando...</span>
                            ) : hasFicha ? (
                              <Button variant="ghost" size="icon" onClick={() => handleViewFicha(sm.materials.name)} title="Ver Ficha Técnica">
                                <FileText className="h-4 w-4 text-procarni-primary" />
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">N/A</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )
          ) : (
            <p className="text-muted-foreground">Este proveedor no tiene materiales registrados.</p>
          )}
        </CardContent>
      </Card>
      <MadeWithDyad />

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
    </div>
  );
};

export default SupplierDetails;