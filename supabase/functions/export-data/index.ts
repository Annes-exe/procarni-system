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
      console.warn('[export-data] Unauthorized: No Authorization header');
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
      console.warn('[export-data] Unauthorized: Invalid user session');
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    const { type, pin } = await req.json();
    console.log(`[export-data] Export request for type: ${type} by user: ${user.email}`);

    // --- PIN Validation ---
    const adminPin = Deno.env.get('ADMIN_PIN');
    if (!adminPin) {
      console.error('[export-data] ADMIN_PIN environment variable is not set.');
      return new Response(JSON.stringify({ error: 'PIN de administración no configurado en el servidor.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (pin !== adminPin) {
      console.warn(`[export-data] Invalid PIN provided for export by user: ${user.email}`);
      return new Response(JSON.stringify({ error: 'PIN de seguridad incorrecto.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let dataToExport: any[] = [];
    let headers: string[] = [];
    let fileName = '';

    switch (type) {
      case 'supplier':
        const { data: suppliers, error: supplierError } = await supabaseClient
          .from('suppliers')
          .select('*')
          .eq('user_id', user.id); // Only export user's own data

        if (supplierError) throw supplierError;
        dataToExport = suppliers.map(s => ({
          'Código': s.code || '',
          'RIF': s.rif,
          'Nombre': s.name,
          'Email': s.email || '',
          'Teléfono Principal': s.phone || '',
          'Teléfono Secundario': s.phone_2 || '',
          'Instagram': s.instagram || '',
          'Dirección': s.address || '',
          'Términos de Pago': s.payment_terms,
          'Términos de Pago Personalizados': s.custom_payment_terms || '',
          'Días de Crédito': s.credit_days,
          'Estado': s.status,
        }));
        headers = [
          'Código', 'RIF', 'Nombre', 'Email', 'Teléfono Principal', 'Teléfono Secundario',
          'Instagram', 'Dirección', 'Términos de Pago', 'Términos de Pago Personalizados',
          'Días de Crédito', 'Estado'
        ];
        fileName = 'respaldo_proveedores.xlsx';
        break;

      case 'material':
        const { data: materials, error: materialError } = await supabaseClient
          .from('materials')
          .select('*')
          .eq('user_id', user.id); // Only export user's own data

        if (materialError) throw materialError;
        dataToExport = materials.map(m => ({
          'Código': m.code || '',
          'Nombre': m.name,
          'Categoría': m.category || '',
          'Unidad': m.unit || '',
          'Exento de IVA': m.is_exempt ? 'Sí' : 'No',
        }));
        headers = ['Código', 'Nombre', 'Categoría', 'Unidad', 'Exento de IVA'];
        fileName = 'respaldo_materiales.xlsx';
        break;

      case 'supplier_material_relation':
        const { data: relations, error: relationError } = await supabaseClient
          .from('supplier_materials')
          .select(`
            specification,
            suppliers (code),
            materials (code)
          `)
          .eq('user_id', user.id); // Only export user's own data

        if (relationError) throw relationError;
        dataToExport = relations.map(r => ({
          'Código P': r.suppliers?.code || '',
          'Código MP': r.materials?.code || '',
          'ESPECIFICACION': r.specification || '',
        }));
        headers = ['Código P', 'Código MP', 'ESPECIFICACION'];
        fileName = 'respaldo_relaciones_proveedor_material.xlsx';
        break;

      default:
        return new Response(JSON.stringify({ error: 'Tipo de datos para exportar no válido.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    const ws = XLSX.utils.json_to_sheet(dataToExport, { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Datos Exportados");

    const excelBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

    console.log(`[export-data] Exported ${dataToExport.length} records for type: ${type} by user: ${user.email}`);

    return new Response(excelBuffer, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });

  } catch (error) {
    console.error('[export-data] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});