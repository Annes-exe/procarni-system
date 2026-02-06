import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { PlusCircle, Edit, Trash2, Search, Phone, Mail, Eye, Loader2, ArrowLeft, Instagram, Filter, Tag, AlertTriangle } from 'lucide-react';
import { MadeWithDyad } from '@/components/made-with-dyad';
import { getAllSuppliers, createSupplier, updateSupplier, deleteSupplier, getSupplierDetails } from '@/integrations/supabase/data';
import { showError, showSuccess } from '@/utils/toast';
import SupplierForm from '@/components/SupplierForm';
import { useSession } from '@/components/SessionContextProvider';
import { Input } from '@/components/ui/input';
import { Link, useNavigate } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'; // Import Select components
import { cn } from '@/lib/utils';

interface MaterialAssociation {
  id?: string;
  material_id: string;
  specification?: string;
  materials?: {
    id: string;
    name: string;
    category?: string;
  };
}

interface Supplier {
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
  materials?: MaterialAssociation[]; // Ensure this is correctly typed
}

interface SupplierFormValues {
  code?: string;
  rif: string;
  name: string;
  email?: string;
  phone?: string;
  phone_2?: string;
  instagram?: string;
  address?: string;
  payment_terms: string;
  custom_payment_terms?: string;
  credit_days: number;
  status: string;
  materials?: Array<{
    material_id: string;
    material_name: string;
    material_category?: string;
    specification?: string;
  }>;
}

const SupplierManagement = () => {
  const queryClient = useQueryClient();
  const { session } = useSession();
  const userId = session?.user?.id;
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<'All' | 'Active' | 'Inactive'>('Active'); // NEW STATE for status filter
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [supplierToDeleteId, setSupplierToDeleteId] = useState<string | null>(null);
  const [isLoadingEditData, setIsLoadingEditData] = useState(false);

  const { data: suppliers, isLoading, error } = useQuery<Supplier[]>({
    queryKey: ['suppliers'],
    queryFn: getAllSuppliers,
    enabled: !!session,
  });

  const filteredSuppliers = useMemo(() => {
    if (!suppliers) return [];
    let currentSuppliers = suppliers;

    // 1. Filter by Status
    if (selectedStatus !== 'All') {
      currentSuppliers = currentSuppliers.filter(supplier => supplier.status === selectedStatus);
    }

    // 2. Filter by Search Term
    if (searchTerm) {
      const lowerCaseSearchTerm = searchTerm.toLowerCase();
      currentSuppliers = currentSuppliers.filter(supplier =>
        supplier.name.toLowerCase().includes(lowerCaseSearchTerm) ||
        supplier.rif.toLowerCase().includes(lowerCaseSearchTerm) ||
        (supplier.email && supplier.email.toLowerCase().includes(lowerCaseSearchTerm))
      );
    }

    return currentSuppliers;
  }, [suppliers, searchTerm, selectedStatus]);

  const createMutation = useMutation({
    mutationFn: ({ supplierData, materials }: { supplierData: Omit<Supplier, 'id' | 'created_at' | 'updated_at' | 'materials'>; materials: Array<{ material_id: string; specification?: string }> }) =>
      createSupplier(supplierData, materials),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setIsFormOpen(false);
      showSuccess('Proveedor creado exitosamente.');
    },
    onError: (err) => {
      showError(`Error al crear proveedor: ${err.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, supplierData, materials }: { id: string; supplierData: Partial<Omit<Supplier, 'id' | 'created_at' | 'updated_at' | 'materials'>>; materials: Array<{ material_id: string; specification?: string }> }) =>
      updateSupplier(id, supplierData, materials),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setIsFormOpen(false);
      setEditingSupplier(null);
      showSuccess('Proveedor actualizado exitosamente.');
    },
    onError: (err) => {
      showError(`Error al actualizar proveedor: ${err.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSupplier,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      showSuccess('Proveedor eliminado exitosamente.');
      setIsDeleteDialogOpen(false);
      setSupplierToDeleteId(null);
    },
    onError: (err) => {
      showError(`Error al eliminar proveedor: ${err.message}`);
      setIsDeleteDialogOpen(false);
      setSupplierToDeleteId(null);
    },
  });

  const handleAddSupplier = () => {
    setEditingSupplier(null);
    setIsFormOpen(true);
  };

  const handleEditSupplier = async (supplierId: string) => {
    setIsLoadingEditData(true);
    try {
      const fullSupplierDetails = await getSupplierDetails(supplierId);
      if (fullSupplierDetails) {
        setEditingSupplier(fullSupplierDetails);
        setIsFormOpen(true);
      } else {
        showError('No se pudieron cargar los detalles completos del proveedor.');
      }
    } catch (err: any) {
      showError(`Error al cargar detalles del proveedor: ${err.message}`);
    } finally {
      setIsLoadingEditData(false);
    }
  };

  const handleViewSupplier = (supplierId: string) => {
    navigate(`/suppliers/${supplierId}`);
  };

  const confirmDeleteSupplier = (id: string) => {
    setSupplierToDeleteId(id);
    setIsDeleteDialogOpen(true);
  };

  const executeDeleteSupplier = async () => {
    if (supplierToDeleteId) {
      await deleteMutation.mutateAsync(supplierToDeleteId);
    }
  };

  const handleSubmitForm = async (data: SupplierFormValues) => {
    if (!userId) {
      showError('Usuario no autenticado. No se puede realizar la operación.');
      return;
    }

    const { materials, ...supplierData } = data;
    const materialsPayload = materials?.map(mat => ({
      material_id: mat.material_id,
      specification: mat.specification,
    })) || [];

    if (editingSupplier) {
      await updateMutation.mutateAsync({ id: editingSupplier.id, supplierData, materials: materialsPayload });
    } else {
      await createMutation.mutateAsync({ supplierData, materials: materialsPayload });
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'Active':
        return 'bg-procarni-secondary text-white';
      case 'Inactive':
        return 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 text-center text-muted-foreground">
        Cargando proveedores...
      </div>
    );
  }

  if (error) {
    showError(error.message);
    return (
      <div className="container mx-auto p-4 text-center text-destructive">
        Error al cargar los proveedores: {error.message}
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-4">
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver
        </Button>
      </div>
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="text-procarni-primary">Gestión de Proveedores</CardTitle>
            <CardDescription>Administra la información de tus proveedores.</CardDescription>
          </div>
          <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <DialogTrigger asChild>
              <Button 
                onClick={handleAddSupplier} 
                className={cn(
                  "bg-procarni-secondary hover:bg-green-700",
                  isMobile && "w-10 h-10 p-0" // Hacer el botón cuadrado y sin padding en móvil
                )}
              >
                <PlusCircle className={cn("h-4 w-4", !isMobile && "mr-2")} /> 
                {!isMobile && 'Añadir Proveedor'}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] md:max-w-2xl max-h-[90vh] overflow-y-auto" description={editingSupplier ? 'Edita los detalles del proveedor existente.' : 'Completa los campos para añadir un nuevo proveedor.'}>
              <DialogHeader>
                <DialogTitle>{editingSupplier ? 'Editar Proveedor' : 'Añadir Nuevo Proveedor'}</DialogTitle>
              </DialogHeader>
              {isLoadingEditData ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin text-procarni-primary" />
                  <span className="ml-2 text-muted-foreground">Cargando datos del proveedor...</span>
                </div>
              ) : (
                <SupplierForm
                  initialData={editingSupplier || undefined}
                  onSubmit={handleSubmitForm}
                  onCancel={() => setIsFormOpen(false)}
                  isSubmitting={createMutation.isPending || updateMutation.isPending}
                />
              )}
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className={cn(isMobile ? "px-2 py-4" : "p-6")}>
          <div className="flex flex-col md:flex-row gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Buscar proveedor por RIF, nombre o email..."
                className="w-full appearance-none bg-background pl-8 shadow-none"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="relative md:w-1/3">
              <Filter className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Select value={selectedStatus} onValueChange={(value) => setSelectedStatus(value as 'All' | 'Active' | 'Inactive')}>
                <SelectTrigger className="w-full pl-8">
                  <SelectValue placeholder="Filtrar por estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">Todos los Estados</SelectItem>
                  <SelectItem value="Active">Activo</SelectItem>
                  <SelectItem value="Inactive">Inactivo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {filteredSuppliers.length > 0 ? (
            isMobile ? (
              <div className="grid gap-4">
                {filteredSuppliers.map((supplier) => (
                  <Card key={supplier.id} className="p-4 w-full shadow-md">
                    <div className="flex justify-between items-start mb-2">
                      {/* Título del proveedor */}
                      <CardTitle className="text-lg break-words max-w-[60%]">{supplier.name}</CardTitle>
                      {/* Espacio vacío donde estaba el badge de estado */}
                      <div className="w-[30%] text-right"></div>
                    </div>
                    <CardDescription className="mb-2 flex items-center">
                      <Tag className="mr-1 h-3 w-3" /> Cód: {supplier.code || 'N/A'} | RIF: {supplier.rif}
                    </CardDescription>
                    <div className="text-sm space-y-1 mt-2 w-full">
                      {/* Eliminado el email para ahorrar espacio */}
                      {supplier.phone ? (
                        <p className="flex items-center"><Phone className="mr-1 h-3 w-3" /> Teléfono: {supplier.phone}</p>
                      ) : (
                        <p className="flex items-center text-procarni-alert">
                          <AlertTriangle className="mr-1 h-3 w-3" /> Teléfono: Faltante
                        </p>
                      )}
                      <p>
                        <strong>Términos:</strong> {supplier.payment_terms === 'Otro' && supplier.custom_payment_terms ? supplier.custom_payment_terms : supplier.payment_terms}
                      </p>
                      {/* Etiqueta de estado movida aquí */}
                      <p>
                        <strong>Estado:</strong> 
                        <span className={cn("ml-2 px-2 py-0.5 text-xs font-medium rounded-full", getStatusBadgeClass(supplier.status))}>
                          {supplier.status === 'Active' ? 'Activo' : 'Inactivo'}
                        </span>
                      </p>
                    </div>
                    <div className="flex justify-start gap-2 mt-4 border-t pt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); handleViewSupplier(supplier.id); }}
                      >
                        <Eye className="h-4 w-4 mr-2" /> Ver
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); handleEditSupplier(supplier.id); }}
                        disabled={deleteMutation.isPending || isLoadingEditData}
                      >
                        {isLoadingEditData && editingSupplier?.id === supplier.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Edit className="h-4 w-4 mr-2" />
                        )}
                        Editar
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); confirmDeleteSupplier(supplier.id); }}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>RIF</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Teléfono</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSuppliers.map((supplier) => (
                      <TableRow key={supplier.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                        <TableCell>{supplier.code || 'N/A'}</TableCell>
                        <TableCell className="font-medium">{supplier.name}</TableCell>
                        <TableCell>{supplier.rif}</TableCell>
                        <TableCell>{supplier.email || 'N/A'}</TableCell>
                        <TableCell className={cn(supplier.phone ? '' : 'text-procarni-alert font-medium')}>
                          {supplier.phone || (
                            <span className="flex items-center">
                              <AlertTriangle className="h-4 w-4 mr-1" /> Faltante
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className={cn("px-2 py-0.5 text-xs font-medium rounded-full", getStatusBadgeClass(supplier.status))}>
                            {supplier.status === 'Active' ? 'Activo' : 'Inactivo'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => { e.stopPropagation(); handleViewSupplier(supplier.id); }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => { e.stopPropagation(); handleEditSupplier(supplier.id); }}
                            disabled={deleteMutation.isPending || isLoadingEditData}
                          >
                            {isLoadingEditData && editingSupplier?.id === supplier.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Edit className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => { e.stopPropagation(); confirmDeleteSupplier(supplier.id); }}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )
          ) : (
            <div className="text-center text-muted-foreground p-8">
              No hay proveedores registrados o no se encontraron resultados para tu búsqueda.
            </div>
          )}
        </CardContent>
      </Card>
      <MadeWithDyad />

      {/* AlertDialog for delete confirmation */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás absolutamente seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Esto eliminará permanentemente el proveedor y todas las órdenes de compra/solicitudes de cotización asociadas a él.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={executeDeleteSupplier} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SupplierManagement;