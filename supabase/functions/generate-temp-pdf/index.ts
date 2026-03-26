import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { crypto } from "https://deno.land/std@0.190.0/crypto/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Cloudinary Config helpers
const cloudinaryUrl = (cloudName: string) => `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;

async function generateSignature(params: Record<string, any>, apiSecret: string) {
  const sortedParams = Object.keys(params).sort().map(key => `${key}=${params[key]}`).join('&');
  const stringToSign = sortedParams + apiSecret;
  const hash = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(stringToSign));
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  let orderId = 'unknown';
  let type = 'unknown';

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No Authorization header provided');
    }

    const body = await req.json();
    orderId = body.orderId;
    type = body.type;
    
    console.log(`[generate-temp-pdf] Request: Type=${type}, ID=${orderId}`);

    // 1. Determine local endpoint and payload
    let targetEndpoint = '';
    let payload = {};

    if (type === 'purchase') {
      targetEndpoint = 'generate-po-pdf';
      payload = { orderId };
    } else if (type === 'service') {
      targetEndpoint = 'generate-so-pdf';
      payload = { orderId };
    } else if (type === 'quote_request') {
      targetEndpoint = 'generate-qr-pdf';
      payload = { requestId: orderId };
    } else {
      throw new Error(`Invalid document type: ${type}`);
    }

    // 2. Fetch PDF from the official generator (PROXY)
    console.log(`[generate-temp-pdf] Proxying to official generator: ${targetEndpoint}`);
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const pdfResponse = await fetch(`${supabaseUrl}/functions/v1/${targetEndpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!pdfResponse.ok) {
      const errorText = await pdfResponse.text();
      console.error(`[generate-temp-pdf] Official generator error (${targetEndpoint}):`, errorText);
      throw new Error(`Official PDF generator failed: ${errorText}`);
    }

    const pdfBlob = await pdfResponse.blob();
    const pdfBuffer = await pdfBlob.arrayBuffer();
    console.log(`[generate-temp-pdf] Received PDF bytes: ${pdfBuffer.byteLength}`);

    // 3. Upload to Cloudinary (Base64)
    console.log("[generate-temp-pdf] Uploading to Cloudinary...");
    const cloudName = Deno.env.get('VITE_CLOUDINARY_CLOUD_NAME');
    const apiKey = Deno.env.get('VITE_CLOUDINARY_API_KEY');
    const apiSecret = Deno.env.get('VITE_CLOUDINARY_API_SECRET');
    
    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error("Cloudinary secrets (VITE_) missing from environment");
    }

    const timestamp = Math.round(new Date().getTime() / 1000);
    const folder = 'procarni_system/temp';
    const params = { folder, timestamp };
    const signature = await generateSignature(params, apiSecret);

    const base64Data = btoa(String.fromCharCode(...new Uint8Array(pdfBuffer)));
    const fileData = `data:application/pdf;base64,${base64Data}`;

    const formData = new FormData();
    formData.append('file', fileData);
    formData.append('api_key', apiKey);
    formData.append('timestamp', timestamp.toString());
    formData.append('signature', signature);
    formData.append('folder', folder);

    const uploadRes = await fetch(cloudinaryUrl(cloudName), { method: 'POST', body: formData });
    const uploadData = await uploadRes.json();

    if (!uploadRes.ok) {
      console.error("[generate-temp-pdf] Cloudinary Error:", uploadData);
      throw new Error(uploadData.error?.message || "Cloudinary upload failed");
    }

    // 4. Register in Supabase (Service Role)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 72);

    const { data: asset, error: dbError } = await supabase.from('temporary_assets').insert({
      url: uploadData.secure_url,
      cloudinary_public_id: uploadData.public_id,
      expires_at: expiresAt.toISOString()
    }).select().single();

    if (dbError) throw dbError;

    return new Response(JSON.stringify({ url: asset.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error(`[generate-temp-pdf] Critical Error:`, error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
