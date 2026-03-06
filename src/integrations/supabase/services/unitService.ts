// src/integrations/supabase/services/unitService.ts

import { supabase } from '../client';
import { showError } from '@/utils/toast';

export interface UnitOfMeasure {
    id: string;
    name: string;
    user_id?: string | null;
    created_at?: string | null;
}

const UnitService = {
    getAll: async (): Promise<UnitOfMeasure[]> => {
        const { data, error } = await supabase
            .from('units_of_measure')
            .select('*')
            .order('name', { ascending: true });

        if (error) {
            console.error('[UnitService.getAll] Error:', error);
            showError('Error al cargar unidades de medida.');
            return [];
        }
        return data;
    },

    create: async (name: string, userId?: string): Promise<UnitOfMeasure | null> => {
        const payload = {
            name: name.toUpperCase(),
            user_id: userId,
        };

        const { data: newUnit, error } = await supabase
            .from('units_of_measure')
            .insert(payload)
            .select()
            .single();

        if (error) {
            console.error('[UnitService.create] Error:', error);
            if (error.code === '23505') {
                showError('La unidad de medida ya existe.');
            } else {
                showError('Error al crear la unidad de medida.');
            }
            return null;
        }

        return newUnit;
    },

    delete: async (id: string): Promise<boolean> => {
        try {
            // 1. Get the unit name
            const { data: unit, error: fetchError } = await supabase
                .from('units_of_measure')
                .select('name')
                .eq('id', id)
                .single();

            if (fetchError || !unit) {
                console.error('[UnitService.delete] Fetch error:', fetchError);
                showError('Error al encontrar la unidad de medida.');
                return false;
            }

            // 2. Check if any material is using this unit
            const { count, error: countError } = await supabase
                .from('materials')
                .select('*', { count: 'exact', head: true })
                .eq('unit', unit.name);

            if (countError) {
                console.error('[UnitService.delete] Count error:', countError);
                showError('Error al verificar el uso de la unidad.');
                return false;
            }

            if (count && count > 0) {
                showError(`No se puede eliminar: hay ${count} materiales usando esta unidad.`);
                return false;
            }

            // 3. Delete the unit
            const { error: deleteError } = await supabase
                .from('units_of_measure')
                .delete()
                .eq('id', id);

            if (deleteError) {
                console.error('[UnitService.delete] Delete error:', deleteError);
                showError('Error al eliminar la unidad de medida.');
                return false;
            }

            return true;
        } catch (err) {
            console.error('[UnitService.delete] Unexpected error:', err);
            return false;
        }
    },
};

export const {
    getAll: getAllUnits,
    create: createUnit,
    delete: deleteUnit,
} = UnitService;
