
import { supabase } from '@/integrations/supabase/client';
import { ServiceOrder, ServiceOrderItem, ServiceOrderMaterial } from '@/integrations/supabase/types';
import { showError } from '@/utils/toast';

// Define strict input types
export type CreateServiceOrderInput = Omit<ServiceOrder, 'id' | 'created_at' | 'supplier' | 'company' | 'sequence_number' | 'service_order_items' | 'service_order_materials'>;
export type CreateServiceOrderItemInput = Omit<ServiceOrderItem, 'id' | 'order_id' | 'created_at'>;
export type CreateServiceOrderMaterialInput = Omit<ServiceOrderMaterial, 'id' | 'service_order_id' | 'created_at' | 'suppliers' | 'materials'>;

export type ServiceOrderWithRelations = ServiceOrder & {
    suppliers: { name: string };
    companies: { name: string };
};

export const serviceOrderService = {
    /**
     * Fetch all Service Orders filtered by status
     */
    getAll: async (statusFilter: 'Active' | 'Archived' | 'Approved' | 'Rejected' = 'Active'): Promise<ServiceOrderWithRelations[]> => {
        let query = supabase
            .from('service_orders')
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
            console.error('[serviceOrderService.getAll] Error:', error);
            showError('Error al cargar órdenes de servicio.');
            return [];
        }

        return data as unknown as ServiceOrderWithRelations[];
    },

    getById: async (id: string): Promise<ServiceOrder | null> => {
        // Need to fetch order, items, and materials
        const { data, error } = await supabase
            .from('service_orders')
            .select(`
                *,
                suppliers(*),
                companies(*),
                service_order_items(*),
                service_order_materials(*, materials(name))
            `)
            .eq('id', id)
            .single();

        if (error) {
            console.error('[serviceOrderService.getById] Error:', error);
            return null;
        }
        return data as unknown as ServiceOrder;
    },

    create: async (
        orderData: CreateServiceOrderInput,
        items: CreateServiceOrderItemInput[],
        materials: CreateServiceOrderMaterialInput[]
    ): Promise<ServiceOrder | null> => {
        // 1. Create Order
        const { data: newOrder, error: orderError } = await supabase
            .from('service_orders')
            .insert(orderData)
            .select()
            .single();

        if (orderError) {
            console.error('[serviceOrderService.create] Error:', orderError);
            showError('Error al crear la orden de servicio.');
            return null;
        }

        // 2. Create Services (Items)
        if (items && items.length > 0) {
            const orderItems = items.map(item => ({
                ...item,
                order_id: newOrder.id,
            }));

            const { error: itemsError } = await supabase
                .from('service_order_items')
                .insert(orderItems);

            if (itemsError) {
                console.error('[serviceOrderService.create] Error items:', itemsError);
                showError('Error al guardar los servicios.');
                return null;
            }
        }

        // 3. Create Materials
        if (materials && materials.length > 0) {
            const orderMaterials = materials.map(mat => ({
                ...mat,
                service_order_id: newOrder.id,
            }));

            const { error: materialsError } = await supabase
                .from('service_order_materials')
                .insert(orderMaterials);

            if (materialsError) {
                console.error('[serviceOrderService.create] Error materials:', materialsError);
                showError('Error al guardar los materiales/repuestos.');
                return null;
            }

            // 4. Record Price History (for materials only)
            const priceHistoryEntries = materials
                .filter(item => item.material_id && item.unit_price > 0)
                .map(item => ({
                    material_id: item.material_id!,
                    supplier_id: newOrder.supplier_id,
                    unit_price: item.unit_price,
                    currency: newOrder.currency,
                    exchange_rate: newOrder.exchange_rate,
                    service_order_id: newOrder.id,
                    user_id: newOrder.user_id,
                }));

            if (priceHistoryEntries.length > 0) {
                await supabase.from('price_history').insert(priceHistoryEntries);
            }
        }

        return newOrder as unknown as ServiceOrder;
    },

    update: async (
        id: string,
        updates: Partial<CreateServiceOrderInput>,
        items: CreateServiceOrderItemInput[],
        materials: CreateServiceOrderMaterialInput[]
    ): Promise<ServiceOrder | null> => {
        // 1. Update Order
        const { data: updatedOrder, error: orderError } = await supabase
            .from('service_orders')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (orderError) {
            console.error('[serviceOrderService.update] Error:', orderError);
            showError('Error al actualizar la orden.');
            return null;
        }

        // 2. Refresh Items (Services)
        const { error: deleteItemsError } = await supabase
            .from('service_order_items')
            .delete()
            .eq('order_id', id);

        if (deleteItemsError) {
            console.error('[serviceOrderService.update] Delete items error:', deleteItemsError);
            return null;
        }

        if (items && items.length > 0) {
            const orderItems = items.map(item => ({
                ...item,
                order_id: id,
            }));
            const { error: insertItemsError } = await supabase.from('service_order_items').insert(orderItems);
            if (insertItemsError) {
                console.error('[serviceOrderService.update] Insert items error:', insertItemsError);
                return null;
            }
        }

        // 3. Refresh Materials
        const { error: deleteMaterialsError } = await supabase
            .from('service_order_materials')
            .delete()
            .eq('service_order_id', id);

        if (deleteMaterialsError) {
            console.error('[serviceOrderService.update] Delete materials error:', deleteMaterialsError);
            return null;
        }

        if (materials && materials.length > 0) {
            const orderMaterials = materials.map(mat => ({
                ...mat,
                service_order_id: id,
            }));
            const { error: insertMaterialsError } = await supabase.from('service_order_materials').insert(orderMaterials);
            if (insertMaterialsError) {
                console.error('[serviceOrderService.update] Insert materials error:', insertMaterialsError);
                return null;
            }

            // 4. Update Price History
            await supabase.from('price_history').delete().eq('service_order_id', id);

            const priceHistoryEntries = materials
                .filter(item => item.material_id && item.unit_price > 0)
                .map(item => ({
                    material_id: item.material_id!,
                    supplier_id: updatedOrder.supplier_id,
                    unit_price: item.unit_price,
                    currency: updatedOrder.currency,
                    exchange_rate: updatedOrder.exchange_rate,
                    service_order_id: updatedOrder.id,
                    user_id: updatedOrder.user_id,
                }));

            if (priceHistoryEntries.length > 0) {
                await supabase.from('price_history').insert(priceHistoryEntries);
            }
        }

        return updatedOrder as unknown as ServiceOrder;
    },

    updateStatus: async (id: string, newStatus: ServiceOrder['status']): Promise<boolean> => {
        const { error } = await supabase
            .from('service_orders')
            .update({ status: newStatus })
            .eq('id', id);

        if (error) {
            console.error('[serviceOrderService.updateStatus] Error:', error);
            showError('Error al actualizar estado.');
            return false;
        }
        return true;
    },

    delete: async (id: string): Promise<boolean> => {
        const { error } = await supabase
            .from('service_orders')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('[serviceOrderService.delete] Error:', error);
            showError('Error al eliminar orden.');
            return false;
        }
        return true;
    }
};
