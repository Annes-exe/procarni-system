import { supabase } from '../client';
import { PurchaseReminder, PurchaseReminderItem } from '../types';
import { showError, showSuccess } from '@/utils/toast';

export interface CreatePurchaseReminderPayload {
  title: string;
  description?: string | null;
  reminder_type: 'material_purchase' | 'management_task';
  priority: 'baja' | 'media' | 'alta' | 'urgente';
  due_date?: string | null;
  material_id?: string | null;
  material_name?: string | null;
  supplier_id?: string | null;
  quantity?: number | null;
  unit_id?: string | null;
  unit_name?: string | null;
  estimated_price?: number | null;
  currency?: 'USD' | 'VES' | 'EUR';
  items?: PurchaseReminderItem[] | null;
  is_recurring?: boolean | null;
  recurrence_interval?: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom' | null;
  recurrence_days?: number | null;
}

export interface UpdatePurchaseReminderPayload extends Partial<CreatePurchaseReminderPayload> {
  status?: 'pending' | 'completed' | 'cancelled';
  purchase_order_id?: string | null;
  completed_at?: string | null;
  last_completed_at?: string | null;
}

export const calculateNextDueDate = (
  currentDueDateStr?: string | null,
  interval?: string | null,
  customDays?: number | null
): string => {
  const baseDate = currentDueDateStr ? new Date(currentDueDateStr) : new Date();
  const startDate = isNaN(baseDate.getTime()) || baseDate.getTime() < Date.now() ? new Date() : baseDate;
  const nextDate = new Date(startDate);

  switch (interval) {
    case 'daily':
      nextDate.setDate(nextDate.getDate() + 1);
      break;
    case 'weekly':
      nextDate.setDate(nextDate.getDate() + 7);
      break;
    case 'biweekly':
      nextDate.setDate(nextDate.getDate() + 15);
      break;
    case 'monthly':
      nextDate.setMonth(nextDate.getMonth() + 1);
      break;
    case 'custom':
      nextDate.setDate(nextDate.getDate() + (customDays && customDays > 0 ? customDays : 7));
      break;
    default:
      nextDate.setDate(nextDate.getDate() + 7);
  }

  return nextDate.toISOString();
};

const normalizeReminder = (r: any): PurchaseReminder => {
  let items: PurchaseReminderItem[] = [];
  if (Array.isArray(r.items) && r.items.length > 0) {
    items = r.items;
  } else if (r.material_name || r.material_id) {
    items = [{
      material_id: r.material_id,
      material_name: r.material_name || r.title,
      quantity: r.quantity || 1,
      unit_id: r.unit_id,
      unit_name: r.unit_name || r.units_of_measure?.name || 'UND',
      estimated_price: r.estimated_price
    }];
  }

  return {
    ...r,
    items
  } as PurchaseReminder;
};

export const purchaseReminderService = {
  async getReminders(filter?: {
    status?: string;
    reminder_type?: string;
    priority?: string;
    is_recurring?: boolean;
  }): Promise<PurchaseReminder[]> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return [];

      let query = supabase
        .from('purchase_reminders')
        .select(`
          *,
          materials ( id, name, code, unit, unit_id ),
          suppliers ( id, name, rif ),
          purchase_orders ( id, sequence_number, status, created_at )
        `)
        .order('created_at', { ascending: false });

      if (filter?.status && filter.status !== 'all') {
        query = query.eq('status', filter.status);
      }
      if (filter?.reminder_type && filter.reminder_type !== 'all') {
        query = query.eq('reminder_type', filter.reminder_type);
      }
      if (filter?.priority && filter.priority !== 'all') {
        query = query.eq('priority', filter.priority);
      }
      if (typeof filter?.is_recurring === 'boolean') {
        query = query.eq('is_recurring', filter.is_recurring);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map(normalizeReminder);
    } catch (error: unknown) {
      const err = error as Error;
      console.error('[purchaseReminderService.getReminders] Error:', err);
      showError(err.message || 'Error al cargar recordatorios');
      return [];
    }
  },

  async getReminderById(id: string): Promise<PurchaseReminder | null> {
    try {
      const { data, error } = await supabase
        .from('purchase_reminders')
        .select(`
          *,
          materials ( id, name, code, unit, unit_id ),
          suppliers ( id, name, rif ),
          purchase_orders ( id, sequence_number, status, created_at )
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      return data ? normalizeReminder(data) : null;
    } catch (error: unknown) {
      const err = error as Error;
      console.error('[purchaseReminderService.getReminderById] Error:', err);
      return null;
    }
  },

  async createReminder(payload: CreatePurchaseReminderPayload): Promise<PurchaseReminder | null> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        showError('Debes iniciar sesión para crear recordatorios.');
        return null;
      }

      const firstItem = payload.items && payload.items.length > 0 ? payload.items[0] : null;
      const materialId = payload.material_id !== undefined ? payload.material_id : (firstItem?.material_id || null);
      const materialName = payload.material_name !== undefined ? payload.material_name : (firstItem?.material_name?.trim() || null);
      const quantity = payload.quantity !== undefined ? payload.quantity : (firstItem?.quantity ?? null);
      const unitId = payload.unit_id !== undefined ? payload.unit_id : (firstItem?.unit_id || null);
      const unitName = payload.unit_name !== undefined ? payload.unit_name : (firstItem?.unit_name?.trim() || null);
      const estimatedPrice = payload.estimated_price !== undefined ? payload.estimated_price : (firstItem?.estimated_price ?? null);

      const insertBody: Record<string, any> = {
        user_id: session.user.id,
        title: payload.title.trim(),
        description: payload.description?.trim() || null,
        reminder_type: payload.reminder_type,
        priority: payload.priority || 'media',
        due_date: payload.due_date || null,
        status: 'pending',
        material_id: materialId,
        material_name: materialName,
        supplier_id: payload.supplier_id || null,
        quantity: quantity,
        unit_id: unitId,
        unit_name: unitName,
        estimated_price: estimatedPrice,
        currency: payload.currency || 'USD',
        is_recurring: Boolean(payload.is_recurring),
        recurrence_interval: payload.is_recurring ? (payload.recurrence_interval || 'weekly') : null,
        recurrence_days: payload.is_recurring ? (payload.recurrence_days || null) : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      if (payload.items && payload.items.length > 0) {
        insertBody.items = payload.items;
      }

      let res = await supabase
        .from('purchase_reminders')
        .insert(insertBody)
        .select(`
          *,
          materials ( id, name, code, unit, unit_id ),
          suppliers ( id, name, rif ),
          purchase_orders ( id, sequence_number, status, created_at )
        `)
        .single();

      // Fallback if column `items` does not exist yet in DB schema
      if (res.error && (res.error as any).code === '42703' && insertBody.items !== undefined) {
        console.warn('[purchaseReminderService] Columna "items" no existe aún en la BD. Guardando sin items para compatibilidad.');
        delete insertBody.items;
        res = await supabase
          .from('purchase_reminders')
          .insert(insertBody)
          .select(`
            *,
            materials ( id, name, code, unit, unit_id ),
            suppliers ( id, name, rif ),
            purchase_orders ( id, sequence_number, status, created_at )
          `)
          .single();
      }

      if (res.error) throw res.error;
      showSuccess(payload.is_recurring ? 'Recordatorio recurrente programado' : 'Recordatorio guardado correctamente');
      return res.data ? normalizeReminder(res.data) : null;
    } catch (error: unknown) {
      const err = error as Error;
      console.error('[purchaseReminderService.createReminder] Error:', err);
      showError(err.message || 'Error al crear el recordatorio');
      return null;
    }
  },

  async updateReminder(id: string, updates: UpdatePurchaseReminderPayload): Promise<PurchaseReminder | null> {
    try {
      const updateBody: Record<string, any> = {
        ...updates,
        updated_at: new Date().toISOString()
      };

      if (updates.items && updates.items.length > 0) {
        const first = updates.items[0];
        if (updates.material_name === undefined && first.material_name) {
          updateBody.material_name = first.material_name;
        }
        if (updates.quantity === undefined && first.quantity) {
          updateBody.quantity = first.quantity;
        }
        if (updates.unit_name === undefined && first.unit_name) {
          updateBody.unit_name = first.unit_name;
        }
        if (updates.estimated_price === undefined && first.estimated_price !== undefined) {
          updateBody.estimated_price = first.estimated_price;
        }
      }

      let res = await supabase
        .from('purchase_reminders')
        .update(updateBody)
        .eq('id', id)
        .select(`
          *,
          materials ( id, name, code, unit, unit_id ),
          suppliers ( id, name, rif ),
          purchase_orders ( id, sequence_number, status, created_at )
        `)
        .single();

      // Fallback if column `items` does not exist yet
      if (res.error && (res.error as any).code === '42703' && updateBody.items !== undefined) {
        delete updateBody.items;
        res = await supabase
          .from('purchase_reminders')
          .update(updateBody)
          .eq('id', id)
          .select(`
            *,
            materials ( id, name, code, unit, unit_id ),
            suppliers ( id, name, rif ),
            purchase_orders ( id, sequence_number, status, created_at )
          `)
          .single();
      }

      if (res.error) throw res.error;
      showSuccess('Recordatorio actualizado');
      return res.data ? normalizeReminder(res.data) : null;
    } catch (error: unknown) {
      const err = error as Error;
      console.error('[purchaseReminderService.updateReminder] Error:', err);
      showError(err.message || 'Error al actualizar el recordatorio');
      return null;
    }
  },

  async toggleComplete(id: string, currentStatus: string, reminder?: PurchaseReminder): Promise<boolean> {
    try {
      // If reminder is recurring, advance the next due date and maintain as pending
      if (reminder?.is_recurring) {
        const nextDueDate = calculateNextDueDate(
          reminder.due_date,
          reminder.recurrence_interval,
          reminder.recurrence_days
        );

        const { error } = await supabase
          .from('purchase_reminders')
          .update({
            due_date: nextDueDate,
            last_completed_at: new Date().toISOString(),
            status: 'pending',
            updated_at: new Date().toISOString()
          })
          .eq('id', id);

        if (error) throw error;
        showSuccess('¡Ciclo recurrente completado! Próximo recordatorio reprogramado.');
        return true;
      }

      const isCompleted = currentStatus === 'completed';
      const newStatus = isCompleted ? 'pending' : 'completed';
      const completedAt = isCompleted ? null : new Date().toISOString();

      const { error } = await supabase
        .from('purchase_reminders')
        .update({
          status: newStatus,
          completed_at: completedAt,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;
      showSuccess(isCompleted ? 'Recordatorio marcado como pendiente' : 'Recordatorio completado');
      return true;
    } catch (error: unknown) {
      const err = error as Error;
      console.error('[purchaseReminderService.toggleComplete] Error:', err);
      showError(err.message || 'Error al actualizar estado del recordatorio');
      return false;
    }
  },

  async linkPurchaseOrder(reminderId: string, purchaseOrderId: string): Promise<boolean> {
    try {
      const existing = await this.getReminderById(reminderId);

      if (existing?.is_recurring) {
        const nextDueDate = calculateNextDueDate(
          existing.due_date,
          existing.recurrence_interval,
          existing.recurrence_days
        );

        const { error } = await supabase
          .from('purchase_reminders')
          .update({
            purchase_order_id: purchaseOrderId,
            last_completed_at: new Date().toISOString(),
            due_date: nextDueDate,
            status: 'pending',
            updated_at: new Date().toISOString()
          })
          .eq('id', reminderId);

        if (error) throw error;
        showSuccess('Orden de Compra generada y próximo ciclo reprogramado');
        return true;
      }

      const { error } = await supabase
        .from('purchase_reminders')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          purchase_order_id: purchaseOrderId,
          updated_at: new Date().toISOString()
        })
        .eq('id', reminderId);

      if (error) throw error;
      return true;
    } catch (error: unknown) {
      const err = error as Error;
      console.error('[purchaseReminderService.linkPurchaseOrder] Error:', err);
      return false;
    }
  },

  async deleteReminder(id: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('purchase_reminders')
        .delete()
        .eq('id', id);

      if (error) throw error;
      showSuccess('Recordatorio eliminado');
      return true;
    } catch (error: unknown) {
      const err = error as Error;
      console.error('[purchaseReminderService.deleteReminder] Error:', err);
      showError(err.message || 'Error al eliminar el recordatorio');
      return false;
    }
  }
};
