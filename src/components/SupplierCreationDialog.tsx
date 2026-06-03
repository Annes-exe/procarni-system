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
import { Supplier } from '@/integrations/supabase/types';

interface SupplierCreationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSupplierCreated: (supplier: Supplier) => void;
}

const PAYMENT_TERMS_OPTIONS = ['Contado', 'Crédito', 'Otro'];
const STATUS_OPTIONS = ['Active', 'Inactive'];

const supplierCreationSchema = z.object({
  rif: z.string().min(1, 'RIF es requerido').refine((val) => validateRif(val) !== null, {
    message: 'Formato de RIF inválido. Ej: J123456789 o *',
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

    let finalRif = validateRif(data.rif);
    if (!finalRif) {
      form.setError('rif', { message: 'Formato de RIF inválido.' });
      return;
    }

    if (finalRif === '*') {
      // Generar sufijo invisible usando caracteres de espacio de ancho cero (U+200B a U+200D) para evitar conflictos de constraint unique
      const invisibleSuffix = Date.now().toString().split('').map(d => String.fromCharCode(0x200B + (parseInt(d) % 3))).join('');
      finalRif = '*' + invisibleSuffix;
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
      rif: finalRif,
      name: data.name.toUpperCase(),
      email: data.email || null,
      phone: data.phone || null,
      payment_terms: data.payment_terms,
      custom_payment_terms: data.payment_terms === 'Otro' ? data.custom_payment_terms : null,
      credit_days: data.payment_terms === 'Crédito' ? data.credit_days : 0,
      status: data.status,
      user_id: session.user.id,
      phone_2: null,
      instagram: null,
      address: null,
      code: null,
      city: null,
      alert_comment: null,
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
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader className="mb-4">
          <DialogTitle className="text-xl font-bold text-procarni-primary">Añadir Nuevo Proveedor</DialogTitle>
          <DialogDescription className="text-xs">
            Crea un registro rápido. Podrás añadir materiales asociados luego en la gestión de proveedores.
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              
              {/* Información Básica */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 border-b pb-1">Identificación</h4>
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Nombre / Razón Social *</FormLabel>
                      <FormControl>
                        <Input placeholder="Nombre comercial" {...field} disabled={isSubmitting} className="h-9 text-sm" />
                      </FormControl>
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="rif"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">RIF *</FormLabel>
                      <FormControl>
                        <Input placeholder="J123456789" {...field} disabled={isSubmitting} className="h-9 text-sm" />
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
                      <FormLabel className="text-xs">Estado inicial</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isSubmitting}>
                        <FormControl>
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue placeholder="Activo" />
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

              {/* Contacto y Términos */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 border-b pb-1">Contacto y Pagos</h4>
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Teléfono</FormLabel>
                        <FormControl>
                          <Input placeholder="0412..." {...field} value={field.value || ''} disabled={isSubmitting} className="h-9 text-sm" />
                        </FormControl>
                        <FormMessage className="text-[10px]" />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="ejemplo@mail.com" {...field} value={field.value || ''} disabled={isSubmitting} className="h-9 text-sm" />
                        </FormControl>
                        <FormMessage className="text-[10px]" />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="payment_terms"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Términos de Pago *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isSubmitting}>
                        <FormControl>
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue placeholder="Seleccione términos" />
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
                      <FormItem className="animate-in slide-in-from-top-2 duration-200">
                        <FormLabel className="text-xs">Días de Crédito *</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="Ej: 30"
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                            disabled={isSubmitting}
                            className="h-9 text-sm"
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
                      <FormItem className="animate-in slide-in-from-top-2 duration-200">
                        <FormLabel className="text-xs">Especificar Términos *</FormLabel>
                        <FormControl>
                          <Input placeholder="Ej: 50% inicial, 50% entrega" {...field} value={field.value || ''} disabled={isSubmitting} className="h-9 text-sm" />
                        </FormControl>
                        <FormMessage className="text-[10px]" />
                      </FormItem>
                    )}
                  />
                )}
              </div>
            </div>

            <DialogFooter className="mt-8 border-t pt-4">
              <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting} className="text-xs">
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting} className="bg-procarni-secondary hover:bg-green-700 text-white font-bold px-6 shadow-sm shadow-green-100">
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Guardando...
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