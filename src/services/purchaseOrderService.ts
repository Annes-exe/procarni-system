
import { supabase } from '@/integrations/supabase/client';
import { PurchaseOrder, PurchaseOrderItem } from '@/integrations/supabase/types';
import { logAudit } from '@/integrations/supabase/services/auditLogService';
import { showError } from '@/utils/toast';

// Define strict input types for creation/updating to avoid 'any'
export type CreatePurchaseOrderInput = Omit<PurchaseOrder, 'id' | 'created_at' | 'supplier' | 'company' | 'sequence_number'>;
export type CreatePurchaseOrderItemInput = Omit<PurchaseOrderItem, 'id' | 'order_id' | 'created_at' | 'updated_at'>;

// Type for the list view which includes joined table data
// Note: Supabase returns arrays for joined 1:1 relations if not strictly defined, 
// but here we expect single objects because of how we allow the data.
// We use the plural 'suppliers' matching the table name in the query unless aliased.
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
            query = query.in('status', ['Draft', 'Sent']);
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

        // Cast response to satisfy the strict PurchaseOrder type
        return data as unknown as PurchaseOrderWithRelations[];
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
                // We do not revert the order creation here, but ideally we should (transaction).
                // For now, we return null to indicate partial failure or just log it.
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

        // 2. Refresh Items (Delete all then Re-insert) -> Simple strategy
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

            // 3. Update Price History (Delete old for this PO, insert new)
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

    /**
     * Bulk archive orders for a supplier
     */
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

    /**
     * Reporting: Get Purchase History
     */
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
