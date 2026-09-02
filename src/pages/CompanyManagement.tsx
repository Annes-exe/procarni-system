import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { PlusCircle, Edit, Trash2, Search, Phone, Mail, ArrowLeft, Tag, MapPin, MoreHorizontal, Building2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { getAllCompanies, createCompany, updateCompany, deleteCompany } from '@/integrations/supabase/data';
import { showError, showSuccess } from '@/utils/toast';
import CompanyForm from '@/components/CompanyForm';
import { useSession } from '@/components/SessionContextProvider';
import { Input } from '@/components/ui/input';
import { useIsMobile, useIsTablet } from '@/hooks/use-mobile';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface Company {
  id: string;
  name: string;
  rif: string;
  logo_url?: string;
  cloudinary_public_id?: string;
  address?: string;
  phone?: string;
  email?: string;
  fiscal_data?: any; // Assuming fiscal_data might exist but not directly editable via form
  created_at: string;
  updated_at: string;
  user_id: string;
}

interface CompanyFormValues {
  name: string;
  rif: string;
  logo_url?: string;
  cloudinary_public_id?: string;
  address?: string;
  phone?: string;
  email?: string;
}

const CompanyManagement = () => {
  const queryClient = useQueryClient();
  const { session, role, isLoadingSession } = useSession();
  const userId = session?.user?.id;
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const isMobileView = isMobile || isTablet;
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoadingSession && role !== 'admin') {
      navigate('/');
      showError('No tienes permisos para acceder a esta página.');
    }
  }, [role, isLoadingSession, navigate]);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [companyToDeleteId, setCompanyToDeleteId] = useState<string | null>(null);

  const { data: companies, isLoading, error } = useQuery<Company[]>({
    queryKey: ['companies'],
    queryFn: getAllCompanies,
    enabled: !!session,
  });

  const filteredCompanies = useMemo(() => {
    if (!companies) return [];
    if (!searchTerm) return companies;

    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    return companies.filter(company =>
      company.name.toLowerCase().includes(lowerCaseSearchTerm) ||
      company.rif.toLowerCase().includes(lowerCaseSearchTerm) ||
      (company.address && company.address.toLowerCase().includes(lowerCaseSearchTerm)) ||
      (company.email && company.email.toLowerCase().includes(lowerCaseSearchTerm))
    );
  }, [companies, searchTerm]);

  const createMutation = useMutation({
    mutationFn: (newCompany: CompanyFormValues) =>
      createCompany({
        name: newCompany.name,
        rif: newCompany.rif,
        logo_url: newCompany.logo_url || null,
        cloudinary_public_id: newCompany.cloudinary_public_id || null,
        address: newCompany.address || null,
        phone: newCompany.phone || null,
        email: newCompany.email || null,
        user_id: userId!,
        fiscal_data: {},
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      setIsFormOpen(false);
      showSuccess('Empresa creada exitosamente.');
    },
    onError: (err: any) => {
      if (err.code === '23505') {
        showError('Ya existe una empresa con este nombre o RIF.');
      } else {
        showError(`Error al crear empresa: ${err.message}`);
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Omit<Company, 'id' | 'created_at' | 'updated_at' | 'user_id' | 'fiscal_data'>> }) =>
      updateCompany(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      setIsFormOpen(false);
      setEditingCompany(null);
      showSuccess('Empresa actualizada exitosamente.');
    },
    onError: (err) => {
      showError(`Error al actualizar empresa: ${err.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCompany,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      showSuccess('Empresa eliminada exitosamente.');
      setIsDeleteDialogOpen(false);
      setCompanyToDeleteId(null);
    },
    onError: (err: any) => {
      if (err.code === '23503') {
        showError('No se puede eliminar la empresa porque tiene órdenes o solicitudes asociadas. Elimina esos registros primero.');
      } else {
        showError(`Error al eliminar empresa: ${err.message}`);
      }
      setIsDeleteDialogOpen(false);
      setCompanyToDeleteId(null);
    },
  });

  const handleAddCompany = () => {
    setEditingCompany(null);
    setIsFormOpen(true);
  };

  const handleEditCompany = (company: Company) => {
    setEditingCompany(company);
    setIsFormOpen(true);
  };

  const confirmDeleteCompany = (id: string) => {
    setCompanyToDeleteId(id);
    setIsDeleteDialogOpen(true);
  };

  const executeDeleteCompany = async () => {
    if (companyToDeleteId) {
      await deleteMutation.mutateAsync(companyToDeleteId);
    }
  };

  const handleSubmitForm = async (data: CompanyFormValues) => {
    if (!userId) {
      showError('Usuario no autenticado. No se puede realizar la operación.');
      return;
    }
    if (editingCompany) {
      await updateMutation.mutateAsync({ id: editingCompany.id, updates: data });
    } else {
      await createMutation.mutateAsync(data);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 text-center text-muted-foreground">
        Cargando empresas...
      </div>
    );
  }

  if (error) {
    showError(error.message);
    return (
      <div className="container mx-auto p-4 text-center text-destructive">
        Error al cargar las empresas: {error.message}
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
              <Building2 className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-extrabold text-procarni-dark tracking-tight">Gestión de Empresas</h1>
          </div>
          <p className="text-xs md:text-sm text-slate-500 font-medium">
            Administra las razones sociales, sedes y datos fiscales de tu organización.
          </p>
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <DialogTrigger asChild>
              <Button
                onClick={handleAddCompany}
                className="bg-procarni-secondary hover:bg-emerald-800 text-white shadow-lg shadow-emerald-900/10 rounded-2xl h-10 px-4 font-semibold text-xs transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center gap-2 w-full md:w-auto"
              >
                <PlusCircle className="h-4 w-4" />
                <span>Añadir Empresa</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] md:max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white/95 backdrop-blur-xl border-none shadow-2xl">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold text-procarni-dark">
                  {editingCompany ? 'Editar Empresa' : 'Añadir Nueva Empresa'}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  {editingCompany ? 'Edita los detalles de la empresa existente.' : 'Completa los campos para añadir una nueva empresa.'}
                </DialogDescription>
              </DialogHeader>
              <CompanyForm
                initialData={editingCompany || undefined}
                onSubmit={handleSubmitForm}
                onCancel={() => setIsFormOpen(false)}
                isSubmitting={createMutation.isPending || updateMutation.isPending}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Main Container Card */}
      <Card className="bg-white/80 backdrop-blur-xl border border-slate-100 shadow-xl shadow-gray-200/50 ring-1 ring-white rounded-3xl p-6 overflow-hidden">
        <CardContent className="p-0 space-y-5">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
            <Input
              type="text"
              placeholder="Buscar empresa por RIF, nombre, dirección o email..."
              className="w-full bg-slate-50/80 border-slate-200/80 rounded-2xl pl-10 h-10 text-xs focus:bg-white focus:ring-2 focus:ring-procarni-primary/20 transition-all shadow-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {filteredCompanies.length > 0 ? (
            isMobileView ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredCompanies.map((company) => (
                  <Card key={company.id} className="bg-white/90 backdrop-blur-xl border border-slate-100/90 shadow-lg shadow-slate-200/40 ring-1 ring-white rounded-3xl p-5 hover:shadow-xl transition-all duration-200 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="h-8 w-8 rounded-xl bg-procarni-blue/10 text-procarni-blue flex items-center justify-center shrink-0 font-bold text-xs">
                            {company.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-bold text-sm text-procarni-dark truncate" title={company.name}>{company.name}</h3>
                            <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                              {company.rif}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="text-xs space-y-2 mt-3 pt-2 border-t border-slate-100 text-slate-600">
                        {company.email && (
                          <p className="flex items-center gap-2 text-slate-600" title={company.email}>
                            <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <a href={`mailto:${company.email}`} className="text-blue-600 hover:underline truncate text-xs">{company.email}</a>
                          </p>
                        )}
                        {company.phone && (
                          <p className="flex items-center gap-2 text-slate-600" title={company.phone}>
                            <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span className="font-mono text-xs">{company.phone}</span>
                          </p>
                        )}
                        {company.address && (
                          <p className="flex items-start gap-2 text-slate-500" title={company.address}>
                            <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                            <span className="line-clamp-2 text-xs">{company.address}</span>
                          </p>
                        )}
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
                        <DropdownMenuContent align="end" className="w-40 rounded-2xl shadow-xl border border-slate-100 p-1.5" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenuItem
                            onClick={() => handleEditCompany(company)}
                            disabled={deleteMutation.isPending}
                            className="flex items-center gap-2 text-xs font-semibold py-2 rounded-xl cursor-pointer text-slate-700 hover:text-procarni-blue hover:bg-slate-50"
                          >
                            <Edit className="h-4 w-4 text-slate-400" />
                            <span>Editar</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => confirmDeleteCompany(company.id)}
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
                      <TableHead className="font-bold text-[10px] tracking-wider uppercase text-slate-500 pl-4 py-3.5">Nombre</TableHead>
                      <TableHead className="font-bold text-[10px] tracking-wider uppercase text-slate-500 py-3.5">RIF</TableHead>
                      <TableHead className="font-bold text-[10px] tracking-wider uppercase text-slate-500 py-3.5">Email</TableHead>
                      <TableHead className="font-bold text-[10px] tracking-wider uppercase text-slate-500 py-3.5">Teléfono</TableHead>
                      <TableHead className="font-bold text-[10px] tracking-wider uppercase text-slate-500 py-3.5">Dirección</TableHead>
                      <TableHead className="text-right font-bold text-[10px] tracking-wider uppercase text-slate-500 pr-4 py-3.5">Opciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCompanies.map((company) => (
                      <TableRow key={company.id} className="hover:bg-slate-50/60 transition-colors border-b border-slate-50">
                        <TableCell className="pl-4 py-3.5 font-bold text-sm text-procarni-dark max-w-[200px] truncate" title={company.name}>
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-lg bg-procarni-blue/10 text-procarni-blue flex items-center justify-center shrink-0 font-bold text-xs">
                              {company.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="truncate">{company.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="py-3.5 whitespace-nowrap">
                          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                            {company.rif}
                          </span>
                        </TableCell>
                        <TableCell className="py-3.5 text-xs text-slate-600 max-w-[200px] truncate" title={company.email}>
                          {company.email || <span className="text-slate-400 italic">N/A</span>}
                        </TableCell>
                        <TableCell className="py-3.5 font-mono text-xs text-slate-600 whitespace-nowrap">
                          {company.phone || <span className="text-slate-400 italic font-sans">N/A</span>}
                        </TableCell>
                        <TableCell className="py-3.5 text-xs text-slate-500 max-w-[250px] truncate" title={company.address}>
                          {company.address || <span className="text-slate-400 italic">N/A</span>}
                        </TableCell>
                        <TableCell className="text-right pr-4 py-3.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
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
                            <DropdownMenuContent align="end" className="w-40 rounded-2xl shadow-xl border border-slate-100 p-1.5">
                              <DropdownMenuItem
                                onClick={() => handleEditCompany(company)}
                                disabled={deleteMutation.isPending}
                                className="flex items-center gap-2 text-xs font-semibold py-2 rounded-xl cursor-pointer text-slate-700 hover:text-procarni-blue hover:bg-slate-50"
                              >
                                <Edit className="h-4 w-4 text-slate-400" />
                                <span>Editar</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => confirmDeleteCompany(company.id)}
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
              <h3 className="text-base font-bold text-slate-800">No se encontraron empresas</h3>
              <p className="text-xs text-slate-500 max-w-sm mt-1">
                No hay empresas registradas o no coinciden con los términos de búsqueda.
              </p>
            </div>
          )}
        </CardContent>
      </Card>


      {/* AlertDialog for delete confirmation */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás absolutamente seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. No podrás eliminar la empresa si tiene registros (órdenes o solicitudes) asociados a ella.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={executeDeleteCompany} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CompanyManagement;