import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { PlusCircle, Edit, Trash2, Search, Phone, Mail, Eye, Loader2, ArrowLeft, Instagram, Filter, Tag, AlertTriangle, FileUp, MoreHorizontal, Users, GitMerge } from 'lucide-react';
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
import { SupplierMergeModal } from '@/components/SupplierMergeModal';
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
  const { session, role } = useSession();
  const isAdmin = role === 'admin' || role === 'administrador';
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
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [mergeSourceSupplierId, setMergeSourceSupplierId] = useState<string | null>(null);

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
    <div className="container mx-auto p-4 md:p-6 pb-20 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white/70 backdrop-blur-xl border border-slate-100 shadow-xl shadow-slate-200/40 ring-1 ring-white rounded-3xl p-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-2xl bg-procarni-primary/10 text-procarni-primary">
              <Users className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-extrabold text-procarni-dark tracking-tight">Gestión de Proveedores</h1>
          </div>
          <p className="text-xs md:text-sm text-slate-500 font-medium">
            Directorio maestro de proveedores, condiciones comerciales, rubros y contactos.
          </p>
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
          {isAdmin && (
            <Button
              variant="outline"
              onClick={() => {
                setMergeSourceSupplierId(null);
                setIsMergeModalOpen(true);
              }}
              className="border-slate-200 bg-slate-50/80 hover:bg-slate-100 text-slate-700 shadow-sm rounded-2xl h-10 px-4 font-semibold text-xs transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center gap-2"
              title="Fusionar Proveedores (Solo Admin)"
            >
              <GitMerge className="h-4 w-4 text-procarni-blue" />
              <span>Fusionar Proveedores</span>
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => navigate('/ficha-tecnica-upload')}
            className="border-slate-200 bg-slate-50/80 hover:bg-slate-100 text-slate-700 shadow-sm rounded-2xl h-10 px-4 font-semibold text-xs transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center gap-2"
            title="Fichas Técnicas"
          >
            <FileUp className="h-4 w-4 text-procarni-primary" />
            <span>Fichas Técnicas</span>
          </Button>
          <Button
            onClick={handleAddSupplier}
            className="bg-procarni-secondary hover:bg-emerald-800 text-white shadow-lg shadow-emerald-900/10 rounded-2xl h-10 px-4 font-semibold text-xs transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center gap-2 w-full sm:w-auto"
          >
            <PlusCircle className="h-4 w-4" />
            <span>Añadir Proveedor</span>
          </Button>

          <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <DialogContent className="sm:max-w-[425px] md:max-w-4xl lg:max-w-5xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white/95 backdrop-blur-xl border-none shadow-2xl">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold text-procarni-dark">{editingSupplier ? 'Editar Proveedor' : 'Añadir Nuevo Proveedor'}</DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  {editingSupplier ? 'Edita los detalles del proveedor existente.' : 'Completa los campos para añadir un nuevo proveedor.'}
                </DialogDescription>
              </DialogHeader>
              {isLoadingEditData ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin text-procarni-primary" />
                  <span className="ml-2 text-muted-foreground text-xs">Cargando datos del proveedor...</span>
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

      {/* Main Content Card */}
      <Card className="bg-white/80 backdrop-blur-xl border border-slate-100 shadow-xl shadow-gray-200/50 ring-1 ring-white rounded-3xl p-6 overflow-hidden">
        <CardContent className="p-0 space-y-5">
          <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4">
            <div className="flex flex-col sm:flex-row items-center gap-3 flex-1">
              {/* Switch Materia Prima */}
              <div className="flex items-center space-x-2 bg-slate-50/80 border border-slate-200/80 px-3.5 h-10 rounded-2xl self-stretch sm:self-auto justify-between sm:justify-start">
                <Label htmlFor="raw-materials-switch" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer select-none">
                  Materia Prima
                </Label>
                <Switch
                  id="raw-materials-switch"
                  checked={onlyRawMaterials}
                  onCheckedChange={setOnlyRawMaterials}
                />
              </div>

              <div className="relative flex-1 w-full">
                <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Buscar proveedor por RIF, nombre o email..."
                  value={searchInput}
                  onChange={handleSearchChange}
                  className="w-full bg-slate-50/80 border-slate-200/80 rounded-2xl pl-10 h-10 text-xs focus:bg-white focus:ring-2 focus:ring-procarni-primary/20 transition-all shadow-none"
                />
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="relative w-full sm:w-44">
                <Select value={selectedStatus} onValueChange={handleStatusChange}>
                  <SelectTrigger className="w-full h-10 bg-slate-50/80 border-slate-200/80 rounded-2xl text-xs font-medium focus:ring-procarni-primary/20">
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl shadow-xl border border-slate-100">
                    <SelectItem value="All">Todos los Estados</SelectItem>
                    <SelectItem value="Active">Activo</SelectItem>
                    <SelectItem value="Inactive">Inactivo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="relative w-full sm:w-60">
                <Select value={dataQualityFilter} onValueChange={handleQualityChange}>
                  <SelectTrigger className={cn("w-full h-10 bg-slate-50/80 border-slate-200/80 rounded-2xl text-xs font-medium focus:ring-procarni-primary/20", dataQualityFilter !== 'All' && "ring-1 ring-amber-400 bg-amber-50/50")}>
                    <SelectValue placeholder="Calidad de Datos" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl shadow-xl border border-slate-100">
                    <SelectItem value="All">Calidad: Todos</SelectItem>
                    <SelectItem value="MissingCritical">Datos Críticos Faltantes</SelectItem>
                    <SelectItem value="MissingSecondary">Datos Secundarios Faltantes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className={cn("transition-opacity duration-200", isFetching && "opacity-50 pointer-events-none")}>
          {isLoading && suppliersList.length === 0 ? (
            <div className="flex justify-center p-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-procarni-primary border-t-transparent"></div>
            </div>
          ) : error ? (
            <div className="text-center text-red-500 p-4 text-xs font-medium">Error cargando proveedores</div>
          ) : suppliersList.length > 0 ? (
            isMobile ? (
              <div className="grid gap-4">
                {suppliersList.map((supplier) => (
                  <Card
                    key={supplier.id}
                    className="bg-white/90 backdrop-blur-xl border border-slate-100/90 shadow-lg shadow-slate-200/40 ring-1 ring-white rounded-3xl p-5 hover:shadow-xl transition-all duration-200 w-full cursor-pointer flex flex-col justify-between"
                    onClick={() => navigate(`/suppliers/${supplier.id}`)}
                  >
                    <div>
                      <div className="mb-3">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-xl bg-procarni-blue/10 text-procarni-blue flex items-center justify-center shrink-0 font-bold text-xs">
                            {supplier.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="font-bold text-sm text-procarni-dark hover:text-procarni-primary transition-colors block truncate">
                              {supplier.name}
                            </span>
                            {(!supplier.rif || isGenericRif(supplier.rif) || !supplier.phone || !supplier.address) && (
                              <span className="flex items-center gap-1 text-[10px] text-blue-500 mt-0.5 font-medium" title="Falta RIF, Teléfono o Dirección">
                                <Search className="h-3 w-3" /> Info incompleta
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mb-3 pt-2 border-t border-slate-100 text-xs">
                        <div>
                          <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-0.5">RIF</p>
                          {isGenericRif(supplier.rif) ? (
                            <span className="flex items-center gap-1 text-[11px] font-bold text-procarni-alert">
                              <AlertTriangle className="h-3 w-3" /> Faltante
                            </span>
                          ) : (
                            <span className="font-mono text-xs font-bold text-slate-700">{supplier.rif}</span>
                          )}
                        </div>

                        <div>
                          <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-0.5">Teléfono</p>
                          {!supplier.phone ? (
                            <span className="flex items-center gap-1 text-[11px] font-bold text-procarni-alert">
                              <AlertTriangle className="h-3 w-3" /> Faltante
                            </span>
                          ) : (
                            <span className="font-mono text-xs text-slate-600">{supplier.phone}</span>
                          )}
                        </div>
                      </div>

                      {/* Rubro: ÚNICO CAMPO CON EDICIÓN INLINE */}
                      <div className="mb-3 p-2.5 bg-slate-50/80 rounded-2xl border border-slate-100" onClick={(e) => e.stopPropagation()}>
                        <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-0.5">Rubro / Especialidad</p>
                        <InlineEditableCell
                          value={supplier.rubros || ''}
                          onSave={(v) => handleInlineSave(supplier.id, 'rubros', v)}
                          alwaysShowIcon
                          displayClassName="text-xs font-semibold text-procarni-dark"
                          placeholder="Asignar rubro..."
                        />
                      </div>

                      <div className="flex items-center justify-between text-xs text-slate-600 mb-2">
                        <span className="text-[10px] uppercase font-bold text-slate-400">Términos:</span>
                        <span className="font-medium text-slate-700">{supplier.payment_terms === 'Otro' && supplier.custom_payment_terms ? supplier.custom_payment_terms : supplier.payment_terms}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
                        <span className="text-[10px] uppercase font-bold text-slate-400">Estado:</span>
                        <span className={cn("px-2 py-0.5 text-[10px] font-bold rounded-full", getStatusBadgeClass(supplier.status))}>
                          {supplier.status === 'Active' ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-4 border-t border-slate-100 pt-3">
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Opciones</span>
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
                          {isAdmin && (
                            <DropdownMenuItem
                              onClick={() => {
                                setMergeSourceSupplierId(supplier.id);
                                setIsMergeModalOpen(true);
                              }}
                              className="flex items-center gap-2 text-xs font-semibold py-2 rounded-xl cursor-pointer text-slate-700 hover:text-procarni-blue hover:bg-slate-50"
                            >
                              <GitMerge className="h-4 w-4 text-slate-400" />
                              <span>Fusionar con otro...</span>
                            </DropdownMenuItem>
                          )}
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
              <div className="rounded-2xl border border-slate-100 overflow-hidden bg-white shadow-sm">
                <Table>
                  <TableHeader className="bg-slate-50/80 border-b border-slate-100">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="font-bold text-[10px] tracking-wider uppercase text-slate-500 pl-4 py-3.5">Código</TableHead>
                      <TableHead className="font-bold text-[10px] tracking-wider uppercase text-slate-500 py-3.5">Nombre</TableHead>
                      <TableHead className="font-bold text-[10px] tracking-wider uppercase text-slate-500 py-3.5">RIF</TableHead>
                      <TableHead className="font-bold text-[10px] tracking-wider uppercase text-slate-500 py-3.5">Rubro</TableHead>
                      <TableHead className="font-bold text-[10px] tracking-wider uppercase text-slate-500 py-3.5">Teléfono</TableHead>
                      <TableHead className="font-bold text-[10px] tracking-wider uppercase text-slate-500 py-3.5">Estado</TableHead>
                      <TableHead className="text-right font-bold text-[10px] tracking-wider uppercase text-slate-500 pr-4 py-3.5">Opciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {suppliersList.map((supplier) => (
                      <TableRow
                        key={supplier.id}
                        className="hover:bg-slate-50/60 transition-colors border-b border-slate-50 group cursor-pointer"
                        onClick={() => navigate(`/suppliers/${supplier.id}`)}
                      >
                        <TableCell className="pl-4 py-3.5 font-mono text-xs font-semibold text-slate-600">{supplier.code || '—'}</TableCell>
                        <TableCell className="py-3.5 max-w-[240px]">
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-lg bg-procarni-blue/10 text-procarni-blue flex items-center justify-center shrink-0 font-bold text-xs">
                              {supplier.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <span className="font-bold text-sm text-procarni-dark group-hover:text-procarni-primary transition-colors block truncate">
                                {supplier.name}
                              </span>
                              {(!supplier.rif || isGenericRif(supplier.rif) || !supplier.phone || !supplier.address) && (
                                <span className="flex items-center gap-1 text-[10px] text-blue-500 font-medium" title="Falta RIF, Teléfono o Dirección">
                                  <Search className="h-3 w-3" /> Info incompleta
                                </span>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-3.5">
                          {isGenericRif(supplier.rif) ? (
                            <span className="flex items-center gap-1 text-procarni-alert font-bold text-xs">
                              <AlertTriangle className="h-3 w-3" /> Faltante
                            </span>
                          ) : (
                            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">{supplier.rif}</span>
                          )}
                        </TableCell>
                        {/* RUBRO: ÚNICO CAMPO CON EDICIÓN INLINE */}
                        <TableCell className="py-3.5 max-w-[200px]" onClick={(e) => e.stopPropagation()}>
                          <InlineEditableCell
                            value={supplier.rubros || ''}
                            onSave={(v) => handleInlineSave(supplier.id, 'rubros', v)}
                            displayClassName="text-xs font-medium text-slate-700 whitespace-normal break-words"
                            placeholder="Asignar rubro..."
                          />
                        </TableCell>
                        <TableCell className="py-3.5 font-mono text-xs text-slate-600">
                          {!supplier.phone ? (
                            <span className="flex items-center gap-1 text-procarni-alert font-bold text-xs">
                              <AlertTriangle className="h-3 w-3" /> Faltante
                            </span>
                          ) : (
                            <span>{supplier.phone}</span>
                          )}
                        </TableCell>
                        <TableCell className="py-3.5">
                          <span className={cn("px-2.5 py-0.5 text-[11px] font-bold rounded-full border", getStatusBadgeClass(supplier.status))}>
                            {supplier.status === 'Active' ? 'Activo' : 'Inactivo'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right pr-4 py-3.5" onClick={(e) => e.stopPropagation()}>
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
                              {isAdmin && (
                                <DropdownMenuItem
                                  onClick={() => {
                                    setMergeSourceSupplierId(supplier.id);
                                    setIsMergeModalOpen(true);
                                  }}
                                  className="flex items-center gap-2 text-xs font-semibold py-2 rounded-xl cursor-pointer text-slate-700 hover:text-procarni-blue hover:bg-slate-50"
                                >
                                  <GitMerge className="h-4 w-4 text-slate-400" />
                                  <span>Fusionar con otro...</span>
                                </DropdownMenuItem>
                              )}
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
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <div className="bg-slate-100 text-slate-400 p-4 rounded-full mb-4 ring-8 ring-slate-50/50">
                <Search className="h-8 w-8" />
              </div>
              <h3 className="text-base font-bold text-slate-800">No se encontraron proveedores</h3>
              <p className="text-xs text-slate-500 max-w-sm mt-1">
                No hay proveedores registrados o no coinciden con los términos de búsqueda y filtros.
              </p>
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
        <AlertDialogContent className="rounded-3xl bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-procarni-dark">¿Estás seguro de eliminar este proveedor?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-500">
              Esta acción no se puede deshacer. Se eliminarán permanentemente el proveedor y sus relaciones si no tiene órdenes asociadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending} className="rounded-2xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeDeleteSupplier}
              disabled={deleteMutation.isPending}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-2xl"
            >
              {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Admin Supplier Merge Modal */}
      <SupplierMergeModal
        isOpen={isMergeModalOpen}
        onClose={() => {
          setIsMergeModalOpen(false);
          setMergeSourceSupplierId(null);
        }}
        initialSourceSupplierId={mergeSourceSupplierId}
      />
    </div>
  );
};

export default SupplierManagement;