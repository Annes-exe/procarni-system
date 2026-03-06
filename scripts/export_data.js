const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: Faltan credenciales en el archivo .env (VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY)');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const tables = [
    "profiles", "suppliers", "materials", "companies", "supplier_materials",
    "purchase_orders", "purchase_order_items", "quote_requests", "quote_request_items",
    "audit_logs", "fichas_tecnicas", "price_history", "supplier_quotes",
    "quote_comparisons", "quote_comparison_items", "service_orders",
    "service_order_items", "service_order_materials"
];

async function exportData() {
    let combinedData = {};
    for (const table of tables) {
        console.log(`Exportando ${table}...`);

        let allData = [];
        let limit = 1000;
        let start = 0;
        let hasMore = true;

        while (hasMore) {
            const { data, error } = await supabase.from(table).select('*').range(start, start + limit - 1);
            if (error) {
                console.error(`Error exportando ${table}:`, error.message);
                break;
            }
            if (data.length > 0) {
                allData = allData.concat(data);
                start += limit;
            } else {
                hasMore = false;
            }

            // Si retorna menos del límite quiere decir que ya no hay más páginas
            if (data.length < limit) {
                hasMore = false;
            }
        }

        combinedData[table] = allData;
        fs.writeFileSync(`backup_${table}.json`, JSON.stringify(allData, null, 2));
        console.log(`-> ${table} exportada con éxito. Registros: ${allData.length}`);
    }
    fs.writeFileSync('produccion_data_completa.json', JSON.stringify(combinedData, null, 2));
    console.log('\n¡Todos los datos exportados correctamente a produccion_data_completa.json!');
}

exportData();
