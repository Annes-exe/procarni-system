// src/integrations/supabase/services/fichaTecnicaService.ts

import { supabase } from '../client';
import { showError } from '@/utils/toast';
import { FichaTecnica } from '../types';
import { logAudit } from './auditLogService';

interface UploadPayload {
  nombre_producto: string;
  proveedor_id: string;
  fileBase64: string;
  fileName: string;
  mimeType: string;
}

const FichaTecnicaService = {
  upload: async (payload: UploadPayload): Promise<FichaTecnica | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      showError('Sesión no activa. Por favor, inicia sesión.');
      return null;
    }

    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-ficha-tecnica`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error desconocido al subir la ficha técnica.');
      }

      const newFicha: FichaTecnica = await response.json();

      // --- AUDIT LOG ---
      logAudit('UPLOAD_FICHA_TECNICA', {
        table: 'fichas_tecnicas',
        record_id: newFicha.id,
        description: `Subida de ficha técnica para ${newFicha.nombre_producto}`,
        nombre_producto: newFicha.nombre_producto,
        proveedor_id: newFicha.proveedor_id,
        file_name: payload.fileName
      });
      // -----------------

      return newFicha;

    } catch (error: any) {
      console.error('[FichaTecnicaService.upload] Error:', error);
      showError(error.message || 'Error al subir la ficha técnica.');
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
    // Eliminamos .single() para evitar el error 406 si hay 0 o >1 resultado.
    const { data, error } = await supabase
      .from('fichas_tecnicas')
      .select('*')
      .eq('proveedor_id', proveedorId)
      .eq('nombre_producto', nombreProducto);

    if (error) {
      console.error('[FichaTecnicaService.getBySupplierAndProduct] Error:', error);
      return null;
    }

    // Si hay datos, devolvemos el primer resultado (o null si no hay)
    return data.length > 0 ? data[0] as FichaTecnica : null;
  },

  delete: async (fichaId: string, storageUrl: string): Promise<boolean> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      showError('Sesión no activa. Por favor, inicia sesión.');
      return false;
    }

    try {
      // Llama a la Edge Function para manejar la eliminación del archivo y el registro DB
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-ficha-tecnica`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fichaId, storageUrl }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error desconocido al eliminar la ficha técnica.');
      }

      // --- AUDIT LOG ---
      logAudit('DELETE_FICHA_TECNICA', {
        table: 'fichas_tecnicas',
        record_id: fichaId,
        description: 'Eliminación de ficha técnica',
        storage_url: storageUrl
      });
      // -----------------

      return true;

    } catch (error: any) {
      console.error('[FichaTecnicaService.delete] Error:', error);
      // Re-throw the error so useMutation catches it
      throw new Error(error.message || 'Error al eliminar la ficha técnica.');
    }
  },
};

export const {
  upload: uploadFichaTecnica,
  getAll: getAllFichasTecnicas,
  delete: deleteFichaTecnica,
  getBySupplierAndProduct: getFichaTecnicaBySupplierAndProduct,
} = FichaTecnicaService;