import { supabase } from '../client';
import { PurchaseReminder } from '../types';
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
      return (data as unknown as PurchaseReminder[]) || [];
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
      return data as unknown as PurchaseReminder;
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

      const { data, error } = await supabase
        .from('purchase_reminders')
        .insert({
          user_id: session.user.id,
          title: payload.title.trim(),
          description: payload.description?.trim() || null,
          reminder_type: payload.reminder_type,
          priority: payload.priority || 'media',
          due_date: payload.due_date || null,
          status: 'pending',
          material_id: payload.material_id || null,
          material_name: payload.material_name?.trim() || null,
          supplier_id: payload.supplier_id || null,
          quantity: payload.quantity || null,
          unit_id: payload.unit_id || null,
          unit_name: payload.unit_name?.trim() || null,
          estimated_price: payload.estimated_price || null,
          currency: payload.currency || 'USD',
          is_recurring: Boolean(payload.is_recurring),
          recurrence_interval: payload.is_recurring ? (payload.recurrence_interval || 'weekly') : null,
          recurrence_days: payload.is_recurring ? (payload.recurrence_days || null) : null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select(`
          *,
          materials ( id, name, code, unit, unit_id ),
          suppliers ( id, name, rif ),
          purchase_orders ( id, sequence_number, status, created_at )
        `)
        .single();

      if (error) throw error;
      showSuccess(payload.is_recurring ? 'Recordatorio recurrente programado' : 'Recordatorio guardado correctamente');
      return data as unknown as PurchaseReminder;
    } catch (error: unknown) {
      const err = error as Error;
      console.error('[purchaseReminderService.createReminder] Error:', err);
      showError(err.message || 'Error al crear el recordatorio');
      return null;
    }
  },

  async updateReminder(id: string, updates: UpdatePurchaseReminderPayload): Promise<PurchaseReminder | null> {
    try {
      const { data, error } = await supabase
        .from('purchase_reminders')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select(`
          *,
          materials ( id, name, code, unit, unit_id ),
          suppliers ( id, name, rif ),
          purchase_orders ( id, sequence_number, status, created_at )
        `)
        .single();

      if (error) throw error;
      showSuccess('Recordatorio actualizado');
      return data as unknown as PurchaseReminder;
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
