import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Configurar variables de entorno dadas desde .env
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
// Priorizar SERVICE_ROLE_KEY si existe en el entorno para saltar RLS
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: Faltan las variables de entorno VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const VENEZUELA_LOCATIONS = {
  "Amazonas": [
    "Alto Orinoco", "Atabapo", "Atures", "Autana", "Manapiare", "Maroa", "Río Negro"
  ],
  "Anzoátegui": [
    "Anaco", "Aragua", "Barcelona", "Diego Bautista Urbaneja", "Fernando de Peñalver", "Francisco del Carmen Carvajal", "Francisco de Miranda", "Guanta", "Independencia", "José Gregorio Monagas", "Juan Antonio Sotillo", "Juan Manuel Cajigal", "Libertad", "Manuel Ezequiel Bruzual", "Pedro María Freites", "Píritu", "Puerto La Cruz", "San José de Guanipa", "San Juan de Capistrano", "Santa Ana", "Simón Bolívar", "Simón Rodríguez", "Sir Arthur McGregor"
  ],
  "Apure": [
    "Achaguas", "Biruaca", "Muñoz", "Páez", "Pedro Camejo", "Rómulo Gallegos", "San Fernando"
  ],
  "Aragua": [
    "Bolívar", "Camatagua", "Francisco Linares Alcántara", "Girardot", "José Ángel Lamas", "José Félix Ribas", "José Rafael Revenga", "Libertador", "Maracay", "Mario Briceño Iragorry", "Ocumare de la Costa de Oro", "San Casimiro", "San Sebastián", "Santiago Mariño", "Santos Michelena", "Sucre", "Tovar", "Urdaneta", "Zamora"
  ],
  "Barinas": [
    "Alberto Arvelo Torrealba", "Andrés Eloy Blanco", "Antonio José de Sucre", "Arismendi", "Barinas", "Bolívar", "Cruz Paredes", "Ezequiel Zamora", "Obispos", "Pedraza", "Rojas", "Sosa"
  ],
  "Bolívar": [
    "Angostura", "Caroní", "Cedeño", "Ciudad Bolívar", "El Callao", "Gran Sabana", "Heres", "Padre Pedro Chien", "Piar", "Puerto Ordaz", "Roscio", "San Félix", "Sifontes", "Sucre"
  ],
  "Carabobo": [
    "Bejuma", "Carlos Arvelo", "Diego Ibarra", "Guacara", "Juan José Mora", "Libertador", "Los Guayos", "Miranda", "Montalbán", "Naguanagua", "Puerto Cabello", "San Diego", "San Joaquín", "Valencia"
  ],
  "Cojedes": [
    "Anzoátegui", "Ezequiel Zamora", "Girardot", "Lima Blanco", "Pao de San Juan Bautista", "Ricaurte", "Rómulo Gallegos", "Tinaco", "Tinaquillo"
  ],
  "Delta Amacuro": [
    "Antonio Díaz", "Casacoima", "Pedernales", "Tucupita"
  ],
  "Dependencias Federales": [
    "Archipiélago Los Roques", "Dependencias Federales (Otras)"
  ],
  "Distrito Capital": [
    "Libertador", "Caracas"
  ],
  "Falcón": [
    "Acosta", "Bolívar", "Buchivacoa", "Cacique Manaure", "Carirubana", "Colina", "Coro", "Dabajuro", "Democracia", "Falcón", "Federación", "Jacura", "Los Taques", "Mauroa", "Miranda", "Monseñor Iturriza", "Palmasola", "Petit", "Píritu", "Punto Fijo", "San Francisco", "Silva", "Sucre", "Tocópero", "Unión", "Urumaco", "Zamora"
  ],
  "Guárico": [
    "Camaguán", "Chaguaramas", "El Socorro", "Francisco de Miranda", "José Félix Ribas", "José Tadeo Monagas", "Juan Germán Roscio", "Julián Mellado", "Las Mercedes", "Leonardo Infante", "Ortiz", "San Gerónimo de Guayabal", "San José de Guaribe", "Santa María de Ipire", "Zaraza"
  ],
  "La Guaira": [
    "Vargas"
  ],
  "Lara": [
    "Andrés Eloy Blanco", "Barquisimeto", "Crespo", "Iribarren", "Jiménez", "Morán", "Palavecino", "Simón Planas", "Torres", "Urdaneta"
  ],
  "Mérida": [
    "Alberto Adriani", "Andrés Bello", "Antonio Pinto Salinas", "Aricagua", "Arzobispo Chacón", "Campo Elías", "Caracciolo Parra Olmedo", "Cardenal Quintero", "Guaraque", "Julio César Salas", "Justo Briceño", "Libertador", "Miranda", "Obispo Ramos de Lora", "Padre Noguera", "Pueblo Llano", "Rangel", "Rivas Dávila", "Santos Marquina", "Sucre", "Tovar", "Tulio Febres Cordero", "Zea"
  ],
  "Miranda": [
    "Acevedo", "Andrés Bello", "Baruta", "Brión", "Buroz", "Carrizal", "Chacao", "Cristóbal Rojas", "El Hatillo", "Guaicaipuro", "Independencia", "Lander", "Los Salias", "Los Teques", "Páez", "Paz Castillo", "Pedro Gual", "Plaza", "Simón Bolívar", "Sucre", "Urdaneta", "Zamora"
  ],
  "Monagas": [
    "Acosta", "Aguasay", "Bolívar", "Caripe", "Cedeño", "Ezequiel Zamora", "Libertador", "Maturín", "Piar", "Punceres", "Santa Bárbara", "Sotillo", "Uracoa"
  ],
  "Nueva Esparta": [
    "Antolín del Campo", "Arismendi", "Díaz", "García", "Gómez", "Maneiro", "Marcano", "Mariño", "Península de Macanao", "Tubores", "Villalba"
  ],
  "Portuguesa": [
    "Agua Blanca", "Araure", "Esteller", "Guanare", "Guanarito", "Monseñor José Vicente de Unda", "Ospino", "Páez", "Papelón", "San Genaro de Boconoíto", "San Rafael de Onoto", "Santa Rosalía", "Sucre", "Turén"
  ],
  "Sucre": [
    "Andrés Eloy Blanco", "Andrés Mata", "Arismendi", "Benítez", "Bermúdez", "Bolívar", "Cajigal", "Cruz Salmerón Acosta", "Libertador", "Mariño", "Mejía", "Montes", "Ribero", "Sucre", "Valdez"
  ],
  "Táchira": [
    "Andrés Bello", "Antonio Rómulo Costa", "Ayacucho", "Bolívar", "Cárdenas", "Córdoba", "Fernández Feo", "Francisco de Miranda", "García de Hevia", "Guásimos", "Independencia", "Jáuregui", "José María Vargas", "Junín", "Libertad", "Libertador", "Lobatera", "Michelena", "Panamericano", "Pedro María Ureña", "Rafael Urdaneta", "Samuel Darío Maldonado", "San Cristóbal", "San Judas Tadeo", "Seboruco", "Simón Rodríguez", "Sucre", "Torbes", "Uribante"
  ],
  "Trujillo": [
    "Andrés Bello", "Boconó", "Bolívar", "Candelaria", "Carache", "Escuque", "José Felipe Márquez Cañizalez", "Juan Vicente Campos Elías", "La Ceiba", "Miranda", "Monte Carmelo", "Motatán", "Pampán", "Pampanito", "Rafael Rangel", "San Rafael de Carvajal", "Sucre", "Trujillo", "Urdaneta", "Valera"
  ],
  "Yaracuy": [
    "Arístides Bastidas", "Bolívar", "Bruzual", "Cocorote", "Independencia", "José Antonio Páez", "La Trinidad", "Manuel Monge", "Nirgua", "Peña", "San Felipe", "Sucre", "Urachiche", "Veroes"
  ],
  "Zulia": [
    "Almirante Padilla", "Baralt", "Cabimas", "Catatumbo", "Colón", "Francisco Javier Pulgar", "Jesús Enrique Lossada", "Jesús María Semprún", "La Cañada de Urdaneta", "Lagunillas", "Machiques de Perijá", "Mara", "Maracaibo", "Miranda", "Páez", "Rosario de Perijá", "San Francisco", "Santa Rita", "Simón Bolívar", "Sucre", "Valmore Rodríguez"
  ]
};

const VENEZUELAN_STATES = Object.keys(VENEZUELA_LOCATIONS).sort();

/**
 * Normalizes a string by removing accents, converting to lowercase, 
 * and stripping extra whitespace.
 */
function normalizeString(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, ' ');
}

function detectLocation(address: string) {
    if (!address) return { state: '', city: '' };

    const addressLower = normalizeString(address);
    const foundStates: string[] = [];
    const foundCities: { city: string, state: string }[] = [];

    // 1. Identificar todos los estados candidatos
    for (const state of VENEZUELAN_STATES) {
        const stateNormalized = normalizeString(state);
        const stateRegex = new RegExp(`\\b${stateNormalized}\\b`, 'i');
        if (stateRegex.test(addressLower)) {
            foundStates.push(state);
        }
    }

    // 2. Identificar todas las ciudades candidatas
    for (const [state, cities] of Object.entries(VENEZUELA_LOCATIONS)) {
        for (const city of cities) {
            const cityNormalized = normalizeString(city);
            // Usar límites de palabra para evitar que "Mara" coincida con "Maracaibo"
            const cityRegex = new RegExp(`\\b${cityNormalized}\\b`, 'i');
            if (cityRegex.test(addressLower)) {
                foundCities.push({ city, state });
            }
        }
    }

    // 3. Buscar patrón explicito "Estado X"
    let explicitState: string | null = null;
    const estadoMatch = addressLower.match(/estado\s+([a-z\s]+)/i);
    if (estadoMatch) {
        const candidate = normalizeString(estadoMatch[1]);
        for (const state of VENEZUELAN_STATES) {
            if (candidate.startsWith(normalizeString(state))) {
                explicitState = state;
                break;
            }
        }
    }

    // 4. Determinar el mejor par
    let finalState: string | null = explicitState;
    let finalCity: string | null = null;

    const statesToSearch = explicitState ? [explicitState, ...foundStates] : foundStates;
    
    for (const stateName of statesToSearch) {
        const cityMatch = foundCities.find(c => c.state === stateName);
        if (cityMatch) {
            finalState = stateName;
            finalCity = cityMatch.city;
            break;
        }
    }

    if (!finalCity && foundCities.length > 0) {
        finalCity = foundCities[0].city;
        finalState = foundCities[0].state;
    }

    if (!finalState && foundStates.length > 0) {
        finalState = foundStates[0];
    }

    if (explicitState && !finalState) {
        finalState = explicitState;
    }

    return { 
        state: finalState || '', 
        city: finalCity || '' 
    };
}

async function runMigration() {
    console.log('Iniciando migración de ubicación para TODOS los proveedores...');

    // 1. Obtener todos los proveedores
    const { data: suppliers, error: fetchError } = await supabase
        .from('suppliers')
        .select('id, name, address, city, state');

    if (fetchError) {
        console.error('Error al obtener proveedores:', fetchError);
        process.exit(1);
    }

    console.log(`Encontrados ${suppliers.length} proveedores. Evaluando cambios...`);

    let updatedCount = 0;
    let skippedCount = 0;

    // 2. Evaluar y actualizar cada proveedor
    for (const supplier of suppliers) {
        const { state: newState, city: newCity } = detectLocation(supplier.address || '');

        // Solo actualizar si hay cambios
        if (newState !== (supplier.state || '') || newCity !== (supplier.city || '')) {
            console.log(`\n[PROVEEDOR: ${supplier.name}]`);
            console.log(`  - Dirección: "${supplier.address}"`);
            console.log(`  - Cambio detectado:`);
            console.log(`    Estado: "${supplier.state || '(vacío)'}" -> "${newState || '(no detectado)'}"`);
            console.log(`    Ciudad: "${supplier.city || '(vacío)'}" -> "${newCity || '(no detectado)'}"`);

            // Actualizar en base de datos
            const { error: updateError } = await supabase
                .from('suppliers')
                .update({ 
                    state: newState || null, 
                    city: newCity || null 
                })
                .eq('id', supplier.id);

            if (updateError) {
                console.error(`  -> ERROR al actualizar:`, updateError.message);
            } else {
                console.log(`  -> Actualizado correctamente.`);
                updatedCount++;
            }
        } else {
            skippedCount++;
        }
    }

    console.log('\n----------------------------------------');
    console.log('--- Resumen de Migración Completada ---');
    console.log(`Total proveedores evaluados: ${suppliers.length}`);
    console.log(`Proveedores actualizados: ${updatedCount}`);
    console.log(`Proveedores sin cambios: ${skippedCount}`);
    console.log('----------------------------------------\n');
}

runMigration().catch(console.error);
