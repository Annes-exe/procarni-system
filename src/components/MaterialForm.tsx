"use client";

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form'; // Importar FormDescription
import { Switch } from '@/components/ui/switch'; // Importar el componente Switch

// Define las opciones de categoría.
const MATERIAL_CATEGORIES = [
  'SECA',
  'FRESCA',
  'EMPAQUE',
  'FERRETERIA Y CONSTRUCCION',
  'AGROPECUARIA',
  'GASES Y COMBUSTIBLE',
  'ELECTRICIDAD',
  'REFRIGERACION',
  'INSUMOS DE OFICINA',
  'INSUMOS INDUSTRIALES',
  'MECANICA Y SELLOS',
  'NEUMATICA',
  'INSUMOS DE LIMPIEZA',
  'FUMICACION',
  'EQUIPOS DE CARNICERIA',
  'FARMACIA',
  'MEDICION Y MANIPULACION',
  'ENCERADOS',
  'PUBLICIDAD', // Nueva categoría
  'MAQUINARIA', // Nueva categoría
  'COMEDOR', // Nueva categoría
  'OPERACIONAL', // Nueva categoría
];

// Define las unidades de medida.
const MATERIAL_UNITS = [
  'KG', 'LT', 'ROL', 'PAQ', 'SACO', 'GAL', 'UND', 'MT', 'RESMA', 'PZA', 'TAMB', 'MILL', 'CAJA', 'PAR', 'BULTO'
];

// Esquema de validación con Zod
const materialFormSchema = z.object({
  code: z.string().optional(), // El código es opcional y se autogenera, no se gestiona directamente en el formulario
  name: z.string().min(1, { message: 'El nombre es requerido.' }),
  category: z.enum(MATERIAL_CATEGORIES as [string, ...string[]], { message: 'La categoría es requerida y debe ser válida.' }),
  unit: z.enum(MATERIAL_UNITS as [string, ...string[]], { message: 'La unidad es requerida y debe ser válida.' }),
  is_exempt: z.boolean().default(false).optional(), // Nuevo campo para exención de IVA
});

type MaterialFormValues = z.infer<typeof materialFormSchema>;

interface MaterialFormProps {
  initialData?: MaterialFormValues & { id?: string };
  onSubmit: (data: MaterialFormValues) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

const MaterialForm: React.FC<MaterialFormProps> = ({ initialData, onSubmit, onCancel, isSubmitting }) => {
  const form = useForm<MaterialFormValues>({
    resolver: zodResolver(materialFormSchema),
    defaultValues: {
      code: '', // Aseguramos que el código esté vacío para que el trigger lo genere
      name: '',
      category: initialData?.category || MATERIAL_CATEGORIES[0],
      unit: initialData?.unit || MATERIAL_UNITS[0],
      is_exempt: initialData?.is_exempt || (initialData?.category === 'FRESCA' ? true : false), // Set initial default based on category
    },
  });

  const watchedCategory = form.watch('category');

  // Set form values when initialData changes (for editing)
  React.useEffect(() => {
    if (initialData) {
      form.reset({
        ...initialData,
        is_exempt: initialData.is_exempt || (initialData.category === 'FRESCA' ? true : false),
      });
    } else {
      form.reset({
        code: '', // Aseguramos que el código esté vacío para que el trigger lo genere
        name: '',
        category: MATERIAL_CATEGORIES[0],
        unit: MATERIAL_UNITS[0],
        is_exempt: MATERIAL_CATEGORIES[0] === 'FRESCA',
      });
    }
  }, [initialData, form]);

  // Effect to enforce is_exempt=true when category is FRESCA
  React.useEffect(() => {
    if (watchedCategory === 'FRESCA' && form.getValues('is_exempt') !== true) {
      form.setValue('is_exempt', true, { shouldDirty: true });
    } else if (watchedCategory !== 'FRESCA' && initialData?.category !== watchedCategory && form.getValues('is_exempt') === true) {
      // If switching away from FRESCA, reset is_exempt to false only if it was forced true by FRESCA
      // If they switch away, let them manually control it again, but default to false.
      if (initialData?.category !== 'FRESCA') {
        form.setValue('is_exempt', false, { shouldDirty: true });
      }
    }
  }, [watchedCategory, form, initialData]);


  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {/* El campo de código ha sido eliminado ya que se genera automáticamente */}
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nombre</FormLabel>
              <FormControl>
                <Input placeholder="Nombre del material" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Categoría</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona una categoría" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {MATERIAL_CATEGORIES.map(option => (
                    <SelectItem key={option} value={option}>{option}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="unit"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Unidad</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona una unidad" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {MATERIAL_UNITS.map(option => (
                    <SelectItem key={option} value={option}>{option}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="is_exempt"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
              <div className="space-y-0.5">
                <FormLabel>Exento de IVA</FormLabel>
                <FormDescription>
                  Marcar si este material no debe incluir IVA en los cálculos de costos.
                </FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  aria-label="Material exento de IVA"
                  disabled={watchedCategory === 'FRESCA' || isSubmitting}
                />
              </FormControl>
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

export default MaterialForm;