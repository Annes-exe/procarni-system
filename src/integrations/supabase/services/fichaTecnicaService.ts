// src/integrations/supabase/services/fichaTecnicaService.ts

import { supabase } from '../client';
import { showError } from '@/utils/toast';
import { FichaTecnica } from '../types';
import { logAudit } from './auditLogService';

interface SaveMetadataPayload {
  nombre_producto: string;
  proveedor_id: string;
  storage_url: string;
  cloudinary_public_id?: string;
}

const FichaTecnicaService = {
  /**
   * Saves the metadata of a ficha técnica after the file has been uploaded (e.g., to Cloudinary).
   */
  saveMetadata: async (payload: SaveMetadataPayload): Promise<FichaTecnica | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      showError('Sesión no activa. Por favor, inicia sesión.');
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('fichas_tecnicas')
        .insert({
          user_id: session.user.id,
          nombre_producto: payload.nombre_producto,
          proveedor_id: payload.proveedor_id,
          storage_url: payload.storage_url,
          cloudinary_public_id: payload.cloudinary_public_id,
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      const newFicha: FichaTecnica = data;

      // --- AUDIT LOG ---
      logAudit('UPLOAD_FICHA_TECNICA', {
        table: 'fichas_tecnicas',
        record_id: newFicha.id,
        description: `Subida de ficha técnica para ${newFicha.nombre_producto}`,
        nombre_producto: newFicha.nombre_producto,
        proveedor_id: newFicha.proveedor_id,
        cloudinary_public_id: payload.cloudinary_public_id
      });
      // -----------------

      return newFicha;

    } catch (error: any) {
      console.error('[FichaTecnicaService.saveMetadata] Error:', error);
      showError(error.message || 'Error al guardar los datos de la ficha técnica.');
      return null;
    }
  },

  getAll: async (): Promise<FichaTecnica[]> => {
    const { data, error } = await supabase
      .from('fichas_tecnicas')
      .select('*, suppliers(name)')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[FichaTecnicaService.getAll] Error:', error);
      showError('Error al cargar fichas técnicas.');
      return [];
    }
    return data as FichaTecnica[];
  },

  getBySupplierAndProduct: async (proveedorId: string, nombreProducto: string): Promise<FichaTecnica | null> => {
    const { data, error } = await supabase
      .from('fichas_tecnicas')
      .select('*')
      .eq('proveedor_id', proveedorId)
      .eq('nombre_producto', nombreProducto);

    if (error) {
      console.error('[FichaTecnicaService.getBySupplierAndProduct] Error:', error);
      return null;
    }

    return data.length > 0 ? data[0] as FichaTecnica : null;
  },

  delete: async (fichaId: string, cloudinaryPublicId?: string): Promise<boolean> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      showError('Sesión no activa. Por favor, inicia sesión.');
      return false;
    }

    try {
      // 1. Delete the record from the database
      const { error } = await supabase
        .from('fichas_tecnicas')
        .delete()
        .eq('id', fichaId);

      if (error) {
        throw error;
      }

      // 2. Delete from Cloudinary if public_id exists
      if (cloudinaryPublicId) {
        console.log(`[FichaTecnicaService] Deleting from Cloudinary: ${cloudinaryPublicId}`);
        // For PDFs, we need to specify resource_type as 'raw' (Cloudinary treats them as such if auto-uploaded)
        // or just 'image' if they were detected as images. 
        // Our upload uses 'auto', so for PDFs it usually results in 'image' (for previews) or 'raw'.
        // The error log showed 'image/upload', so we'll try 'image' but the function defaults to it.
        try {
          await supabase.functions.invoke('delete-cloudinary-asset', {
            body: { 
              public_id: cloudinaryPublicId,
              resource_type: 'image' // Based on the observed URL: image/upload/...
            }
          });
        } catch (cloudinaryError) {
          console.error('[FichaTecnicaService] Error deleting from Cloudinary:', cloudinaryError);
          // We don't throw here to avoid failing the DB delete, but we log it
        }
      }

      // --- AUDIT LOG ---
      logAudit('DELETE_FICHA_TECNICA', {
        table: 'fichas_tecnicas',
        record_id: fichaId,
        description: 'Eliminación de ficha técnica',
        cloudinary_public_id: cloudinaryPublicId
      });
      // -----------------

      return true;

    } catch (error: any) {
      console.error('[FichaTecnicaService.delete] Error:', error);
      throw new Error(error.message || 'Error al eliminar la ficha técnica.');
    }
  },
};

export const {
  saveMetadata: uploadFichaTecnica,
  getAll: getAllFichasTecnicas,
  delete: deleteFichaTecnica,
  getBySupplierAndProduct: getFichaTecnicaBySupplierAndProduct,
} = FichaTecnicaService;