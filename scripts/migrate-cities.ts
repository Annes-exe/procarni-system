import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Configurar variables de entorno dadas desde .env
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: Faltan las variables de entorno VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const VENEZUELAN_CITIES = [
    'Caracas', 'Maracaibo', 'Valencia', 'Barquisimeto', 'Maracay',
    'Ciudad Guayana', 'San Cristóbal', 'Maturín', 'Barinas', 'Barcelona',
    'Mérida', 'Coro', 'Cumaná', 'Ciudad Bolívar', 'San Felipe',
    'Guanare', 'San Carlos', 'San Juan de los Morros', 'Tucupita',
    'Puerto Ayacucho', 'La Asunción', 'La Guaira'
].sort((a, b) => a.localeCompare(b));

async function runMigration() {
    console.log('Iniciando migración de ciudades para proveedores existentes...');

    // 1. Obtener todos los proveedores
    const { data: suppliers, error: fetchError } = await supabase
        .from('suppliers')
        .select('id, name, address, city');

    if (fetchError) {
        console.error('Error al obtener proveedores:', fetchError);
        process.exit(1);
    }

    console.log(`Encontrados ${suppliers.length} proveedores. Evaluando...`);

    let updatedCount = 0;

    // 2. Evaluar y actualizar cada proveedor
    for (const supplier of suppliers) {
        if (supplier.address && !supplier.city) {
            const addressLower = supplier.address.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

            let detectedCity = null;
            for (const city of VENEZUELAN_CITIES) {
                const cityNormalized = city.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                if (addressLower.includes(cityNormalized)) {
                    detectedCity = city;
                    break;
                }
            }

            if (detectedCity) {
                console.log(`- Proveedor "${supplier.name}": asignando ciudad "${detectedCity}" (basado en dirección: "${supplier.address.substring(0, 30)}...")`);

                // Actualizar en base de datos
                const { error: updateError } = await supabase
                    .from('suppliers')
                    .update({ city: detectedCity })
                    .eq('id', supplier.id);

                if (updateError) {
                    console.error(`  -> Error al actualizar ${supplier.name}:`, updateError);
                } else {
                    updatedCount++;
                }
            }
        }
    }

    console.log('--- Migración completada ---');
    console.log(`Total de proveedores actualizados: ${updatedCount}`);
}

runMigration().catch(console.error);
