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
      console.warn('[reset-data-and-sequences] Unauthorized: No Authorization header');
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
      console.warn('[reset-data-and-sequences] Unauthorized: Invalid user session');
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    const { pin } = await req.json();
    console.log(`[reset-data-and-sequences] Reset request by user: ${user.email}`);

    // --- PIN Validation ---
    const adminPin = Deno.env.get('ADMIN_PIN');
    if (!adminPin) {
      console.error('[reset-data-and-sequences] ADMIN_PIN environment variable is not set.');
      return new Response(JSON.stringify({ error: 'PIN de administración no configurado en el servidor.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (pin !== adminPin) {
      console.warn(`[reset-data-and-sequences] Invalid PIN provided by user: ${user.email}`);
      return new Response(JSON.stringify({ error: 'PIN de seguridad incorrecto.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- Delete all data for this user ---
    // 1. Delete supplier_materials relations
    const { error: smError } = await supabaseClient
      .from('supplier_materials')
      .delete()
      .eq('user_id', user.id);

    if (smError) {
      console.error('[reset-data-and-sequences] Error deleting supplier_materials:', smError);
      return new Response(JSON.stringify({ error: `Error al eliminar relaciones proveedor-material: ${smError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Delete materials
    const { error: materialError } = await supabaseClient
      .from('materials')
      .delete()
      .eq('user_id', user.id);

    if (materialError) {
      console.error('[reset-data-and-sequences] Error deleting materials:', materialError);
      return new Response(JSON.stringify({ error: `Error al eliminar materiales: ${materialError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Delete suppliers
    const { error: supplierError } = await supabaseClient
      .from('suppliers')
      .delete()
      .eq('user_id', user.id);

    if (supplierError) {
      console.error('[reset-data-and-sequences] Error deleting suppliers:', supplierError);
      return new Response(JSON.stringify({ error: `Error al eliminar proveedores: ${supplierError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- Reset sequences ---
    // Use the service role client to reset sequences
    const serviceRoleClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Reset supplier_code_sequence
    const { error: supplierSeqError } = await serviceRoleClient
      .rpc('reset_supplier_code_sequence');

    if (supplierSeqError) {
      console.error('[reset-data-and-sequences] Error resetting supplier sequence:', supplierSeqError);
      return new Response(JSON.stringify({ error: `Error al reiniciar secuencia de proveedores: ${supplierSeqError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Reset material_code_sequence
    const { error: materialSeqError } = await serviceRoleClient
      .rpc('reset_material_code_sequence');

    if (materialSeqError) {
      console.error('[reset-data-and-sequences] Error resetting material sequence:', materialSeqError);
      return new Response(JSON.stringify({ error: `Error al reiniciar secuencia de materiales: ${materialSeqError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[reset-data-and-sequences] Successfully reset all data and sequences for user: ${user.email}`);
    return new Response(JSON.stringify({
      message: 'Todos los datos y secuencias han sido reiniciados exitosamente. Los nuevos proveedores y materiales comenzarán con códigos P001 y MT001 respectivamente.'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[reset-data-and-sequences] General error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Error desconocido en la función Edge.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});