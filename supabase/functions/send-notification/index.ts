import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import webpush from "npm:web-push@3.6.7";

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const VAPID_SUBJECT = 'mailto:sistemasprocarni2025@gmail.com';
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error("CRITICAL: VAPID keys are not set in environment variables.");
} else {
  webpush.setVapidDetails(
    VAPID_SUBJECT,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
}

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
    console.log("Payload recibido:", JSON.stringify(payload, null, 2));
    
    let record = null;
    let userId = null;

    if ((payload.type === 'INSERT' && payload.table === 'notifications') || payload.type === 'RETRY') {
      record = payload.record;
      userId = record.user_id;
      
      if (payload.type !== 'RETRY' && !['reminder', 'price_alert'].includes(record.type)) {
        console.log(`Notificación ignorada (tipo: ${record.type})`);
        return new Response(JSON.stringify({ message: "Notificación ignorada" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    } else if (payload.test === true) {
      record = {
        title: 'Notificaciones Activadas',
        message: '¡Excelente! Las notificaciones están funcionando en este dispositivo.'
      };
      userId = payload.user_id;
      console.log(`Enviando notificación de prueba para usuario: ${userId}`);
    } else {
      console.error("Payload inválido:", payload);
      return new Response(JSON.stringify({ message: "Payload inválido" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (!userId) {
       console.error("No se encontró userId en el payload");
       return new Response(JSON.stringify({ message: "Falta user_id." }), { 
         status: 400, 
         headers: { ...corsHeaders, "Content-Type": "application/json" } 
       });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    console.log(`Buscando suscripciones activas para user_id: ${userId}`);
    
    const { data: subscriptions, error } = await supabase
      .from('user_push_subscriptions')
      .select('endpoint, auth_key, p256dh_key')
      .eq('user_id', userId);

    if (error) {
      console.error('Error DB buscando suscripciones:', error);
      return new Response(JSON.stringify({ error: 'Error DB' }), { status: 500, headers: corsHeaders });
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.log(`No hay suscripciones para el usuario ${userId}. Asegúrate de que el usuario haya aceptado notificaciones en el dispositivo.`);
      return new Response(JSON.stringify({ message: "Sin suscripciones" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    console.log(`Enviando push a ${subscriptions.length} dispositivo(s).`);

    let targetUrl = '/';
    if (record.type === 'price_alert') {
      targetUrl = `/reports?tab=price-variation&materialId=${record.resource_id}`;
    } else {
      switch (record.resource_type) {
        case 'quote_request':
          targetUrl = `/quote-requests/${record.resource_id}`;
          break;
        case 'purchase_order':
          targetUrl = `/purchase-orders/${record.resource_id}`;
          break;
        case 'service_order':
          targetUrl = `/service-orders/${record.resource_id}`;
          break;
        case 'material':
          targetUrl = `/material-management`;
          break;
        default:
          targetUrl = '/notifications';
      }
    }

    const pushPayload = JSON.stringify({
      title: record.title || 'Sistema Procarni',
      body: record.message || '',
      icon: '/Sis-Prov.png',
      badge: '/badge-72x72.png',
      data: { 
        url: targetUrl,
        notificationId: record.id
      }
    });

    const sendPromises = subscriptions.map((sub: any) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: { auth: sub.auth_key, p256dh: sub.p256dh_key }
      };
      
      return webpush.sendNotification(pushSubscription, pushPayload)
        .then(() => console.log(`Push enviado con éxito a: ${sub.endpoint.substring(0, 30)}...`))
        .catch((err: any) => {
            console.error('Error al enviar Push:', sub.endpoint.substring(0, 30), err.message);
            // Si la suscripción ya no es válida (410 Gone o 404), la eliminamos
            if (err.statusCode === 410 || err.statusCode === 404) {
               console.log(`Eliminando suscripción inválida: ${sub.endpoint.substring(0, 30)}`);
               return supabase
                 .from('user_push_subscriptions')
                 .delete()
                 .match({ endpoint: sub.endpoint });
            }
        });
    });

    await Promise.all(sendPromises);

    return new Response(
      JSON.stringify({ message: "Proceso de envío completado" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Error inesperado en la función:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
