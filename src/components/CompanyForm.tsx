import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { validateRif } from '@/utils/validators';

// Esquema de validación con Zod para el formulario de empresa
const companyFormSchema = z.object({
  name: z.string().min(1, { message: 'El nombre es requerido.' }),
  rif: z.string().min(1, { message: 'El RIF es requerido.' }).refine((val) => validateRif(val) !== null, {
    message: 'Formato de RIF inválido. Ej: J123456789',
  }),
  logo_url: z.string().url({ message: 'Debe ser una URL válida.' }).optional().or(z.literal('')),
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
  const form = useForm<CompanyFormValues>({
    resolver: zodResolver(companyFormSchema),
    defaultValues: {
      name: '',
      rif: '',
      logo_url: '',
      address: '',
      phone: '',
      email: '',
    },
  });

  React.useEffect(() => {
    if (initialData) {
      form.reset(initialData);
    } else {
      form.reset({
        name: '',
        rif: '',
        logo_url: '',
        address: '',
        phone: '',
        email: '',
      });
    }
  }, [initialData, form]);

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

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4">
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
        <FormField
          control={form.control}
          name="logo_url"
          render={({ field }) => (
            <FormItem>
              <FormLabel>URL del Logo</FormLabel>
              <FormControl>
                <Input placeholder="https://ejemplo.com/logo.png" {...field} value={field.value || ''} />
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
                <Textarea placeholder="Dirección completa de la empresa" {...field} value={field.value || ''} />
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

        <div className="flex justify-end gap-2 mt-6">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting} className="bg-procarni-secondary hover:bg-green-700">
            {isSubmitting ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      </form>
    </Form>
  );
};

export default CompanyForm;