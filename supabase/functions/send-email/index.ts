import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from 'https://esm.sh/resend@1.1.0';
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
      console.warn('[send-email] Unauthorized: No Authorization header');
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
      console.warn('[send-email] Unauthorized: Invalid user session');
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    const { to, subject, body, attachmentBase64, attachmentFilename } = await req.json();
    console.log(`[send-email] Sending email to: ${to} from user: ${user.email}`);
    console.log(`[send-email] Attachment filename: ${attachmentFilename}`);
    console.log(`[send-email] Attachment base64 length: ${attachmentBase64 ? attachmentBase64.length : 0}`);

    // Check for Resend API key
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      console.error('[send-email] RESEND_API_KEY is not set in environment variables.');
      return new Response(JSON.stringify({ 
        error: 'Resend API key not configured. Please set RESEND_API_KEY environment variable in Supabase.' 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resend = new Resend(resendApiKey);

    // Prepare attachments
    const attachments = [];
    if (attachmentBase64 && attachmentFilename) {
      // Remove data URL prefix if present (e.g., "data:application/pdf;base64,")
      let base64Data = attachmentBase64;
      if (base64Data.startsWith('data:')) {
        const commaIndex = base64Data.indexOf(',');
        if (commaIndex > -1) {
          base64Data = base64Data.substring(commaIndex + 1);
        }
      }
      
      console.log(`[send-email] Cleaned base64 length: ${base64Data.length}`);
      
      attachments.push({
        content: base64Data,
        filename: attachmentFilename,
        encoding: 'base64',
        contentType: 'application/pdf',
      });
    }

    console.log(`[send-email] Number of attachments: ${attachments.length}`);

    const { data, error } = await resend.emails.send({
      from: 'onboarding@resend.dev', // Replace with your verified domain in Resend
      to: to,
      subject: subject,
      html: body,
      attachments: attachments,
    });

    if (error) {
      console.error('[send-email] Error sending email:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[send-email] Email sent successfully:', data);
    return new Response(JSON.stringify({ message: 'Email sent successfully', data }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[send-email] General error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Error desconocido en la función Edge.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});