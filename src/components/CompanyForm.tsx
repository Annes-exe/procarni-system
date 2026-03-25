import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { validateRif } from '@/utils/validators';
import { uploadToCloudinary } from '@/services/cloudinaryService';
import { showError } from '@/utils/toast';
import { UploadCloud, ImageIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

// Esquema de validación con Zod para el formulario de empresa
const companyFormSchema = z.object({
  name: z.string().min(1, { message: 'El nombre es requerido.' }),
  rif: z.string().min(1, { message: 'El RIF es requerido.' }).refine((val) => validateRif(val) !== null, {
    message: 'Formato de RIF inválido. Ej: J123456789',
  }),
  logo_url: z.string().url({ message: 'Debe ser una URL válida.' }).optional().or(z.literal('')),
  cloudinary_public_id: z.string().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  email: z.string().email({ message: 'Formato de email inválido.' }).optional().or(z.literal('')),
});

type CompanyFormValues = z.infer<typeof companyFormSchema>;

interface CompanyFormProps {
  initialData?: CompanyFormValues & { id?: string };
  onSubmit: (data: CompanyFormValues) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

const CompanyForm: React.FC<CompanyFormProps> = ({ initialData, onSubmit, onCancel, isSubmitting }) => {
  const [isUploading, setIsUploading] = useState(false);
  const form = useForm<CompanyFormValues>({
    resolver: zodResolver(companyFormSchema),
    defaultValues: {
      name: '',
      rif: '',
      logo_url: '',
      cloudinary_public_id: '',
      address: '',
      phone: '',
      email: '',
    },
  });

  React.useEffect(() => {
    if (initialData) {
      form.reset({
        ...initialData,
        logo_url: initialData.logo_url || '',
        cloudinary_public_id: initialData.cloudinary_public_id || '',
      });
    } else {
      form.reset({
        name: '',
        rif: '',
        logo_url: '',
        cloudinary_public_id: '',
        address: '',
        phone: '',
        email: '',
      });
    }
  }, [initialData, form]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      
      // Basic image validation
      if (!file.type.startsWith('image/')) {
        showError('Por favor selecciona una imagen válida.');
        return;
      }

      setIsUploading(true);
      try {
        // Delete old logo if it exists
        const oldPublicId = form.getValues('cloudinary_public_id') || initialData?.cloudinary_public_id;
        if (oldPublicId) {
          console.log(`[CompanyForm] Deleting old logo: ${oldPublicId}`);
          try {
            await supabase.functions.invoke('delete-cloudinary-asset', {
              body: { public_id: oldPublicId, resource_type: 'image' }
            });
          } catch (deleteError) {
            console.error('[CompanyForm] Error deleting old logo:', deleteError);
          }
        }

        const result = await uploadToCloudinary(file, 'procarni_system/logos_empresas');
        form.setValue('logo_url', result.secure_url);
        form.setValue('cloudinary_public_id', result.public_id);
      } catch (error: any) {
        showError('Error al subir el logo: ' + error.message);
      } finally {
        setIsUploading(false);
      }
    }
  };

  const handleFormSubmit = (data: CompanyFormValues) => {
    const normalizedRif = validateRif(data.rif);
    if (!normalizedRif) {
      form.setError('rif', { message: 'Formato de RIF inválido.' });
      return;
    }

    onSubmit({
      ...data,
      rif: normalizedRif,
    });
  };

  const currentLogoUrl = form.watch('logo_url');

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4">
        <div className="flex flex-col md:flex-row gap-6">
          <div className="flex-1 space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre de la Empresa</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: Mi Empresa C.A." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="rif"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>RIF</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: J123456789" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="w-full md:w-1/3 flex flex-col items-center justify-center p-4 border rounded-md bg-gray-50/50">
            <Label className="mb-2 block self-start">Logo de Empresa</Label>
            <div className="relative w-32 h-32 mb-4 border-2 border-dashed rounded-md flex items-center justify-center overflow-hidden bg-white group">
              {currentLogoUrl ? (
                <img src={currentLogoUrl} alt="Logo preview" className="w-full h-full object-contain" />
              ) : (
                <ImageIcon className="w-10 h-10 text-gray-300" />
              )}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <p className="text-white text-xs font-medium">Cambiar Logo</p>
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                disabled={isUploading || isSubmitting}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </div>
            <Button 
              type="button" 
              variant="outline" 
              size="sm" 
              className="w-full"
              disabled={isUploading || isSubmitting}
              onClick={() => document.getElementById('logo-upload-input')?.click()}
            >
              {isUploading ? 'Subiendo...' : <><UploadCloud className="mr-2 h-4 w-4" /> Subir Logo</>}
            </Button>
            <input
              id="logo-upload-input"
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
            <FormField
              control={form.control}
              name="logo_url"
              render={({ field }) => (
                <div className="hidden">
                  <Input {...field} value={field.value || ''} />
                </div>
              )}
            />
          </div>
        </div>

        <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Dirección</FormLabel>
              <FormControl>
                <Textarea placeholder="Dirección completa de la empresa" {...field} value={field.value || ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Teléfono</FormLabel>
                <FormControl>
                  <Input placeholder="Ej: +582121234567" {...field} value={field.value || ''} />
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
                  <Input type="email" placeholder="email@empresa.com" {...field} value={field.value || ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting || isUploading}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting || isUploading} className="bg-procarni-secondary hover:bg-green-700">
            {isSubmitting ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      </form>
    </Form>
  );
};

export default CompanyForm;