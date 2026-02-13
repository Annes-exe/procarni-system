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
      console.warn('[generate-template] Unauthorized: No Authorization header');
      return new Response(JSON.stringify({ error: 'Unauthorized: No Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      console.error('[generate-template] Auth Error:', authError);
      return new Response(JSON.stringify({ error: `Unauthorized: ${authError?.message || 'User not found'}` }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { type } = await req.json();

    let headers: string[] = [];
    let fileName = '';

    switch (type) {
      case 'supplier':
        headers = [
          'Código', 'RIF', 'Nombre', 'Email', 'Teléfono Principal', 'Teléfono Secundario',
          'Instagram', 'Dirección', 'Términos de Pago', 'Términos de Pago Personalizados',
          'Días de Crédito', 'Estado'
        ];
        fileName = 'plantilla_proveedores.xlsx';
        break;
      case 'material':
        headers = ['Código', 'Nombre', 'Categoría', 'Unidad', 'Exento de IVA']; // Added 'Exento de IVA'
        fileName = 'plantilla_materiales.xlsx';
        break;
      case 'supplier_material_relation':
        // Updated headers to match bulk-upload function's expectations
        headers = ['Código P', 'Código MP', 'ESPECIFICACION'];
        fileName = 'plantilla_relaciones_proveedor_material.xlsx';
        break;
      default:
        return new Response(JSON.stringify({ error: 'Tipo de plantilla no válido.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    const ws = XLSX.utils.aoa_to_sheet([headers]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");

    const excelBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

    console.log(`[generate-template] Generated template for type: ${type} by user: ${user.email}`);

    return new Response(excelBuffer, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });

  } catch (error) {
    console.error('[generate-template] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});