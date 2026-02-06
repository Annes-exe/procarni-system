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
      console.warn('[delete-ficha-tecnica] Unauthorized: No Authorization header');
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
      console.warn('[delete-ficha-tecnica] Unauthorized: Invalid user session');
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    const { fichaId, storageUrl } = await req.json();
    console.log(`[delete-ficha-tecnica] Delete request for Ficha ID: ${fichaId} by user: ${user.email}`);

    if (!fichaId || !storageUrl) {
      return new Response(JSON.stringify({ error: 'Faltan campos requeridos (fichaId, storageUrl).' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use Service Role Client for privileged operations (Storage deletion)
    const serviceRoleClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // 1. Extract file path from storage URL
    const pathSegments = storageUrl.split('/');
    const bucketIndex = pathSegments.indexOf('fichas');
    
    if (bucketIndex === -1 || bucketIndex + 1 >= pathSegments.length) {
      console.error('[delete-ficha-tecnica] Invalid storage URL format:', storageUrl);
      throw new Error('URL de almacenamiento inválida.');
    }
    
    const filePath = pathSegments.slice(bucketIndex + 1).join('/');
    
    // 2. Delete file from Storage (using Service Role Key)
    const { error: storageError } = await serviceRoleClient.storage
      .from('fichas')
      .remove([filePath]);

    if (storageError) {
      console.error('[delete-ficha-tecnica] Storage Delete Error:', storageError);
      // Note: We proceed to delete the DB entry even if storage fails, to clean up metadata.
      // But we log the error.
    }

    // 3. Delete metadata from DB (using RLS-enabled client, ensuring user ownership)
    const { error: dbError } = await supabaseClient
      .from('fichas_tecnicas')
      .delete()
      .eq('id', fichaId)
      .eq('user_id', user.id); // Ensure the user owns the record

    if (dbError) {
      console.error('[delete-ficha-tecnica] DB Delete Error:', dbError);
      throw new Error(`Error al eliminar el registro de la base de datos: ${dbError.message}`);
    }

    console.log(`[delete-ficha-tecnica] Ficha ID ${fichaId} and file deleted successfully.`);

    return new Response(JSON.stringify({ message: 'Ficha técnica eliminada exitosamente.' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error during deletion.';
    console.error('[delete-ficha-tecnica] General Error:', errorMessage, error);

    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});