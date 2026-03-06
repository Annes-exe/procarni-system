
import { createClient } from '@supabase/supabase-js';

// Ensure environment variables are loaded before running this script
// Start with: node --env-file=.env debug_so_data.ts (Node 20+) or use dotenv
const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || "";

if (!supabaseUrl || !supabaseKey) {
    console.error("Error: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in environment variables.");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testServiceOrderFlow() {
    console.log('--- STARTING SERVICE ORDER TEST ---');

    // 1. Get Dependencies (Supplier, Company, User)
    // Need to sign in or use an existing user id? 
    // RLS often requires authentication for INSERT. 
    // Let's try to find an existing user from a public table or just pick one if RLS allows anon read on users? (Unlikely)
    // We'll try to login as a test user if possible, or just fail and see.
    // Actually, we can hardcode a user UUID if we know one, but we don't.

    // Let's try to fetch a Supplier and Company first. 
    const { data: suppliers } = await supabase.from('suppliers').select('id').limit(1);
    const { data: companies } = await supabase.from('companies').select('id').limit(1);

    if (!suppliers?.length || !companies?.length) {
        console.error("Cannot test: Missing suppliers or companies.");
        return;
    }

    const supplierId = suppliers[0].id;
    const companyId = companies[0].id;

    // We need a user ID. Often RLS uses auth.uid(). 
    // Without login, INSERT might fail.
    // Let's try to fetch an existing Order to get a valid user_id to spoof? (Not possible with Supabase Client)

    console.log('Found Supplier:', supplierId);
    console.log('Found Company:', companyId);

    // 2. Fetch Existing Service Orders (with correct query)
    console.log('\n--- FETCHING EXISTING ORDERS ---');
    const { data: orders, error: ordersError } = await supabase
        .from('service_orders')
        .select('id, sequence_number, status')
        .limit(5);

    if (ordersError) {
        console.error("Error fetching orders:", ordersError);
    } else {
        console.log(`Found ${orders?.length} orders.`);
        if (orders && orders.length > 0) {
            const testId = orders[0].id;
            console.log(`Querying details for Order ID: ${testId}`);

            const { data: details, error: detailsError } = await supabase
                .from('service_orders')
                .select('*, service_order_items(*)')
                .eq('id', testId)
                .single();

            if (detailsError) {
                console.error("Error fetching details:", detailsError);
            } else {
                console.log("Order retrieved successfully.");
                console.log("Keys:", Object.keys(details));
                console.log("Items:", details.service_order_items);
                if (details.service_order_items && details.service_order_items.length === 0) {
                    console.warn("WARNING: service_order_items is an EMPTY ARRAY. Check if this order actually has items.");

                    // Let's check the items table directly for this order_id
                    const { data: directItems, error: directItemsError } = await supabase
                        .from('service_order_items')
                        .select('*')
                        .eq('order_id', testId);

                    console.log("Direct query on service_order_items for this order:", directItems);
                    if (directItems && directItems.length > 0) {
                        console.error("CRITICAL: Items exist in table but are not returned in Join! Check foreign key or RLS.");
                    } else {
                        console.log("Items table is truly empty for this order.");
                    }
                }
            }
        }
    }
}

testServiceOrderFlow();
