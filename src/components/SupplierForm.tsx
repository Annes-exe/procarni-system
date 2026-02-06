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
import { Loader2, Plus, X, PlusCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getAllMaterials } from '@/integrations/supabase/data';
import { showError, showSuccess } from '@/utils/toast';
import { validateRif } from '@/utils/validators'; // Importar el validador de RIF
import MaterialCreationDialog from '@/components/MaterialCreationDialog'; // NEW IMPORT

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
    payment_terms: 'Contado' | 'Crédito' | 'Otro';
    custom_payment_terms?: string | null;
    credit_days: number;
    status: string;
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
      payment_terms: 'Contado',
      custom_payment_terms: '',
      credit_days: 0,
      status: 'Active', // Changed to English to match database constraint
      materials: [],
    },
  });

  const currentMaterialsInForm = form.watch('materials');
  const currentPaymentTerms = form.watch('payment_terms');
  
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
        payment_terms: initialData.payment_terms,
        custom_payment_terms: initialData.custom_payment_terms || '',
        credit_days: initialData.credit_days || 0,
        status: initialData.status || 'Active', // Changed to English
        materials: formattedMaterials,
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
        payment_terms: 'Contado',
        custom_payment_terms: '',
        credit_days: 0,
        status: 'Active', // Changed to English
        materials: [],
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

  const filteredMaterials = allMaterials?.filter(material =>
    material.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (material.code && material.code.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (material.category && material.category.toLowerCase().includes(searchTerm.toLowerCase()))
  ) || [];

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
      name: data.name.toUpperCase(), // Ensure name is uppercase before submission
      credit_days: data.payment_terms === 'Crédito' ? data.credit_days : 0,
      custom_payment_terms: data.payment_terms === 'Otro' ? data.custom_payment_terms : null,
    };
    onSubmit(finalData);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4">
        {/* El campo de código ha sido eliminado */}
        <FormField
            control={form.control}
            name="rif"
            render={({ field }) => (
              <FormItem>
                <FormLabel>RIF</FormLabel>
                <FormControl>
                  <Input placeholder="RIF del proveedor" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre</FormLabel>
                <FormControl>
                  <Input placeholder="Nombre del proveedor" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input placeholder="Email del proveedor" {...field} value={field.value || ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Teléfono 1</FormLabel>
                <FormControl>
                  <Input placeholder="Teléfono principal" {...field} value={field.value || ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="phone_2"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Teléfono 2</FormLabel>
                <FormControl>
                  <Input placeholder="Teléfono secundario" {...field} value={field.value || ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="instagram"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Instagram</FormLabel>
                <FormControl>
                  <Input placeholder="@usuario" {...field} value={field.value || ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="address"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Dirección</FormLabel>
                <FormControl>
                  <Textarea placeholder="Dirección del proveedor" {...field} value={field.value || ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="payment_terms"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Términos de Pago</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccione términos de pago" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="Contado">Contado</SelectItem>
                    <SelectItem value="Crédito">Crédito</SelectItem>
                    <SelectItem value="Otro">Otro</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          {currentPaymentTerms === 'Crédito' && (
            <FormField
              control={form.control}
              name="credit_days"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Días de Crédito</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="Días de crédito"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                    />
                  </FormControl>
                  <FormMessage />
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
                  <FormLabel>Términos de Pago Personalizados</FormLabel>
                  <FormControl>
                    <Input placeholder="Describa los términos de pago" {...field} value={field.value || ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Estado</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccione estado" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="Active">Activo</SelectItem>
                    <SelectItem value="Inactive">Inactivo</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        {/* Sección de materiales asociados */}
        <div className="mt-6 p-4 border rounded-lg">
          <h3 className="text-lg font-semibold mb-4 flex justify-between items-center">
            Materiales Asociados
            <Button 
              type="button" 
              variant="outline" 
              size="sm" 
              onClick={() => setIsMaterialCreationDialogOpen(true)} // NEW BUTTON
            >
              <PlusCircle className="mr-2 h-4 w-4" /> Crear Material
            </Button>
          </h3>

          <div className="mb-4">
            <Input
              placeholder="Buscar materiales existentes para asociar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="mb-2"
            />

            {isLoadingMaterials ? (
              <div className="text-sm text-muted-foreground">Cargando materiales...</div>
            ) : (
              <div className="max-h-40 overflow-y-auto border rounded-md p-2">
                {filteredMaterials.length > 0 ? (
                  filteredMaterials.map((material) => (
                    <div
                      key={material.id}
                      className="p-2 hover:bg-muted rounded cursor-pointer flex justify-between items-center"
                      onClick={() => handleAddMaterial(material)}
                    >
                      <div>
                        <div className="font-medium">{material.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {material.code} {material.category && `- ${material.category}`}
                        </div>
                      </div>
                      <Button type="button" size="sm" variant="ghost">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-muted-foreground p-2">
                    No se encontraron materiales
                  </div>
                )}
              </div>
            )}
          </div>

          {currentMaterialsInForm && currentMaterialsInForm.length > 0 ? (
            <div className="space-y-3">
              {currentMaterialsInForm.map((material) => (
                <div key={material.material_id} className="p-3 border rounded-md flex flex-col gap-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-medium">{material.material_name}</div>
                      {material.material_category && (
                        <div className="text-sm text-muted-foreground">
                          Categoría: {material.material_category}
                        </div>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveMaterial(material.material_id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Especificación</label>
                    <Input
                      value={material.specification || ''}
                      onChange={(e) => handleSpecificationChange(material.material_id, e.target.value)}
                      placeholder="Especificación del material (opcional)"
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              No hay materiales asociados a este proveedor
            </div>
          )}
        </div>

        <DialogFooter className="mt-6">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting} className="bg-procarni-secondary hover:bg-green-700">
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Guardando...
              </>
            ) : (
              'Guardar'
            )}
          </Button>
        </DialogFooter>
      </form>
      
      {/* NEW DIALOG */}
      <MaterialCreationDialog
        isOpen={isMaterialCreationDialogOpen}
        onClose={() => setIsMaterialCreationDialogOpen(false)}
        onMaterialCreated={handleMaterialCreatedFromDialog}
        supplierId={currentSupplierId} // Pass ID if editing, undefined if creating
        supplierName={initialData?.name}
      />
    </Form>
  );
};

export default SupplierForm;