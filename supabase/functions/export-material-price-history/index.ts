import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import * as XLSX from 'https://esm.sh/xlsx@0.18.5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to convert price to the base currency
const convertPriceToBase = (entry: any, base: 'USD' | 'VES'): number | null => {
    const price = entry.unit_price;
    const currency = entry.currency;
    const rate = entry.exchange_rate;

    if (currency === base) {
        return price;
    }

    if (base === 'USD' && currency === 'VES') {
        if (rate && rate > 0) {
            return price / rate;
        }
        return null;
    }

    if (base === 'VES' && currency === 'USD') {
        if (rate && rate > 0) {
            return price * rate;
        }
        return null;
    }

    return null;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.warn('[export-material-price-history] Unauthorized: No Authorization header');
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      console.warn('[export-material-price-history] Unauthorized: Invalid user session');
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    const { materialId, materialName, baseCurrency } = await req.json();
    console.log(`[export-material-price-history] Export request for material ID: ${materialId}, Base Currency: ${baseCurrency} by user: ${user.email}`);

    if (!materialId || !baseCurrency) {
        return new Response(JSON.stringify({ error: 'Material ID y Moneda Base son requeridos.' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    // Fetch price history data
    const { data: history, error: historyError } = await supabaseClient
      .from('price_history')
      .select(`
        *,
        suppliers (name, rif, code)
      `)
      .eq('material_id', materialId)
      .order('recorded_at', { ascending: false });

    if (historyError) {
      console.error('[export-material-price-history] Error fetching history:', historyError);
      throw historyError;
    }

    const dataToExport = history.map(entry => {
        const convertedPrice = convertPriceToBase(entry, baseCurrency);
        
        return {
            'ID Transacción': entry.id.substring(0, 8),
            'Proveedor': entry.suppliers?.name || 'N/A',
            'Cód. Proveedor': entry.suppliers?.code || 'N/A',
            'Precio Unitario Original': entry.unit_price,
            'Moneda Original': entry.currency,
            'Tasa de Cambio (USD/VES)': entry.exchange_rate || 'N/A',
            [`Precio Convertido (${baseCurrency})`]: convertedPrice !== null ? convertedPrice.toFixed(4) : 'N/A',
            'Fecha Registro': new Date(entry.recorded_at).toLocaleString('es-VE'),
            'ID Orden de Compra': entry.purchase_order_id ? entry.purchase_order_id.substring(0, 8) : 'N/A',
        };
    });

    const headers = [
        'ID Transacción', 'Proveedor', 'Cód. Proveedor', 'Precio Unitario Original', 
        'Moneda Original', 'Tasa de Cambio (USD/VES)', `Precio Convertido (${baseCurrency})`, 
        'Fecha Registro', 'ID Orden de Compra'
    ];
    
    const safeMaterialName = (materialName || 'Material').replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
    const fileName = `Historial_Precios_${safeMaterialName}_${baseCurrency}.xlsx`;

    const ws = XLSX.utils.json_to_sheet(dataToExport, { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Historial de Precios");

    const excelBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

    console.log(`[export-material-price-history] Exported ${dataToExport.length} records.`);

    return new Response(excelBuffer, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });

  } catch (error) {
    console.error('[export-material-price-history] Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Error desconocido en la función Edge.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});