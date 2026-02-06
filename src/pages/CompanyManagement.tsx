import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { PlusCircle, Edit, Trash2, Search, Phone, Mail, ArrowLeft, Tag, MapPin } from 'lucide-react';
import { MadeWithDyad } from '@/components/made-with-dyad';
import { getAllCompanies, createCompany, updateCompany, deleteCompany } from '@/integrations/supabase/data';
import { showError, showSuccess } from '@/utils/toast';
import CompanyForm from '@/components/CompanyForm';
import { useSession } from '@/components/SessionContextProvider';
import { Input } from '@/components/ui/input';
import { useIsMobile } from '@/hooks/use-mobile';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface Company {
  id: string;
  name: string;
  rif: string;
  logo_url?: string;
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
  address?: string;
  phone?: string;
  email?: string;
}

const CompanyManagement = () => {
  const queryClient = useQueryClient();
  const { session } = useSession();
  const userId = session?.user?.id;
  const isMobile = useIsMobile();
  const navigate = useNavigate();

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
    mutationFn: (newCompany: Omit<Company, 'id' | 'created_at' | 'updated_at' | 'user_id' | 'fiscal_data'>) =>
      createCompany({ ...newCompany, user_id: userId! }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      setIsFormOpen(false);
      showSuccess('Empresa creada exitosamente.');
    },
    onError: (err) => {
      showError(`Error al crear empresa: ${err.message}`);
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
    onError: (err) => {
      showError(`Error al eliminar empresa: ${err.message}`);
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
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-4">
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver
        </Button>
      </div>
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="text-procarni-primary">Gestión de Empresas</CardTitle>
            <CardDescription>Administra la información de tus empresas.</CardDescription>
          </div>
          <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <DialogTrigger asChild>
              <Button onClick={handleAddCompany} className="bg-procarni-secondary hover:bg-green-700">
                <PlusCircle className="mr-2 h-4 w-4" /> Añadir Empresa
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] md:max-w-2xl max-h-[90vh] overflow-y-auto" description={editingCompany ? 'Edita los detalles de la empresa existente.' : 'Completa los campos para añadir una nueva empresa.'}>
              <DialogHeader>
                <DialogTitle>{editingCompany ? 'Editar Empresa' : 'Añadir Nueva Empresa'}</DialogTitle>
              </DialogHeader>
              <CompanyForm
                initialData={editingCompany || undefined}
                onSubmit={handleSubmitForm}
                onCancel={() => setIsFormOpen(false)}
                isSubmitting={createMutation.isPending || updateMutation.isPending}
              />
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <div className="relative mb-4">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Buscar empresa por RIF, nombre, dirección o email..."
              className="w-full appearance-none bg-background pl-8 shadow-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {filteredCompanies.length > 0 ? (
            isMobile ? (
              <div className="grid gap-4">
                {filteredCompanies.map((company) => (
                  <Card key={company.id} className="p-4 shadow-md">
                    <CardTitle className="text-lg mb-1">{company.name}</CardTitle>
                    <CardDescription className="mb-2 flex items-center">
                      <Tag className="mr-1 h-3 w-3" /> RIF: {company.rif}
                    </CardDescription>
                    <div className="text-sm space-y-1 mt-2 w-full">
                      {company.email && <p className="flex items-center"><Mail className="mr-1 h-3 w-3" /> Email: <a href={`mailto:${company.email}`} className="text-blue-600 hover:underline ml-1">{company.email}</a></p>}
                      {company.phone && <p className="flex items-center"><Phone className="mr-1 h-3 w-3" /> Teléfono: {company.phone}</p>}
                      {company.address && <p className="flex items-center"><MapPin className="mr-1 h-3 w-3" /> Dirección: {company.address}</p>}
                    </div>
                    <div className="flex justify-end gap-2 mt-4 border-t pt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); handleEditCompany(company); }}
                        disabled={deleteMutation.isPending}
                      >
                        <Edit className="h-4 w-4 mr-2" /> Editar
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); confirmDeleteCompany(company.id); }}
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
                      <TableHead>Nombre</TableHead>
                      <TableHead>RIF</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Teléfono</TableHead>
                      <TableHead>Dirección</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCompanies.map((company) => (
                      <TableRow key={company.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                        <TableCell className="font-medium">{company.name}</TableCell>
                        <TableCell>{company.rif}</TableCell>
                        <TableCell>{company.email || 'N/A'}</TableCell>
                        <TableCell>{company.phone || 'N/A'}</TableCell>
                        <TableCell>{company.address || 'N/A'}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => { e.stopPropagation(); handleEditCompany(company); }}
                            disabled={deleteMutation.isPending}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => { e.stopPropagation(); confirmDeleteCompany(company.id); }}
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
              No hay empresas registradas o no se encontraron resultados para tu búsqueda.
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
              Esta acción no se puede deshacer. Esto eliminará permanentemente la empresa y todas las órdenes de compra/solicitudes de cotización asociadas a ella.
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