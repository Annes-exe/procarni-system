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

  let supabaseClient: any = null;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.warn('[upload-ficha-tecnica] Unauthorized: No Authorization header');
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    const token = authHeader.replace('Bearer ', '');
    supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      console.warn('[upload-ficha-tecnica] Unauthorized: Invalid user session');
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    const { 
      nombre_producto, 
      proveedor_id, 
      fileBase64, 
      fileName, 
      mimeType 
    } = await req.json();

    if (!nombre_producto || !proveedor_id || !fileBase64 || !fileName || !mimeType) {
      console.error('[upload-ficha-tecnica] Missing required fields in payload.');
      return new Response(JSON.stringify({ error: 'Faltan campos requeridos (nombre_producto, proveedor_id, fileBase64, fileName, mimeType).' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- 1. Upload file to Supabase Storage ---
    
    // Create a unique path: user_id/timestamp_filename
    const filePath = `${user.id}/${Date.now()}_${fileName.replace(/\s/g, '_')}`;
    
    // Convert Base64 string to ArrayBuffer/Blob for upload
    // Remove data URL prefix if present (e.g., "data:application/pdf;base64,")
    let base64Data = fileBase64;
    if (base64Data.startsWith('data:')) {
      const commaIndex = base64Data.indexOf(',');
      if (commaIndex > -1) {
        base64Data = base64Data.substring(commaIndex + 1);
      }
    }

    // Convert Base64 to Uint8Array (ArrayBuffer)
    const fileBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

    console.log(`[upload-ficha-tecnica] Uploading file to storage path: ${filePath}`);

    // Use the service role client for upload to bypass RLS if needed
    const serviceRoleClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { error: uploadError } = await serviceRoleClient.storage
      .from('fichas')
      .upload(filePath, fileBuffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      console.error('[upload-ficha-tecnica] Supabase Storage Upload Error:', uploadError);
      throw new Error(`Error al subir el archivo a Supabase Storage: ${uploadError.message}`);
    }

    // --- 2. Get Public URL ---
    const { data: publicUrlData } = serviceRoleClient.storage
      .from('fichas')
      .getPublicUrl(filePath);
      
    const storageUrl = publicUrlData.publicUrl;
    console.log(`[upload-ficha-tecnica] Public URL obtained: ${storageUrl}`);

    // --- 3. Insert Metadata into Supabase DB ---
    const { data: newFicha, error: insertError } = await supabaseClient
      .from('fichas_tecnicas')
      .insert({
        user_id: user.id,
        nombre_producto: nombre_producto,
        proveedor_id: proveedor_id,
        storage_url: storageUrl,
      })
      .select()
      .single();

    if (insertError) {
      console.error('[upload-ficha-tecnica] Supabase Insert Error:', insertError);
      throw new Error(`Error al guardar metadatos en la base de datos: ${insertError.message}`);
    }

    console.log(`[upload-ficha-tecnica] Ficha técnica created successfully: ${newFicha.id}`);

    return new Response(JSON.stringify(newFicha), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error during file upload.';
    console.error('[upload-ficha-tecnica] General Error:', errorMessage, error);

    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});