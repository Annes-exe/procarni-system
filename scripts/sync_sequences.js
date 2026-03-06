const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function syncSequences() {
    console.log('--- Sincronizando Secuencias de Base de Datos ---');

    // 1. Sincronizar Orden de Compra (PO)
    const { data: maxPO } = await supabase.from('purchase_orders').select('sequence_number').order('sequence_number', { ascending: false }).limit(1);
    const nextPO = maxPO?.[0]?.sequence_number ? maxPO[0].sequence_number : 0;

    console.log(`Última OC encontrada: ${nextPO}. Ajustando secuencia...`);

    const { error: poError } = await supabase.rpc('execute_sql', {
        query: `SELECT setval('purchase_order_sequence', ${nextPO}, true);`
    });

    // Si la función RPC 'execute_sql' no existe (que es común), lo hacemos vía SQL directo si el usuario tiene acceso o simplemente explicamos.
    // Pero como ya tenemos el esquema inyectado, podemos intentar un truco: 
    // Supabase no permite setval vía API fácilmente. Lo más seguro es que el usuario lo corra en el SQL Editor.

    console.log('\nPor favor, copia y pega esto en el SQL Editor de tu Dashboard de Supabase (Proyecto jrfvwivsylrtipojewku):');
    console.log('------------------------------------------------------------');
    console.log(`SELECT setval('purchase_order_sequence', ${nextPO}, true);`);
    console.log(`SELECT setval('service_order_sequence', (SELECT MAX(sequence_number) FROM service_orders), true);`);
    console.log(`SELECT setval('material_code_sequence', (SELECT COALESCE(MAX(CAST(SUBSTRING(code FROM '[0-9]+') AS INTEGER)), 0) FROM materials), true);`);
    console.log(`SELECT setval('supplier_code_sequence', (SELECT COALESCE(MAX(CAST(SUBSTRING(code FROM '[0-9]+') AS INTEGER)), 0) FROM suppliers), true);`);
    console.log('------------------------------------------------------------');
}

syncSequences();
