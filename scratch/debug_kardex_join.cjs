const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Parse .env file
const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w\.\-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] ? match[2].trim() : '';
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.substring(1, value.length - 1);
    }
    env[match[1]] = value;
  }
});

const supabaseUrl = env['VITE_SUPABASE_URL'];
const supabaseAnonKey = env['VITE_SUPABASE_ANON_KEY'];

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase credentials not found in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function runTest() {
  console.log('Testing join with profiles:created_by...');
  try {
    const { data: test1, error: err1 } = await supabase
      .from('inventory_transactions')
      .select(`
        id,
        created_by,
        profiles:created_by (
          first_name,
          last_name,
          email,
          username
        )
      `)
      .limit(1);
    
    if (err1) {
      console.log('Join with profiles:created_by failed:', err1.message);
    } else {
      console.log('Join with profiles:created_by succeeded! Data:', JSON.stringify(test1, null, 2));
      return;
    }
  } catch (e) {
    console.error('Exception on test 1:', e);
  }

  console.log('\nTesting join with profiles!inventory_transactions_created_by_fkey...');
  try {
    const { data: test2, error: err2 } = await supabase
      .from('inventory_transactions')
      .select(`
        id,
        created_by,
        profiles!inventory_transactions_created_by_fkey (
          first_name,
          last_name,
          email,
          username
        )
      `)
      .limit(1);

    if (err2) {
      console.log('Join with profiles!inventory_transactions_created_by_fkey failed:', err2.message);
    } else {
      console.log('Join succeeded! Data:', JSON.stringify(test2, null, 2));
      return;
    }
  } catch (e) {
    console.error('Exception on test 2:', e);
  }

  console.log('\nTesting direct profiles table fetch...');
  try {
    const { data: test3, error: err3 } = await supabase
      .from('profiles')
      .select('*')
      .limit(2);
    
    if (err3) {
      console.log('Profiles table fetch failed:', err3.message);
    } else {
      console.log('Profiles table fetch succeeded! Data:', JSON.stringify(test3, null, 2));
    }
  } catch (e) {
    console.error('Exception on test 3:', e);
  }
}

runTest();
