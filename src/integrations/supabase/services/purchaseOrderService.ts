// src/integrations/supabase/services/purchaseOrderService.ts

import { supabase } from '../client';
import { showError } from '@/utils/toast';
import { PurchaseOrder, PurchaseOrderItem } from '../types';
import { logAudit } from './auditLogService';

const PurchaseOrderService = {
  getAll: async (statusFilter: 'Active' | 'Archived' | 'Approved' = 'Active'): Promise<PurchaseOrder[]> => {
    let query = supabase
      .from('purchase_orders')
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
      console.error('[PurchaseOrderService.getAll] Error:', error);
      showError('Error al cargar órdenes de compra.');
      return [];
    }
    return data;
  },

  create: async (orderData: Omit<PurchaseOrder, 'id' | 'created_at'>, items: Omit<PurchaseOrderItem, 'id' | 'order_id'>[]): Promise<PurchaseOrder | null> => {
    const { data: newOrder, error: orderError } = await supabase
      .from('purchase_orders')
      .insert(orderData)
      .select()
      .single();

    if (orderError) {
      console.error('[PurchaseOrderService.create] Error:', orderError);
      showError('Error al crear la orden de compra.');
      return null;
    }

    // --- AUDIT LOG ---
    logAudit('CREATE_PURCHASE_ORDER', { 
      table: 'purchase_orders',
      record_id: newOrder.id, 
      description: `Creación de Orden de Compra #${newOrder.sequence_number}`,
      sequence_number: newOrder.sequence_number,
      supplier_id: newOrder.supplier_id, 
      company_id: newOrder.company_id,
      items_count: items.length
    });
    // -----------------

    if (items && items.length > 0) {
      const orderItems = items.map(item => ({
        order_id: newOrder.id,
        material_id: item.material_id, // Include material_id
        material_name: item.material_name,
        supplier_code: item.supplier_code,
        quantity: item.quantity,
        unit_price: item.unit_price,
        tax_rate: item.tax_rate,
        is_exempt: item.is_exempt,
        unit: item.unit,
        description: item.description, // ADDED
        sales_percentage: item.sales_percentage, // NEW
        discount_percentage: item.discount_percentage, // NEW
      }));

      const { error: itemsError } = await supabase
        .from('purchase_order_items')
        .insert(orderItems);

      if (itemsError) {
        console.error('[PurchaseOrderService.create] Error al crear ítems:', itemsError);
        showError('Error al crear los ítems de la orden.');
        return null;
      }
      
      // --- Record Price History ---
      const priceHistoryEntries = items
        .filter(item => item.material_id && item.unit_price > 0) // Only record valid prices for linked materials
        .map(item => ({
          material_id: item.material_id,
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
          console.error('[PurchaseOrderService.create] Error al registrar historial de precios:', historyError);
          // Note: We don't fail the PO creation if history logging fails, but we log the error.
        }
      }
    }

    return newOrder;
  },

  update: async (id: string, updates: Partial<Omit<PurchaseOrder, 'id' | 'created_at'>>, items: Omit<PurchaseOrderItem, 'id' | 'order_id'>[]): Promise<PurchaseOrder | null> => {
    const { data: updatedOrder, error: orderError } = await supabase
      .from('purchase_orders')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (orderError) {
      console.error('[PurchaseOrderService.update] Error:', orderError);
      showError('Error al actualizar la orden de compra.');
      return null;
    }

    // --- AUDIT LOG ---
    logAudit('UPDATE_PURCHASE_ORDER', { 
      table: 'purchase_orders',
      record_id: id, 
      description: 'Actualización de Orden de Compra',
      sequence_number: updatedOrder.sequence_number,
      updates: updates,
      items_count: items.length
    });
    // -----------------

    // 1. Eliminar ítems existentes
    const { error: deleteError } = await supabase
      .from('purchase_order_items')
      .delete()
      .eq('order_id', id);

    if (deleteError) {
      console.error('[PurchaseOrderService.update] Error al eliminar ítems antiguos:', deleteError);
      showError('Error al actualizar los ítems de la orden.');
      return null;
    }

    // 2. Insertar nuevos ítems
    if (items && items.length > 0) {
      const orderItems = items.map(item => ({
        order_id: id,
        material_id: item.material_id, // Include material_id
        material_name: item.material_name,
        supplier_code: item.supplier_code,
        quantity: item.quantity,
        unit_price: item.unit_price,
        tax_rate: item.tax_rate,
        is_exempt: item.is_exempt,
        unit: item.unit,
        description: item.description, // ADDED
        sales_percentage: item.sales_percentage, // NEW
        discount_percentage: item.discount_percentage, // NEW
      }));

      const { error: itemsError } = await supabase
        .from('purchase_order_items')
        .insert(orderItems);

      if (itemsError) {
        console.error('[PurchaseOrderService.update] Error al crear nuevos ítems:', itemsError);
        showError('Error al actualizar los ítems de la orden.');
        return null;
      }
      
      // --- Record Price History (Only if price or material changed significantly, but for simplicity, we record on every update) ---
      const priceHistoryEntries = items
        .filter(item => item.material_id && item.unit_price > 0)
        .map(item => ({
          material_id: item.material_id,
          supplier_id: updatedOrder.supplier_id,
          unit_price: item.unit_price,
          currency: updatedOrder.currency,
          exchange_rate: updatedOrder.exchange_rate,
          purchase_order_id: updatedOrder.id,
          user_id: updatedOrder.user_id,
        }));

      if (priceHistoryEntries.length > 0) {
        // FIX: Delete existing price history entries for this PO ID before inserting new ones.
        const { error: deleteHistoryError } = await supabase
          .from('price_history')
          .delete()
          .eq('purchase_order_id', updatedOrder.id);

        if (deleteHistoryError) {
          console.error('[PurchaseOrderService.update] Error al eliminar historial de precios antiguo:', deleteHistoryError);
        }
        
        const { error: historyError } = await supabase
          .from('price_history')
          .insert(priceHistoryEntries);

        if (historyError) {
          console.error('[PurchaseOrderService.update] Error al registrar historial de precios:', historyError);
        }
      }
    }

    return updatedOrder;
  },
  
  updateStatus: async (id: string, newStatus: 'Draft' | 'Sent' | 'Approved' | 'Rejected' | 'Archived'): Promise<boolean> => {
    const { error } = await supabase
      .from('purchase_orders')
      .update({ status: newStatus })
      .eq('id', id);

    if (error) {
      console.error(`[PurchaseOrderService.updateStatus] Error updating status to ${newStatus}:`, error);
      showError(`Error al actualizar el estado de la orden a ${newStatus}.`);
      return false;
    }

    // --- AUDIT LOG ---
    logAudit('UPDATE_PURCHASE_ORDER_STATUS', { 
      table: 'purchase_orders',
      record_id: id, 
      description: `Cambio de estado a ${newStatus}`,
      new_status: newStatus 
    });
    // -----------------
    
    return true;
  },

  archive: async (id: string): Promise<boolean> => {
    return PurchaseOrderService.updateStatus(id, 'Archived');
  },

  unarchive: async (id: string): Promise<boolean> => {
    return PurchaseOrderService.updateStatus(id, 'Draft');
  },

  bulkArchiveBySupplier: async (supplierId: string): Promise<number> => {
    // Archiva todas las órdenes que no estén ya en estado 'Archived' o 'Approved'
    const { data, error } = await supabase
      .from('purchase_orders')
      .update({ status: 'Archived' })
      .eq('supplier_id', supplierId)
      .not('status', 'in', '("Archived", "Approved")')
      .select('id');

    if (error) {
      console.error('[PurchaseOrderService.bulkArchiveBySupplier] Error:', error);
      return 0;
    }
    
    // --- AUDIT LOG ---
    if (data.length > 0) {
      logAudit('BULK_ARCHIVE_PURCHASE_ORDERS', { 
        table: 'purchase_orders',
        description: `Archivado masivo de ${data.length} OCs por inactividad de proveedor`,
        supplier_id: supplierId, 
        count: data.length 
      });
    }
    // -----------------

    return data.length;
  },

  delete: async (id: string): Promise<boolean> => {
    const { error } = await supabase
      .from('purchase_orders')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[PurchaseOrderService.delete] Error:', error);
      showError('Error al eliminar la orden de compra.');
      return false;
    }

    // --- AUDIT LOG ---
    logAudit('DELETE_PURCHASE_ORDER', { 
      table: 'purchase_orders',
      record_id: id,
      description: 'Eliminación permanente de Orden de Compra'
    });
    // -----------------
    
    return true;
  },

  getById: async (id: string): Promise<PurchaseOrder | null> => {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('*, suppliers(*), companies(*), purchase_order_items(*)')
      .eq('id', id)
      .single();

    if (error) {
      console.error('[PurchaseOrderService.getById] Error:', error);
      return null;
    }
    return data;
  },
};

export const {
  getAll: getAllPurchaseOrders,
  create: createPurchaseOrder,
  update: updatePurchaseOrder,
  delete: deletePurchaseOrder,
  getById: getPurchaseOrderDetails,
  archive: archivePurchaseOrder,
  unarchive: unarchivePurchaseOrder,
  updateStatus: updatePurchaseOrderStatus,
  bulkArchiveBySupplier: bulkArchivePurchaseOrdersBySupplier, // Export the new function
} = PurchaseOrderService;