import { DotacionSnapshot, DotacionCalculationResult, GeneratedPurchaseOrderLink } from '@/types/dotacion';
import { supabase } from '@/integrations/supabase/client';

const STORAGE_KEY = 'procarni_dotacion_snapshots_v1';

export const dotacionSnapshotService = {
  getAll: async (): Promise<DotacionSnapshot[]> => {
    // 1. Try fetching from Supabase if table exists
    try {
      const { data, error } = await supabase
        .from('dotacion_snapshots')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        return data.map((row) => ({
          id: row.id,
          name: row.name,
          month: row.month,
          year: row.year,
          quincena: row.quincena,
          employeesPC: row.employees_pc,
          employeesMA: row.employees_ma,
          totalEmployees: row.total_employees,
          stock: row.stock_data,
          comedor: row.comedor_data,
          finca: row.finca_data,
          presentations: row.presentations_data,
          enableGlobalOptimization: row.enable_global_optimization,
          result: row.result_data,
          createdAt: row.created_at,
          createdBy: row.created_by,
          generatedPurchaseOrders: row.generated_purchase_orders || [],
        }));
      }
    } catch {
      // Supabase table may not exist yet, fallback gracefully to localStorage
    }

    // 2. Fallback to localStorage
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored) as DotacionSnapshot[];
      }
    } catch (e) {
      console.error('[dotacionSnapshotService.getAll] LocalStorage error:', e);
    }
    return [];
  },

  save: async (snapshot: Omit<DotacionSnapshot, 'id' | 'createdAt'>): Promise<DotacionSnapshot> => {
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const fullSnapshot: DotacionSnapshot = {
      ...snapshot,
      id,
      createdAt,
      generatedPurchaseOrders: snapshot.generatedPurchaseOrders || [],
    };

    // 1. Save to LocalStorage immediately
    try {
      const current = await dotacionSnapshotService.getAll();
      const updated = [fullSnapshot, ...current.filter((s) => s.id !== id)];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('[dotacionSnapshotService.save] LocalStorage save error:', e);
    }

    // 2. Also try inserting into Supabase
    try {
      await supabase.from('dotacion_snapshots').insert({
        id: fullSnapshot.id,
        name: fullSnapshot.name,
        month: fullSnapshot.month,
        year: fullSnapshot.year,
        quincena: fullSnapshot.quincena,
        employees_pc: fullSnapshot.employeesPC,
        employees_ma: fullSnapshot.employeesMA,
        total_employees: fullSnapshot.totalEmployees,
        stock_data: fullSnapshot.stock,
        comedor_data: fullSnapshot.comedor,
        finca_data: fullSnapshot.finca,
        presentations_data: fullSnapshot.presentations,
        enable_global_optimization: fullSnapshot.enableGlobalOptimization,
        result_data: fullSnapshot.result,
        created_at: fullSnapshot.createdAt,
        created_by: fullSnapshot.createdBy,
        generated_purchase_orders: fullSnapshot.generatedPurchaseOrders,
      });
    } catch {
      // Non-fatal if table doesn't exist
    }

    return fullSnapshot;
  },

  linkPurchaseOrder: async (snapshotId: string, orderLink: GeneratedPurchaseOrderLink): Promise<void> => {
    try {
      const current = await dotacionSnapshotService.getAll();
      const target = current.find((s) => s.id === snapshotId);
      if (target) {
        target.generatedPurchaseOrders = [...(target.generatedPurchaseOrders || []), orderLink];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(current));

        try {
          await supabase
            .from('dotacion_snapshots')
            .update({ generated_purchase_orders: target.generatedPurchaseOrders })
            .eq('id', snapshotId);
        } catch {
          // Non-fatal
        }
      }
    } catch (e) {
      console.error('[dotacionSnapshotService.linkPurchaseOrder] Error:', e);
    }
  },

  delete: async (id: string): Promise<void> => {
    try {
      const current = await dotacionSnapshotService.getAll();
      const updated = current.filter((s) => s.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

      try {
        await supabase.from('dotacion_snapshots').delete().eq('id', id);
      } catch {
        // Non-fatal
      }
    } catch (e) {
      console.error('[dotacionSnapshotService.delete] Error:', e);
    }
  },
};
