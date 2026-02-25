import { supabase } from '../client';
import { MaterialCategory } from '../types';
import { showError } from '@/utils/toast';

/**
 * Fetches all material categories from the database.
 */
export const getAllMaterialCategories = async (): Promise<MaterialCategory[]> => {
    try {
        const { data, error } = await supabase
            .from('material_categories')
            .select('*')
            .order('name', { ascending: true });

        if (error) {
            console.error('[getAllMaterialCategories] Error:', error);
            showError('Error al cargar las categorías de materiales.');
            return [];
        }

        return data || [];
    } catch (err) {
        console.error('[getAllMaterialCategories] Unexpected error:', err);
        return [];
    }
};

/**
 * Creates a new material category.
 */
export const createMaterialCategory = async (name: string, userId: string): Promise<MaterialCategory | null> => {
    try {
        const { data, error } = await supabase
            .from('material_categories')
            .insert([{ name, user_id: userId }])
            .select()
            .single();

        if (error) {
            console.error('[createMaterialCategory] Error:', error);
            if (error.code === '23505') {
                showError('Esta categoría ya existe.');
            } else {
                showError('Error al crear la categoría.');
            }
            return null;
        }

        return data;
    } catch (err) {
        console.error('[createMaterialCategory] Unexpected error:', err);
        return null;
    }
};

/**
 * Deletes a material category.
 */
export const deleteMaterialCategory = async (id: string): Promise<boolean> => {
    try {
        const { error } = await supabase
            .from('material_categories')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('[deleteMaterialCategory] Error:', error);
            showError('Error al eliminar la categoría.');
            return false;
        }

        return true;
    } catch (err) {
        console.error('[deleteMaterialCategory] Unexpected error:', err);
        return false;
    }
};
