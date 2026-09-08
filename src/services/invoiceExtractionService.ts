import { createWorker } from 'tesseract.js';
import { ExtractedInvoiceSchema, InvoiceExtractionResult } from '@/types/invoiceExtractor';

/**
 * System Prompt especializado en auditoría y extracción de facturas fiscales y comerciales
 */
/**
 * System Prompt especializado en auditoría y extracción de facturas fiscales y comerciales
 */
const SYSTEM_PROMPT = `[ROL]
Eres un sistema experto en auditoría contable y extracción de datos (Data Parsing) especializado en facturación venezolana (SENIAT) e internacional.

[TAREA]
Tu objetivo es analizar el texto crudo proporcionado por un sistema OCR a partir de la imagen de una factura y extraer los datos comerciales y fiscales clave. Debes estructurar estos datos estrictamente según el esquema JSON definido a continuación.

[REGLAS Y RESTRICCIONES DE AUDITORÍA]
1. FORMATO ESTRICTO: Tu respuesta debe ser ÚNICA Y EXCLUSIVAMENTE un objeto JSON válido. No incluyas saludos, explicaciones, ni bloques de formato Markdown (como \`\`\`json).
2. MANEJO DE NULOS: Si un dato solicitado no está presente en el texto, está ilegible, o no aplica, el valor en el JSON debe ser null. No inventes información.
3. LIMPIEZA Y CORRECCIÓN DE ERRORES DE OCR: 
   - RIF EMISOR Y CLIENTE (Venezuela): 
     * Formato SENIAT: Letra (J, V, G, E, P) seguida de EXACTAMENTE 8 o 9 dígitos numéricos (ej. J-50141542-0 o J501415420).
     * El RIF NUNCA tiene 10 o más dígitos numéricos. Si el OCR incluye dígitos extra producidos por guiones o manchas (ej. "J-5014154720"), corrígelo al RIF real de 9 dígitos ("J501415420" o "J-50141542-0").
     * Limpia espacios internos.
   - DESCRIPCIÓN DE PRODUCTOS / ÍTEMS:
     * Elimina códigos de impuestos fiscales al final de la línea como (G), (6), (E), (R), (A), (B), y montos de precio repetidos.
     * Corrige confusiones típicas de OCR en capacidades y medidas: 'SOL' suele ser '50L' (50 Litros) o '5OL', 'ZOW' suele ser '20W', 'O' por '0', 'l' por '1'.
     * Extrae el nombre o descripción limpia del producto.
   - MONEDAS: Identifica si los montos están en Bolívares (VES) o Dólares (USD) basándote en símbolos ($) o siglas (Bs, REF, USD).
   - NÚMEROS: Convierte todos los montos a formato numérico (flotante), usando el punto (.) para decimales, sin separadores de miles. (ej. "177.058,20" -> 177058.20, "1.250,50" -> 1250.50).

[ESQUEMA JSON ESPERADO]
{
  "documento": {
    "tipo": "String (Factura, Nota de Entrega, Recibo)",
    "numero_factura": "String",
    "fecha_emision": "String (Formato YYYY-MM-DD)",
    "hora_emision": "String (Formato HH:MM)"
  },
  "emisor": {
    "razon_social": "String",
    "rif": "String"
  },
  "cliente": {
    "razon_social": "String",
    "identificacion_rif_ci": "String"
  },
  "totales": {
    "moneda_principal": "String (VES o USD)",
    "subtotal_base_imponible": Number,
    "monto_iva": Number,
    "monto_igtf": Number,
    "total_general": Number
  },
  "items": [
    {
      "descripcion": "String (Nombre del producto o descripción)",
      "cantidad": Number,
      "unidad": "String (UND, KG, LT, etc.)",
      "precio_unitario": Number,
      "precio_total": Number
    }
  ],
  "metodo_pago": "String (Efectivo, Transferencia, Pago Movil, Divisas, Multiples)"
}`;

/**
 * Formatea y limpia un RIF venezolano al estándar canónico (ej. J-50141542-0 o J501415420)
 */
export function formatVenRif(rawRif: string | null | undefined): string {
  if (!rawRif) return '';
  let clean = rawRif.trim().replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (!clean) return '';
  
  const letter = clean[0];
  let digits = clean.slice(1);
  if (!['J', 'V', 'G', 'E', 'P'].includes(letter)) {
    return rawRif.trim();
  }

  // Si tiene 10 dígitos debido a un error de OCR (ej. 5014154720 en vez de 501415420), recortar el espurio
  if (digits.length === 10) {
    // Si contiene un '7' o '1' insertado por el OCR en lugar del guión
    digits = digits.slice(0, 8) + digits.slice(9);
  }

  if (digits.length === 9) {
    return `${letter}-${digits.slice(0, 8)}-${digits.slice(8)}`;
  } else if (digits.length === 8) {
    return `${letter}-${digits}`;
  }

  return `${letter}-${digits}`;
}

/**
 * Limpia y sanea bloques markdown de la respuesta del LLM
 */
export function sanitizeJsonString(raw: string): string {
  return raw
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

/**
 * Normaliza y valida que los tipos numéricos sean float/number reales y no strings con comas
 */
export function sanitizeParsedInvoice(data: any): ExtractedInvoiceSchema {
  const parseNum = (val: unknown): number | null => {
    if (typeof val === 'number') return isNaN(val) ? null : val;
    if (typeof val === 'string') {
      const clean = val.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
      const num = parseFloat(clean);
      return isNaN(num) ? null : num;
    }
    return null;
  };

  const rawItems = Array.isArray(data?.items) ? data.items : [];
  const sanitizedItems = rawItems
    .filter((it: any) => it && (it.descripcion || it.nombre || it.name))
    .map((it: any) => ({
      descripcion: String(it.descripcion || it.nombre || it.name || '')
        .replace(/\((?:G|6|E|R|A|B)\)/gi, '')
        .trim(),
      cantidad: parseNum(it.cantidad || it.qty || it.cant) || 1,
      unidad: String(it.unidad || it.unit || 'UND').toUpperCase().trim(),
      precio_unitario: parseNum(it.precio_unitario || it.unit_price || it.precio || it.price) || 0,
      precio_total: parseNum(it.precio_total || it.total_price || it.total) || null,
      codigo_referencia: it.codigo_referencia || it.code || null,
    }));

  return {
    documento: {
      tipo: data?.documento?.tipo || null,
      numero_factura: data?.documento?.numero_factura ? String(data.documento.numero_factura).trim() : null,
      fecha_emision: data?.documento?.fecha_emision || null,
      hora_emision: data?.documento?.hora_emision || null,
    },
    emisor: {
      razon_social: data?.emisor?.razon_social ? String(data.emisor.razon_social).trim() : null,
      rif: data?.emisor?.rif ? formatVenRif(String(data.emisor.rif)) : null,
    },
    cliente: {
      razon_social: data?.cliente?.razon_social ? String(data.cliente.razon_social).trim() : null,
      identificacion_rif_ci: data?.cliente?.identificacion_rif_ci
        ? formatVenRif(String(data.cliente.identificacion_rif_ci))
        : null,
    },
    totales: {
      moneda_principal: data?.totales?.moneda_principal === 'USD' ? 'USD' : 'VES',
      subtotal_base_imponible: parseNum(data?.totales?.subtotal_base_imponible),
      monto_iva: parseNum(data?.totales?.monto_iva),
      monto_igtf: parseNum(data?.totales?.monto_igtf),
      total_general: parseNum(data?.totales?.total_general),
    },
    items: sanitizedItems,
    metodo_pago: data?.metodo_pago || null,
  };
}

/**
 * Obtiene la API Key de Gemini desde variables de entorno de Vite o Node
 */
export function getGeminiApiKey(customApiKey?: string): string | undefined {
  if (customApiKey) return customApiKey;

  if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
    const viteKey =
      (import.meta as any).env.VITE_GOOGLE_AI_API_KEY ||
      (import.meta as any).env.VITE_GEMINI_API_KEY ||
      (import.meta as any).env.VITE_GOOGLE_API_KEY;
    if (viteKey) return viteKey;
  }

  if (typeof process !== 'undefined' && process.env) {
    return (
      process.env.GOOGLE_AI_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.VITE_GOOGLE_AI_API_KEY ||
      process.env.NEXT_PUBLIC_GOOGLE_AI_API_KEY
    );
  }

  return undefined;
}

/**
 * Fallback de modelos si no se puede consultar la lista
 */
const DEFAULT_CANDIDATE_MODELS = [
  'gemini-flash-latest',
  'gemini-flash-lite-latest',
  'gemini-2.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.7-flash',
  'gemini-pro-latest',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
];

/**
 * Consulta y prioriza todos los modelos disponibles para la API Key
 */
async function getAvailableModelsForApiKey(apiKey: string): Promise<string[]> {
  try {
    const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (listRes.ok) {
      const listData = await listRes.json();
      const rawModels: Array<{ name: string; supportedGenerationMethods?: string[] }> = listData.models || [];

      // Filtrar modelos que soporten generateContent
      const validModels = rawModels
        .filter(m => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent'))
        .map(m => m.name.replace(/^models\//, ''));

      console.log('📋 [Gemini IA] Modelos con generateContent habilitado:', validModels);

      // Ordenar por prioridad óptima (modelos lite y flash rápidos con alta disponibilidad)
      const prioritized = validModels.sort((a, b) => {
        const getScore = (name: string) => {
          if (name === 'gemini-2.5-flash-lite') return 100;
          if (name === 'gemini-flash-lite-latest') return 95;
          if (name === 'gemini-3.5-flash') return 90;
          if (name === 'gemini-3.7-flash') return 85;
          if (name === 'gemini-flash-latest') return 80;
          if (name === 'gemini-pro-latest') return 75;
          if (name.includes('flash-lite')) return 70;
          if (name.includes('flash') && !name.includes('image') && !name.includes('tts') && !name.includes('transcribe')) return 60;
          if (name.includes('gemini') && !name.includes('image') && !name.includes('tts') && !name.includes('embedding')) return 40;
          return 0;
        };
        return getScore(b) - getScore(a);
      });

      if (prioritized.length > 0) {
        return prioritized;
      }
    } else {
      const err = await listRes.text();
      console.warn('⚠️ [Gemini IA] ModelService.ListModels no disponible:', err);
    }
  } catch (e) {
    console.warn('⚠️ [Gemini IA] Error consultando lista de modelos:', e);
  }
  return DEFAULT_CANDIDATE_MODELS;
}

/**
 * Invoca el modelo Gemini via REST API con fallback inteligente de modelos
 */
export async function callGeminiApi(ocrText: string, apiKey: string): Promise<string> {
  const modelsToTry = await getAvailableModelsForApiKey(apiKey);

  console.log(`🤖 [Gemini IA] Modelos a probar en orden de prioridad:`, modelsToTry.slice(0, 5));
  console.log('📝 [Gemini IA] Fragmento de texto enviado:', ocrText.slice(0, 300) + (ocrText.length > 300 ? '...' : ''));

  let lastError: any = null;

  for (const model of modelsToTry) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const payload = {
      system_instruction: {
        parts: [{ text: SYSTEM_PROMPT }]
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: `[INPUT DE DATOS]\nTexto extraído por OCR:\n${ocrText}` }]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        response_mime_type: 'application/json'
      }
    };

    try {
      console.log(`📡 [Gemini IA] Probando endpoint: v1beta/models/${model}...`);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.status === 404 || res.status === 503 || res.status === 429) {
        console.warn(`⚠️ [Gemini IA] Modelo "${model}" devolvió estado ${res.status}. Probando siguiente opción...`);
        continue;
      }

      if (!res.ok) {
        const errorBody = await res.text();
        console.error(`❌ [Gemini IA] Error HTTP ${res.status} con modelo ${model}:`, errorBody);
        lastError = new Error(`Google AI API Error [${res.status}] (${model}): ${errorBody}`);
        continue;
      }

      const jsonResponse = await res.json();
      const textOutput = jsonResponse?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!textOutput) {
        console.error(`❌ [Gemini IA] Respuesta vacía con modelo ${model}:`, jsonResponse);
        lastError = new Error(`Respuesta vacía del modelo ${model}`);
        continue;
      }

      console.log(`✅ [Gemini IA] ¡Petición exitosa usando el modelo: ${model}!`);
      console.log('✨ [Gemini IA] Respuesta cruda (JSON) recibida:');
      console.log(textOutput);

      return textOutput;
    } catch (networkErr: any) {
      console.warn(`⚠️ [Gemini IA] Fallo de red intentando ${model}:`, networkErr.message);
      lastError = networkErr;
    }
  }

  throw lastError || new Error('No se pudo conectar con ningún modelo Gemini compatible.');
}

/**
 * Estructura semánticamente el texto extraído por OCR usando Gemini 1.5 Flash
 */
export async function extractStructuredInvoiceFromOcrText(
  ocrText: string,
  customApiKey?: string
): Promise<InvoiceExtractionResult> {
  const startTime = Date.now();

  try {
    if (!ocrText || ocrText.trim().length < 15) {
      console.warn('⚠️ [Gemini IA] Texto OCR demasiado corto o vacío para enviar al modelo.');
      return {
        success: false,
        rawOcrText: ocrText,
        error: 'El texto OCR no contiene suficiente información legible.',
        executionTimeMs: Date.now() - startTime,
      };
    }

    const apiKey = getGeminiApiKey(customApiKey);
    console.log('🔑 [Gemini IA] Verificando API Key en entorno:', apiKey ? `✅ Detectada (${apiKey.substring(0, 7)}...${apiKey.substring(apiKey.length - 4)})` : '❌ NO DETECTADA');

    if (!apiKey) {
      console.warn('⚠️ [Gemini IA] VITE_GOOGLE_AI_API_KEY no encontrada en variables de entorno.');
      return {
        success: false,
        rawOcrText: ocrText,
        error: 'API Key de Google Gemini no configurada. Define VITE_GOOGLE_AI_API_KEY en tu archivo .env',
        executionTimeMs: Date.now() - startTime,
      };
    }

    const responseText = await callGeminiApi(ocrText, apiKey);
    const cleanedJson = sanitizeJsonString(responseText);
    const parsedData = JSON.parse(cleanedJson);
    const sanitizedInvoice = sanitizeParsedInvoice(parsedData);

    console.log('📊 [Gemini IA] Factura parseada y estructurada con éxito:', sanitizedInvoice);

    return {
      success: true,
      data: sanitizedInvoice,
      rawOcrText: ocrText,
      executionTimeMs: Date.now() - startTime,
    };
  } catch (error: any) {
    console.error('❌ [Gemini IA] Error durante la extracción semántica:', error);
    return {
      success: false,
      rawOcrText: ocrText,
      error: error.message || 'Error durante la estructuración semántica con Gemini.',
      executionTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Función Principal de Extracción de Facturas en Dos Pasos (OCR + Gemini LLM)
 *
 * @param imageInput Buffer, File, Blob, DataURL o URL de la imagen
 * @param customApiKey Opcional: Clave de Google AI Studio (si no se especifica en process.env o import.meta.env)
 * @returns InvoiceExtractionResult con los datos normalizados y listos para DB
 */
export async function processInvoiceImage(
  imageInput: any,
  customApiKey?: string
): Promise<InvoiceExtractionResult> {
  const startTime = Date.now();

  try {
    // ----------------------------------------------------
    // PASO A: Extracción de texto crudo con Tesseract OCR
    // ----------------------------------------------------
    const worker = await createWorker('spa');
    const ocrResult = await worker.recognize(imageInput);
    await worker.terminate();

    const rawText = ocrResult?.data?.text?.trim() || '';

    // Validación de texto mínimo
    if (!rawText || rawText.length < 15) {
      return {
        success: false,
        rawOcrText: rawText,
        error: 'El OCR no detectó suficiente texto legible en el documento. Verifica el contraste y resolución de la imagen.',
        executionTimeMs: Date.now() - startTime,
      };
    }

    // ----------------------------------------------------
    // PASO B & C: Estructuración y Normalización con Gemini
    // ----------------------------------------------------
    return await extractStructuredInvoiceFromOcrText(rawText, customApiKey);
  } catch (error: any) {
    console.error('[InvoiceExtractionService] Error:', error);
    return {
      success: false,
      error: error.message || 'Error inesperado durante el procesamiento de la factura.',
      executionTimeMs: Date.now() - startTime,
    };
  }
}
