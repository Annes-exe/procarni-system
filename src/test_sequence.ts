import { supabase } from './integrations/supabase/client';

async function checkSuppliers() {
    const { data, error } = await supabase
        .from('suppliers')
        .select('id, code, rif, name')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error('Error:', error);
        return;
    }
    console.log('Latest suppliers:', data);

    // Intentamos obtener el valor de la secuencia (requiere permisos, quizás no funcione vía API REST)
    // Pero podemos ver el último código.
}

checkSuppliers();
