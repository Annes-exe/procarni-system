import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";
import { encode } from "https://deno.land/std@0.177.0/encoding/hex.ts";

const CLOUD_NAME = Deno.env.get("VITE_CLOUDINARY_CLOUD_NAME") || "";
const API_KEY = Deno.env.get("VITE_CLOUDINARY_API_KEY") || "";
const API_SECRET = Deno.env.get("VITE_CLOUDINARY_API_SECRET") || "";

Deno.serve(async (req: Request) => {
  // CORS Handling
  if (req.method === "OPTIONS") {
    return new Response("ok", { 
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      }
    });
  }

  try {
    const { public_id, resource_type = "image" } = await req.json();

    if (!public_id) {
      return new Response(JSON.stringify({ error: "public_id is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const timestamp = Math.round(new Date().getTime() / 1000);
    
    // Generate signature
    // Pattern: public_id=<id>&timestamp=<ts><api_secret>
    const strToSign = `public_id=${public_id}&timestamp=${timestamp}${API_SECRET}`;
    
    const encoder = new TextEncoder();
    const data = encoder.encode(strToSign);
    const hashBuffer = await crypto.subtle.digest("SHA-1", data);
    const signature = new TextDecoder().decode(encode(new Uint8Array(hashBuffer)));

    const formData = new FormData();
    formData.append("public_id", public_id);
    formData.append("timestamp", timestamp.toString());
    formData.append("api_key", API_KEY);
    formData.append("signature", signature);

    const cloudinaryUrl = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resource_type}/destroy`;

    const response = await fetch(cloudinaryUrl, {
      method: "POST",
      body: formData,
    });

    const result = await response.json();

    return new Response(JSON.stringify(result), {
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      status: response.status,
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
