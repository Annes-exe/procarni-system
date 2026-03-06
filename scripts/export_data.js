const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = 'https://sbmwuttfblpwwwpifmza.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNibXd1dHRmYmxwd3d3cGlmbXphIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQ4MzUzOSwiZXhwIjoyMDg0MDU5NTM5fQ.QHoSWPcIRzDa_n9hrwG1aj47PvVqIVh8yCp0oQOkB6g';

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
