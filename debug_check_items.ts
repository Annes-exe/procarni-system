
import { createClient } from '@supabase/supabase-js';

// Ensure environment variables are loaded before running this script
// Start with: node --env-file=.env debug_check_items.ts (Node 20+) or use dotenv
const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || "";

if (!supabaseUrl || !supabaseKey) {
    console.error("Error: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in environment variables.");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAllItems() {
    console.log('--- CHECKING ALL SERVICE ORDER ITEMS ---');

    // 1. Count items
    const { count, error: countError } = await supabase
        .from('service_order_items')
        .select('*', { count: 'exact', head: true });

    if (countError) {
        console.error('Error counting items:', countError);
        return;
    }

    console.log(`Total items in 'service_order_items' table: ${count}`);

    if (count === 0) {
        console.log("The table is empty. The creation process might be failing to insert items.");
    } else {
        // 2. List some items with their order_id
        const { data: items, error: listError } = await supabase
            .from('service_order_items')
            .select('id, order_id, description, quantity, unit_price')
            .limit(5);

        if (listError) console.error(listError);
        else {
            console.log("Sample items:", items);

            // Check one parent order
            if (items && items.length > 0) {
                const parentId = items[0].order_id;
                console.log(`Checking parent order ${parentId}...`);
                const { data: order } = await supabase.from('service_orders').select('id, sequence_number').eq('id', parentId).single();
                console.log("Parent Order:", order);
            }
        }
    }
}

checkAllItems();
