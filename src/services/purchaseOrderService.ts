
import { supabase } from '@/integrations/supabase/client';
import { PurchaseOrder, PurchaseOrderItem } from '@/integrations/supabase/types';
import { logAudit } from '@/integrations/supabase/services/auditLogService';
import { showError } from '@/utils/toast';

// Define strict input types for creation/updating to avoid 'any'
export type CreatePurchaseOrderInput = Omit<PurchaseOrder, 'id' | 'created_at' | 'supplier' | 'company' | 'sequence_number'>;
export type CreatePurchaseOrderItemInput = Omit<PurchaseOrderItem, 'id' | 'order_id' | 'created_at' | 'updated_at'>;

// Type for the list view which includes joined table data
export type PurchaseOrderWithRelations = PurchaseOrder & {
    suppliers: { name: string };
    companies: { name: string };
};

export const purchaseOrderService = {
    /**
     * Fetch all Purchase Orders filtered by status
     */
    getAll: async (statusFilter: 'Active' | 'Archived' | 'Approved' | 'Rejected' = 'Active'): Promise<PurchaseOrderWithRelations[]> => {
        let query = supabase
            .from('purchase_orders')
            .select('*, suppliers(name), companies(name)')
            .order('created_at', { ascending: false });

        if (statusFilter === 'Active') {
            query = query.in('status', ['Draft']);
        } else if (statusFilter === 'Approved') {
            query = query.eq('status', 'Approved');
        } else if (statusFilter === 'Archived') {
            query = query.eq('status', 'Archived');
        } else if (statusFilter === 'Rejected') {
            query = query.eq('status', 'Rejected');
        }

        const { data, error } = await query;

        if (error) {
            console.error('[purchaseOrderService.getAll] Error:', error);
            showError('Error al cargar órdenes de compra.');
            return [];
        }

        return data as unknown as PurchaseOrderWithRelations[];
    },

    getPaginated: async (
      page: number,
      pageSize: number,
      searchTerm: string = '',
      statusFilter: 'Active' | 'Archived' | 'Approved' | 'Rejected' | 'All' = 'Active'
    ): Promise<{ data: PurchaseOrderWithRelations[], count: number }> => {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
  
      // Use standard join
      const selectQuery = '*, suppliers(name), companies(name)';
  
      let query = supabase
        .from('purchase_orders')
        .select(selectQuery, { count: 'exact' });
  
      if (statusFilter === 'Active') {
        query = query.in('status', ['Draft']);
      } else if (statusFilter === 'Approved') {
        query = query.eq('status', 'Approved');
      } else if (statusFilter === 'Archived') {
        query = query.eq('status', 'Archived');
      } else if (statusFilter === 'Rejected') {
        query = query.eq('status', 'Rejected');
      }
  
      if (searchTerm) {
        const searchPattern = `%${searchTerm}%`;
        
        // Fetch matching supplier IDs first to avoid PostgREST foreign table OR syntax errors
        const { data: matchedSuppliers } = await supabase
          .from('suppliers')
          .select('id')
          .ilike('name', searchPattern);
          
        const supplierIds = matchedSuppliers?.map(s => s.id) || [];
        const isNumericSearch = !isNaN(Number(searchTerm)) && searchTerm.trim() !== '';
        
        const orConditions: string[] = [];
        if (isNumericSearch) {
          orConditions.push(`sequence_number.eq.${Number(searchTerm)}`);
        }
        if (supplierIds.length > 0) {
          orConditions.push(`supplier_id.in.(${supplierIds.join(',')})`);
        }
        
        if (orConditions.length > 0) {
          query = query.or(orConditions.join(','));
        } else {
          query = query.eq('id', '00000000-0000-0000-0000-000000000000'); // Force empty result
        }
      }
  
      const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .range(from, to);
  
      if (error) {
        console.error('[purchaseOrderService.getPaginated] Error:', error);
        showError('Error al cargar órdenes de compra (paginadas).');
        return { data: [], count: 0 };
      }
  
      return { data: data as unknown as PurchaseOrderWithRelations[], count: count || 0 };
    },

    getById: async (id: string): Promise<PurchaseOrder | null> => {
        const { data, error } = await supabase
            .from('purchase_orders')
            .select('*, suppliers(*), companies(*), purchase_order_items(*)')
            .eq('id', id)
            .single();

        if (error) {
            console.error('[purchaseOrderService.getById] Error:', error);
            return null;
        }
        return data as unknown as PurchaseOrder;
    },

    create: async (orderData: CreatePurchaseOrderInput, items: CreatePurchaseOrderItemInput[]): Promise<PurchaseOrder | null> => {
        // 1. Create Order
        const { data: newOrder, error: orderError } = await supabase
            .from('purchase_orders')
            .insert(orderData)
            .select()
            .single();

        if (orderError) {
            console.error('[purchaseOrderService.create] Error:', orderError);
            showError('Error al crear la orden de compra.');
            return null;
        }

        // 2. Create Items
        if (items && items.length > 0) {
            const orderItems = items.map(item => ({
                ...item,
                order_id: newOrder.id,
            }));

            const { error: itemsError } = await supabase
                .from('purchase_order_items')
                .insert(orderItems);

            if (itemsError) {
                console.error('[purchaseOrderService.create] Error items:', itemsError);
                showError('Error al crear los ítems de la orden.');
                return null;
            }

            // 3. Record Price History
            const priceHistoryEntries = items
                .filter(item => item.material_id && item.unit_price > 0)
                .map(item => ({
                    material_id: item.material_id!,
                    supplier_id: newOrder.supplier_id,
                    unit_price: item.unit_price,
                    currency: newOrder.currency,
                    exchange_rate: newOrder.exchange_rate,
                    purchase_order_id: newOrder.id,
                    user_id: newOrder.user_id,
                }));

            if (priceHistoryEntries.length > 0) {
                const { error: historyError } = await supabase
                    .from('price_history')
                    .insert(priceHistoryEntries);

                if (historyError) {
                    console.error('[purchaseOrderService.create] Price history error:', historyError);
                }
            }
        }

        // 4. Create Notification
        try {
            await supabase.from('notifications').insert({
                user_id: newOrder.user_id,
                title: 'Nueva Orden de Compra',
                message: `Se ha generado la OC #${newOrder.sequence_number}.`,
                type: 'crud',
                resource_type: 'purchase_order',
                resource_id: newOrder.id
            });
        } catch (e) {
            console.error('Error creating notification:', e);
        }

        return newOrder as unknown as PurchaseOrder;
    },

    update: async (id: string, updates: Partial<CreatePurchaseOrderInput>, items: CreatePurchaseOrderItemInput[]): Promise<PurchaseOrder | null> => {
        // 1. Update Order
        const { data: updatedOrder, error: orderError } = await supabase
            .from('purchase_orders')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (orderError) {
            console.error('[purchaseOrderService.update] Error:', orderError);
            showError('Error al actualizar la orden.');
            return null;
        }

        // 2. Refresh Items
        const { error: deleteError } = await supabase
            .from('purchase_order_items')
            .delete()
            .eq('order_id', id);

        if (deleteError) {
            console.error('[purchaseOrderService.update] Delete items error:', deleteError);
            return null;
        }

        if (items && items.length > 0) {
            const orderItems = items.map(item => ({
                ...item,
                order_id: id,
            }));

            const { error: insertError } = await supabase
                .from('purchase_order_items')
                .insert(orderItems);

            if (insertError) {
                console.error('[purchaseOrderService.update] Insert items error:', insertError);
                return null;
            }

            // 3. Update Price History
            await supabase.from('price_history').delete().eq('purchase_order_id', id);

            const priceHistoryEntries = items
                .filter(item => item.material_id && item.unit_price > 0)
                .map(item => ({
                    material_id: item.material_id!,
                    supplier_id: updatedOrder.supplier_id,
                    unit_price: item.unit_price,
                    currency: updatedOrder.currency,
                    exchange_rate: updatedOrder.exchange_rate,
                    purchase_order_id: updatedOrder.id,
                    user_id: updatedOrder.user_id,
                }));

            if (priceHistoryEntries.length > 0) {
                await supabase.from('price_history').insert(priceHistoryEntries);
            }
        }

        // 4. Create Notification
        try {
            await supabase.from('notifications').insert({
                user_id: updatedOrder.user_id,
                title: 'Orden de Compra Actualizada',
                message: `Se ha actualizado la OC #${updatedOrder.sequence_number}.`,
                type: 'crud',
                resource_type: 'purchase_order',
                resource_id: updatedOrder.id
            });
        } catch (e) {
            console.error('Error creating notification:', e);
        }

        return updatedOrder as unknown as PurchaseOrder;
    },

    updateStatus: async (id: string, newStatus: PurchaseOrder['status']): Promise<boolean> => {
        const { error } = await supabase
            .from('purchase_orders')
            .update({ status: newStatus })
            .eq('id', id);

        if (error) {
            console.error('[purchaseOrderService.updateStatus] Error:', error);
            showError('Error al actualizar estado.');
            return false;
        }

        // Create Notification on status change
        try {
            const { data: po } = await supabase.from('purchase_orders').select('sequence_number, user_id').eq('id', id).single();
            await supabase.from('notifications').insert({
                user_id: po?.user_id,
                title: 'Estado de OC Cambiado',
                message: `La OC #${po?.sequence_number} ha cambiado a: ${newStatus}`,
                type: 'crud',
                resource_type: 'purchase_order',
                resource_id: id
            });
        } catch (e) {
            console.error('Error creating notification:', e);
        }

        return true;
    },

    delete: async (id: string): Promise<boolean> => {
        const { error } = await supabase
            .from('purchase_orders')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('[purchaseOrderService.delete] Error:', error);
            showError('Error al eliminar orden.');
            return false;
        }
        return true;
    },

    bulkArchiveBySupplier: async (supplierId: string): Promise<number> => {
        const { data, error } = await supabase
            .from('purchase_orders')
            .update({ status: 'Archived' })
            .eq('supplier_id', supplierId)
            .neq('status', 'Archived')
            .neq('status', 'Approved')
            .select('id');

        if (error) {
            console.error('[purchaseOrderService.bulkArchive] Error:', error);
            return 0;
        }
        return data.length;
    },

    getPurchaseHistoryReport: async ({
        supplierId,
        materialId,
        startDate,
        endDate,
        status
    }: {
        supplierId?: string;
        materialId?: string;
        startDate?: Date;
        endDate?: Date;
        status?: string;
    }) => {
        let query = supabase
            .from('purchase_order_items')
            .select(`
        *,
        purchase_orders!inner (
          id,
          sequence_number,
          created_at,
          status,
          currency,
          exchange_rate,
          supplier_id,
          suppliers ( name, rif )
        ),
        materials ( name, code, category, unit )
      `)
            .order('created_at', { ascending: false });

        if (supplierId) query = query.eq('purchase_orders.supplier_id', supplierId);
        if (materialId) query = query.eq('material_id', materialId);
        if (startDate) query = query.gte('created_at', startDate.toISOString());
        if (endDate) {
            const endOfDay = new Date(endDate);
            endOfDay.setHours(23, 59, 59, 999);
            query = query.lte('created_at', endOfDay.toISOString());
        }
        if (status) query = query.eq('purchase_orders.status', status);

        const { data, error } = await query;
        if (error) {
            console.error('[purchaseOrderService.historyReport] Error:', error);
            return [];
        }
        return data;
    }
};
