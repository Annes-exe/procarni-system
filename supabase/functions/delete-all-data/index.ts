import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

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
      console.warn('[delete-all-data] Unauthorized: No Authorization header');
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
      console.warn('[delete-all-data] Unauthorized: Invalid user session');
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    const { type, pin } = await req.json();
    console.log(`[delete-all-data] Delete request for type: ${type} by user: ${user.email}`);

    // --- PIN Validation ---
    const adminPin = Deno.env.get('ADMIN_PIN');
    if (!adminPin) {
      console.error('[delete-all-data] ADMIN_PIN environment variable is not set.');
      return new Response(JSON.stringify({ error: 'PIN de administración no configurado en el servidor.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (pin !== adminPin) {
      console.warn(`[delete-all-data] Invalid PIN provided for delete by user: ${user.email}`);
      return new Response(JSON.stringify({ error: 'PIN de seguridad incorrecto.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let message = '';
    let errorCount = 0;

    switch (type) {
      case 'supplier_material_relation':
        const { error: smError } = await supabaseClient
          .from('supplier_materials')
          .delete()
          .eq('user_id', user.id);
        if (smError) {
          console.error('[delete-all-data] Error deleting supplier_materials:', smError);
          errorCount++;
        }
        message += `Relaciones proveedor-material eliminadas. `;
        break;
      case 'material':
        const { error: materialError } = await supabaseClient
          .from('materials')
          .delete()
          .eq('user_id', user.id);
        if (materialError) {
          console.error('[delete-all-data] Error deleting materials:', materialError);
          errorCount++;
        }
        message += `Materiales eliminados. `;
        break;
      case 'supplier':
        const { error: supplierError } = await supabaseClient
          .from('suppliers')
          .delete()
          .eq('user_id', user.id);
        if (supplierError) {
          console.error('[delete-all-data] Error deleting suppliers:', supplierError);
          errorCount++;
        }
        message += `Proveedores eliminados. `;
        break;
      default:
        return new Response(JSON.stringify({ error: 'Tipo de datos para eliminar no válido.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    if (errorCount > 0) {
      return new Response(JSON.stringify({ error: `Se encontraron errores durante la eliminación de ${type}.` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[delete-all-data] Successfully deleted all ${type} for user: ${user.email}`);
    return new Response(JSON.stringify({ message: `Todos los ${type} de tu cuenta han sido eliminados exitosamente. ${message}` }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[delete-all-data] General error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Error desconocido en la función Edge.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});