"use client";

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { DialogFooter } from '@/components/ui/dialog';
import { Check, ChevronsUpDown, Loader2, Plus, X, PlusCircle, Info } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getAllMaterials, searchMaterials } from '@/integrations/supabase/data';
import { showError, showSuccess } from '@/utils/toast';
import { validateRif } from '@/utils/validators';
import MaterialCreationDialog from '@/components/MaterialCreationDialog';
import { VENEZUELAN_MUNICIPALITIES_FLAT } from '@/constants/venezuela-locations';
import { detectLocation } from '@/utils/location-detector';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';

// Esquema de validación - reestructurado para evitar problemas con ctx.parent
const supplierFormSchema = z.object({
  // El código se autogenera y no se gestiona en el formulario, por lo que se elimina de aquí.
  rif: z.string().min(1, 'RIF es requerido').refine((val) => validateRif(val) !== null, {
    message: 'Formato de RIF inválido. Ej: J123456789',
  }),
  name: z.string().min(1, 'Nombre es requerido'),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')), // MODIFIED: Made optional
  phone_2: z.string().optional().or(z.literal('')),
  instagram: z.string().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  payment_terms: z.enum(['Contado', 'Crédito', 'Otro'], { message: 'Términos de pago son requeridos y deben ser Contado, Crédito u Otro.' }), // Opciones limitadas
  // Eliminamos las validaciones condicionales que dependen de ctx.parent
  custom_payment_terms: z.string().optional().nullable(),
  credit_days: z.number().min(0, 'Días de crédito no puede ser negativo').optional(),
  status: z.string().min(1, 'Estado es requerido'),
  materials: z.array(
    z.object({
      material_id: z.string().min(1, 'Material es requerido'),
      material_name: z.string().min(1, 'Nombre de material es requerido'),
      material_category: z.string().optional(),
      specification: z.string().optional(),
    })
  ).optional(),
  alert_comment: z.string().optional().nullable(),
});

type SupplierFormValues = z.infer<typeof supplierFormSchema>;

interface SupplierFormProps {
  initialData?: {
    id?: string;
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
    payment_terms: 'Contado' | 'Crédito' | 'Otro';
    custom_payment_terms?: string | null;
    credit_days: number;
    status: string;
    alert_comment?: string | null;
    materials?: Array<{
      id?: string;
      material_id: string;
      specification?: string;
      materials?: {
        id: string;
        name: string;
        category?: string;
      };
    }>;
  };
  onSubmit: (data: SupplierFormValues) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

const SupplierForm = ({ initialData, onSubmit, onCancel, isSubmitting }: SupplierFormProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isMaterialCreationDialogOpen, setIsMaterialCreationDialogOpen] = useState(false); // NEW STATE

  const { data: allMaterials, isLoading: isLoadingMaterials, refetch: refetchMaterials } = useQuery({
    queryKey: ['materials'],
    queryFn: getAllMaterials,
  });

  const form = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierFormSchema),
    defaultValues: {
      rif: '',
      name: '',
      email: '',
      phone: '',
      phone_2: '',
      instagram: '',
      address: '',
      city: '',
      state: '',
      payment_terms: 'Contado',
      custom_payment_terms: '',
      credit_days: 0,
      status: 'Active', // Changed to English to match database constraint
      materials: [],
      alert_comment: '',
    },
  });

  const currentMaterialsInForm = form.watch('materials');
  const currentPaymentTerms = form.watch('payment_terms');
  const currentAddress = form.watch('address');

  useEffect(() => {
    if (currentAddress) {
      const { state: detectedState, city: detectedCity } = detectLocation(currentAddress);

      if (detectedState && form.getValues('state') !== detectedState) {
        form.setValue('state', detectedState, { shouldDirty: true });
      }
      if (detectedCity && form.getValues('city') !== detectedCity) {
        form.setValue('city', detectedCity, { shouldDirty: true });
      }
    }
  }, [currentAddress, form]);


  const currentSupplierId = initialData?.id;

  useEffect(() => {
    if (initialData) {
      const formattedMaterials = initialData.materials?.map(mat => ({
        material_id: mat.material_id,
        material_name: mat.materials?.name || '',
        material_category: mat.materials?.category || '',
        specification: mat.specification || '',
      })) || [];

      form.reset({
        rif: initialData.rif || '',
        name: initialData.name || '',
        email: initialData.email || '',
        phone: initialData.phone || '',
        phone_2: initialData.phone_2 || '',
        instagram: initialData.instagram || '',
        address: initialData.address || '',
        city: initialData.city || '',
        state: initialData.state || '',
        payment_terms: initialData.payment_terms,
        custom_payment_terms: initialData.custom_payment_terms || '',
        credit_days: initialData.credit_days || 0,
        status: initialData.status || 'Active', // Changed to English
        materials: formattedMaterials,
        alert_comment: initialData.alert_comment || '',
      });
    } else {
      form.reset({
        rif: '',
        name: '',
        email: '',
        phone: '',
        phone_2: '',
        instagram: '',
        address: '',
        city: '',
        state: '',
        payment_terms: 'Contado',
        custom_payment_terms: '',
        credit_days: 0,
        status: 'Active', // Changed to English
        materials: [],
        alert_comment: '',
      });
    }
  }, [initialData, form]);

  const handleAddMaterial = (material: { id: string; name: string; category?: string }) => {
    const materialsArray = form.getValues('materials') || [];
    if (materialsArray.some(m => m.material_id === material.id)) {
      showError('Este material ya está asociado al proveedor');
      return;
    }

    const newMaterialEntry = {
      material_id: material.id,
      material_name: material.name,
      material_category: material.category || '',
      specification: '',
    };

    form.setValue('materials', [...materialsArray, newMaterialEntry], { shouldDirty: true });
  };

  const handleMaterialCreatedFromDialog = (material: { id: string; name: string; unit?: string; is_exempt?: boolean; specification?: string }) => {
    // 1. Add the newly created/associated material to the form state
    const materialsArray = form.getValues('materials') || [];

    // Check if it was already added (shouldn't happen if logic is correct, but safety check)
    if (materialsArray.some(m => m.material_id === material.id)) {
      showError('El material ya estaba en la lista.');
      return;
    }

    const newMaterialEntry = {
      material_id: material.id,
      material_name: material.name,
      material_category: '', // We don't have category here, rely on refetch if needed later
      specification: material.specification || '',
    };

    form.setValue('materials', [...materialsArray, newMaterialEntry], { shouldDirty: true });

    // 2. Since a new material might have been created, invalidate the general materials query
    refetchMaterials();
  };

  const handleRemoveMaterial = (materialId: string) => {
    const materialsArray = form.getValues('materials') || [];
    const updatedMaterials = materialsArray.filter(m => m.material_id !== materialId);
    form.setValue('materials', updatedMaterials, { shouldDirty: true });
  };

  const handleSpecificationChange = (materialId: string, specification: string) => {
    const materialsArray = form.getValues('materials') || [];
    const updatedMaterials = materialsArray.map(m =>
      m.material_id === materialId ? { ...m, specification } : m
    );
    form.setValue('materials', updatedMaterials, { shouldDirty: true });
  };

  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);

  // Search materials when searchTerm changes
  useEffect(() => {
    const search = async () => {
      // If searchTerm is empty, no need to search, but perhaps show a default list or empty
      if (!searchTerm.trim()) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      try {
        const results = await searchMaterials(searchTerm);
        setSearchResults(results || []);
      } catch (error) {
        console.error('Error searching materials:', error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    };

    const timeoutId = setTimeout(search, 300);
    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  const handleFormSubmit = (data: SupplierFormValues) => {
    const normalizedRif = validateRif(data.rif);
    if (!normalizedRif) {
      form.setError('rif', { message: 'Formato de RIF inválido.' });
      return;
    }

    // Validaciones manuales para campos condicionales
    if (data.payment_terms === 'Otro' && (!data.custom_payment_terms || data.custom_payment_terms.trim() === '')) {
      form.setError('custom_payment_terms', { message: 'Términos de pago personalizados son requeridos si el tipo es "Otro".' });
      return;
    }

    if (data.payment_terms === 'Crédito' && (data.credit_days === undefined || data.credit_days === null || data.credit_days <= 0)) {
      form.setError('credit_days', { message: 'Días de crédito son requeridos y deben ser mayores a 0 para términos de "Crédito".' });
      return;
    }

    // Asegurarse de que credit_days sea 0 si no es 'Crédito'
    // Asegurarse de que custom_payment_terms sea null si no es 'Otro'
    const finalData = {
      ...data,
      rif: normalizedRif,
      city: data.city || null,
      state: data.state || null,
      name: data.name.toUpperCase(), // Ensure name is uppercase before submission
      credit_days: data.payment_terms === 'Crédito' ? data.credit_days : 0,
      custom_payment_terms: data.payment_terms === 'Otro' ? data.custom_payment_terms : null,
    };
    onSubmit(finalData);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 items-start">
          
          {/* Columna Derecha: Materiales Asociados (en desktop) */}
          <div className="order-2 md:order-2 space-y-4">
            <div className="p-4 bg-gray-50/50 border rounded-xl overflow-hidden">
              <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-4 flex justify-between items-center">
                Materiales Asociados
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs bg-white"
                  onClick={() => setIsMaterialCreationDialogOpen(true)}
                >
                  <PlusCircle className="mr-1.5 h-3.5 w-3.5" /> Crear
                </Button>
              </h3>

              <div className="space-y-4">
                <div className="relative">
                  <Input
                    placeholder="Buscar materiales para asociar..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pr-10 bg-white"
                  />
                  {(isLoadingMaterials || isSearching) && (
                    <div className="absolute right-3 top-2.5">
                      <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                    </div>
                  )}
                </div>

                {!isLoadingMaterials && !isSearching && (
                  <div className="max-h-48 overflow-y-auto border bg-white rounded-md p-1 shadow-sm">
                    {searchResults.length > 0 ? (
                      searchResults.map((material) => (
                        <div
                          key={material.id}
                          className="p-2 hover:bg-procarni-light/30 rounded cursor-pointer flex justify-between items-center group transition-colors"
                          onClick={() => handleAddMaterial(material)}
                        >
                          <div className="min-w-0 pr-2">
                            <div className="font-medium text-xs truncate">{material.name}</div>
                            <div className="text-[10px] text-muted-foreground truncate">
                              {material.code} {material.category && `• ${material.category}`}
                            </div>
                          </div>
                          <Button type="button" size="xs" variant="ghost" className="h-6 w-6 p-0 group-hover:bg-procarni-secondary group-hover:text-white">
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      ))
                    ) : searchTerm.trim().length > 0 ? (
                      <div className="text-[11px] text-center text-muted-foreground py-4">
                        Sin resultados para "{searchTerm}"
                      </div>
                    ) : (
                      <div className="text-[11px] text-center text-muted-foreground py-4">
                        Escribe para buscar y añadir...
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-3 pt-2">
                  {currentMaterialsInForm && currentMaterialsInForm.length > 0 ? (
                    currentMaterialsInForm.map((material) => (
                      <div key={material.material_id} className="p-3 bg-white border rounded-lg shadow-sm flex flex-col gap-2 group relative">
                        <div className="flex justify-between items-start">
                          <div className="min-w-0">
                            <div className="font-semibold text-xs text-procarni-dark truncate pr-6">{material.material_name}</div>
                            {material.material_category && (
                              <div className="text-[10px] text-muted-foreground">
                                {material.material_category}
                              </div>
                            )}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 absolute right-2 top-2 text-gray-400 hover:text-red-500"
                            onClick={() => handleRemoveMaterial(material.material_id)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <div>
                          <Input
                            value={material.specification || ''}
                            onChange={(e) => handleSpecificationChange(material.material_id, e.target.value)}
                            placeholder="Especificación (ej: Marca, Grosor...)"
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-[11px] text-center text-gray-400 border border-dashed rounded-lg py-8">
                      No hay materiales asociados aún
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Columna Izquierda: Datos del Proveedor (en desktop) */}
          <div className="order-1 md:order-1 space-y-6">
            
            {/* Sección: Datos Básicos */}
            <div className="space-y-4">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-procarni-secondary border-l-2 border-procarni-secondary pl-2">Identificación</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="rif"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">RIF</FormLabel>
                      <FormControl>
                        <Input placeholder="J123456789" {...field} className="h-9" />
                      </FormControl>
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Estado</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Estado" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Active">Activo</SelectItem>
                          <SelectItem value="Inactive">Inactivo</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Nombre / Razón Social</FormLabel>
                    <FormControl>
                      <Input placeholder="Nombre del proveedor" {...field} className="h-9" />
                    </FormControl>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />
            </div>

            {/* Sección: Contacto */}
            <div className="space-y-4">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-procarni-secondary border-l-2 border-procarni-secondary pl-2">Contacto</h4>
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="proveedor@ejemplo.com" {...field} value={field.value || ''} className="h-9" />
                    </FormControl>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Teléfono Principal</FormLabel>
                      <FormControl>
                        <Input placeholder="0412-1234567" {...field} value={field.value || ''} className="h-9" />
                      </FormControl>
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone_2"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Teléfono Secundario</FormLabel>
                      <FormControl>
                        <Input placeholder="Opcional" {...field} value={field.value || ''} className="h-9" />
                      </FormControl>
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="instagram"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Instagram</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-gray-400 h-4 w-4">@</span>
                        <Input placeholder="usuario" {...field} value={field.value || ''} className="h-9 pl-8" />
                      </div>
                    </FormControl>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />
            </div>

            {/* Sección: Ubicación */}
            <div className="space-y-4 pt-2">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-procarni-secondary border-l-2 border-procarni-secondary pl-2">Ubicación</h4>
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Dirección Fiscal</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Dirección completa..." {...field} value={field.value || ''} className="min-h-[80px] resize-none" />
                    </FormControl>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel className="text-xs">Ciudad / Municipio</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            role="combobox"
                            className={cn(
                              "w-full justify-between h-9 text-xs font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value
                              ? VENEZUELAN_MUNICIPALITIES_FLAT.find(
                                  (m) => m.city === field.value && m.state === form.getValues('state')
                                )?.label || field.value
                              : "Seleccionar ciudad..."}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-[300px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Buscar ciudad o estado..." />
                          <CommandList className="max-h-48">
                            <CommandEmpty>No se encontró la ciudad.</CommandEmpty>
                            <CommandGroup>
                              {VENEZUELAN_MUNICIPALITIES_FLAT.map((m) => (
                                <CommandItem
                                  value={m.label}
                                  key={`${m.city}-${m.state}`}
                                  className="text-xs"
                                  onSelect={() => {
                                    form.setValue("city", m.city);
                                    form.setValue("state", m.state);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-3.5 w-3.5",
                                      m.city === field.value && m.state === form.getValues('state')
                                        ? "opacity-100"
                                        : "opacity-0"
                                      )}
                                  />
                                  {m.label}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />
              <p className="text-[10px] text-muted-foreground italic">La ubicación se detecta automáticamente al escribir la dirección.</p>
            </div>

            {/* Sección: Términos y Pagos */}
            <div className="space-y-4 pt-2">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-procarni-secondary border-l-2 border-procarni-secondary pl-2">Pago y Comentarios</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="payment_terms"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Términos de Pago</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Términos" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Contado">Contado</SelectItem>
                          <SelectItem value="Crédito">Crédito</SelectItem>
                          <SelectItem value="Otro">Otro</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )}
                />

                {currentPaymentTerms === 'Crédito' && (
                  <FormField
                    control={form.control}
                    name="credit_days"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Días de Crédito</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="Ej: 30"
                            className="h-9"
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormMessage className="text-[10px]" />
                      </FormItem>
                    )}
                  />
                )}

                {currentPaymentTerms === 'Otro' && (
                  <FormField
                    control={form.control}
                    name="custom_payment_terms"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Pago Personalizado</FormLabel>
                        <FormControl>
                          <Input placeholder="Describa los términos" {...field} value={field.value || ''} className="h-9" />
                        </FormControl>
                        <FormMessage className="text-[10px]" />
                      </FormItem>
                    )}
                  />
                )}
              </div>

              <FormField
                control={form.control}
                name="alert_comment"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-procarni-alert flex items-center gap-2">
                      <Info className="h-3 w-3" /> Aviso Especial
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Aviso que aparecerá al seleccionar este proveedor..."
                        className="bg-red-50/10 border-procarni-alert/30 focus:border-procarni-alert min-h-[100px] text-xs resize-none"
                        {...field}
                        value={field.value || ''}
                      />
                    </FormControl>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="sticky bottom-0 bg-white pt-4 border-t gap-2 flex-col sm:flex-row">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting} className="h-10">
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting} className="h-10 bg-procarni-secondary hover:bg-green-700 sm:min-w-[120px]">
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Guardando...
              </>
            ) : (
              'Guardar Cambios'
            )}
          </Button>
        </DialogFooter>
      </form>

      <MaterialCreationDialog
        isOpen={isMaterialCreationDialogOpen}
        onClose={() => setIsMaterialCreationDialogOpen(false)}
        onMaterialCreated={handleMaterialCreatedFromDialog}
        supplierId={currentSupplierId}
        supplierName={initialData?.name}
      />
    </Form>
  );
};

export default SupplierForm;