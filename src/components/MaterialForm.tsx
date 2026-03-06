"use client";

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import { getAllUnits, getAllMaterialCategories } from '@/integrations/supabase/data';


// Esquema de validación con Zod
const materialFormSchema = z.object({
  code: z.string().optional(),
  name: z.string().min(1, { message: 'El nombre es requerido.' }),
  category: z.string().min(1, { message: 'La categoría es requerida.' }),
  unit: z.string().min(1, { message: 'La unidad es requerida.' }),
  is_exempt: z.boolean().default(false).optional(),
});

type MaterialFormValues = z.infer<typeof materialFormSchema>;

interface MaterialFormProps {
  initialData?: MaterialFormValues & { id?: string };
  onSubmit: (data: MaterialFormValues) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

const MaterialForm: React.FC<MaterialFormProps> = ({ initialData, onSubmit, onCancel, isSubmitting }) => {
  const { data: units = [], isLoading: isLoadingUnits } = useQuery({
    queryKey: ['units_of_measure'],
    queryFn: getAllUnits,
  });

  const { data: categories = [], isLoading: isLoadingCategories } = useQuery({
    queryKey: ['material_categories'],
    queryFn: getAllMaterialCategories,
  });

  const form = useForm<MaterialFormValues>({
    resolver: zodResolver(materialFormSchema),
    defaultValues: {
      code: '',
      name: '',
      category: initialData?.category || (categories[0]?.name || ''),
      unit: initialData?.unit || '',
      is_exempt: initialData?.is_exempt || (initialData?.category === 'FRESCA' ? true : false),
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
        code: '',
        name: '',
        category: categories[0]?.name || '',
        unit: '',
        is_exempt: (categories[0]?.name || '') === 'FRESCA',
      });
    }
  }, [initialData, form]);

  // Set default unit if it's empty and we have units
  React.useEffect(() => {
    if (!form.getValues('unit') && units.length > 0 && !initialData) {
      form.setValue('unit', units[0].name);
    }
  }, [units, form, initialData]);

  // Effect to enforce is_exempt=true when category is FRESCA
  React.useEffect(() => {
    if (watchedCategory === 'FRESCA' && form.getValues('is_exempt') !== true) {
      form.setValue('is_exempt', true, { shouldDirty: true });
    } else if (watchedCategory !== 'FRESCA' && initialData?.category !== watchedCategory && form.getValues('is_exempt') === true) {
      if (initialData?.category !== 'FRESCA') {
        form.setValue('is_exempt', false, { shouldDirty: true });
      }
    }
  }, [watchedCategory, form, initialData]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
              <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona una categoría" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {categories.map(category => (
                    <SelectItem key={category.id} value={category.name}>{category.name}</SelectItem>
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
              <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                <FormControl>
                  <SelectTrigger disabled={isLoadingUnits}>
                    <SelectValue placeholder={isLoadingUnits ? "Cargando..." : "Selecciona una unidad"} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {units.map(unit => (
                    <SelectItem key={unit.id} value={unit.name}>{unit.name}</SelectItem>
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
