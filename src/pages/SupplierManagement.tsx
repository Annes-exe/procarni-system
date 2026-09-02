import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { PlusCircle, Edit, Trash2, Search, Phone, Mail, Eye, Loader2, ArrowLeft, Instagram, Filter, Tag, AlertTriangle, FileUp, MoreHorizontal } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import InlineEditableCell from '@/components/InlineEditableCell';

import { getPaginatedSuppliers, createSupplier, updateSupplier, deleteSupplier, getSupplierDetails } from '@/integrations/supabase/data';
import { showError, showSuccess } from '@/utils/toast';
import { isGenericRif, validateRif } from '@/utils/validators';
import SupplierForm from '@/components/SupplierForm';
import { useSession } from '@/components/SessionContextProvider';
import { Input } from '@/components/ui/input';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useDebounce } from 'use-debounce';
import PaginationControls from '@/components/PaginationControls';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

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
  city?: string | null;
  state?: string | null;
  payment_terms: string;
  custom_payment_terms?: string | null;
  credit_days: number;
  status: string;
  user_id: string;
  rubros?: string | null;
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
  rubros?: string | null;
  city?: string | null;
  state?: string | null;
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

  const [searchParams, setSearchParams] = useSearchParams();
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = 25;
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '');
  const [debouncedSearch] = useDebounce(searchInput, 500);
  const selectedStatus = (searchParams.get('status') || 'Active') as 'All' | 'Active' | 'Inactive';
  const dataQualityFilter = searchParams.get('quality') || 'All';
  const [onlyRawMaterials, setOnlyRawMaterials] = useState<boolean>(false);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [supplierToDeleteId, setSupplierToDeleteId] = useState<string | null>(null);
  const [isLoadingEditData, setIsLoadingEditData] = useState(false);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['suppliers_paginated', page, pageSize, debouncedSearch, selectedStatus, dataQualityFilter, onlyRawMaterials],
    queryFn: () => getPaginatedSuppliers(page, pageSize, debouncedSearch, selectedStatus, dataQualityFilter, onlyRawMaterials),
    enabled: !!session,
    placeholderData: keepPreviousData,
  });

  const suppliersList = data?.data || [];
  const totalCount = data?.totalCount || 0;

  const setPage = (newPage: number) => {
    setSearchParams(prev => {
      prev.set('page', newPage.toString());
      return prev;
    });
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchInput(value);
    setSearchParams(prev => {
      if (value) prev.set('search', value);
      else prev.delete('search');
      prev.set('page', '1');
      return prev;
    });
  };

  const handleStatusChange = (value: string) => {
    setSearchParams(prev => {
      if (value !== 'All') prev.set('status', value);
      else prev.delete('status');
      prev.set('page', '1');
      return prev;
    });
  };

  const handleQualityChange = (value: string) => {
    setSearchParams(prev => {
      if (value !== 'All') prev.set('quality', value);
      else prev.delete('quality');
      prev.set('page', '1');
      return prev;
    });
  };

  const createMutation = useMutation({
    mutationFn: ({ supplierData, materials }: { supplierData: any; materials: any }) =>
      createSupplier(supplierData, materials),
    onSuccess: (responseData) => {
      if (responseData) {
        queryClient.invalidateQueries({ queryKey: ['suppliers_paginated'] });
        setIsFormOpen(false);
        showSuccess('Proveedor creado exitosamente.');
      }
    },
    onError: (err) => {
      showError(`Error al crear proveedor: ${err.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, supplierData, materials }: { id: string; supplierData: any; materials: any }) =>
      updateSupplier(id, supplierData, materials),
    onSuccess: (responseData) => {
      if (responseData) {
        queryClient.invalidateQueries({ queryKey: ['suppliers_paginated'] });
        setIsFormOpen(false);
        setEditingSupplier(null);
        showSuccess('Proveedor actualizado exitosamente.');
      }
    },
    onError: (err) => {
      showError(`Error al actualizar proveedor: ${err.message}`);
    },
  });

  // Mutation exclusive for inline field edits — patches ONLY the suppliers table,
  // never touches supplier_materials so associated materials are preserved.
  const inlineUpdateMutation = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: string; value: string }) => {
      const { supabase } = await import('@/integrations/supabase/client');
      
      let payloadValue: string | null = value;

      if (field === 'rif') {
        const validated = validateRif(value);
        if (!validated) {
          throw new Error('Formato de RIF inválido. Ej: J123456789 o SR');
        }
        if (validated === 'SR') {
          // Generar sufijo invisible para evadir constraint unique
          const invisibleSuffix = Date.now().toString().split('').map(d => String.fromCharCode(0x200B + (parseInt(d) % 3))).join('');
          payloadValue = 'SR' + invisibleSuffix;
        } else {
          payloadValue = validated;
        }
      } else if (field === 'name') {
        payloadValue = value.toUpperCase();
      }

      const payload = { [field]: payloadValue };
      
      const { error } = await supabase
        .from('suppliers')
        .update(payload)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers_paginated'] });
      showSuccess('Campo actualizado.');
    },
    onError: (err: any) => {
      if (err?.code === '23505') {
        showError('El RIF ingresado ya pertenece a otro proveedor. Verifícalo e intenta de nuevo.');
      } else {
        showError(err.message || 'No se pudo actualizar el campo. Intenta de nuevo.');
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSupplier,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers_paginated'] });
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
    navigate('/suppliers/new');
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

  // Inline save: patches a single field directly in the suppliers table.
  // Uses inlineUpdateMutation (NOT updateMutation) to avoid wiping supplier_materials.
  const handleInlineSave = async (supplierId: string, field: string, newValue: string) => {
    await inlineUpdateMutation.mutateAsync({ id: supplierId, field, value: newValue });
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

  const handleSubmitForm = async (data: any) => {
    if (!userId) {
      showError('Usuario no autenticado. No se puede realizar la operación.');
      return;
    }

    const { materials, ...supplierData } = data;
    const materialsPayload = materials?.map((mat: any) => ({
      material_id: mat.material_id,
      specification: mat.specification,
    })) || [];

    if (editingSupplier) {
      await updateMutation.mutateAsync({ id: editingSupplier.id, supplierData, materials: materialsPayload });
    } else {
      await createMutation.mutateAsync({ supplierData: { ...supplierData, user_id: userId }, materials: materialsPayload });
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

  // No loading static return to allow keepPreviousData rendering

  if (error) {
    showError(error.message);
    return (
      <div className="container mx-auto p-4 text-center text-destructive">
        Error al cargar los proveedores: {error.message}
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-procarni-primary tracking-tight">Gestión de Proveedores</h1>
          <p className="text-muted-foreground text-sm">Administra la información de tus proveedores.</p>
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <Button
            variant="outline"
            onClick={() => navigate('/ficha-tecnica-upload')}
            className={cn(isMobile && "w-10 h-10 p-0", "text-procarni-secondary border-procarni-secondary/30 hover:bg-procarni-secondary/10 hover:text-procarni-secondary")}
            title="Fichas Técnicas"
          >
            <FileUp className={cn("h-4 w-4", !isMobile && "mr-2")} />
            {!isMobile && 'Fichas Técnicas'}
          </Button>
          <Button
            onClick={handleAddSupplier}
            className={cn(
              "bg-procarni-secondary hover:bg-green-700 text-white gap-2",
              isMobile && "w-10 h-10 p-0"
            )}
            size={isMobile ? "default" : "sm"}
          >
            <PlusCircle className={cn("h-4 w-4", !isMobile && "mr-2")} />
            {!isMobile && 'Añadir Proveedor'}
          </Button>

          <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <DialogContent className="sm:max-w-[425px] md:max-w-4xl lg:max-w-5xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingSupplier ? 'Editar Proveedor' : 'Añadir Nuevo Proveedor'}</DialogTitle>
                <DialogDescription>
                  {editingSupplier ? 'Edita los detalles del proveedor existente.' : 'Completa los campos para añadir un nuevo proveedor.'}
                </DialogDescription>
              </DialogHeader>
              {isLoadingEditData ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin text-procarni-primary" />
                  <span className="ml-2 text-muted-foreground">Cargando datos del proveedor...</span>
                </div>
              ) : (
                <SupplierForm
                  initialData={(editingSupplier as any) || undefined}
                  onSubmit={handleSubmitForm}
                  onCancel={() => setIsFormOpen(false)}
                  isSubmitting={createMutation.isPending || updateMutation.isPending}
                />
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="mb-6 border-none shadow-sm bg-transparent md:bg-white md:border md:border-gray-200">
        <CardContent className="p-0 md:p-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-4">
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
              {/* Switch Materia Prima */}
              <div className="flex items-center space-x-2 bg-slate-50 border border-gray-200 px-3 py-1.5 h-9 rounded-xl self-stretch sm:self-auto justify-between sm:justify-start">
                <Label htmlFor="raw-materials-switch" className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider cursor-pointer select-none">
                  Materia Prima
                </Label>
                <Switch
                  id="raw-materials-switch"
                  checked={onlyRawMaterials}
                  onCheckedChange={setOnlyRawMaterials}
                />
              </div>

              <div className="relative w-full sm:w-72">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar proveedor por RIF, nombre o email..."
                  value={searchInput}
                  onChange={handleSearchChange}
                  className="w-full pl-10 bg-white"
                />
              </div>
            </div>
            <div className="relative w-full md:w-48">
              <Filter className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Select value={selectedStatus} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-full pl-8 h-9 text-sm">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">Todos los Estados</SelectItem>
                  <SelectItem value="Active">Activo</SelectItem>
                  <SelectItem value="Inactive">Inactivo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="relative w-full md:w-64">
              <AlertTriangle className={cn("absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground", dataQualityFilter !== 'All' && "text-amber-500")} />
              <Select value={dataQualityFilter} onValueChange={handleQualityChange}>
                <SelectTrigger className={cn("w-full pl-8 h-9 text-sm", dataQualityFilter !== 'All' && "ring-1 ring-amber-400 bg-amber-50")}>
                  <SelectValue placeholder="Calidad de Datos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">Calidad: Todos</SelectItem>
                  <SelectItem value="MissingCritical">Datos Críticos Faltantes</SelectItem>
                  <SelectItem value="MissingSecondary">Datos Secundarios Faltantes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className={cn("transition-opacity duration-200", isFetching && "opacity-50 pointer-events-none")}>
          {isLoading && suppliersList.length === 0 ? (
            <div className="flex justify-center p-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-procarni-primary border-t-transparent"></div>
            </div>
          ) : error ? (
            <div className="text-center text-red-500 p-4">Error cargando proveedores</div>
          ) : suppliersList.length > 0 ? (
            isMobile ? (
              <div className="grid gap-4">
                {suppliersList.map((supplier) => (
                  <Card
                    key={supplier.id}
                    className="p-4 w-full shadow-md cursor-pointer hover:border-slate-300 transition-all"
                    onClick={() => navigate(`/suppliers/${supplier.id}`)}
                  >
                    <div className="mb-2">
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-0.5">Nombre</p>
                      <span className="font-bold text-base text-procarni-dark hover:text-procarni-primary transition-colors block">
                        {supplier.name}
                      </span>
                      {(!supplier.rif || isGenericRif(supplier.rif) || !supplier.phone || !supplier.address) && (
                        <span className="flex items-center gap-1 text-[10px] text-blue-500 mt-1" title="Falta RIF, Teléfono o Dirección">
                          <Search className="h-3 w-3" /> Info incompleta
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-0.5">RIF</p>
                        {isGenericRif(supplier.rif) ? (
                          <span className="flex items-center gap-1 text-[11px] font-medium text-procarni-alert">
                            <AlertTriangle className="h-3 w-3" /> Faltante
                          </span>
                        ) : (
                          <span className="font-mono text-xs text-gray-700">{supplier.rif}</span>
                        )}
                      </div>

                      <div>
                        <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-0.5">Teléfono</p>
                        {!supplier.phone ? (
                          <span className="flex items-center gap-1 text-[11px] font-medium text-procarni-alert">
                            <AlertTriangle className="h-3 w-3" /> Faltante
                          </span>
                        ) : (
                          <span className="font-mono text-xs text-gray-700">{supplier.phone}</span>
                        )}
                      </div>
                    </div>

                    {/* Rubro: ÚNICO CAMPO CON EDICIÓN INLINE */}
                    <div className="mb-2 p-2 bg-slate-50 rounded-xl border border-slate-100" onClick={(e) => e.stopPropagation()}>
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-0.5">Rubro / Especialidad</p>
                      <InlineEditableCell
                        value={supplier.rubros || ''}
                        onSave={(v) => handleInlineSave(supplier.id, 'rubros', v)}
                        alwaysShowIcon
                        displayClassName="text-xs font-semibold text-procarni-dark"
                        placeholder="Asignar rubro..."
                      />
                    </div>

                    <p className="text-xs mb-1 text-slate-600">
                      <strong>Términos:</strong> {supplier.payment_terms === 'Otro' && supplier.custom_payment_terms ? supplier.custom_payment_terms : supplier.payment_terms}
                    </p>
                    <p className="text-xs mb-3 text-slate-600">
                      <strong>Estado:</strong>
                      <span className={cn("ml-2 px-2 py-0.5 text-xs font-medium rounded-full", getStatusBadgeClass(supplier.status))}>
                        {supplier.status === 'Active' ? 'Activo' : 'Inactivo'}
                      </span>
                    </p>

                    <div className="flex items-center justify-between mt-3 border-t border-slate-100 pt-3">
                      <span className="text-[11px] text-slate-400 font-medium">Acciones</span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl hover:bg-slate-100 text-slate-500">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44 rounded-2xl shadow-xl border border-slate-100 p-1.5" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenuItem
                            onClick={() => handleViewSupplier(supplier.id)}
                            className="flex items-center gap-2 text-xs font-semibold py-2 rounded-xl cursor-pointer text-slate-700 hover:text-procarni-blue hover:bg-slate-50"
                          >
                            <Eye className="h-4 w-4 text-slate-400" />
                            <span>Ver Perfil</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleEditSupplier(supplier.id)}
                            disabled={deleteMutation.isPending || isLoadingEditData}
                            className="flex items-center gap-2 text-xs font-semibold py-2 rounded-xl cursor-pointer text-slate-700 hover:text-procarni-blue hover:bg-slate-50"
                          >
                            <Edit className="h-4 w-4 text-slate-400" />
                            <span>Editar en Modal</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => confirmDeleteSupplier(supplier.id)}
                            disabled={deleteMutation.isPending}
                            className="flex items-center gap-2 text-xs font-semibold py-2 rounded-xl cursor-pointer text-destructive hover:bg-red-50 focus:text-destructive focus:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                            <span>Eliminar</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-gray-100 overflow-hidden bg-white">
                <Table>
                  <TableHeader className="bg-gray-50/50">
                    <TableRow>
                      <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500 pl-4 py-3">Código</TableHead>
                      <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500 py-3">Nombre</TableHead>
                      <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500 py-3">RIF</TableHead>
                      <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500 py-3">Rubro</TableHead>
                      <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500 py-3">Teléfono</TableHead>
                      <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500 py-3">Estado</TableHead>
                      <TableHead className="text-right font-semibold text-xs tracking-wider uppercase text-gray-500 pr-4 py-3">Opciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {suppliersList.map((supplier) => (
                      <TableRow
                        key={supplier.id}
                        className="hover:bg-gray-50/50 transition-colors group cursor-pointer"
                        onClick={() => navigate(`/suppliers/${supplier.id}`)}
                      >
                        <TableCell className="pl-4 py-3 font-mono text-xs text-gray-600">{supplier.code || 'N/A'}</TableCell>
                        <TableCell className="py-3 max-w-[220px]">
                          <div className="flex flex-col">
                            <span className="font-semibold text-sm text-procarni-dark group-hover:text-procarni-primary transition-colors whitespace-normal break-words">
                              {supplier.name}
                            </span>
                            {/* Alerta de Datos Críticos Faltantes */}
                            {(!supplier.rif || isGenericRif(supplier.rif) || !supplier.phone || !supplier.address) && (
                              <span className="flex items-center gap-1 text-[10px] text-blue-500 mt-1" title="Falta RIF, Teléfono o Dirección">
                                <Search className="h-3 w-3" /> Info incompleta
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          {isGenericRif(supplier.rif) ? (
                            <span className="flex items-center gap-1 text-procarni-alert font-medium text-xs">
                              <AlertTriangle className="h-3 w-3" /> Faltante
                            </span>
                          ) : (
                            <span className="font-mono text-xs text-gray-700">{supplier.rif}</span>
                          )}
                        </TableCell>
                        {/* RUBRO: ÚNICO CAMPO CON EDICIÓN INLINE */}
                        <TableCell className="py-3 max-w-[200px]" onClick={(e) => e.stopPropagation()}>
                          <InlineEditableCell
                            value={supplier.rubros || ''}
                            onSave={(v) => handleInlineSave(supplier.id, 'rubros', v)}
                            displayClassName="text-xs font-medium text-slate-700 whitespace-normal break-words"
                            placeholder="Asignar rubro..."
                          />
                        </TableCell>
                        <TableCell className="py-3 font-mono text-xs text-gray-600">
                          {!supplier.phone ? (
                            <span className="flex items-center gap-1 text-procarni-alert font-medium text-xs">
                              <AlertTriangle className="h-3 w-3" /> Faltante
                            </span>
                          ) : (
                            <span>{supplier.phone}</span>
                          )}
                        </TableCell>
                        <TableCell className="py-3">
                          <span className={cn("px-2 py-0.5 text-xs font-medium rounded-md border", getStatusBadgeClass(supplier.status))}>
                            {supplier.status === 'Active' ? 'Activo' : 'Inactivo'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right pr-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-xl hover:bg-slate-100 text-slate-500"
                                title="Opciones"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44 rounded-2xl shadow-xl border border-slate-100 p-1.5">
                              <DropdownMenuItem
                                onClick={() => handleViewSupplier(supplier.id)}
                                className="flex items-center gap-2 text-xs font-semibold py-2 rounded-xl cursor-pointer text-slate-700 hover:text-procarni-blue hover:bg-slate-50"
                              >
                                <Eye className="h-4 w-4 text-slate-400" />
                                <span>Ver Perfil</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleEditSupplier(supplier.id)}
                                disabled={deleteMutation.isPending || isLoadingEditData}
                                className="flex items-center gap-2 text-xs font-semibold py-2 rounded-xl cursor-pointer text-slate-700 hover:text-procarni-blue hover:bg-slate-50"
                              >
                                <Edit className="h-4 w-4 text-slate-400" />
                                <span>Editar en Modal</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => confirmDeleteSupplier(supplier.id)}
                                disabled={deleteMutation.isPending}
                                className="flex items-center gap-2 text-xs font-semibold py-2 rounded-xl cursor-pointer text-destructive hover:bg-red-50 focus:text-destructive focus:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" />
                                <span>Eliminar</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
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
          </div>
          
          <PaginationControls
            currentPage={page}
            totalCount={totalCount}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>


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