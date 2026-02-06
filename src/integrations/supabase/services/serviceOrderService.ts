// src/integrations/supabase/services/serviceOrderService.ts

import { supabase } from '../client';
import { showError } from '@/utils/toast';
import { ServiceOrder, ServiceOrderItem } from '../types';
import { logAudit } from './auditLogService';

const ServiceOrderService = {
  getAll: async (statusFilter: 'Active' | 'Archived' | 'Approved' = 'Active'): Promise<ServiceOrder[]> => {
    let query = supabase
      .from('service_orders')
      .select('*, suppliers(name), companies(name)')
      .order('created_at', { ascending: false });

    if (statusFilter === 'Active') {
      // Incluir 'Draft', 'Sent', 'Rejected'
      query = query.in('status', ['Draft', 'Sent', 'Rejected']);
    } else if (statusFilter === 'Approved') {
      // Solo incluir 'Approved'
      query = query.eq('status', 'Approved');
    } else if (statusFilter === 'Archived') {
      // Solo incluir 'Archived'
      query = query.eq('status', 'Archived');
    }

    const { data, error } = await query;

    if (error) {
      console.error('[ServiceOrderService.getAll] Error:', error);
      showError('Error al cargar órdenes de servicio.');
      return [];
    }
    return data as ServiceOrder[];
  },

  create: async (orderData: Omit<ServiceOrder, 'id' | 'created_at'>, items: Omit<ServiceOrderItem, 'id' | 'order_id'>[]): Promise<ServiceOrder | null> => {
    const { data: newOrder, error: orderError } = await supabase
      .from('service_orders')
      .insert(orderData)
      .select()
      .single();

    if (orderError) {
      console.error('[ServiceOrderService.create] Error:', orderError);
      showError('Error al crear la orden de servicio.');
      return null;
    }

    // --- AUDIT LOG ---
    logAudit('CREATE_SERVICE_ORDER', {
      table: 'service_orders',
      record_id: newOrder.id,
      description: `Creación de Orden de Servicio #${newOrder.sequence_number}`,
      sequence_number: newOrder.sequence_number,
      supplier_id: newOrder.supplier_id,
      company_id: newOrder.company_id,
      items_count: items.length
    });
    // -----------------

    if (items && items.length > 0) {
      const orderItems = items.map(item => ({
        order_id: newOrder.id,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        tax_rate: item.tax_rate,
        is_exempt: item.is_exempt,
        sales_percentage: item.sales_percentage,
        discount_percentage: item.discount_percentage,
      }));

      const { error: itemsError } = await supabase
        .from('service_order_items')
        .insert(orderItems);

      if (itemsError) {
        console.error('[ServiceOrderService.create] Error al crear ítems:', itemsError);
        showError('Error al crear los ítems de la orden de servicio.');
        return null;
      }
    }

    return newOrder as ServiceOrder;
  },

  update: async (id: string, updates: Partial<Omit<ServiceOrder, 'id' | 'created_at'>>, items: Omit<ServiceOrderItem, 'id' | 'order_id'>[]): Promise<ServiceOrder | null> => {
    const { data: updatedOrder, error: orderError } = await supabase
      .from('service_orders')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (orderError) {
      console.error('[ServiceOrderService.update] Error:', orderError);
      showError('Error al actualizar la orden de servicio.');
      return null;
    }

    // --- AUDIT LOG ---
    logAudit('UPDATE_SERVICE_ORDER', {
      table: 'service_orders',
      record_id: id,
      description: 'Actualización de Orden de Servicio',
      sequence_number: updatedOrder.sequence_number,
      updates: updates,
      items_count: items.length
    });
    // -----------------

    // 1. Eliminar ítems existentes
    const { error: deleteError } = await supabase
      .from('service_order_items')
      .delete()
      .eq('order_id', id);

    if (deleteError) {
      console.error('[ServiceOrderService.update] Error al eliminar ítems antiguos:', deleteError);
      showError('Error al actualizar los ítems de la orden de servicio.');
      return null;
    }

    // 2. Insertar nuevos ítems
    if (items && items.length > 0) {
      const orderItems = items.map(item => ({
        order_id: id,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        tax_rate: item.tax_rate,
        is_exempt: item.is_exempt,
        sales_percentage: item.sales_percentage,
        discount_percentage: item.discount_percentage,
      }));

      const { error: itemsError } = await supabase
        .from('service_order_items')
        .insert(orderItems);

      if (itemsError) {
        console.error('[ServiceOrderService.update] Error al crear nuevos ítems:', itemsError);
        showError('Error al actualizar los ítems de la orden de servicio.');
        return null;
      }
    }

    return updatedOrder as ServiceOrder;
  },

  updateStatus: async (id: string, newStatus: 'Draft' | 'Sent' | 'Approved' | 'Rejected' | 'Archived'): Promise<boolean> => {
    const { error } = await supabase
      .from('service_orders')
      .update({ status: newStatus })
      .eq('id', id);

    if (error) {
      console.error(`[ServiceOrderService.updateStatus] Error updating status to ${newStatus}:`, error);
      showError(`Error al actualizar el estado de la orden de servicio a ${newStatus}.`);
      return false;
    }

    // --- AUDIT LOG ---
    logAudit('UPDATE_SERVICE_ORDER_STATUS', {
      table: 'service_orders',
      record_id: id,
      description: `Cambio de estado a ${newStatus}`,
      new_status: newStatus
    });
    // -----------------

    return true;
  },

  archive: async (id: string): Promise<boolean> => {
    return ServiceOrderService.updateStatus(id, 'Archived');
  },

  unarchive: async (id: string): Promise<boolean> => {
    return ServiceOrderService.updateStatus(id, 'Draft');
  },

  delete: async (id: string): Promise<boolean> => {
    const { error } = await supabase
      .from('service_orders')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[ServiceOrderService.delete] Error:', error);
      showError('Error al eliminar la orden de servicio.');
      return false;
    }

    // --- AUDIT LOG ---
    logAudit('DELETE_SERVICE_ORDER', {
      table: 'service_orders',
      record_id: id,
      description: 'Eliminación permanente de Orden de Servicio'
    });
    // -----------------

    return true;
  },

  getById: async (id: string): Promise<ServiceOrder | null> => {
    const { data: order, error } = await supabase
      .from('service_orders')
      .select('*, suppliers(*), companies(*)')
      .eq('id', id)
      .single();

    if (error) {
      console.error('[ServiceOrderService.getById] Error:', error);
      return null;
    }

    // Manually fetch items to ensure they are retrieved regardless of join issues
    const { data: items, error: itemsError } = await supabase
      .from('service_order_items')
      .select('*')
      .eq('order_id', id);

    if (itemsError) {
      console.error('[ServiceOrderService.getById] Error fetching items:', itemsError);
    }

    // Attach items to order object manually
    const orderWithItems = {
      ...order,
      service_order_items: items || []
    };

    return orderWithItems as ServiceOrder;
  },
};

export const {
  getAll: getAllServiceOrders,
  create: createServiceOrder,
  update: updateServiceOrder,
  delete: deleteServiceOrder,
  getById: getServiceOrderDetails,
  archive: archiveServiceOrder,
  unarchive: unarchiveServiceOrder,
  updateStatus: updateServiceOrderStatus,
} = ServiceOrderService;