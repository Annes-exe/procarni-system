// src/integrations/supabase/services/auditLogService.ts

import { supabase } from '../client';
import { showError } from '@/utils/toast';

export interface AuditLogEntry {
  id: string;
  action: string;
  user_email?: string;
  user_name?: string;
  user_id?: string;
  timestamp: string;
  // New structured fields derived from 'details'
  table?: string;
  record_id?: string;
  description?: string;
  // Keep original details for raw data if needed, but primarily use structured fields
  raw_details?: any; 
}

interface LogPayload {
  table?: string;
  record_id?: string;
  description?: string;
  user_name?: string;
  user_id?: string;
  [key: string]: any; // Allow other custom details
}

const AuditLogService = {
  getAll: async (startDate?: string, endDate?: string): Promise<AuditLogEntry[]> => {
    let query = supabase
      .from('audit_logs')
      .select('*');

    if (startDate) {
      query = query.gte('timestamp', startDate);
    }
    if (endDate) {
      query = query.lte('timestamp', endDate);
    }

    const { data, error } = await query.order('timestamp', { ascending: false });

    if (error) {
      console.error('[AuditLogService.getAll] Error:', error);
      showError('Error al cargar el historial de auditoría.');
      return [];
    }
    
    // Map raw data to structured AuditLogEntry
    return (data || []).map(log => ({
      id: log.id,
      action: log.action,
      user_email: log.user_email,
      user_name: log.details?.user_name || (log as any).user_name || undefined,
      user_id: log.details?.user_id || (log as any).user_id || undefined,
      timestamp: log.timestamp,
      table: log.details?.table,
      record_id: log.details?.record_id,
      description: log.details?.description,
      raw_details: log.details,
    })) as AuditLogEntry[];
  },

  log: async (action: string, payload: LogPayload = {}): Promise<void> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const user_email = user?.email;
      let user_name = payload.user_name || user?.user_metadata?.full_name || user?.user_metadata?.name || undefined;

      if (!user_name && user?.id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('first_name, last_name, username')
          .eq('id', user.id)
          .maybeSingle();

        if (profile) {
          user_name = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim() || profile.username || undefined;
        }
      }

      const finalPayload: LogPayload = {
        ...payload,
        user_id: user?.id || payload.user_id,
        user_name: user_name || payload.user_name || user_email?.split('@')[0] || 'Sistema'
      };

      // Ensure the payload is stored in the 'details' column
      const { error } = await supabase
        .from('audit_logs')
        .insert({
          action,
          user_email,
          details: finalPayload,
        });

      if (error) {
        console.error('[AuditLogService.log] Error logging audit event:', error);
      }
    } catch (err) {
      console.error('[AuditLogService.log] Exception logging audit event:', err);
    }
  }
};

export const {
  getAll: getAllAuditLogs,
  log: logAudit,
} = AuditLogService;