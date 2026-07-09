
import { supabase } from '@/integrations/supabase/client';
import { PurchaseOrder, PurchaseOrderItem } from '@/integrations/supabase/types';
import { logAudit } from '@/integrations/supabase/services/auditLogService';
import { showError } from '@/utils/toast';
import { calculateTotals } from '@/utils/calculations';

// Define strict input types for creation/updating to avoid 'any'
export type CreatePurchaseOrderInput = Omit<PurchaseOrder, 'id' | 'created_at' | 'supplier' | 'company' | 'sequence_number' | 'print_date'>;
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
    getAll: async (statusFilter: 'Active' | 'Archived' | 'Approved' | 'Rejected' | 'ToPay' | 'Credit' | 'Paid' = 'Active'): Promise<PurchaseOrderWithRelations[]> => {
        let query = supabase
            .from('purchase_orders')
            .select('*, suppliers(name), companies(name)')
            .order('created_at', { ascending: false });

        if (statusFilter === 'Active') {
            query = query.in('status', ['Draft']);
        } else if (statusFilter === 'Approved') {
            query = query.in('status', ['Approved', 'Credit', 'Paid']);
        } else if (statusFilter === 'ToPay') {
            query = query.eq('status', 'ToPay');
        } else if (statusFilter === 'Credit') {
            query = query.eq('status', 'Credit');
        } else if (statusFilter === 'Paid') {
            query = query.eq('status', 'Paid');
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
      statusFilter: 'Active' | 'Archived' | 'Approved' | 'Rejected' | 'ToPay' | 'Credit' | 'Paid' | 'All' = 'Active'
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
        query = query.in('status', ['Approved', 'Credit', 'Paid', 'ToPay', 'Received']);
      } else if (statusFilter === 'ToPay') {
        query = query.eq('status', 'ToPay');
      } else if (statusFilter === 'Credit') {
        query = query.eq('status', 'Credit');
      } else if (statusFilter === 'Paid') {
        query = query.eq('status', 'Paid');
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

        // Fetch matching master materials first
        const { data: matchedMasterMaterials } = await supabase
          .from('materials')
          .select('id')
          .ilike('name', searchPattern);

        const materialIds = matchedMasterMaterials?.map(m => m.id) || [];

        let orderIds: string[] = [];
        if (materialIds.length > 0) {
          const { data: matchedItems } = await supabase
            .from('purchase_order_items')
            .select('order_id')
            .or(`material_name.ilike.${searchPattern},material_id.in.(${materialIds.join(',')})`);
          orderIds = Array.from(new Set(matchedItems?.map(item => item.order_id).filter(Boolean) || []));
        } else {
          const { data: matchedItems } = await supabase
            .from('purchase_order_items')
            .select('order_id')
            .ilike('material_name', searchPattern);
          orderIds = Array.from(new Set(matchedItems?.map(item => item.order_id).filter(Boolean) || []));
        }
        
        const orConditions: string[] = [];
        if (isNumericSearch) {
          orConditions.push(`sequence_number.eq.${Number(searchTerm)}`);
        }
        if (supplierIds.length > 0) {
          orConditions.push(`supplier_id.in.(${supplierIds.join(',')})`);
        }
        if (orderIds.length > 0) {
          orConditions.push(`id.in.(${orderIds.join(',')})`);
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
            .select('*, suppliers(*), companies(*), purchase_order_items(*, materials(name))')
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
                order_id: newOrder.id,
                material_id: item.material_id || null,
                material_name: item.material_name,
                supplier_code: item.supplier_code || null,
                description: item.description || null,
                quantity: item.quantity,
                unit: item.unit || null,
                unit_price: item.unit_price,
                tax_rate: item.tax_rate ?? 0.16,
                is_exempt: !!item.is_exempt,
                sales_percentage: item.sales_percentage || 0,
                discount_percentage: item.discount_percentage || 0,
                unit_id: item.unit_id || null,
                was_recalculated: !!item.was_recalculated,
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
                    unit: item.unit,
                    unit_id: item.unit_id,
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
                order_id: id,
                material_id: item.material_id || null,
                material_name: item.material_name,
                supplier_code: item.supplier_code || null,
                description: item.description || null,
                quantity: item.quantity,
                unit: item.unit || null,
                unit_price: item.unit_price,
                tax_rate: item.tax_rate ?? 0.16,
                is_exempt: !!item.is_exempt,
                sales_percentage: item.sales_percentage || 0,
                discount_percentage: item.discount_percentage || 0,
                unit_id: item.unit_id || null,
                was_recalculated: !!item.was_recalculated,
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
                    unit: item.unit,
                    unit_id: item.unit_id,
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
        let updateData: any = { status: newStatus };

        if (newStatus === 'Paid') {
            try {
                // Fetch the purchase order details with items to calculate total
                const { data: po } = await supabase
                    .from('purchase_orders')
                    .select('*, purchase_order_items(*)')
                    .eq('id', id)
                    .single();

                if (po) {
                    const itemsForCalculation = (po.purchase_order_items || []).map((item: any) => ({
                        quantity: item.quantity,
                        unit_price: item.unit_price,
                        tax_rate: item.tax_rate,
                        is_exempt: item.is_exempt,
                        sales_percentage: item.sales_percentage || 0,
                        discount_percentage: item.discount_percentage || 0,
                    }));
                    const totals = calculateTotals(itemsForCalculation);
                    updateData.paid_amount = totals.total;
                }
            } catch (e) {
                console.error('[purchaseOrderService.updateStatus] Error calculating paid_amount:', e);
            }
        }

        const { error } = await supabase
            .from('purchase_orders')
            .update(updateData)
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
        const toLocalDateString = (d: Date): string => {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        let query = supabase
            .from('purchase_order_items')
            .select(`
        *,
        purchase_orders!inner (
          id,
          sequence_number,
          created_at,
          issue_date,
          status,
          currency,
          exchange_rate,
          supplier_id,
          suppliers ( name, rif )
        ),
        materials ( name, code, category, unit )
      `)
            .order('purchase_orders(issue_date)', { ascending: false });

        if (supplierId) query = query.eq('purchase_orders.supplier_id', supplierId);
        if (materialId) query = query.eq('material_id', materialId);
        if (startDate) query = query.gte('purchase_orders.issue_date', toLocalDateString(startDate));
        if (endDate) query = query.lte('purchase_orders.issue_date', toLocalDateString(endDate));
        if (status) query = query.eq('purchase_orders.status', status);

        const { data, error } = await query;
        if (error) {
            console.error('[purchaseOrderService.historyReport] Error:', error);
            return [];
        }
        return data;
    },

    updateReceptionStatus: async (orderIds: string[], status: 'Ninguno' | 'En tránsito' | 'Parcial' | 'Recibido'): Promise<boolean> => {
        const { error } = await supabase
            .from('purchase_orders')
            .update({ reception_status: status })
            .in('id', orderIds);

        if (error) {
            console.error('[purchaseOrderService.updateReceptionStatus] Error:', error);
            showError('Error al actualizar el estado de recepción.');
            return false;
        }

        // Audit log
        try {
            await logAudit('update_reception_status', { 
                table: 'purchase_orders',
                record_id: orderIds.join(','),
                description: `Estableció el estado de recepción a '${status}' para las órdenes seleccionadas.`,
                new_data: { reception_status: status },
                old_data: { reception_status: 'Ninguno' }
            });
        } catch (e) {
            console.error('[purchaseOrderService.updateReceptionStatus] Audit error:', e);
        }

        return true;
    },

    updateReceivedQuantities: async (items: { id: string; received_quantity: number }[]): Promise<boolean> => {
        try {
            const promises = items.map(item => 
                supabase
                    .from('purchase_order_items')
                    .update({ received_quantity: item.received_quantity })
                    .eq('id', item.id)
            );
            
            const results = await Promise.all(promises);
            const hasError = results.some(r => r.error);
            if (hasError) {
                const firstError = results.find(r => r.error)?.error;
                throw firstError;
            }
            return true;
        } catch (error) {
            console.error('[purchaseOrderService.updateReceivedQuantities] Error:', error);
            showError('Error al registrar cantidades recibidas.');
            return false;
        }
    },

    updateOrderReceptionState: async (orderId: string): Promise<boolean> => {
        try {
            const { data: items, error: itemsError } = await supabase
                .from('purchase_order_items')
                .select('quantity, received_quantity')
                .eq('order_id', orderId);

            if (itemsError) throw itemsError;
            if (!items || items.length === 0) return false;

            let totalItems = items.length;
            let fullyReceivedCount = 0;
            let partialReceivedCount = 0;

            items.forEach(item => {
                const qty = Number(item.quantity);
                const recQty = Number(item.received_quantity || 0);

                if (recQty >= qty) {
                    fullyReceivedCount++;
                } else if (recQty > 0) {
                    partialReceivedCount++;
                }
            });

            let newReceptionStatus: 'Ninguno' | 'En tránsito' | 'Parcial' | 'Recibido' = 'Ninguno';
            
            if (fullyReceivedCount === totalItems) {
                newReceptionStatus = 'Recibido';
            } else if (partialReceivedCount > 0 || fullyReceivedCount > 0) {
                newReceptionStatus = 'Parcial';
            } else {
                const { data: orderData } = await supabase
                    .from('purchase_orders')
                    .select('reception_status')
                    .eq('id', orderId)
                    .single();
                
                if (orderData && orderData.reception_status === 'En tránsito') {
                    newReceptionStatus = 'En tránsito';
                } else {
                    newReceptionStatus = 'Ninguno';
                }
            }

            const updates: any = { reception_status: newReceptionStatus };

            const { error: updateError } = await supabase
                .from('purchase_orders')
                .update(updates)
                .eq('id', orderId);

            if (updateError) throw updateError;

            try {
                await logAudit('update_order_reception_state', { 
                    table: 'purchase_orders',
                    record_id: orderId,
                    description: `Actualizó el estado general de recepción de la orden a '${newReceptionStatus}'.`,
                    new_data: updates
                });
            } catch (e) {
                console.error('[purchaseOrderService.updateOrderReceptionState] Audit error:', e);
            }

            return true;
        } catch (error) {
            console.error('[purchaseOrderService.updateOrderReceptionState] Error:', error);
            return false;
        }
    },

    getBySupplierId: async (supplierId: string): Promise<unknown[]> => {
        const { data, error } = await supabase
            .from('purchase_orders')
            .select('*, companies(name), purchase_order_items(*)')
            .eq('supplier_id', supplierId)
            .order('sequence_number', { ascending: false });

        if (error) {
            console.error('[purchaseOrderService.getBySupplierId] Error:', error);
            showError('Error al cargar órdenes de compra del proveedor.');
            return [];
        }
        return data || [];
    }
};

