import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface WebSearchResult {
  title: string;
  snippet: string;
  url: string;
}

interface RawWebSupplierItem {
  name?: string;
  rif?: string;
  city?: string;
  state?: string;
  phone?: string;
  phone_2?: string;
  whatsapp?: string;
  email?: string;
  website?: string;
  instagram?: string;
  summary?: string;
  products_detected?: string[] | string;
  sources?: string[];
}

export interface WebSupplierCandidate {
  id: string;
  name: string;
  rif: string;
  city?: string;
  state?: string;
  phone?: string;
  phone_2?: string;
  whatsapp?: string;
  email?: string;
  website?: string;
  instagram?: string;
  summary: string;
  products_detected: string[];
  source_urls: Array<{ title: string; url: string }>;
  ai_provider: string;
}

export interface StepLogItem {
  step: string;
  timestamp: string;
  status: 'ok' | 'warn' | 'error' | 'info';
  message?: string;
  durationMs?: number;
}

export interface SearchExecutionTelemetry {
  startTime: string;
  totalDurationMs: number;
  searchDurationMs: number;
  aiDurationMs: number;
  queriesExecuted: string[];
  snippetsFound: number;
  snippets: WebSearchResult[];
  selectedProvider: string;
  modelUsed: string;
  keyPoolStats: {
    geminiKeysCount: number;
    hasGroqKey: boolean;
    hasOpenRouterKey: boolean;
    hasSerperKey: boolean;
  };
  stepsLog: StepLogItem[];
  rawAiResponseSnippet?: string;
}

// Modelos oficiales y verificados de Google AI Studio v1beta
const GEMINI_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
  'gemini-flash-lite-latest',
  'gemini-flash-latest',
  'gemini-3.7-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-pro-latest',
];

// Modelos OpenRouter (DeepSeek y Llama con enrutamiento de hardware a Groq/Cerebras)
const OPENROUTER_MODELS = [
  'deepseek/deepseek-chat',
  'meta-llama/llama-3.3-70b-instruct',
  'deepseek/deepseek-r1:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'openrouter/free',
];

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 6000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return response;
  } catch (error) {
    clearTimeout(timer);
    throw error;
  }
}

function cleanSecret(val?: string | null): string | undefined {
  if (!val) return undefined;
  const cleaned = val.trim().replace(/^["']|["']$/g, '');
  return cleaned.length > 0 ? cleaned : undefined;
}

function getSerperApiKey(customKey?: string): string | undefined {
  const custom = cleanSecret(customKey);
  if (custom) return custom;

  try {
    const envObj = Deno.env.toObject();
    for (const [key, value] of Object.entries(envObj)) {
      if (key.toUpperCase().includes('SERPER')) {
        const cleaned = cleanSecret(value);
        if (cleaned) return cleaned;
      }
    }
  } catch {
    // fallback
  }

  return (
    cleanSecret(Deno.env.get('SERPER_API_KEY')) ||
    cleanSecret(Deno.env.get('VITE_SERPER_API_KEY')) ||
    cleanSecret(Deno.env.get('SERPER_KEY')) ||
    cleanSecret(Deno.env.get('SERPER_API')) ||
    cleanSecret(Deno.env.get('SERPERDEV_API_KEY'))
  );
}

function getAllGeminiApiKeys(customApiKey?: string): string[] {
  const keys: string[] = [];
  const addKey = (raw?: string | null) => {
    if (!raw) return;
    // Permite separar por comas, saltos de línea, punto y coma o espacios múltiples
    raw.split(/[,\s;\n]+/).forEach((k) => {
      const trimmed = cleanSecret(k);
      if (trimmed && trimmed.length > 10 && !keys.includes(trimmed)) {
        keys.push(trimmed);
      }
    });
  };

  addKey(customApiKey);

  try {
    const envObj = Deno.env.toObject();
    for (const [key, value] of Object.entries(envObj)) {
      const uKey = key.toUpperCase();
      if (
        uKey.includes('GEMINI') ||
        uKey.includes('GOOGLE_AI') ||
        uKey.includes('GOOGLE_API')
      ) {
        addKey(value);
      }
    }
  } catch {
    addKey(Deno.env.get('GOOGLE_AI_API_KEY'));
    addKey(Deno.env.get('GOOGLE_AI_API_KEY_1'));
    addKey(Deno.env.get('GOOGLE_AI_API_KEY_2'));
    addKey(Deno.env.get('GOOGLE_AI_API_KEY_3'));
    addKey(Deno.env.get('VITE_GOOGLE_AI_API_KEY'));
    addKey(Deno.env.get('GEMINI_API_KEY'));
  }

  return keys;
}


function getOpenRouterApiKey(customKey?: string): string | undefined {
  const custom = cleanSecret(customKey);
  if (custom) return custom;

  try {
    const envObj = Deno.env.toObject();
    for (const [key, value] of Object.entries(envObj)) {
      if (key.toUpperCase().includes('OPENROUTER')) {
        const cleaned = cleanSecret(value);
        if (cleaned) return cleaned;
      }
    }
  } catch {
    // fallback
  }

  return (
    cleanSecret(Deno.env.get('OPENROUTER_API_KEY')) ||
    cleanSecret(Deno.env.get('VITE_OPENROUTER_API_KEY'))
  );
}

async function fetchRealWebResults(
  searchTerm: string,
  region: string,
  customSerperKey?: string,
  stepsLog: StepLogItem[] = [],
  queriesExecuted: string[] = []
): Promise<WebSearchResult[]> {
  const serperKey = getSerperApiKey(customSerperKey);
  const cleanSearchTerm = searchTerm.replace(/["']/g, '').trim();
  const results: WebSearchResult[] = [];

  if (serperKey) {
    const queries = [
      `${cleanSearchTerm} proveedores distribuidores venezuela`,
      `${cleanSearchTerm} empresas venezuela`,
      `${cleanSearchTerm} venta venezuela`,
    ];

    stepsLog.push({
      step: 'Serper Crawler',
      timestamp: new Date().toISOString(),
      status: 'info',
      message: `Iniciando rastreo Google Venezuela con Serper API (${queries.length} variantes)`,
    });

    for (const query of queries) {
      queriesExecuted.push(query);
      const queryStart = Date.now();
      try {
        const serperRes = await fetchWithTimeout('https://google.serper.dev/search', {
          method: 'POST',
          headers: {
            'X-API-KEY': serperKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            q: query,
            gl: 've',
            hl: 'es',
            num: 10,
          }),
        }, 5000);

        const durationMs = Date.now() - queryStart;

        if (serperRes.ok) {
          const serperData = await serperRes.json();
          let count = 0;
          if (Array.isArray(serperData.organic)) {
            for (const item of serperData.organic) {
              if (item.link && !results.some((r) => r.url === item.link)) {
                results.push({
                  title: item.title || 'Resultado Google',
                  snippet: item.snippet || '',
                  url: item.link || '',
                });
                count++;
              }
            }
          }
          stepsLog.push({
            step: 'Serper Query OK',
            timestamp: new Date().toISOString(),
            status: 'ok',
            message: `"${query}" -> ${count} resultados orgánicos nuevos (${durationMs}ms)`,
            durationMs,
          });
        } else {
          const errStatus = serperRes.status;
          stepsLog.push({
            step: 'Serper Query Status',
            timestamp: new Date().toISOString(),
            status: 'warn',
            message: `Status ${errStatus} para "${query}" (${durationMs}ms)`,
            durationMs,
          });
        }

        if (results.length >= 6) break;
      } catch (serperErr) {
        const durationMs = Date.now() - queryStart;
        stepsLog.push({
          step: 'Serper Error',
          timestamp: new Date().toISOString(),
          status: 'warn',
          message: `Error consultando Serper: ${serperErr instanceof Error ? serperErr.message : String(serperErr)}`,
          durationMs,
        });
      }
    }
  } else {
    stepsLog.push({
      step: 'Serper Skip',
      timestamp: new Date().toISOString(),
      status: 'info',
      message: 'No hay SERPER_API_KEY configurada. Se utilizará síntesis con conocimiento industrial de IA.',
    });
  }

  return results;
}

function buildSupplierExtractionPrompt(
  searchTerm: string,
  region: string,
  liveWebSnippets: WebSearchResult[]
): string {
  const hasSnippets = liveWebSnippets.length > 0;

  if (hasSnippets) {
    const webSnippetsText = liveWebSnippets
      .map((s, i) => `[RESULTADO ${i + 1}]\nTítulo: ${s.title}\nURL: ${s.url}\nContenido: ${s.snippet}`)
      .join('\n\n');

    return `Eres un experto asistente de abastecimiento y compras para Procarni en Venezuela.
Tu objetivo es analizar los siguientes RESULTADOS DE BÚSQUEDA WEB REALES y extraer todas las empresas, comercializadoras, distribuidoras, fábricas o tiendas B2B en Venezuela que suministren o puedan suministrar "${searchTerm}".

UBICACIÓN PREFERENTE: ${region} (Venezuela).

RESULTADOS DE BÚSQUEDA WEB:
${webSnippetsText}

INSTRUCCIONES:
1. Extrae cada empresa o distribuidor en Venezuela mencionado o relacionado con "${searchTerm}".
2. Identifica el nombre comercial de la empresa.
3. Ubicación: Identifica la ciudad y estado en Venezuela (ej. Maracay/Aragua, Valencia/Carabobo, Caracas/Miranda, Barquisimeto/Lara, etc.). Si no se detalla ciudad, coloca "Venezuela".
4. Contactos: Extrae RIF, teléfonos (0241, 0243, 0212, 0414, 0424, 0412, etc.), WhatsApp, correos, página web o Instagram si aparecen explícitamente o infiérelos del texto. Si no aparecen, coloca null.
5. Si los resultados web contienen pocos proveedores directos, complementa con empresas y distribuidoras reconocidas del sector comercial e industrial en Venezuela que suministren "${searchTerm}".

FORMATO DE SALIDA (ÚNICAMENTE ARRAY JSON VÁLIDO, SIN TEXTO ADICIONAL):
[
  {
    "name": "Nombre de la empresa o distribuidora",
    "rif": "RIF si aparece o null",
    "city": "Ciudad (ej: Valencia, Maracay)",
    "state": "Estado (ej: Carabobo, Aragua)",
    "phone": "Teléfono principal o null",
    "phone_2": "Teléfono secundario o null",
    "whatsapp": "WhatsApp o null",
    "email": "Correo o null",
    "website": "URL web si aparece o null",
    "instagram": "Instagram si aparece o null",
    "summary": "Resumen de lo que ofrece",
    "products_detected": ["producto 1", "producto 2"],
    "sources": ["URL de la fuente"]
  }
]`;
  }

  return `Eres un director de compras y abastecimiento industrial con amplio conocimiento del mercado comercial y empresarial en Venezuela (sector de alimentos, cárnicos, químicos, aditivos, empaques, repuestos, suministros industriales en ${region}).

El usuario necesita encontrar proveedores, comercializadoras, importadoras o distribuidores en Venezuela para el material/rubro: "${searchTerm}".

TAREA:
Genera una lista de 4 a 8 empresas y distribuidores reales o representativos del sector comercial/industrial en Venezuela (con énfasis en ${region}) que comercialicen, importen, fabriquen o distribuyan "${searchTerm}" o su categoría de productos asociada.

INSTRUCCIONES:
1. Incluye empresas y distribuidoras comerciales reales que operen en Venezuela (ej. en Maracay, Valencia, Caracas, Barquisimeto, etc.).
2. Identifica su nombre comercial, ciudad/estado probable en Venezuela, teléfonos de contacto estándar venezolanos si los conoces o null, y productos asociados.
3. En el campo "summary", explica brevemente por qué es un proveedor relevante para "${searchTerm}".
4. En "sources", coloca un enlace de referencia o dominio comercial.

FORMATO DE SALIDA (ÚNICAMENTE ARRAY JSON VÁLIDO, SIN TEXTO ADICIONAL):
[
  {
    "name": "Nombre de la empresa o distribuidora",
    "rif": "RIF si lo conoces o null",
    "city": "Ciudad (ej: Valencia, Maracay)",
    "state": "Estado (ej: Carabobo, Aragua)",
    "phone": "Teléfono o null",
    "phone_2": "Teléfono secundario o null",
    "whatsapp": "WhatsApp o null",
    "email": "Correo o null",
    "website": "URL web o null",
    "instagram": "Instagram o null",
    "summary": "Resumen comercial",
    "products_detected": ["producto 1", "producto 2"],
    "sources": ["https://www.google.com/search?q=${encodeURIComponent(searchTerm + ' proveedores venezuela')}"]
  }
]`;
}

async function callGeminiAi(
  fullPrompt: string,
  apiKeys: string[],
  stepsLog: StepLogItem[] = []
): Promise<{ text: string; model: string }> {
  if (apiKeys.length === 0) throw new Error('No hay claves de Google Gemini disponibles.');

  const invalidKeys = new Set<string>();
  let lastError: Error | null = null;

  for (const model of GEMINI_MODELS) {
    let modelNotFound = false;

    for (let kIdx = 0; kIdx < apiKeys.length; kIdx++) {
      const apiKey = apiKeys[kIdx];
      if (invalidKeys.has(apiKey)) continue;

      const maskedKey = apiKey.length > 8 ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : '***';
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const payload = {
        contents: [{ parts: [{ text: fullPrompt }] }],
        generationConfig: { temperature: 0.2 },
      };

      const modelStart = Date.now();
      try {
        const response = await fetchWithTimeout(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify(payload),
        }, 6000);

        const durationMs = Date.now() - modelStart;

        if (!response.ok) {
          const errText = await response.text();
          let parsedErrMsg = errText;
          try {
            const errObj = JSON.parse(errText);
            if (errObj.error?.message) {
              parsedErrMsg = `${errObj.error.message} (${errObj.error.status || response.status})`;
            }
          } catch {
            // raw
          }

          lastError = new Error(`Google Gemini [${response.status} - ${model}]: ${parsedErrMsg}`);
          stepsLog.push({
            step: 'Gemini Attempt',
            timestamp: new Date().toISOString(),
            status: 'warn',
            message: `Key ${kIdx + 1}/${apiKeys.length} (${maskedKey}) en ${model} -> [Status ${response.status}]: ${parsedErrMsg.slice(0, 160)}`,
            durationMs,
          });

          // Si la clave es inválida (400 API_KEY_INVALID o 403), descartar esta clave para los siguientes modelos
          if (response.status === 400 || response.status === 403 || parsedErrMsg.includes('API_KEY_INVALID')) {
            invalidKeys.add(apiKey);
          }

          if (response.status === 404) {
            modelNotFound = true;
            break;
          }
          continue;
        }

        const jsonResponse = await response.json();
        const textOutput = jsonResponse.candidates?.[0]?.content?.parts?.[0]?.text;
        if (textOutput) {
          stepsLog.push({
            step: 'Gemini Success',
            timestamp: new Date().toISOString(),
            status: 'ok',
            message: `Respuesta exitosa de ${model} con Key ${kIdx + 1}/${apiKeys.length} (${maskedKey}) en ${durationMs}ms`,
            durationMs,
          });
          return { text: textOutput, model: `Google Gemini (${model})` };
        }
      } catch (err: unknown) {
        const durationMs = Date.now() - modelStart;
        const msg = err instanceof Error ? err.message : String(err);
        lastError = err instanceof Error ? err : new Error(msg);
        stepsLog.push({
          step: 'Gemini Error',
          timestamp: new Date().toISOString(),
          status: 'warn',
          message: `Error en ${model} (Key ${kIdx + 1}): ${msg}`,
          durationMs,
        });
      }
    }

    if (modelNotFound) continue;
  }
  throw lastError || new Error('No se pudo obtener respuesta de Google Gemini.');
}

async function callOpenRouterAi(
  fullPrompt: string,
  apiKey: string,
  stepsLog: StepLogItem[] = []
): Promise<{ text: string; model: string }> {
  let lastError: Error | null = null;
  for (const model of OPENROUTER_MODELS) {
    const modelStart = Date.now();
    try {
      const response = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://procarni.com',
          'X-Title': 'Procarni Procurement System',
        },
        body: JSON.stringify({
          model,
          provider: {
            order: ['Groq', 'Cerebras', 'DeepInfra', 'Together'],
            allow_fallbacks: true,
          },
          messages: [{ role: 'user', content: fullPrompt }],
          temperature: 0.2,
        }),
      }, 7000);

      const durationMs = Date.now() - modelStart;

      if (!response.ok) {
        const errText = await response.text();
        lastError = new Error(`OpenRouter [${response.status} - ${model}]: ${errText}`);
        stepsLog.push({
          step: 'OpenRouter Attempt',
          timestamp: new Date().toISOString(),
          status: 'warn',
          message: `OpenRouter ${model} status ${response.status}: ${errText.slice(0, 100)}...`,
          durationMs,
        });
        continue;
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content;
      const routedModel = data.model ? data.model.replace(':free', '') : model;
      if (text) {
        stepsLog.push({
          step: 'OpenRouter Success',
          timestamp: new Date().toISOString(),
          status: 'ok',
          message: `Respuesta exitosa de OpenRouter (${routedModel}) en ${durationMs}ms`,
          durationMs,
        });
        return { text, model: `OpenRouter (${routedModel})` };
      }
    } catch (err: unknown) {
      const durationMs = Date.now() - modelStart;
      const msg = err instanceof Error ? err.message : String(err);
      lastError = err instanceof Error ? err : new Error(msg);
      stepsLog.push({
        step: 'OpenRouter Error',
        timestamp: new Date().toISOString(),
        status: 'warn',
        message: `Error en OpenRouter ${model}: ${msg}`,
        durationMs,
      });
    }
  }
  throw lastError || new Error('No se pudo obtener respuesta de OpenRouter.');
}

const VENEZUELAN_KEYWORDS = [
  'venezuela', 'aragua', 'maracay', 'cagua', 'turmero', 'victoria', 'villa de cura', 'palo negro',
  'carabobo', 'valencia', 'guacara', 'san diego', 'puerto cabello', 'los guayos', 'naguanagua',
  'caracas', 'miranda', 'distrito capital', 'guarenas', 'guatire', 'los teques', 'petare', 'chacao', 'baruta',
  'lara', 'barquisimeto', 'cabudare', 'carora',
  'zulia', 'maracaibo', 'san francisco', 'cabimas',
  'anzoategui', 'anzoátegui', 'barcelona', 'puerto la cruz', 'lecheria', 'lechería',
  'monagas', 'maturin', 'maturín', 'bolivar', 'bolívar', 'guayana', 'pto ordaz', 'puerto ordaz'
];

const FORBIDDEN_FOREIGN_LOCATIONS = [
  'colombia', 'bogota', 'bogotá', 'medellin', 'medellín', 'cali', 'barranquilla',
  'mexico', 'méxico', 'cdmx', 'guadalajara', 'monterrey',
  'españa', 'madrid', 'barcelona, españa', 'valencia, españa',
  'argentina', 'buenos aires', 'peru', 'perú', 'lima', 'chile', 'santiago de chile',
  'ecuador', 'quito', 'guayaquil'
];

function isForeignCompany(item: RawWebSupplierItem): boolean {
  const city = (item.city || '').toLowerCase();
  const state = (item.state || '').toLowerCase();
  const name = (item.name || '').toLowerCase();
  const summary = (item.summary || '').toLowerCase();
  const combined = `${name} ${city} ${state} ${summary}`;

  if (VENEZUELAN_KEYWORDS.some((loc) => city.includes(loc) || state.includes(loc) || combined.includes(loc))) {
    return false;
  }

  const phone = (item.phone || item.phone_2 || item.whatsapp || '').replace(/[\s\-\(\)]/g, '');
  if (phone.startsWith('+58') || phone.startsWith('58') || phone.startsWith('04') || phone.startsWith('02')) {
    return false;
  }

  if (
    phone.startsWith('+57') || phone.startsWith('57') ||
    phone.startsWith('+52') || phone.startsWith('52') ||
    phone.startsWith('+34') || phone.startsWith('34') ||
    phone.startsWith('+54') || phone.startsWith('+51') || phone.startsWith('+56') || phone.startsWith('+593')
  ) {
    return true;
  }

  for (const foreignKw of FORBIDDEN_FOREIGN_LOCATIONS) {
    if (city.includes(foreignKw) || state.includes(foreignKw)) {
      return true;
    }
  }

  return false;
}

function inferVenezuelanState(city?: string, currentState?: string): string | undefined {
  if (!city) return currentState || 'Venezuela';
  const c = city.toLowerCase();
  if (c.includes('maracay') || c.includes('cagua') || c.includes('turmero') || c.includes('victoria') || c.includes('villa de cura') || c.includes('palo negro')) {
    return 'Aragua';
  }
  if (c.includes('valencia') || c.includes('guacara') || c.includes('san diego') || c.includes('puerto cabello') || c.includes('los guayos') || c.includes('naguanagua')) {
    return 'Carabobo';
  }
  if (c.includes('caracas') || c.includes('guarenas') || c.includes('guatire') || c.includes('los teques') || c.includes('petare') || c.includes('chacao') || c.includes('baruta')) {
    return 'Distrito Capital / Miranda';
  }
  if (c.includes('barquisimeto') || c.includes('cabudare') || c.includes('carora')) {
    return 'Lara';
  }
  if (c.includes('maracaibo') || c.includes('san francisco') || c.includes('cabimas')) {
    return 'Zulia';
  }
  if (c.includes('barcelona') || c.includes('puerto la cruz') || c.includes('lecheria') || c.includes('maturin')) {
    return 'Anzoátegui / Monagas';
  }
  return currentState || 'Venezuela';
}

function parseSuppliersJson(rawText: string): RawWebSupplierItem[] {
  let cleaned = rawText.trim();
  const jsonBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
  const match = jsonBlockRegex.exec(cleaned);
  if (match && match[1]) {
    cleaned = match[1].trim();
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed as RawWebSupplierItem[];
    if (typeof parsed === 'object' && parsed !== null) {
      for (const val of Object.values(parsed)) {
        if (Array.isArray(val) && val.length > 0) {
          return val as RawWebSupplierItem[];
        }
      }
      return [parsed as RawWebSupplierItem];
    }
  } catch {
    const firstBracket = cleaned.indexOf('[');
    const lastBracket = cleaned.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      const slice = cleaned.substring(firstBracket, lastBracket + 1);
      try {
        const subParsed = JSON.parse(slice);
        if (Array.isArray(subParsed)) return subParsed as RawWebSupplierItem[];
      } catch {
        // ignore
      }
    }
  }
  return [];
}

function cleanField(val?: string | null): string | undefined {
  if (!val) return undefined;
  const t = String(val).trim();
  if (!t || t.toLowerCase() === 'null' || t.toLowerCase() === 'undefined' || t === 'SR' || t === 'S/R') return undefined;
  return t;
}

function cleanRif(val?: string | null): string {
  if (!val) return 'SR';
  const t = String(val).trim();
  if (!t || t.toLowerCase() === 'null' || t.toLowerCase() === 'undefined' || t.toLowerCase() === 'sr' || t.toLowerCase() === 's/r') return 'SR';
  return t;
}

function processAiOutput(
  textOutput: string,
  liveWebSnippets: WebSearchResult[],
  searchTerm = '',
  modelUsed = ''
): WebSupplierCandidate[] {
  const parsedItems = parseSuppliersJson(textOutput);
  const venezuelanItems = parsedItems.filter((item) => !isForeignCompany(item));

  return venezuelanItems.map((item, index) => {
    const id = `web-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 7)}`;
    const cleanProducts: string[] = Array.isArray(item.products_detected)
      ? item.products_detected.filter((p): p is string => typeof p === 'string' && p.trim().toLowerCase() !== 'null')
      : typeof item.products_detected === 'string' && item.products_detected.trim().toLowerCase() !== 'null'
        ? (item.products_detected as string).split(',').map((p) => p.trim()).filter((p) => p.length > 0)
        : [];

    const allSourcesMap = new Map<string, { title: string; url: string }>();

    if (Array.isArray(item.sources)) {
      for (const s of item.sources) {
        if (s && typeof s === 'string' && s.startsWith('http')) {
          let title = 'Sitio Web del Proveedor';
          try {
            title = new URL(s).hostname.replace('www.', '');
          } catch {
            // ignore
          }
          allSourcesMap.set(s, { title, url: s });
        }
      }
    }

    for (const snippet of liveWebSnippets) {
      if (snippet.url && !allSourcesMap.has(snippet.url)) {
        allSourcesMap.set(snippet.url, { title: snippet.title, url: snippet.url });
      }
    }

    const city = cleanField(item.city);
    const state = inferVenezuelanState(city, cleanField(item.state));
    const phone = cleanField(item.phone);
    const phone2 = cleanField(item.phone_2);
    const whatsapp = cleanField(item.whatsapp) || phone;
    const email = cleanField(item.email);
    const website = cleanField(item.website);
    const instagram = cleanField(item.instagram);

    return {
      id,
      name: (item.name || 'Proveedor').trim(),
      rif: cleanRif(item.rif),
      city,
      state,
      phone,
      phone_2: phone2,
      whatsapp,
      email,
      website,
      instagram,
      summary: cleanField(item.summary) || `Distribuidor comercial en ${city || 'Venezuela'} para ${searchTerm}.`,
      products_detected: cleanProducts.length > 0 ? cleanProducts : [searchTerm],
      source_urls: Array.from(allSourcesMap.values()).slice(0, 3),
      ai_provider: modelUsed,
    };
  });
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders, status: 200 });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 405,
    });
  }

  const startTime = Date.now();
  const stepsLog: StepLogItem[] = [];
  const queriesExecuted: string[] = [];

  try {
    const body = await req.json().catch(() => ({}));
    const {
      searchTerm,
      category,
      region = 'Eje Central (Aragua, Carabobo, Caracas, Lara)',
      provider = 'auto',
      customApiKey,
      customGeminiKey,
      customGroqKey,
      customOpenRouterKey,
      customSerperKey,
    } = body;

    const selectedProvider = (provider || 'auto').toLowerCase();

    stepsLog.push({
      step: 'Request Inbound',
      timestamp: new Date().toISOString(),
      status: 'info',
      message: `Búsqueda iniciada para: "${searchTerm}" | Región: "${region}" | Proveedor prioritario: "${selectedProvider}"`,
    });

    if (!searchTerm || typeof searchTerm !== 'string' || !searchTerm.trim()) {
      return new Response(JSON.stringify({ error: 'searchTerm es requerido.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // 1. Rastreo web en vivo
    const searchStart = Date.now();
    const liveWebSnippets = await fetchRealWebResults(
      searchTerm,
      region,
      customSerperKey || customApiKey,
      stepsLog,
      queriesExecuted
    );
    const searchDurationMs = Date.now() - searchStart;

    const fullStrictPrompt = buildSupplierExtractionPrompt(searchTerm, region, liveWebSnippets);

    // 2. Extracción de claves (Priorizando claves personalizadas pasadas por el cliente)
    const geminiKeys = getAllGeminiApiKeys(customGeminiKey || customApiKey);
    const openRouterKey = getOpenRouterApiKey(customOpenRouterKey || customApiKey);
    const serperKey = getSerperApiKey(customSerperKey || customApiKey);

    const keyPoolStats = {
      geminiKeysCount: geminiKeys.length,
      hasOpenRouterKey: Boolean(openRouterKey),
      hasSerperKey: Boolean(serperKey),
    };

    stepsLog.push({
      step: 'Key Pool Inspection',
      timestamp: new Date().toISOString(),
      status: 'info',
      message: `Claves disponibles: Gemini (${geminiKeys.length} claves en pool${customGeminiKey ? ' [Personalizada activa]' : ''}), OpenRouter (${keyPoolStats.hasOpenRouterKey ? (customOpenRouterKey ? 'Personalizada' : 'Pool Servidor') : 'No'}), Serper (${keyPoolStats.hasSerperKey ? 'Activa' : 'No'})`,
    });

    let rawOutput: { text: string; model: string } | null = null;
    const errorsAcc: string[] = [];

    const aiStart = Date.now();

    // 3. Definición del orden de ejecución estricto según la selección del usuario
    const providersToTry: Array<'gemini' | 'openrouter'> = [];
    if (selectedProvider === 'openrouter') {
      providersToTry.push('openrouter', 'gemini');
    } else {
      // 'auto' o 'gemini': Gemini -> OpenRouter
      providersToTry.push('gemini', 'openrouter');
    }

    // 4. Ejecución en cascada con prioridad estricta
    for (const p of providersToTry) {
      if (rawOutput) break;

      if (p === 'gemini') {
        if (geminiKeys.length > 0) {
          try {
            rawOutput = await callGeminiAi(fullStrictPrompt, geminiKeys, stepsLog);
          } catch (err) {
            errorsAcc.push(`Gemini: ${err instanceof Error ? err.message : String(err)}`);
          }
        } else {
          stepsLog.push({
            step: 'Gemini Skip',
            timestamp: new Date().toISOString(),
            status: 'info',
            message: 'Sin claves de Google Gemini configuradas para este intento.',
          });
        }
      } else if (p === 'openrouter') {
        if (openRouterKey) {
          try {
            rawOutput = await callOpenRouterAi(fullStrictPrompt, openRouterKey, stepsLog);
          } catch (err) {
            errorsAcc.push(`OpenRouter: ${err instanceof Error ? err.message : String(err)}`);
          }
        } else {
          stepsLog.push({
            step: 'OpenRouter Skip',
            timestamp: new Date().toISOString(),
            status: 'info',
            message: 'Sin clave de OpenRouter configurada para este intento.',
          });
        }
      }
    }

    if (!rawOutput) {
      if (geminiKeys.length === 0 && !openRouterKey) {
        return new Response(JSON.stringify({
          error: 'No se encontraron claves de IA disponibles. Configura GOOGLE_AI_API_KEY u OPENROUTER_API_KEY en Supabase o en el modal.',
          stepsLog,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }
      return new Response(JSON.stringify({
        error: `Error en los motores de IA probados: ${errorsAcc.join(' | ')}`,
        stepsLog,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    const aiDurationMs = Date.now() - aiStart;
    const totalDurationMs = Date.now() - startTime;

    const candidates = processAiOutput(rawOutput.text, liveWebSnippets, searchTerm, rawOutput.model);

    const telemetry: SearchExecutionTelemetry = {
      startTime: new Date(startTime).toISOString(),
      totalDurationMs,
      searchDurationMs,
      aiDurationMs,
      queriesExecuted,
      snippetsFound: liveWebSnippets.length,
      snippets: liveWebSnippets,
      selectedProvider,
      modelUsed: rawOutput.model,
      keyPoolStats,
      stepsLog,
      rawAiResponseSnippet: rawOutput.text.slice(0, 300) + '...',
    };

    return new Response(JSON.stringify({ candidates, model: rawOutput.model, telemetry }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: unknown) {
    console.error('❌ [EdgeFunction Error]:', error);
    const msg = error instanceof Error ? error.message : 'Error en la búsqueda asistida.';
    return new Response(JSON.stringify({ error: msg, stepsLog }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
