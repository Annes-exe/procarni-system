const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Error: Faltan credenciales en el archivo .env (VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY)');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function importData() {
    console.log('--- Iniciando Importación de Datos ---');

    // 1. Cargar el JSON de datos
    let allData;
    try {
        allData = JSON.parse(fs.readFileSync('produccion_data_completa.json', 'utf8'));
    } catch (err) {
        console.error('Error cargando el archivo JSON:', err.message);
        return;
    }

    // 2. Obtener usuarios del nuevo proyecto para mapear IDs
    const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();
    if (userError) {
        console.error('Error obteniendo usuarios del destino:', userError.message);
        return;
    }

    const userMapping = {};
    users.forEach(u => {
        userMapping[u.email] = u.id;
    });

    console.log('Usuarios encontrados en destino:', Object.keys(userMapping));

    // 3. Crear mapa de IDs viejos a correos (basado en el backup de profiles)
    const oldProfiles = allData['profiles'] || [];
    const oldUserIdToEmail = {};
    oldProfiles.forEach(p => {
        let email = p.email;
        // IDs conocidos del proyecto anterior para los que tenían email null
        if (!email) {
            if (p.id === 'be2aab53-9d6b-4cda-97ad-8edf9902a007') email = 'sistemasprocarni2025@gmail.com';
            if (p.id === '575a8f50-4117-4560-b1fa-c21199a1e4e0') email = 'analistacompraspc@gmail.com';
        }
        if (email) oldUserIdToEmail[p.id] = email;
    });

    // 4. Función de obtención de nuevo ID basado en tus reglas de consolidación
    const getNewUserId = (oldId) => {
        const email = oldUserIdToEmail[oldId];
        if (!email) return null;

        // Regla: sistemasprocarni2025@gmail.com y admin@procarni.com -> sistemasprocarni2025@gmail.com
        if (email === 'sistemasprocarni2025@gmail.com' || email === 'admin@procarni.com') {
            return userMapping['sistemasprocarni2025@gmail.com'];
        }
        // Regla: analistacompraspc@gmail.com y compras@procarni.com -> analistacompraspc@gmail.com
        if (email === 'analistacompraspc@gmail.com' || email === 'compras@procarni.com') {
            return userMapping['analistacompraspc@gmail.com'];
        }

        return userMapping[email] || userMapping['sistemasprocarni2025@gmail.com'];
    };

    // 5. Orden de tablas para respetar llaves foráneas
    const tableOrder = [
        'profiles',
        'companies',
        'material_categories',
        'units_of_measure',
        'suppliers',
        'materials',
        'supplier_materials',
        'quote_requests',
        'quote_request_items',
        'service_orders',
        'purchase_orders',
        'purchase_order_items',
        'service_order_items',
        'service_order_materials',
        'price_history',
        'notifications',
        'audit_logs',
        'fichas_tecnicas'
    ];

    // 6. Proceso de inserción
    for (const tableName of tableOrder) {
        const records = allData[tableName];
        if (!records || records.length === 0) {
            console.log(`Tabla [${tableName}]: Sin registros.`);
            continue;
        }

        console.log(`Tabla [${tableName}]: Procesando ${records.length} registros...`);

        const cleanedRecords = records.map(record => {
            const newRecord = { ...record };

            // Re-mapear user_id en cualquier tabla que lo contenga
            if (newRecord.user_id) {
                const newId = getNewUserId(newRecord.user_id);
                if (newId) newRecord.user_id = newId;
            }

            // Caso especial: profiles debe usar el ID oficial del Auth del nuevo proyecto
            if (tableName === 'profiles') {
                let email = record.email;
                if (!email) {
                    if (record.id === 'be2aab53-9d6b-4cda-97ad-8edf9902a007') email = 'sistemasprocarni2025@gmail.com';
                    if (record.id === '575a8f50-4117-4560-b1fa-c21199a1e4e0') email = 'analistacompraspc@gmail.com';
                }
                const targetAuthId = userMapping[email];
                if (targetAuthId) {
                    newRecord.id = targetAuthId;
                } else {
                    return null; // Saltamos si no hay cuenta de Auth creada
                }
            }

            return newRecord;
        }).filter(r => r !== null);

        if (cleanedRecords.length === 0) continue;

        // Inserción masiva
        const { error } = await supabase.from(tableName).upsert(cleanedRecords, { onConflict: 'id' });

        if (error) {
            console.error(`Error en ${tableName}:`, JSON.stringify(error, null, 2));
        } else {
            console.log(`Tabla [${tableName}]: Importada con éxito.`);
        }
    }

    console.log('--- Importación FINALIZADA con éxito ---');
}

importData();
