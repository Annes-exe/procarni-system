import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  MapPin,
  Phone,
  Mail,
  Plus,
  Edit2,
  Trash2,
  Copy,
  Check,
  ExternalLink,
  MessageCircle,
  Loader2,
  Search,
  ChevronsUpDown,
  Navigation,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  getSupplierBranches,
  createSupplierBranch,
  updateSupplierBranch,
  deleteSupplierBranch,
  getLocations,
} from '@/integrations/supabase/data';
import { SupplierBranch } from '@/integrations/supabase/types';
import { detectLocation } from '@/utils/location-detector';
import { showError, showSuccess } from '@/utils/toast';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface SupplierBranchesManagerProps {
  supplierId: string;
  supplierName?: string;
  readOnly?: boolean;
}

export const SupplierBranchesManager: React.FC<SupplierBranchesManagerProps> = ({
  supplierId,
  supplierName = 'Proveedor',
  readOnly = false,
}) => {
  const queryClient = useQueryClient();

  // Queries
  const {
    data: branches = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['supplier_branches', supplierId],
    queryFn: () => getSupplierBranches(supplierId),
    enabled: !!supplierId && supplierId !== 'new',
  });

  const { data: dbLocations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: getLocations,
    staleTime: 1000 * 60 * 60,
  });

  // Modal / Form States
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<SupplierBranch | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [phone2, setPhone2] = useState('');
  const [email, setEmail] = useState('');
  const [openLocationPopover, setOpenLocationPopover] = useState(false);

  // Delete States
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [branchToDelete, setBranchToDelete] = useState<SupplierBranch | null>(null);

  // Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Auto-detect location when address changes in form
  const handleAddressChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newAddress = e.target.value;
    setAddress(newAddress);

    if (newAddress.length > 5 && dbLocations.length > 0) {
      const { state: detectedState, city: detectedCity } = detectLocation(newAddress, dbLocations);
      if (detectedState && !state) setState(detectedState);
      if (detectedCity && !city) setCity(detectedCity);
    }
  };

  const handleOpenCreateDialog = () => {
    setEditingBranch(null);
    setName('');
    setAddress('');
    setState('');
    setCity('');
    setPhone('');
    setPhone2('');
    setEmail('');
    setIsDialogOpen(true);
  };

  const handleOpenEditDialog = (branch: SupplierBranch) => {
    setEditingBranch(branch);
    setName(branch.name || '');
    setAddress(branch.address || '');
    setState(branch.state || '');
    setCity(branch.city || '');
    setPhone(branch.phone || '');
    setPhone2(branch.phone_2 || '');
    setEmail(branch.email || '');
    setIsDialogOpen(true);
  };

  // Mutations
  const createMutation = useMutation({
    mutationFn: (branchData: Omit<SupplierBranch, 'id' | 'created_at' | 'updated_at'>) =>
      createSupplierBranch(branchData),
    onSuccess: (data) => {
      if (data) {
        queryClient.invalidateQueries({ queryKey: ['supplier_branches', supplierId] });
        queryClient.invalidateQueries({ queryKey: ['supplier', supplierId] });
        showSuccess('Sede agregada exitosamente.');
        setIsDialogOpen(false);
      }
    },
    onError: (err: any) => {
      showError(`Error al crear la sede: ${err.message || 'Error desconocido'}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<SupplierBranch> }) =>
      updateSupplierBranch(id, updates),
    onSuccess: (data) => {
      if (data) {
        queryClient.invalidateQueries({ queryKey: ['supplier_branches', supplierId] });
        queryClient.invalidateQueries({ queryKey: ['supplier', supplierId] });
        showSuccess('Sede actualizada exitosamente.');
        setIsDialogOpen(false);
        setEditingBranch(null);
      }
    },
    onError: (err: any) => {
      showError(`Error al actualizar la sede: ${err.message || 'Error desconocido'}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (branchId: string) => deleteSupplierBranch(branchId, supplierId),
    onSuccess: (success) => {
      if (success) {
        queryClient.invalidateQueries({ queryKey: ['supplier_branches', supplierId] });
        queryClient.invalidateQueries({ queryKey: ['supplier', supplierId] });
        showSuccess('Sede eliminada correctamente.');
        setIsDeleteDialogOpen(false);
        setBranchToDelete(null);
      }
    },
    onError: (err: any) => {
      showError(`Error al eliminar la sede: ${err.message || 'Error desconocido'}`);
      setIsDeleteDialogOpen(false);
      setBranchToDelete(null);
    },
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      showError('Por favor ingresa un nombre para la sede (ej. Sede Valencia).');
      return;
    }

    const payload = {
      supplier_id: supplierId,
      name: name.trim(),
      address: address.trim() || null,
      state: state.trim() || null,
      city: city.trim() || null,
      phone: phone.trim() || null,
      phone_2: phone2.trim() || null,
      email: email.trim() || null,
      status: 'Active',
      user_id: null,
    };

    if (editingBranch) {
      updateMutation.mutate({ id: editingBranch.id, updates: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleCopyAddress = (branch: SupplierBranch) => {
    const fullText = [
      branch.name,
      branch.address,
      branch.city ? `${branch.city}, ${branch.state || ''}` : branch.state,
    ]
      .filter(Boolean)
      .join(' - ');

    navigator.clipboard.writeText(fullText);
    setCopiedId(branch.id);
    toast.success('Dirección copiada al portapapeles');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredBranches = branches.filter((branch) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      branch.name?.toLowerCase().includes(term) ||
      branch.address?.toLowerCase().includes(term) ||
      branch.city?.toLowerCase().includes(term) ||
      branch.state?.toLowerCase().includes(term) ||
      branch.phone?.toLowerCase().includes(term) ||
      branch.email?.toLowerCase().includes(term)
    );
  });

  if (supplierId === 'new') {
    return (
      <div className="p-6 text-center bg-slate-50/50 rounded-2xl border border-dashed border-gray-200">
        <Building2 className="w-10 h-10 text-gray-400 mx-auto mb-2" />
        <p className="text-sm font-medium text-gray-600">
          Podrás registrar y gestionar sedes una vez que guardes los datos iniciales del proveedor.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-procarni-primary" />
            <h3 className="text-lg font-bold text-gray-900 tracking-tight">
              Sedes y Sucursales
            </h3>
            <Badge variant="secondary" className="font-semibold text-xs bg-slate-100 text-slate-700">
              {branches.length} {branches.length === 1 ? 'sede' : 'sedes'}
            </Badge>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Consulta y gestiona las diferentes direcciones y números de contacto de {supplierName}.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {branches.length > 3 && (
            <div className="relative w-full sm:w-60">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Buscar por sede o ciudad..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9 text-xs bg-white/70"
              />
            </div>
          )}

          {!readOnly && (
            <Button
              onClick={handleOpenCreateDialog}
              className="bg-procarni-primary hover:bg-procarni-primary/90 text-white shadow-md hover:shadow-lg transition-all text-xs font-semibold h-9 px-4 rounded-xl gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Nueva Sede
            </Button>
          )}
        </div>
      </div>

      {/* Loading & Error States */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-procarni-primary" />
          <span className="ml-2 text-sm text-gray-500">Cargando sedes...</span>
        </div>
      ) : isError ? (
        <div className="p-6 text-center bg-red-50/50 rounded-2xl border border-red-200">
          <p className="text-sm font-medium text-red-600">Error al cargar las sedes del proveedor.</p>
        </div>
      ) : branches.length === 0 ? (
        /* Empty State */
        <div className="p-8 text-center bg-white/70 backdrop-blur-xl rounded-3xl border border-gray-100 shadow-sm ring-1 ring-white flex flex-col items-center justify-center">
          <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center text-procarni-primary mb-3">
            <Building2 className="w-6 h-6" />
          </div>
          <h4 className="text-base font-bold text-gray-800">No hay sedes registradas</h4>
          <p className="text-xs text-gray-500 max-w-md mt-1 mb-5">
            Agrega las sucursales, almacenes o plantas de este proveedor para consultar rápidamente su dirección exacta y números de contacto.
          </p>
          {!readOnly && (
            <Button
              onClick={handleOpenCreateDialog}
              className="bg-procarni-primary hover:bg-procarni-primary/90 text-white text-xs font-semibold h-9 px-4 rounded-xl shadow-md gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Registrar Primera Sede
            </Button>
          )}
        </div>
      ) : (
        /* Branches Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredBranches.map((branch) => {
            const cleanPhone = branch.phone?.replace(/\D/g, '') || '';
            const cleanPhone2 = branch.phone_2?.replace(/\D/g, '') || '';

            return (
              <Card
                key={branch.id}
                className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/70 shadow-sm hover:shadow-md transition-all duration-300 ring-1 ring-white/60 group overflow-hidden flex flex-col justify-between"
              >
                <CardContent className="p-5 space-y-4">
                  {/* Card Header: Name + Actions */}
                  <div className="flex items-start justify-between gap-2 border-b border-gray-100 pb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-red-50 text-procarni-primary flex items-center justify-center shrink-0">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-sm text-gray-900 truncate" title={branch.name}>
                          {branch.name}
                        </h4>
                        {(branch.city || branch.state) && (
                          <p className="text-[11px] font-medium text-gray-500 truncate">
                            {[branch.city, branch.state].filter(Boolean).join(', ')}
                          </p>
                        )}
                      </div>
                    </div>

                    {!readOnly && (
                      <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-gray-500 hover:text-procarni-primary hover:bg-red-50 rounded-lg"
                          onClick={() => handleOpenEditDialog(branch)}
                          title="Editar Sede"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                          onClick={() => {
                            setBranchToDelete(branch);
                            setIsDeleteDialogOpen(true);
                          }}
                          title="Eliminar Sede"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Address Section */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-gray-400">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-procarni-primary" /> Dirección
                      </span>
                      {branch.address && (
                        <button
                          type="button"
                          onClick={() => handleCopyAddress(branch)}
                          className="hover:text-procarni-primary transition-colors flex items-center gap-0.5 lowercase text-[10px]"
                          title="Copiar dirección"
                        >
                          {copiedId === branch.id ? (
                            <>
                              <Check className="w-2.5 h-2.5 text-green-600" /> Copiado
                            </>
                          ) : (
                            <>
                              <Copy className="w-2.5 h-2.5" /> copiar
                            </>
                          )}
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-gray-700 leading-relaxed line-clamp-3 bg-slate-50/60 p-2.5 rounded-xl border border-gray-100 font-normal">
                      {branch.address || <span className="italic text-gray-400">Sin dirección especificada</span>}
                    </p>
                  </div>

                  {/* Contact Info (Phones & Email) */}
                  <div className="space-y-2 pt-1 border-t border-gray-100/80">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">
                      Contacto Directo
                    </span>

                    {/* Primary Phone */}
                    {branch.phone ? (
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 text-gray-700 font-medium truncate">
                          <Phone className="w-3.5 h-3.5 text-procarni-secondary shrink-0" />
                          <span className="font-mono text-xs">{branch.phone}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <a
                            href={`tel:${cleanPhone}`}
                            className="p-1 text-gray-500 hover:text-procarni-secondary hover:bg-green-50 rounded transition-colors"
                            title="Llamar"
                          >
                            <Phone className="w-3 h-3" />
                          </a>
                          <a
                            href={`https://wa.me/${cleanPhone.startsWith('58') ? cleanPhone : '58' + cleanPhone}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                            title="WhatsApp"
                          >
                            <MessageCircle className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                    ) : null}

                    {/* Secondary Phone */}
                    {branch.phone_2 ? (
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 text-gray-700 font-medium truncate">
                          <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span className="font-mono text-xs text-gray-600">{branch.phone_2}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <a
                            href={`tel:${cleanPhone2}`}
                            className="p-1 text-gray-500 hover:text-procarni-secondary hover:bg-green-50 rounded transition-colors"
                            title="Llamar"
                          >
                            <Phone className="w-3 h-3" />
                          </a>
                          <a
                            href={`https://wa.me/${cleanPhone2.startsWith('58') ? cleanPhone2 : '58' + cleanPhone2}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                            title="WhatsApp"
                          >
                            <MessageCircle className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                    ) : null}

                    {/* Email */}
                    {branch.email ? (
                      <div className="flex items-center justify-between text-xs pt-0.5">
                        <div className="flex items-center gap-1.5 text-gray-700 truncate">
                          <Mail className="w-3.5 h-3.5 text-procarni-blue shrink-0" />
                          <span className="truncate text-xs">{branch.email}</span>
                        </div>
                        <a
                          href={`mailto:${branch.email}`}
                          className="p-1 text-gray-500 hover:text-procarni-blue hover:bg-blue-50 rounded transition-colors"
                          title="Enviar correo"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    ) : null}

                    {!branch.phone && !branch.phone_2 && !branch.email && (
                      <p className="text-[11px] text-gray-400 italic">Sin datos de contacto directo</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog for Create / Edit Branch */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-lg bg-white/95 backdrop-blur-2xl rounded-3xl p-6 border-none shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-procarni-primary" />
              {editingBranch ? 'Editar Sede' : 'Agregar Nueva Sede'}
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-500">
              Registra la dirección física y los canales de contacto directo para esta sede.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4 py-2">
            {/* Nombre de la Sede */}
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Nombre de la Sede <span className="text-red-500">*</span>
              </Label>
              <Input
                placeholder="Ej. Sede Valencia, Planta Guacara, Almacén Central..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="h-10 text-sm bg-gray-50/50 border-gray-200 focus:ring-procarni-primary/20 rounded-xl"
              />
            </div>

            {/* Dirección */}
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Dirección Física
              </Label>
              <Textarea
                placeholder="Calle, avenida, zona industrial, galpón, punto de referencia..."
                value={address}
                onChange={handleAddressChange}
                rows={3}
                className="text-sm bg-gray-50/50 border-gray-200 focus:ring-procarni-primary/20 rounded-xl resize-none"
              />
            </div>

            {/* Estado y Municipio (Location Picker) */}
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Ubicación Geográfica (Estado / Municipio)
              </Label>
              <Popover open={openLocationPopover} onOpenChange={setOpenLocationPopover}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={openLocationPopover}
                    className="w-full justify-between h-10 bg-gray-50/50 border-gray-200 text-sm font-normal rounded-xl"
                  >
                    {city || state ? (
                      <span className="flex items-center gap-1.5 text-gray-800 font-medium">
                        <MapPin className="w-4 h-4 text-procarni-primary" />
                        {[city, state].filter(Boolean).join(' - Estado ')}
                      </span>
                    ) : (
                      <span className="text-gray-400 flex items-center gap-1.5">
                        <MapPin className="w-4 h-4" />
                        Seleccionar Estado / Municipio...
                      </span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[320px] sm:w-[400px] p-0 rounded-2xl shadow-xl" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar municipio o estado..." className="h-9 text-xs" />
                    <CommandList className="max-h-60">
                      <CommandEmpty className="py-3 text-center text-xs text-gray-500">
                        No se encontraron municipios.
                      </CommandEmpty>
                      <CommandGroup heading="Municipios y Estados">
                        {dbLocations.map((loc) => {
                          const isSelected = city === loc.city && state === loc.state;
                          return (
                            <CommandItem
                              key={loc.id}
                              value={`${loc.city} ${loc.state}`}
                              onSelect={() => {
                                setCity(loc.city);
                                setState(loc.state);
                                setOpenLocationPopover(false);
                              }}
                              className="text-xs cursor-pointer py-2 flex items-center justify-between"
                            >
                              <div>
                                <span className="font-semibold text-gray-800">{loc.city}</span>
                                <span className="text-gray-400 ml-1.5">({loc.state})</span>
                              </div>
                              {isSelected && <Check className="w-4 h-4 text-procarni-secondary" />}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Teléfonos */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Teléfono Principal
                </Label>
                <Input
                  placeholder="Ej. 0414-1234567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="h-10 text-sm bg-gray-50/50 border-gray-200 focus:ring-procarni-primary/20 rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Teléfono Secundario
                </Label>
                <Input
                  placeholder="Ej. 0241-8765432"
                  value={phone2}
                  onChange={(e) => setPhone2(e.target.value)}
                  className="h-10 text-sm bg-gray-50/50 border-gray-200 focus:ring-procarni-primary/20 rounded-xl"
                />
              </div>
            </div>

            {/* Correo Electrónico */}
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Correo Electrónico de la Sede
              </Label>
              <Input
                type="email"
                placeholder="Ej. ventas.valencia@proveedor.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-10 text-sm bg-gray-50/50 border-gray-200 focus:ring-procarni-primary/20 rounded-xl"
              />
            </div>

            <DialogFooter className="pt-3 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                className="rounded-xl h-10 px-4 text-xs font-semibold text-gray-600"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                className="bg-procarni-primary hover:bg-procarni-primary/90 text-white rounded-xl h-10 px-5 text-xs font-semibold shadow-md"
              >
                {createMutation.isPending || updateMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                    Guardando...
                  </>
                ) : editingBranch ? (
                  'Guardar Cambios'
                ) : (
                  'Crear Sede'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Alert Dialog for Confirming Delete */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="rounded-3xl bg-white/95 backdrop-blur-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-bold text-gray-900">
              ¿Eliminar la sede "{branchToDelete?.name}"?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-gray-500">
              Esta acción eliminará permanentemente la dirección y los datos de contacto registrados para esta sede.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-xl h-9 text-xs font-semibold">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => branchToDelete && deleteMutation.mutate(branchToDelete.id)}
              className="bg-red-600 hover:bg-red-700 text-white rounded-xl h-9 text-xs font-semibold"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Sí, Eliminar'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SupplierBranchesManager;
