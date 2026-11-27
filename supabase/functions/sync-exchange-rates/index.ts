import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExternalRateResponse {
  moneda: string;
  nombre: string;
  valor: number;
  promedio: number;
  fechaActualizacion: string;
}

interface ExternalHistoryItem {
  fecha: string;
  valor: number;
  promedio: number;
}

const BASE_URL = 'https://ve.dolarapi.com/v1';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error('Supabase environment variables (URL / SERVICE_ROLE_KEY) are missing');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // 1. Obtener tasas oficiales actuales y recientes (Dólar y Euro)
    const [usdRes, eurRes, usdHistRes, eurHistRes] = await Promise.allSettled([
      fetch(`${BASE_URL}/dolares/oficial`).then(r => r.ok ? r.json() : null),
      fetch(`${BASE_URL}/euros/oficial`).then(r => r.ok ? r.json() : null),
      fetch(`${BASE_URL}/historicos/dolares/oficial`).then(r => r.ok ? r.json() : null),
      fetch(`${BASE_URL}/historicos/euros/oficial`).then(r => r.ok ? r.json() : null),
    ]);

    const recordsToUpsert: Array<{
      rate_date: string;
      currency: 'USD' | 'EUR';
      rate: number;
      source: string;
      effective_date: string | null;
      updated_at: string;
    }> = [];

    const nowIso = new Date().toISOString();

    // Procesar USD actual
    if (usdRes.status === 'fulfilled' && usdRes.value) {
      const data = usdRes.value as ExternalRateResponse;
      const rateVal = data.promedio || data.valor;
      const rateDate = data.fechaActualizacion ? data.fechaActualizacion.substring(0, 10) : nowIso.substring(0, 10);
      if (rateVal && rateVal > 0) {
        recordsToUpsert.push({
          rate_date: rateDate,
          currency: 'USD',
          rate: rateVal,
          source: 'BCV',
          effective_date: data.fechaActualizacion || rateDate,
          updated_at: nowIso,
        });
      }
    }

    // Procesar EUR actual
    if (eurRes.status === 'fulfilled' && eurRes.value) {
      const data = eurRes.value as ExternalRateResponse;
      const rateVal = data.promedio || data.valor;
      const rateDate = data.fechaActualizacion ? data.fechaActualizacion.substring(0, 10) : nowIso.substring(0, 10);
      if (rateVal && rateVal > 0) {
        recordsToUpsert.push({
          rate_date: rateDate,
          currency: 'EUR',
          rate: rateVal,
          source: 'BCV',
          effective_date: data.fechaActualizacion || rateDate,
          updated_at: nowIso,
        });
      }
    }

    // Procesar Histórico USD (últimos 30 días)
    if (usdHistRes.status === 'fulfilled' && Array.isArray(usdHistRes.value)) {
      const history = usdHistRes.value as ExternalHistoryItem[];
      for (const item of history.slice(-30)) {
        const rateVal = item.promedio || item.valor;
        const rateDate = item.fecha ? item.fecha.substring(0, 10) : null;
        if (rateDate && rateVal && rateVal > 0) {
          recordsToUpsert.push({
            rate_date: rateDate,
            currency: 'USD',
            rate: rateVal,
            source: 'BCV',
            effective_date: item.fecha,
            updated_at: nowIso,
          });
        }
      }
    }

    // Procesar Histórico EUR (últimos 30 días)
    if (eurHistRes.status === 'fulfilled' && Array.isArray(eurHistRes.value)) {
      const history = eurHistRes.value as ExternalHistoryItem[];
      for (const item of history.slice(-30)) {
        const rateVal = item.promedio || item.valor;
        const rateDate = item.fecha ? item.fecha.substring(0, 10) : null;
        if (rateDate && rateVal && rateVal > 0) {
          recordsToUpsert.push({
            rate_date: rateDate,
            currency: 'EUR',
            rate: rateVal,
            source: 'BCV',
            effective_date: item.fecha,
            updated_at: nowIso,
          });
        }
      }
    }

    if (recordsToUpsert.length === 0) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'No se pudieron obtener tasas de la API externa' 
      }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Desduplicar registros por currency + rate_date (el último gana)
    const recordMap = new Map<string, typeof recordsToUpsert[0]>();
    for (const rec of recordsToUpsert) {
      recordMap.set(`${rec.currency}_${rec.rate_date}`, rec);
    }
    const deduplicatedRecords = Array.from(recordMap.values());

    // 2. Guardar en public.exchange_rates con service_role (bypasea RLS limpiamente)
    const { error: upsertError } = await supabase
      .from('exchange_rates')
      .upsert(deduplicatedRecords, { onConflict: 'currency,rate_date' });

    if (upsertError) {
      console.error('[sync-exchange-rates] Database upsert error:', upsertError);
      throw upsertError;
    }

    console.log(`[sync-exchange-rates] Sincronizadas exitosamente ${deduplicatedRecords.length} tasas de cambio.`);

    return new Response(JSON.stringify({
      success: true,
      message: `Tasas sincronizadas exitosamente (${deduplicatedRecords.length} registros)`,
      count: deduplicatedRecords.length,
      synced_at: nowIso
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : 'Error inesperado';
    console.error('[sync-exchange-rates] Unhandled error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: errMessage
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
