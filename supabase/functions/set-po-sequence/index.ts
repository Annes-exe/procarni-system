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
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    const { startNumber, pin } = await req.json();
    console.log(`[set-po-sequence] Setting sequence start number to: ${startNumber} by user: ${user.email}`);

    // --- PIN Validation ---
    const adminPin = Deno.env.get('ADMIN_PIN');
    if (!adminPin) {
      console.error('[set-po-sequence] ADMIN_PIN environment variable is not set.');
      return new Response(JSON.stringify({ error: 'PIN de administración no configurado en el servidor.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (pin !== adminPin) {
      console.warn(`[set-po-sequence] Invalid PIN provided by user: ${user.email}`);
      return new Response(JSON.stringify({ error: 'PIN de seguridad incorrecto.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use the service role client to update the sequence
    const serviceRoleClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Call the set_purchase_order_sequence_start function
    // If startNumber is 0, it will reset to the last existing order number + 1
    const { error } = await serviceRoleClient.rpc('set_purchase_order_sequence_start', { start_number: startNumber });

    if (error) {
      console.error('[set-po-sequence] Error updating sequence:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let message = '';
    if (startNumber === 0) {
      // Get the last sequence number to show in the message
      const { data: lastSeqData, error: lastSeqError } = await serviceRoleClient.rpc('get_last_purchase_order_sequence');
      if (lastSeqError) {
        console.error('[set-po-sequence] Error getting last sequence:', lastSeqError);
        message = 'Secuencia reiniciada exitosamente.';
      } else {
        message = `Secuencia reiniciada exitosamente. El próximo número de orden será ${lastSeqData + 1}.`;
      }
    } else {
      message = `Secuencia actualizada exitosamente. El próximo número de orden será ${startNumber}.`;
    }

    console.log(`[set-po-sequence] Sequence updated successfully by user: ${user.email}`);
    return new Response(JSON.stringify({ message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[set-po-sequence] General error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Error desconocido en la función Edge.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});