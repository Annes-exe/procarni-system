const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const userConfig = require('./user_config.json');

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
        const email = userConfig.emailByOldUserId[oldId];
        if (!email) return userMapping[userConfig.fallbackEmail];

        // Buscar en grupos
        for (const group of Object.values(userConfig.groups)) {
            if (group.emails.includes(email)) {
                return userMapping[group.targetEmail];
            }
        }

        return userMapping[email] || userMapping[userConfig.fallbackEmail];
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
