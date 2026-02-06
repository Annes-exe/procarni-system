// src/integrations/supabase/services/auditLogService.ts

import { supabase } from '../client';
import { showError } from '@/utils/toast';

export interface AuditLogEntry {
  id: string;
  action: string;
  user_email?: string;
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
  [key: string]: any; // Allow other custom details
}

const AuditLogService = {
  getAll: async (): Promise<AuditLogEntry[]> => {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('timestamp', { ascending: false });

    if (error) {
      console.error('[AuditLogService.getAll] Error:', error);
      showError('Error al cargar el historial de auditoría.');
      return [];
    }
    
    // Map raw data to structured AuditLogEntry
    return data.map(log => ({
      id: log.id,
      action: log.action,
      user_email: log.user_email,
      timestamp: log.timestamp,
      table: log.details?.table,
      record_id: log.details?.record_id,
      description: log.details?.description,
      raw_details: log.details,
    })) as AuditLogEntry[];
  },

  log: async (action: string, payload: LogPayload = {}): Promise<void> => {
    const { data: { user } } = await supabase.auth.getUser();
    const user_email = user?.email;

    // Ensure the payload is stored in the 'details' column
    const { error } = await supabase
      .from('audit_logs')
      .insert({
        action,
        user_email,
        details: payload,
      });

    if (error) {
      console.error('[AuditLogService.log] Error logging audit event:', error);
    }
  }
};

export const {
  getAll: getAllAuditLogs,
  log: logAudit,
} = AuditLogService;