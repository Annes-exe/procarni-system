import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2 } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';
import { createSupplier } from '@/integrations/supabase/data';
import { useSession } from '@/components/SessionContextProvider';
import { validateRif } from '@/utils/validators';
import { Supplier } from '@/integrations/supabase/types/index';

interface SupplierCreationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSupplierCreated: (supplier: Supplier) => void;
}

const PAYMENT_TERMS_OPTIONS = ['Contado', 'Crédito', 'Otro'];
const STATUS_OPTIONS = ['Active', 'Inactive'];

const supplierCreationSchema = z.object({
  rif: z.string().min(1, 'RIF es requerido').refine((val) => validateRif(val) !== null, {
    message: 'Formato de RIF inválido. Ej: J123456789',
  }),
  name: z.string().min(1, 'Nombre es requerido'),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')), // CORREGIDO: Ahora es opcional
  payment_terms: z.enum(PAYMENT_TERMS_OPTIONS as [string, ...string[]], { message: 'Términos de pago son requeridos.' }),
  custom_payment_terms: z.string().optional().nullable(),
  credit_days: z.number().min(0, 'Días de crédito no puede ser negativo').optional(),
  status: z.enum(STATUS_OPTIONS as [string, ...string[]]).default('Active'),
});

type SupplierCreationFormValues = z.infer<typeof supplierCreationSchema>;

const SupplierCreationDialog: React.FC<SupplierCreationDialogProps> = ({
  isOpen,
  onClose,
  onSupplierCreated,
}) => {
  const { session } = useSession();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<SupplierCreationFormValues>({
    resolver: zodResolver(supplierCreationSchema),
    defaultValues: {
      rif: '',
      name: '',
      email: '',
      phone: '',
      payment_terms: 'Contado',
      custom_payment_terms: null,
      credit_days: 0,
      status: 'Active',
    },
  });

  const currentPaymentTerms = form.watch('payment_terms');

  useEffect(() => {
    if (!isOpen) {
      form.reset();
    }
  }, [isOpen, form]);

  const handleFormSubmit = async (data: SupplierCreationFormValues) => {
    if (!session?.user?.id) {
      showError('Usuario no autenticado.');
      return;
    }

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

    setIsSubmitting(true);

    const supplierData = {
      rif: normalizedRif,
      name: data.name.toUpperCase(),
      email: data.email || null,
      phone: data.phone || null,
      payment_terms: data.payment_terms,
      custom_payment_terms: data.payment_terms === 'Otro' ? data.custom_payment_terms : null,
      credit_days: data.payment_terms === 'Crédito' ? data.credit_days : 0,
      status: data.status,
      user_id: session.user.id,
    };

    try {
      const newSupplier = await createSupplier(supplierData, []); // Create without materials initially

      if (newSupplier) {
        showSuccess(`Proveedor "${newSupplier.name}" creado exitosamente.`);
        onSupplierCreated(newSupplier as Supplier);
        onClose();
      }
    } catch (error: any) {
      console.error('[SupplierCreationDialog] Error:', error);
      showError(error.message || 'Error al crear el proveedor.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>Añadir Nuevo Proveedor</DialogTitle>
          <DialogDescription>
            Crea un nuevo proveedor rápidamente. Puedes añadir materiales asociados más tarde en la gestión de proveedores.
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre *</FormLabel>
                  <FormControl>
                    <Input placeholder="Nombre del proveedor" {...field} disabled={isSubmitting} />
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
                  <FormLabel>RIF *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: J123456789" {...field} disabled={isSubmitting} />
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
                  <FormLabel>Teléfono Principal</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: +584121234567" {...field} value={field.value || ''} disabled={isSubmitting} />
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
                    <Input type="email" placeholder="email@proveedor.com" {...field} value={field.value || ''} disabled={isSubmitting} />
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
                  <FormLabel>Términos de Pago *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isSubmitting}>
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
                    <FormLabel>Días de Crédito *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="Días de crédito"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                        disabled={isSubmitting}
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
                    <FormLabel>Términos de Pago Personalizados *</FormLabel>
                    <FormControl>
                      <Input placeholder="Describa los términos de pago" {...field} value={field.value || ''} disabled={isSubmitting} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting} className="bg-procarni-secondary hover:bg-green-700">
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creando...
                  </>
                ) : (
                  'Crear Proveedor'
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default SupplierCreationDialog;