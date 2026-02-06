
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://sbmwuttfblpwwwpifmza.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNibXd1dHRmYmxwd3d3cGlmbXphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0ODM1MzksImV4cCI6MjA4NDA1OTUzOX0.a4fT7Da0XmIFTVx72KBj1ahlqJo_46bQb8wdlwJRPjE";

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
