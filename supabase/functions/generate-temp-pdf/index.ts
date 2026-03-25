import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { PDFDocument, rgb, StandardFonts } from 'https://esm.sh/pdf-lib@1.17.1';
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
    const body = await req.json();
    orderId = body.orderId;
    type = body.type;
    
    console.log(`Starting PDF generation for ${type} document: ${orderId}`);

    const authHeader = req.headers.get('Authorization')!;
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // 1. Fetch Data based on type
    console.log(`Fetching data for ${type}...`);
    let data, items, title, fileName;
    if (type === 'purchase') {
      const { data: po, error: poErr } = await supabase.from('purchase_orders').select('*, suppliers(*), companies(*)').eq('id', orderId).single();
      if (poErr) throw poErr;
      const { data: poItems, error: itemsErr } = await supabase.from('purchase_order_items').select('*, materials(name)').eq('order_id', orderId);
      if (itemsErr) throw itemsErr;
      data = po; items = poItems; title = 'ORDEN DE COMPRA'; fileName = `OC_${orderId.slice(0,8)}.pdf`;
    } else if (type === 'service') {
      const { data: so, error: soErr } = await supabase.from('service_orders').select('*, suppliers(*), companies(*)').eq('id', orderId).single();
      if (soErr) throw soErr;
      const { data: soItems, error: itemsErr } = await supabase.from('service_order_items').select('*').eq('order_id', orderId);
      if (itemsErr) throw itemsErr;
      data = so; items = soItems; title = 'ORDEN DE SERVICIO'; fileName = `OS_${orderId.slice(0,8)}.pdf`;
    } else if (type === 'quote_request') {
      const { data: qr, error: qrErr } = await supabase.from('quote_requests').select('*, suppliers(*), companies(*)').eq('id', orderId).single();
      if (qrErr) throw qrErr;
      const { data: qrItems, error: itemsErr } = await supabase.from('quote_request_items').select('*, materials(name)').eq('request_id', orderId);
      if (itemsErr) throw itemsErr;
      data = qr; items = qrItems; title = 'SOLICITUD DE COTIZACIÓN'; fileName = `SC_${orderId.slice(0,8)}.pdf`;
    }

    if (!data) throw new Error('Document not found');
    console.log(`Data fetched successfully. Supplier: ${data.suppliers?.name}`);

    // 2. Simple PDF Generation
    console.log("Generating PDF...");
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const { width, height } = page.getSize();
    
    let y = height - 50;
    page.drawText(title, { x: 50, y, size: 20, font: boldFont, color: rgb(0.5, 0, 0) });
    y -= 30;
    page.drawText(`Nro: ${orderId.slice(0,8)}`, { x: 50, y, size: 12, font });
    y -= 20;
    page.drawText(`Proveedor: ${data.suppliers?.name || 'N/A'}`, { x: 50, y, size: 12, font });
    y -= 30;

    // Items Header
    page.drawText('Items', { x: 50, y, size: 12, font: boldFont });
    y -= 20;
    items?.forEach((item: any) => {
      const name = item.materials?.name || item.material_name || item.description || 'Item';
      page.drawText(`- ${item.quantity} x ${name}`, { x: 60, y, size: 10, font });
      y -= 15;
    });

    const pdfBytes = await pdfDoc.save();
    console.log("PDF generated. Size:", pdfBytes.length);

    // 3. Upload to Cloudinary
    console.log("Uploading to Cloudinary...");
    const cloudName = Deno.env.get('CLOUDINARY_CLOUD_NAME');
    const apiKey = Deno.env.get('CLOUDINARY_API_KEY');
    const apiSecret = Deno.env.get('CLOUDINARY_API_SECRET');
    
    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error('Cloudinary configuration missing (Environment Variables)');
    }

    const timestamp = Math.round(new Date().getTime() / 1000);
    const folder = 'procarni_system/temp';
    
    const params = { folder, timestamp };
    const signature = await generateSignature(params, apiSecret);

    const formData = new FormData();
    formData.append('file', new Blob([pdfBytes], { type: 'application/pdf' }), fileName);
    formData.append('api_key', apiKey);
    formData.append('timestamp', timestamp.toString());
    formData.append('signature', signature);
    formData.append('folder', folder);

    const uploadRes = await fetch(cloudinaryUrl(cloudName), { method: 'POST', body: formData });
    const uploadData = await uploadRes.json();

    if (!uploadRes.ok) throw new Error(uploadData.error?.message || 'Cloudinary upload failed');
    console.log("Uploaded to Cloudinary:", uploadData.secure_url);

    // 4. Register in Supabase
    console.log("Registering asset in Database...");
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 72);

    const { data: asset, error: dbError } = await supabase.from('temporary_assets').insert({
      url: uploadData.secure_url,
      cloudinary_public_id: uploadData.public_id,
      expires_at: expiresAt.toISOString()
    }).select().single();

    if (dbError) throw dbError;
    console.log("Asset registered successfully.");

    return new Response(JSON.stringify({ url: asset.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error(`Edge Function Error [${type} - ${orderId}]:`, error);
    return new Response(JSON.stringify({ 
      error: error.message, 
      details: error.details || error.hint || null,
      stack: error.stack 
    }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
});
