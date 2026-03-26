import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { crypto } from "https://deno.land/std@0.190.0/crypto/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function generateSignature(params: Record<string, any>, apiSecret: string) {
  const sortedParams = Object.keys(params).sort().map(key => `${key}=${params[key]}`).join('&');
  const stringToSign = sortedParams + apiSecret;
  const hash = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(stringToSign));
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 1. Get expired assets
    const now = new Date().toISOString();
    const { data: expiredAssets, error: fetchError } = await supabase
      .from('temporary_assets')
      .select('*')
      .lt('expires_at', now);

    if (fetchError) throw fetchError;
    if (!expiredAssets || expiredAssets.length === 0) {
      return new Response(JSON.stringify({ message: 'No expired assets found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 2. Delete from Cloudinary
    const cloudName = Deno.env.get('VITE_CLOUDINARY_CLOUD_NAME');
    const apiKey = Deno.env.get('VITE_CLOUDINARY_API_KEY');
    const apiSecret = Deno.env.get('VITE_CLOUDINARY_API_SECRET');

    if (!cloudName || !apiKey || !apiSecret) {
      console.error("Cleanup failed: Cloudinary secrets missing (VITE_ prefix required)");
      return new Response(JSON.stringify({ error: 'Cloudinary secrets missing (VITE_ prefix required)' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    for (const asset of expiredAssets) {
      const timestamp = Math.round(new Date().getTime() / 1000);
      const params = { public_id: asset.cloudinary_public_id, timestamp };
      const signature = await generateSignature(params, apiSecret);

      const formData = new FormData();
      formData.append('public_id', asset.cloudinary_public_id);
      formData.append('api_key', apiKey);
      formData.append('timestamp', timestamp.toString());
      formData.append('signature', signature);

      const deleteRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
        method: 'POST',
        body: formData
      });
      
      if (deleteRes.ok) {
        await supabase.from('temporary_assets').delete().eq('id', asset.id);
        console.log(`[cleanup] Deleted asset: ${asset.cloudinary_public_id}`);
      } else {
        const errorData = await deleteRes.json();
        console.error(`[cleanup] Failed to delete ${asset.cloudinary_public_id}:`, errorData);
      }
    }

    return new Response(JSON.stringify({ count: expiredAssets.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
