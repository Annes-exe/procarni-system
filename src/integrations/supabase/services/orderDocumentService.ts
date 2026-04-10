import { supabase } from '../client';
import { showError } from '@/utils/toast';
import { OrderDocument } from '../types';

interface SaveDocumentPayload {
  purchase_order_id?: string;
  service_order_id?: string;
  document_type: 'Factura' | 'Nota de Entrega' | 'Otro';
  file_url: string;
  cloudinary_public_id?: string;
}

export const OrderDocumentService = {
  saveDocument: async (payload: SaveDocumentPayload): Promise<OrderDocument | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      showError('Sesión no activa. Por favor, inicia sesión.');
      return null;
    }

    if (!payload.purchase_order_id && !payload.service_order_id) {
      showError('El documento debe estar asociado a una orden válida.');
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('order_documents')
        .insert({
          user_id: session.user.id,
          purchase_order_id: payload.purchase_order_id || null,
          service_order_id: payload.service_order_id || null,
          document_type: payload.document_type,
          file_url: payload.file_url,
          cloudinary_public_id: payload.cloudinary_public_id,
        })
        .select()
        .single();

      if (error) throw error;
      return data as OrderDocument;

    } catch (error: any) {
      console.error('[OrderDocumentService.saveDocument] Error:', error);
      showError(error.message || 'Error al guardar los datos del documento.');
      return null;
    }
  },

  getDocumentsByOrderId: async (orderId: string, type: 'PO' | 'SO'): Promise<OrderDocument[]> => {
    const column = type === 'PO' ? 'purchase_order_id' : 'service_order_id';

    try {
      const { data, error } = await supabase
        .from('order_documents')
        .select('*, users(email)')
        .eq(column, orderId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error(`[OrderDocumentService.getDocumentsByOrderId] Error fetching for ${type} ${orderId}:`, error);
        return [];
      }

      return data as OrderDocument[];
    } catch (error) {
      console.error('[OrderDocumentService.getDocumentsByOrderId] Unexpected error:', error);
      return [];
    }
  },

  deleteDocument: async (documentId: string, cloudinaryPublicId?: string): Promise<boolean> => {
    try {
      // 1. Delete from DB
      const { error } = await supabase
        .from('order_documents')
        .delete()
        .eq('id', documentId);

      if (error) throw error;

      // 2. Delete from Cloudinary if exists
      if (cloudinaryPublicId) {
        console.log(`[OrderDocumentService] Deleting from Cloudinary: ${cloudinaryPublicId}`);
        try {
          await supabase.functions.invoke('delete-cloudinary-asset', {
            body: { 
              public_id: cloudinaryPublicId,
              resource_type: 'image' // O 'raw' si es un PDF (cloudinary borra ambos con 'image' a menos que sea video, y delete-cloudinary-asset se adapta).
            }
          });
        } catch (cloudinaryError) {
          console.error('[OrderDocumentService] Cloudinary delete failed:', cloudinaryError);
          // Don't throw, DB delete succeeded
        }
      }

      return true;
    } catch (error: any) {
      console.error('[OrderDocumentService.deleteDocument] Error:', error);
      showError(error.message || 'Error al eliminar el documento adjunto.');
      return false;
    }
  }
};
