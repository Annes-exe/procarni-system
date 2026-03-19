import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import webpush from "npm:web-push@3.6.7";

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const VAPID_SUBJECT = 'mailto:sistemasprocarni2025@gmail.com';
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');

webpush.setVapidDetails(
  VAPID_SUBJECT,
  VAPID_PUBLIC_KEY!,
  VAPID_PRIVATE_KEY!
);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders, status: 200 });
  }

  try {
    const payload = await req.json();
    let record = null;
    let userId = null;

    if (payload.type === 'INSERT' && payload.table === 'notifications') {
      record = payload.record;
      userId = record.user_id;
      if (record.type !== 'reminder') {
        return new Response(JSON.stringify({ message: "Notificación ignorada" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    } else if (payload.test === true) {
      record = {
        title: 'Notificaciones Activadas',
        message: 'Notificaciones Activadas en este dispositivo'
      };
      userId = payload.user_id;
    } else {
      return new Response(JSON.stringify({ message: "Payload inválido" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (!userId) {
       return new Response(JSON.stringify({ message: "Falta user_id." }), { 
         status: 400, 
         headers: { ...corsHeaders, "Content-Type": "application/json" } 
       });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: subscriptions, error } = await supabase
      .from('user_push_subscriptions')
      .select('endpoint, auth_key, p256dh_key')
      .eq('user_id', userId);

    if (error || !subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ message: "Sin suscripciones" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const pushPayload = JSON.stringify({
      title: record.title || 'Recordatorio de Compras',
      body: record.message || '',
      icon: '/Sis-Prov.png',
      badge: '/badge-72x72.png',
      data: { url: '/' }
    });

    const sendPromises = subscriptions.map((sub: any) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: { auth: sub.auth_key, p256dh: sub.p256dh_key }
      };
      return webpush.sendNotification(pushSubscription, pushPayload)
        .catch((err: any) => {
            console.error('Error al enviar Push', sub.endpoint, err);
            if (err.statusCode === 410 || err.statusCode === 404) {
               return supabase
                 .from('user_push_subscriptions')
                 .delete()
                 .match({ endpoint: sub.endpoint });
            }
        });
    });

    await Promise.all(sendPromises);

    return new Response(
      JSON.stringify({ message: "Push enviado" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
