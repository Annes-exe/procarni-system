// src/integrations/supabase/services/exchangeRateService.ts

import { supabase } from '../client';
import { ExchangeRate } from '../types';

export interface ExchangeRatePayload {
  rate_date: string;
  currency: 'USD' | 'EUR';
  rate: number;
  source?: string;
  effective_date?: string | null;
}

export const exchangeRateService = {
  /**
   * Obtiene la tasa de una fecha exacta para una moneda dada.
   */
  async getRateByDate(dateStr: string, currency: 'USD' | 'EUR'): Promise<ExchangeRate | null> {
    try {
      const { data, error } = await supabase
        .from('exchange_rates')
        .select('*')
        .eq('currency', currency)
        .eq('rate_date', dateStr)
        .maybeSingle();

      if (error) {
        console.warn(`[exchangeRateService.getRateByDate] Warning: ${error.message}`);
        return null;
      }
      return data as ExchangeRate | null;
    } catch (e) {
      console.error('[exchangeRateService.getRateByDate] Error:', e);
      return null;
    }
  },

  /**
   * Obtiene la tasa oficial más cercana anterior o igual a la fecha objetivo.
   */
  async getEffectiveRateForDate(dateStr: string, currency: 'USD' | 'EUR'): Promise<ExchangeRate | null> {
    try {
      const { data, error } = await supabase
        .from('exchange_rates')
        .select('*')
        .eq('currency', currency)
        .lte('rate_date', dateStr)
        .order('rate_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.warn(`[exchangeRateService.getEffectiveRateForDate] Warning: ${error.message}`);
        return null;
      }
      return data as ExchangeRate | null;
    } catch (e) {
      console.error('[exchangeRateService.getEffectiveRateForDate] Error:', e);
      return null;
    }
  },

  /**
   * Obtiene la tasa más reciente registrada en base de datos.
   */
  async getLatestRate(currency: 'USD' | 'EUR'): Promise<ExchangeRate | null> {
    try {
      const { data, error } = await supabase
        .from('exchange_rates')
        .select('*')
        .eq('currency', currency)
        .order('rate_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.warn(`[exchangeRateService.getLatestRate] Warning: ${error.message}`);
        return null;
      }
      return data as ExchangeRate | null;
    } catch (e) {
      console.error('[exchangeRateService.getLatestRate] Error:', e);
      return null;
    }
  },

  /**
   * Obtiene el histórico de tasas más recientes.
   */
  async getHistory(currency: 'USD' | 'EUR', limit = 30): Promise<ExchangeRate[]> {
    try {
      const { data, error } = await supabase
        .from('exchange_rates')
        .select('*')
        .eq('currency', currency)
        .order('rate_date', { ascending: false })
        .limit(limit);

      if (error) {
        console.warn(`[exchangeRateService.getHistory] Warning: ${error.message}`);
        return [];
      }
      return (data as ExchangeRate[]) || [];
    } catch (e) {
      console.error('[exchangeRateService.getHistory] Error:', e);
      return [];
    }
  },

  /**
   * Inserta o actualiza una tasa de cambio oficial.
   */
  async upsertRate(payload: ExchangeRatePayload): Promise<ExchangeRate | null> {
    try {
      const { data, error } = await supabase
        .from('exchange_rates')
        .upsert(
          {
            rate_date: payload.rate_date,
            currency: payload.currency,
            rate: payload.rate,
            source: payload.source || 'BCV',
            effective_date: payload.effective_date || payload.rate_date,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'currency,rate_date' }
        )
        .select()
        .single();

      if (error) {
        console.error('[exchangeRateService.upsertRate] Error:', error);
        return null;
      }
      return data as ExchangeRate;
    } catch (e) {
      console.error('[exchangeRateService.upsertRate] Exception:', e);
      return null;
    }
  },

  /**
   * Inserta o actualiza un lote de tasas históricas.
   */
  async batchUpsertRates(rates: ExchangeRatePayload[]): Promise<boolean> {
    if (!rates.length) return true;
    try {
      const records = rates.map(r => ({
        rate_date: r.rate_date,
        currency: r.currency,
        rate: r.rate,
        source: r.source || 'BCV',
        effective_date: r.effective_date || r.rate_date,
        updated_at: new Date().toISOString()
      }));

      const { error } = await supabase
        .from('exchange_rates')
        .upsert(records, { onConflict: 'currency,rate_date' });

      if (error) {
        console.error('[exchangeRateService.batchUpsertRates] Error:', error);
        return false;
      }
      return true;
    } catch (e) {
      console.error('[exchangeRateService.batchUpsertRates] Exception:', e);
      return false;
    }
  }
};
