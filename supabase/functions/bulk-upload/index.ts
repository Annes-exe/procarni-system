import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'; // Corregido: Añadido 'from'
import * as XLSX from 'https://esm.sh/xlsx@0.18.5'; // Library to parse Excel files

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Re-implementación de validadores y constantes para el entorno Deno
const validateRif = (rif: string): string | null => {
  if (!rif) return null;
  const normalizedRif = rif.replace(/[- ]/g, '').toUpperCase();
  const rifRegex = /^[JVGEP]\d{8,9}$/;
  return rifRegex.test(normalizedRif) ? normalizedRif : null;
};

const MATERIAL_CATEGORIES = [
  'SECA', 'FRESCA', 'EMPAQUE', 'FERRETERIA Y CONSTRUCCION', 'AGROPECUARIA',
  'GASES Y COMBUSTIBLE', 'ELECTRICIDAD', 'REFRIGERACION', 'INSUMOS DE OFICINA',
  'INSUMOS INDUSTRIALES', 'MECANICA Y SELLOS', 'NEUMATICA', 'INSUMOS DE LIMPIEZA',
  'FUMICACION', 'EQUIPOS DE CARNICERIA', 'FARMACIA', 'MEDICION Y MANIPULACION',
  'ENCERADOS', 'PUBLICIDAD', // Añadida la categoría PUBLICIDAD
  'MAQUINARIA', // Nueva categoría
];

const MATERIAL_UNITS = [
  'KG', 'LT', 'ROL', 'PAQ', 'SACO', 'GAL', 'UND', 'MT', 'RESMA', 'PZA', 'TAMB', 'MILL', 'CAJA', 'PAR'
];

// Definir la constante PAYMENT_TERMS_OPTIONS aquí para que esté disponible en la función Edge
const PAYMENT_TERMS_OPTIONS = ['Contado', 'Crédito', 'Otro']; // Reintroducido 'Otro'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.warn('[bulk-upload] Unauthorized: No Authorization header');
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      console.warn('[bulk-upload] Unauthorized: Invalid user session');
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const uploadType = formData.get('type') as string; // 'supplier', 'material', or 'supplier_material_relation'

    if (!file) {
      console.error('[bulk-upload] No file uploaded.');
      return new Response(JSON.stringify({ error: 'No se ha subido ningún archivo.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!['supplier', 'material', 'supplier_material_relation'].includes(uploadType)) {
      console.error(`[bulk-upload] Invalid upload type: ${uploadType}`);
      return new Response(JSON.stringify({ error: 'Tipo de carga no válido.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet);

    let successCount = 0;
    let failureCount = 0;
    const errors: Array<{ row: number; data: any; reason: string }> = [];

    if (uploadType === 'supplier') {
      console.log(`[bulk-upload] Processing supplier upload for user ${user.id}. Rows: ${jsonData.length}`);
      for (let i = 0; i < jsonData.length; i++) {
        const rowData = jsonData[i];
        const rowNum = i + 2; // Excel rows are 1-indexed, plus header row

        const codeFromExcel = rowData['Código']; // Read code from Excel
        const rif = validateRif(rowData['RIF']);
        const name = rowData['Nombre'];
        const email = rowData['Email'];
        const phone = rowData['Teléfono Principal'];
        const phone_2 = rowData['Teléfono Secundario'];
        const instagram = rowData['Instagram'];
        const address = rowData['Dirección'];
        let payment_terms = rowData['Términos de Pago'];
        let custom_payment_terms = rowData['Términos de Pago Personalizados'];
        let credit_days = rowData['Días de Crédito'];
        let status = rowData['Estado'];

        if (!rif) {
          failureCount++;
          errors.push({ row: rowNum, data: rowData, reason: 'RIF inválido o faltante.' });
          continue;
        }
        if (!name) {
          failureCount++;
          errors.push({ row: rowNum, data: rowData, reason: 'Nombre del proveedor faltante.' });
          continue;
        }
        if (!phone) { // Validar Teléfono Principal
          failureCount++;
          errors.push({ row: rowNum, data: rowData, reason: 'Teléfono Principal del proveedor faltante.' });
          continue;
        }
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          failureCount++;
          errors.push({ row: rowNum, data: rowData, reason: 'Formato de Email inválido.' });
          continue;
        }

        // Validar y normalizar payment_terms
        if (!payment_terms || !PAYMENT_TERMS_OPTIONS.includes(payment_terms)) {
          // Si el término de pago no es válido o está vacío, se establece por defecto a 'Contado'
          // Si es un valor no reconocido, se asume 'Otro' y se usa como custom_payment_terms
          if (payment_terms && typeof payment_terms === 'string' && payment_terms.trim() !== '') {
            custom_payment_terms = payment_terms;
            payment_terms = 'Otro';
          } else {
            payment_terms = 'Contado';
          }
        }

        // Lógica para custom_payment_terms si payment_terms es 'Otro'
        if (payment_terms === 'Otro' && (!custom_payment_terms || String(custom_payment_terms).trim() === '')) {
          failureCount++;
          errors.push({ row: rowNum, data: rowData, reason: 'Términos de Pago Personalizados requeridos si el tipo es "Otro".' });
          continue;
        } else if (payment_terms !== 'Otro') {
          custom_payment_terms = null; // Si no es 'Otro', custom_payment_terms debe ser nulo
        }

        // Lógica para credit_days basada en payment_terms
        if (payment_terms === 'Crédito') {
          if (credit_days === undefined || credit_days === null || isNaN(Number(credit_days)) || Number(credit_days) < 0) {
            failureCount++;
            errors.push({ row: rowNum, data: rowData, reason: 'Días de Crédito requeridos y deben ser un número no negativo para términos de "Crédito".' });
            continue;
          }
          credit_days = Number(credit_days);
        } else {
          credit_days = 0; // Si no es crédito, los días de crédito son 0
        }

        if (!status || !['Active', 'Inactive'].includes(status)) {
          status = 'Active';
        }

        const supplierData: any = {
          rif: rif,
          name: name,
          email: email || null,
          phone: phone || null,
          phone_2: phone_2 || null,
          instagram: instagram || null,
          address: address || null,
          payment_terms: payment_terms,
          custom_payment_terms: custom_payment_terms || null,
          credit_days: credit_days,
          status: status,
          user_id: user.id,
        };

        // Only add code if it's explicitly provided in the Excel
        if (codeFromExcel) {
          supplierData.code = codeFromExcel;
        }

        // ALWAYS check for existing supplier by RIF
        const { data: existingSupplier, error: fetchError } = await supabaseClient
          .from('suppliers')
          .select('id')
          .eq('rif', rif)
          .single();

        if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 means "no rows found"
          console.error(`[bulk-upload] Error checking existing supplier for RIF ${rif}:`, fetchError);
          failureCount++;
          errors.push({ row: rowNum, data: rowData, reason: `Error de base de datos al verificar proveedor por RIF: ${fetchError.message}` });
          continue;
        }

        let dbOperation;
        if (existingSupplier) {
          // Update existing supplier
          dbOperation = await supabaseClient
            .from('suppliers')
            .update(supplierData)
            .eq('id', existingSupplier.id);
          console.log(`[bulk-upload] Updated supplier with RIF ${rif}`);
        } else {
          // Insert new supplier
          dbOperation = await supabaseClient
            .from('suppliers')
            .insert(supplierData);
          console.log(`[bulk-upload] Inserted new supplier with RIF ${rif}`);
        }

        if (dbOperation.error) {
          console.error(`[bulk-upload] Error saving supplier with RIF ${rif}:`, dbOperation.error); // Log full error object
          failureCount++;
          errors.push({ row: rowNum, data: rowData, reason: `Error al guardar proveedor: ${dbOperation.error.message}` });
        } else {
          successCount++;
        }
      }
    } else if (uploadType === 'material') {
      console.log(`[bulk-upload] Processing material upload for user ${user.id}. Rows: ${jsonData.length}`);
      for (let i = 0; i < jsonData.length; i++) {
        const rowData = jsonData[i];
        const rowNum = i + 2;

        const codeFromExcel = rowData['Código']; // Read code from Excel
        const name = rowData['Nombre'];
        const category = rowData['Categoría'];
        const unit = rowData['Unidad'];
        const isExemptRaw = rowData['Exento de IVA']; // NEW: Read 'Exento de IVA'

        if (!name) {
          failureCount++;
          errors.push({ row: rowNum, data: rowData, reason: 'Nombre del material faltante.' });
          continue;
        }
        if (!category || !MATERIAL_CATEGORIES.includes(category)) {
          failureCount++;
          errors.push({ row: rowNum, data: rowData, reason: `Categoría inválida o faltante. Debe ser una de: ${MATERIAL_CATEGORIES.join(', ')}` });
          continue;
        }
        if (!unit || !MATERIAL_UNITS.includes(unit)) {
          failureCount++;
          errors.push({ row: rowNum, data: rowData, reason: `Unidad inválida o faltante. Debe ser una de: ${MATERIAL_UNITS.join(', ')}` });
          continue;
        }

        // NEW: Process isExemptRaw to boolean
        let is_exempt = false;
        if (isExemptRaw !== undefined && isExemptRaw !== null) {
          const lowerCaseExempt = String(isExemptRaw).toLowerCase().trim();
          is_exempt = ['sí', 'si', 'true', '1'].includes(lowerCaseExempt);
        }

        const materialData: any = {
          name: name,
          category: category,
          unit: unit,
          is_exempt: is_exempt, // NEW: Add is_exempt to materialData
          user_id: user.id,
        };

        // Only add code if it's explicitly provided in the Excel
        if (codeFromExcel) {
          materialData.code = codeFromExcel;
        } else {
          // If code is not provided, ensure it's null for insert to trigger auto-generation
          materialData.code = null;
        }

        // Check if material already exists by name and category (or code if provided)
        let existingMaterialQuery = supabaseClient
          .from('materials')
          .select('id');

        if (codeFromExcel) { // If code is provided, prioritize searching by code
          existingMaterialQuery = existingMaterialQuery.eq('code', codeFromExcel);
        } else { // Otherwise, search by name and category
          existingMaterialQuery = existingMaterialQuery
            .eq('name', name)
            .eq('category', category);
        }

        const { data: existingMaterial, error: fetchError } = await existingMaterialQuery.single();

        if (fetchError && fetchError.code !== 'PGRST116') {
          console.error(`[bulk-upload] Error checking existing material for row ${rowNum}:`, fetchError);
          failureCount++;
          errors.push({ row: rowNum, data: rowData, reason: `Error de base de datos al verificar material: ${fetchError.message}` });
          continue;
        }

        let dbOperation;
        if (existingMaterial) {
          // Update existing material
          dbOperation = await supabaseClient
            .from('materials')
            .update(materialData)
            .eq('id', existingMaterial.id);
          console.log(`[bulk-upload] Updated material ${name}`);
        } else {
          // Insert new material
          dbOperation = await supabaseClient
            .from('materials')
            .insert(materialData);
          console.log(`[bulk-upload] Inserted new material ${name}`);
        }

        if (dbOperation.error) {
          console.error(`[bulk-upload] Error saving material ${name}:`, dbOperation.error); // Log full error object
          failureCount++;
          errors.push({ row: rowNum, data: rowData, reason: `Error al guardar material: ${dbOperation.error.message}` });
        } else {
          successCount++;
        }
      }
    } else if (uploadType === 'supplier_material_relation') {
      console.log(`[bulk-upload] Processing supplier-material relation upload for user ${user.id}. Rows: ${jsonData.length}`);
      for (let i = 0; i < jsonData.length; i++) {
        const rowData = jsonData[i];
        const rowNum = i + 2;

        const supplierCode = String(rowData['Código P'] || '').trim(); // Changed from RIF to Código P
        const materialCode = String(rowData['Código MP'] || '').trim(); // Changed from Código to Código MP
        const specification = String(rowData['ESPECIFICACION'] || '').trim();

        if (!supplierCode) { // Validate supplier code
          failureCount++;
          errors.push({ row: rowNum, data: rowData, reason: 'Código del proveedor faltante.' });
          continue;
        }
        if (!materialCode) {
          failureCount++;
          errors.push({ row: rowNum, data: rowData, reason: 'Código del material faltante.' });
          continue;
        }

        // Find supplier_id by code (Código P)
        const { data: supplierLookup, error: supplierLookupError } = await supabaseClient
          .from('suppliers')
          .select('id')
          .eq('code', supplierCode) // Changed to 'code'
          .single();

        if (supplierLookupError || !supplierLookup) {
          console.warn(`[bulk-upload] Supplier with code '${supplierCode}' not found for row ${rowNum}. Skipping relation.`);
          failureCount++;
          errors.push({ row: rowNum, data: rowData, reason: `Proveedor con código '${supplierCode}' no encontrado.` });
          continue;
        }
        const supplierId = supplierLookup.id;

        // Find material_id by code (Código MP)
        const { data: materialLookup, error: materialLookupError } = await supabaseClient
          .from('materials')
          .select('id')
          .eq('code', materialCode) // Already 'code', but confirming
          .single();

        if (materialLookupError || !materialLookup) {
          console.warn(`[bulk-upload] Material with code '${materialCode}' not found for row ${rowNum}. Skipping relation.`);
          failureCount++;
          errors.push({ row: rowNum, data: rowData, reason: `Material con código '${materialCode}' no encontrado.` });
          continue;
        }
        const materialId = materialLookup.id;

        // Check if supplier_material relationship already exists
        const { data: existingRelation, error: relationFetchError } = await supabaseClient
          .from('supplier_materials')
          .select('id')
          .eq('supplier_id', supplierId)
          .eq('material_id', materialId)
          .single();

        if (relationFetchError && relationFetchError.code !== 'PGRST116') {
          console.error(`[bulk-upload] Error checking existing supplier_material relation for row ${rowNum}:`, relationFetchError);
          failureCount++;
          errors.push({ row: rowNum, data: rowData, reason: `Error de base de datos al verificar relación: ${relationFetchError.message}` });
          continue;
        }

        let dbOperation;
        if (existingRelation) {
          // Update existing relation
          dbOperation = await supabaseClient
            .from('supplier_materials')
            .update({ specification: specification, user_id: user.id })
            .eq('id', existingRelation.id);
          console.log(`[bulk-upload] Updated supplier_material relation for supplier ${supplierCode}, material ${materialCode}`);
        } else {
          // Insert new relation
          dbOperation = await supabaseClient
            .from('supplier_materials')
            .insert({
              supplier_id: supplierId,
              material_id: materialId,
              specification: specification,
              user_id: user.id,
            });
          console.log(`[bulk-upload] Inserted new supplier_material relation for supplier ${supplierCode}, material ${materialCode}`);
        }

        if (dbOperation.error) {
          console.error(`[bulk-upload] Error saving supplier_material relation for row ${rowNum}:`, dbOperation.error); // Log full error object
          failureCount++;
          errors.push({ row: rowNum, data: rowData, reason: `Error al guardar relación: ${dbOperation.error.message}` });
        } else {
          successCount++;
        }
      }
    }

    const message = `Carga masiva completada. ${successCount} registros exitosos, ${failureCount} con errores.`;
    console.log(`[bulk-upload] ${message}`);

    return new Response(JSON.stringify({ successCount, failureCount, errors, message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[bulk-upload] General error:', error); // Log full error object
    return new Response(JSON.stringify({ error: error.message || 'Error desconocido en la función Edge.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});