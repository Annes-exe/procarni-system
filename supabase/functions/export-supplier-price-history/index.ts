import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import * as XLSX from 'https://esm.sh/xlsx@0.18.5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.warn('[export-supplier-price-history] Unauthorized: No Authorization header');
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
      console.warn('[export-supplier-price-history] Unauthorized: Invalid user session');
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    const { supplierId, supplierName } = await req.json();
    console.log(`[export-supplier-price-history] Export request for supplier ID: ${supplierId} by user: ${user.email}`);

    if (!supplierId) {
        return new Response(JSON.stringify({ error: 'Supplier ID es requerido.' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    // Fetch price history data for the supplier, joining material details
    const { data: history, error: historyError } = await supabaseClient
      .from('price_history')
      .select(`
        *,
        materials (name, code, unit)
      `)
      .eq('supplier_id', supplierId)
      .order('recorded_at', { ascending: false });

    if (historyError) {
      console.error('[export-supplier-price-history] Error fetching history:', historyError);
      throw historyError;
    }

    const dataToExport = history.map(entry => {
        return {
            'ID Transacción': entry.id.substring(0, 8),
            'Material': entry.materials?.name || 'N/A',
            'Cód. Material': entry.materials?.code || 'N/A',
            'Unidad': entry.materials?.unit || 'N/A',
            'Precio Unitario': entry.unit_price,
            'Moneda': entry.currency,
            'Tasa de Cambio (USD/VES)': entry.exchange_rate || 'N/A',
            'Fecha Registro': new Date(entry.recorded_at).toLocaleString('es-VE'),
            'ID Orden de Compra': entry.purchase_order_id ? entry.purchase_order_id.substring(0, 8) : 'N/A',
        };
    });

    const headers = [
        'ID Transacción', 'Material', 'Cód. Material', 'Unidad', 'Precio Unitario', 
        'Moneda', 'Tasa de Cambio (USD/VES)', 'Fecha Registro', 'ID Orden de Compra'
    ];
    
    const safeSupplierName = (supplierName || 'Proveedor').replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
    const fileName = `Historial_Precios_Proveedor_${safeSupplierName}.xlsx`;

    const ws = XLSX.utils.json_to_sheet(dataToExport, { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Historial de Precios");

    const excelBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

    console.log(`[export-supplier-price-history] Exported ${dataToExport.length} records.`);

    return new Response(excelBuffer, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });

  } catch (error) {
    console.error('[export-supplier-price-history] Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Error desconocido en la función Edge.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});