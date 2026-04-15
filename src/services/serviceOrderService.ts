
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
            console.error('[serviceOrderService.getAll] Error:', error);
            showError('Error al cargar órdenes de servicio.');
            return [];
        }

        return data as unknown as ServiceOrderWithRelations[];
    },

    getPaginated: async (
      page: number,
      pageSize: number,
      searchTerm: string = '',
      statusFilter: 'Active' | 'Archived' | 'Approved' | 'Rejected' = 'Active'
    ): Promise<{ data: ServiceOrderWithRelations[], count: number }> => {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
  
      // Use standard join
      const selectQuery = '*, suppliers(name), companies(name)';
  
      let query = supabase
        .from('service_orders')
        .select(selectQuery, { count: 'exact' });
  
      if (statusFilter === 'Active') {
        query = query.in('status', ['Draft', 'Sent']);
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
        console.error('[serviceOrderService.getPaginated] Error:', error);
        showError('Error al cargar órdenes de servicio (paginadas).');
        return { data: [], count: 0 };
      }
  
      return { data: data as unknown as ServiceOrderWithRelations[], count: count || 0 };
    },

    getById: async (id: string): Promise<ServiceOrder | null> => {
        // Fetch the main order
        const { data: order, error: orderError } = await supabase
            .from('service_orders')
            .select(`
                *,
                suppliers(*),
                companies(*)
            `)
            .eq('id', id)
            .single();

        if (orderError) {
            console.error('[serviceOrderService.getById] Error fetching order:', orderError);
            return null;
        }

        // Fetch items separately
        const { data: items, error: itemsError } = await supabase
            .from('service_order_items')
            .select('*')
            .eq('order_id', id);

        if (itemsError) {
            console.error('[serviceOrderService.getById] Error fetching items:', itemsError);
        }

        // Fetch materials separately with relations
        const { data: materials, error: materialsError } = await supabase
            .from('service_order_materials')
            .select('*, materials(name), suppliers(name)')
            .eq('service_order_id', id);

        if (materialsError) {
            console.error('[serviceOrderService.getById] Error fetching materials:', materialsError);
        }

        // Combine data
        return {
            ...order,
            service_order_items: items || [],
            service_order_materials: materials || []
        } as unknown as ServiceOrder;
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

        // Notification
        try {
            await supabase.from('notifications').insert({
                user_id: newOrder.user_id,
                title: 'Nueva Orden de Servicio',
                message: `Se ha generado la OS #${newOrder.sequence_number}.`,
                type: 'crud',
                resource_type: 'service_order',
                resource_id: newOrder.id
            });
        } catch (e) {
            console.error('Error creating notification:', e);
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

        // Notification
        try {
            await supabase.from('notifications').insert({
                user_id: updatedOrder.user_id,
                title: 'Orden de Servicio Actualizada',
                message: `Se ha actualizado la OS #${updatedOrder.sequence_number}.`,
                type: 'crud',
                resource_type: 'service_order',
                resource_id: updatedOrder.id
            });
        } catch (e) {
            console.error('Error creating notification:', e);
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

        // Notification on status change
        try {
            const { data: so } = await supabase.from('service_orders').select('sequence_number, user_id').eq('id', id).single();
            await supabase.from('notifications').insert({
                user_id: so?.user_id,
                title: 'Estado de OS Cambiado',
                message: `La OS #${so?.sequence_number} ha cambiado a: ${newStatus}`,
                type: 'crud',
                resource_type: 'service_order',
                resource_id: id
            });
        } catch (e) {
            console.error('Error creating notification:', e);
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
