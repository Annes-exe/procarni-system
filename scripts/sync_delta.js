const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function syncDelta() {
    console.log('--- Iniciando Sincronización de Delta Today ---');

    const deltaData = JSON.parse(fs.readFileSync('delta_today.json', 'utf8'));

    // Obtener usuarios para mapeo
    const { data: { users } } = await supabase.auth.admin.listUsers();
    const userMapping = {};
    users.forEach(u => userMapping[u.email] = u.id);

    // Mapa de IDs viejos a nuevos basado en correos conocidos
    const getNewUserId = (oldId) => {
        // Mapeos fijos basados en los IDs del proyecto sbmwuttfblpwwwpifmza
        if (oldId === 'be2aab53-9d6b-4cda-97ad-8edf9902a007' || oldId === '334ddfb0-dc1e-48bc-ad10-dafe29ff6dc9') {
            return userMapping['sistemasprocarni2025@gmail.com'];
        }
        if (oldId === '575a8f50-4117-4560-b1fa-c21199a1e4e0' || oldId === '9b44f0ec-4a3c-4d34-945c-1180a3d54efe') {
            return userMapping['analistacompraspc@gmail.com'];
        }
        return userMapping['sistemasprocarni2025@gmail.com']; // Fallback
    };

    const tableOrder = [
        'materials',
        'supplier_materials',
        'purchase_orders',
        'purchase_order_items',
        'price_history'
    ];

    for (const tableName of tableOrder) {
        const records = deltaData[tableName];
        if (!records) continue;

        console.log(`Sincronizando ${tableName}...`);

        const cleaned = records.map(r => {
            const row = { ...r };
            if (row.user_id) row.user_id = getNewUserId(row.user_id);
            return row;
        });

        const { error } = await supabase.from(tableName).upsert(cleaned, { onConflict: 'id' });
        if (error) console.error(`Error en ${tableName}:`, error.message);
        else console.log(`[OK] ${tableName}`);
    }

    console.log('--- Sincronización Finalizada ---');
}

syncDelta();
