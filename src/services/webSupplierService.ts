import { getGeminiApiKey } from '@/services/invoiceExtractionService';
import { supabase } from '@/integrations/supabase/client';

export type AiProviderType = 'auto' | 'gemini' | 'groq' | 'openrouter';

export interface WebSupplierCandidate {
  id: string;
  name: string;
  rif?: string;
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
  ai_provider?: string;
}

export interface SearchWebSuppliersParams {
  searchTerm: string;
  category?: string;
  region?: string;
  provider?: AiProviderType;
  customApiKey?: string;
}

interface GeminiCandidate {
  content?: {
    parts?: Array<{ text?: string }>;
  };
}

interface GeminiApiResponse {
  candidates?: GeminiCandidate[];
  error?: {
    message?: string;
    code?: number;
    status?: string;
  };
}

interface OpenAiChoice {
  message?: {
    content?: string;
  };
}

interface OpenAiApiResponse {
  id?: string;
  model?: string;
  choices?: OpenAiChoice[];
  error?: {
    message?: string;
    code?: string | number;
    type?: string;
  };
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

interface WebSearchResult {
  title: string;
  snippet: string;
  url: string;
}

function buildStrictExtractionPrompt(
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

  return `Eres un director de compras y abastecimiento industrial con amplio conocimiento del mercado comercial y empresarial en Venezuela (sector de alimentos, cárnicos, químicos, aditivos, empaques, suministros industriales en ${region}).

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

const GEMINI_FREE_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.7-flash',
  'gemini-flash-latest',
  'gemini-flash-lite-latest',
  'gemini-pro-latest',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
];

const GROQ_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'deepseek-r1-distill-llama-70b',
  'llama-3.2-11b-vision-preview',
  'llama-3.2-3b-preview',
  'llama-3.2-1b-preview',
];

const OPENROUTER_ACTIVE_MODELS = [
  'deepseek/deepseek-chat',
  'deepseek/deepseek-r1:free',
  'meta-llama/llama-3.3-70b-instruct',
  'meta-llama/llama-3.3-70b-instruct:free',
  'google/gemini-2.0-flash-exp:free',
  'openrouter/free',
];

// Helper con timeout seguro
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 8000): Promise<Response> {
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

// ==========================================
// GESTIÓN SEGURA DE CLAVES API (LOCALSTORAGE)
// ==========================================

export function saveCustomGeminiApiKey(key: string): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem('gemini_api_key', key.trim());
  }
}

export function getCustomGeminiApiKey(): string | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage.getItem('gemini_api_key');
  }
  return null;
}

export function getAllGeminiApiKeys(customApiKey?: string): string[] {
  const keys: string[] = [];

  const addKey = (raw?: string | null) => {
    if (!raw) return;
    raw.split(',').forEach((k) => {
      const trimmed = k.trim();
      if (trimmed && !keys.includes(trimmed)) {
        keys.push(trimmed);
      }
    });
  };

  addKey(customApiKey);

  if (typeof window !== 'undefined' && window.localStorage) {
    addKey(window.localStorage.getItem('gemini_api_key'));
    addKey(window.localStorage.getItem('GOOGLE_AI_API_KEY'));
  }

  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const env = import.meta.env as Record<string, string | undefined>;
    Object.keys(env).forEach((envVar) => {
      if (
        envVar.startsWith('VITE_GOOGLE_AI_API_KEY') ||
        envVar.startsWith('VITE_GEMINI_API_KEY') ||
        envVar.startsWith('VITE_GOOGLE_API_KEY')
      ) {
        addKey(env[envVar]);
      }
    });
  }

  return keys;
}

export function removeCustomGeminiApiKey(): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem('gemini_api_key');
    window.localStorage.removeItem('GOOGLE_AI_API_KEY');
  }
}

export function saveCustomGroqApiKey(key: string): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem('groq_api_key', key.trim());
  }
}

export function getCustomGroqApiKey(): string | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage.getItem('groq_api_key');
  }
  return null;
}

export function getGroqApiKey(customKey?: string): string | undefined {
  if (customKey && customKey.trim()) return customKey.trim();
  if (typeof window !== 'undefined' && window.localStorage) {
    const stored = window.localStorage.getItem('groq_api_key');
    if (stored && stored.trim()) return stored.trim();
  }
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const envKey = (import.meta.env as Record<string, string | undefined>).VITE_GROQ_API_KEY;
    if (envKey && envKey.trim()) return envKey.trim();
  }
  return undefined;
}

export function removeCustomGroqApiKey(): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem('groq_api_key');
  }
}

export function saveCustomOpenRouterApiKey(key: string): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem('openrouter_api_key', key.trim());
  }
}

export function getCustomOpenRouterApiKey(): string | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage.getItem('openrouter_api_key');
  }
  return null;
}

export function getOpenRouterApiKey(customKey?: string): string | undefined {
  if (customKey && customKey.trim()) return customKey.trim();
  if (typeof window !== 'undefined' && window.localStorage) {
    const stored = window.localStorage.getItem('openrouter_api_key');
    if (stored && stored.trim()) return stored.trim();
  }
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const envKey = (import.meta.env as Record<string, string | undefined>).VITE_OPENROUTER_API_KEY;
    if (envKey && envKey.trim()) return envKey.trim();
  }
  return undefined;
}

export function removeCustomOpenRouterApiKey(): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem('openrouter_api_key');
  }
}

export function saveCustomSerperApiKey(key: string): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem('serper_api_key', key.trim());
  }
}

export function getCustomSerperApiKey(): string | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage.getItem('serper_api_key');
  }
  return null;
}

export function getSerperApiKey(customKey?: string): string | undefined {
  if (customKey && customKey.trim()) return customKey.trim();
  if (typeof window !== 'undefined' && window.localStorage) {
    const stored = window.localStorage.getItem('serper_api_key');
    if (stored && stored.trim()) return stored.trim();
  }
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const envKey = (import.meta.env as Record<string, string | undefined>).VITE_SERPER_API_KEY;
    if (envKey && envKey.trim()) return envKey.trim();
  }
  return undefined;
}

export function removeCustomSerperApiKey(): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem('serper_api_key');
  }
}

export function saveCustomTavilyApiKey(key: string): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem('tavily_api_key', key.trim());
  }
}

export function getCustomTavilyApiKey(): string | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage.getItem('tavily_api_key');
  }
  return null;
}

export function removeCustomTavilyApiKey(): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem('tavily_api_key');
  }
}

export function saveAiProviderPreference(provider: AiProviderType): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem('ai_provider_preference', provider);
  }
}

export function getAiProviderPreference(): AiProviderType {
  if (typeof window !== 'undefined' && window.localStorage) {
    const stored = window.localStorage.getItem('ai_provider_preference') as AiProviderType | null;
    if (stored && ['auto', 'gemini', 'groq', 'openrouter'].includes(stored)) {
      return stored;
    }
  }
  return 'auto';
}

// ==========================================
// FASE 1: RASTREADOR WEB EN VIVO (VENEZUELA)
// ==========================================

function getRegionSearchKeywords(region: string): string {
  const r = (region || '').toLowerCase();
  if (r.includes('toda') || r.includes('nacional') || r.includes('todo el pais') || r.includes('general')) {
    return 'venezuela';
  }
  if (r.includes('aragua') && !r.includes('eje central')) {
    return '(maracay OR aragua OR cagua OR turmero)';
  }
  if (r.includes('carabobo')) {
    return '(valencia OR carabobo OR guacara OR "puerto cabello")';
  }
  if (r.includes('caracas') || r.includes('capital') || r.includes('miranda')) {
    return '(caracas OR "distrito capital" OR miranda)';
  }
  if (r.includes('lara') || r.includes('barquisimeto')) {
    return '(barquisimeto OR lara OR cabudare)';
  }
  if (r.includes('zulia') || r.includes('maracaibo')) {
    return '(maracaibo OR zulia)';
  }
  if (r.includes('oriente') || r.includes('anzoategui') || r.includes('monagas')) {
    return '(barcelona OR "puerto la cruz" OR anzoategui OR monagas)';
  }
  // Default: Eje Central venezolano (Maracay, Valencia, Caracas, Barquisimeto)
  return '(maracay OR valencia OR caracas OR barquisimeto OR aragua OR carabobo)';
}

async function fetchRealWebResults(searchTerm: string, region: string): Promise<WebSearchResult[]> {
  const serperKey = getSerperApiKey();
  const tavilyKey = getCustomTavilyApiKey();
  const cleanSearchTerm = searchTerm.replace(/["']/g, '').trim();
  const regionKw = getRegionSearchKeywords(region);

  // 1. Serper.dev: El Buscador de Verdad (Google Search Scraper en Venezuela)
  if (serperKey) {
    try {
      const googleQuery = regionKw === 'venezuela'
        ? `"${cleanSearchTerm}" proveedores distribuidores venezuela`
        : `"${cleanSearchTerm}" ${regionKw} venezuela`;

      console.log(`🌐 [LiveWebCrawler] Serper.dev Google Search (gl: 've', hl: 'es'): "${googleQuery}"...`);
      const serperRes = await fetchWithTimeout('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'X-API-KEY': serperKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          q: googleQuery,
          gl: 've',
          hl: 'es',
          num: 10,
        }),
      }, 7000);

      let serperData: { organic?: Array<{ title?: string; snippet?: string; link?: string }> } = {};
      if (serperRes.ok) {
        serperData = await serperRes.json();
      } else {
        const errText = await serperRes.text();
        console.warn(`⚠️ [LiveWebCrawler] Serper.dev respondió status ${serperRes.status}: ${errText}`);
      }

      // Si la búsqueda regional estricta no trajo suficientes resultados y no era ya nacional, hacer fallback rápido
      if ((!Array.isArray(serperData.organic) || serperData.organic.length === 0) && regionKw !== 'venezuela') {
        const broadQuery = `"${cleanSearchTerm}" proveedores distribuidores venezuela`;
        console.log(`🌐 [LiveWebCrawler] Serper.dev reintentando con consulta amplia en Venezuela: "${broadQuery}"...`);
        const fallbackRes = await fetchWithTimeout('https://google.serper.dev/search', {
          method: 'POST',
          headers: {
            'X-API-KEY': serperKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            q: broadQuery,
            gl: 've',
            hl: 'es',
            num: 10,
          }),
        }, 7000);
        if (fallbackRes.ok) {
          serperData = await fallbackRes.json();
        }
      }

      if (Array.isArray(serperData.organic) && serperData.organic.length > 0) {
        console.log(`✅ [LiveWebCrawler] Serper.dev obtuvo ${serperData.organic.length} resultados orgánicos de Google Venezuela.`);
        return serperData.organic.map((item: { title?: string; snippet?: string; link?: string }) => ({
          title: item.title || 'Resultado Google',
          snippet: item.snippet || '',
          url: item.link || '',
        }));
      }
    } catch (serperErr) {
      console.warn('⚠️ [LiveWebCrawler] Error consultando Serper.dev, usando fallbacks:', serperErr);
    }
  }

  // 2. Tavily Search Fallback
  if (tavilyKey) {
    try {
      const searchQueries = `"${cleanSearchTerm}" ${regionKw} proveedores distribuidores venezuela`;
      console.log(`🌐 [LiveWebCrawler] Ejecutando búsqueda web con Tavily (${regionKw})...`);
      const res = await fetchWithTimeout('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: tavilyKey,
          query: searchQueries,
          search_depth: 'basic',
          include_domains: ['ve', 'com.ve', 'instagram.com', 'mercadolibre.com.ve', 'paginasamarillas.com.ve', 'linkedin.com'],
          exclude_domains: ['co', 'com.co', 'mx', 'com.mx', 'es', 'com.ar', 'pe', 'com.pe', 'cl'],
          max_results: 8,
        }),
      }, 6000);

      if (res.ok) {
        const tavilyData = await res.json();
        if (Array.isArray(tavilyData.results) && tavilyData.results.length > 0) {
          return tavilyData.results.map((r: { title?: string; content?: string; url?: string }) => ({
            title: r.title || 'Resultado Web',
            snippet: r.content || '',
            url: r.url || '',
          }));
        }
      }
    } catch (tavErr) {
      console.warn('⚠️ [LiveWebCrawler] Tavily search falló, usando rastreo público:', tavErr);
    }
  }

  // 3. Rastreo público en vivo mediante motor DuckDuckGo / Directorios B2B abiertos
  try {
    const directDdgQuery = `${cleanSearchTerm} ${regionKw} venezuela`;
    console.log(`🌐 [LiveWebCrawler] Rastreador web público en vivo para: "${directDdgQuery}"...`);
    const ddgEndpoint = `https://api.duckduckgo.com/?q=${encodeURIComponent(directDdgQuery)}&format=json&no_html=1&skip_disambig=1`;
    const ddgRes = await fetchWithTimeout(ddgEndpoint, {}, 5000);
    const results: WebSearchResult[] = [];

    if (ddgRes.ok) {
      const ddgData = await ddgRes.json();
      if (ddgData.AbstractText && ddgData.AbstractURL) {
        results.push({
          title: ddgData.Heading || searchTerm,
          snippet: ddgData.AbstractText,
          url: ddgData.AbstractURL,
        });
      }
      if (Array.isArray(ddgData.RelatedTopics)) {
        for (const topic of ddgData.RelatedTopics.slice(0, 6)) {
          if (topic.Text && topic.FirstURL) {
            results.push({
              title: topic.Text.split(' - ')[0] || searchTerm,
              snippet: topic.Text,
              url: topic.FirstURL,
            });
          }
        }
      }
    }

    return results;
  } catch (crawlErr) {
    console.warn('⚠️ [LiveWebCrawler] Rastreador público completado:', crawlErr);
    return [];
  }
}

// ==========================================
// CONECTORES DE IA (GEMINI, GROQ, OPENROUTER)
// ==========================================

async function callGeminiAi(fullPrompt: string, apiKeys: string | string[]): Promise<{ text: string; model: string }> {
  const keysList = (Array.isArray(apiKeys) ? apiKeys : [apiKeys])
    .map((k) => k?.trim())
    .filter((k): k is string => Boolean(k && k.length > 0));

  if (keysList.length === 0) {
    throw new Error('No hay claves de Google Gemini disponibles.');
  }

  let lastError: Error | null = null;

  for (const model of GEMINI_FREE_MODELS) {
    for (let kIdx = 0; kIdx < keysList.length; kIdx++) {
      const apiKey = keysList[kIdx];
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const payload = {
        contents: [
          {
            role: 'user',
            parts: [{ text: fullPrompt }],
          },
        ],
        generationConfig: {
          temperature: 0.1,
        },
      };

      try {
        const keyLabel = keysList.length > 1 ? ` (Key ${kIdx + 1}/${keysList.length})` : '';
        console.log(`📡 [GeminiAI] Consultando modelo ${model}${keyLabel}...`);
        const response = await fetchWithTimeout(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }, 15000);

        if (!response.ok) {
          const errText = await response.text();
          console.warn(`⚠️ [GeminiAI] Modelo ${model}${keyLabel} respondió status ${response.status}: ${errText}. Probando siguiente...`);
          lastError = new Error(`Google Gemini [${response.status}]: ${errText}`);
          continue;
        }

        const jsonResponse: GeminiApiResponse = await response.json();
        const textOutput = jsonResponse.candidates?.[0]?.content?.parts?.[0]?.text;

        if (textOutput) {
          return { text: textOutput, model: `Google Gemini (${model})` };
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`⚠️ [GeminiAI] Error intentando modelo ${model}:`, msg);
        lastError = err instanceof Error ? err : new Error(msg);
      }
    }
  }

  throw lastError || new Error('No se pudo obtener respuesta de Google Gemini.');
}

async function callGroqAi(fullPrompt: string, apiKey: string): Promise<{ text: string; model: string }> {
  let lastError: Error | null = null;

  for (const model of GROQ_MODELS) {
    try {
      console.log(`📡 [GroqAI] Consultando modelo ${model}...`);
      const response = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'user', content: fullPrompt },
          ],
          temperature: 0.1,
        }),
      }, 7000);

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`⚠️ [GroqAI] Modelo ${model} respondió status ${response.status}: ${errText}. Probando siguiente...`);
        lastError = new Error(`Groq [${response.status}]: ${errText}`);
        continue;
      }

      const data: OpenAiApiResponse = await response.json();
      const text = data.choices?.[0]?.message?.content;
      if (text) {
        return { text, model: `Groq (${model})` };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`⚠️ [GroqAI] Error en modelo ${model}:`, msg);
      lastError = err instanceof Error ? err : new Error(msg);
    }
  }

  throw lastError || new Error('No se pudo obtener respuesta de Groq.');
}

async function callOpenRouterAi(fullPrompt: string, apiKey: string): Promise<{ text: string; model: string }> {
  let lastError: Error | null = null;

  for (const model of OPENROUTER_ACTIVE_MODELS) {
    try {
      console.log(`📡 [OpenRouterAI] Consultando modelo ${model}...`);
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
          messages: [
            { role: 'user', content: fullPrompt },
          ],
          temperature: 0.1,
        }),
      }, 6000);

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`⚠️ [OpenRouterAI] Modelo "${model}" status ${response.status}. Probando siguiente modelo...`);
        lastError = new Error(`OpenRouter [${response.status}]: ${errText}`);
        continue;
      }

      const data: OpenAiApiResponse = await response.json();
      const text = data.choices?.[0]?.message?.content;
      const routedModel = data.model ? data.model.replace(':free', '') : model;
      if (text) {
        return { text, model: `OpenRouter (${routedModel})` };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`⚠️ [OpenRouterAI] Error en modelo ${model}:`, msg);
      lastError = err instanceof Error ? err : new Error(msg);
    }
  }

  throw lastError || new Error('No se pudo obtener respuesta de OpenRouter con los modelos disponibles.');
}

// ==========================================
// FASE 2: ORQUESTADOR INTELIGENTE MULTI-PROVEEDOR
// ==========================================

export async function searchWebSuppliers({
  searchTerm,
  category,
  region = 'Eje Central (Aragua, Carabobo, Caracas, Lara)',
  provider,
  customApiKey,
}: SearchWebSuppliersParams): Promise<WebSupplierCandidate[]> {
  const chosenProvider = provider || getAiProviderPreference();
  const customGemini = getCustomGeminiApiKey();
  const customGroq = getCustomGroqApiKey();
  const customOpenRouter = getCustomOpenRouterApiKey();
  const customSerper = getCustomSerperApiKey();

  // 1. Invocar Función Serverless Segura en Supabase Edge Functions (100% privado y seguro)
  try {
    const { data, error } = await supabase.functions.invoke('search-web-suppliers', {
      body: {
        searchTerm,
        category,
        region,
        provider: chosenProvider,
        customApiKey,
        customGeminiKey: customGemini || undefined,
        customGroqKey: customGroq || undefined,
        customOpenRouterKey: customOpenRouter || undefined,
        customSerperKey: customSerper || undefined,
      },
    });

    if (!error && data?.candidates && Array.isArray(data.candidates)) {
      const telemetry = data.telemetry;
      const model = data.model || 'Edge Function';

      console.group(`🔎 [Procarni Web Intelligence] Búsqueda: "${searchTerm}" (${region})`);
      if (telemetry) {
        console.log(
          `⏱️ %cTiempo Total: ${telemetry.totalDurationMs}ms%c | Google Serper: ${telemetry.searchDurationMs}ms | Motor IA: ${telemetry.aiDurationMs}ms`,
          'color: #0284c7; font-weight: bold;',
          'color: inherit;'
        );
        console.log(`🤖 %cMotor IA Activo:%c ${model}`, 'color: #16a34a; font-weight: bold;', 'color: inherit;');
        console.log(
          `🔑 %cSecretos en Servidor (Supabase):%c Gemini (${telemetry.keyPoolStats?.geminiKeysCount || 0} claves en pool) | Groq (${telemetry.keyPoolStats?.hasGroqKey ? '✅' : '❌'}) | OpenRouter (${telemetry.keyPoolStats?.hasOpenRouterKey ? '✅' : '❌'}) | Serper (${telemetry.keyPoolStats?.hasSerperKey ? '✅' : '❌'})`,
          'color: #880a0a; font-weight: bold;',
          'color: inherit;'
        );

        if (telemetry.queriesExecuted && telemetry.queriesExecuted.length > 0) {
          console.log(`📡 Consultas Google enviadas:`, telemetry.queriesExecuted);
        }

        if (telemetry.snippets && telemetry.snippets.length > 0) {
          console.groupCollapsed(`📄 Fragmentos Web encontrados en Google Venezuela (${telemetry.snippetsFound})`);
          console.table(
            telemetry.snippets.map((s: { title: string; url: string; snippet: string }, idx: number) => ({
              '#': idx + 1,
              Título: s.title,
              URL: s.url,
              Extracto: s.snippet,
            }))
          );
          console.groupEnd();
        }

        if (telemetry.stepsLog && telemetry.stepsLog.length > 0) {
          console.group(`📋 Trazabilidad y Diagnóstico de Modelos (${telemetry.stepsLog.length} eventos)`);
          telemetry.stepsLog.forEach((log: { step: string; status: string; message?: string; durationMs?: number }) => {
            const icon = log.status === 'ok' ? '✅' : log.status === 'warn' ? '⚠️' : log.status === 'error' ? '❌' : 'ℹ️';
            const dur = log.durationMs !== undefined ? ` [${log.durationMs}ms]` : '';
            console.log(`${icon} [${log.step}] ${log.message || ''}${dur}`);
          });
          console.table(
            telemetry.stepsLog.map((log: { step: string; status: string; message?: string; durationMs?: number }) => ({
              Paso: log.step,
              Estado: log.status.toUpperCase(),
              Duración: log.durationMs ? `${log.durationMs}ms` : 'N/A',
              Detalle: log.message || '',
            }))
          );
          console.groupEnd();
        }
      } else {
        console.log(`🔒 Motor IA: ${model} | Encontrados: ${data.candidates.length}`);
      }

      console.group(`🏢 Proveedores Estructurados Listos (${data.candidates.length})`);
      console.table(
        data.candidates.map((c: WebSupplierCandidate, idx: number) => ({
          '#': idx + 1,
          Nombre: c.name,
          RIF: c.rif || 'S/R',
          Ciudad: c.city || 'Venezuela',
          Estado: c.state || 'Venezuela',
          Teléfono: c.phone || 'N/A',
          WhatsApp: c.whatsapp || 'N/A',
          Productos: Array.isArray(c.products_detected) ? c.products_detected.join(', ') : c.products_detected,
          Motor: c.ai_provider || model,
        }))
      );
      console.groupEnd();

      console.groupEnd();

      return data.candidates;
    }

    if (error) {
      console.warn('⚠️ [WebSupplierSearch] Supabase Edge Function devolvió error:', error);
    }
  } catch (serverlessErr) {
    console.info('ℹ️ [WebSupplierSearch] Error llamando a Supabase Edge Function, intentando fallback directo:', serverlessErr);
  }

  const selectedProvider = provider || getAiProviderPreference();
  const regionKw = getRegionSearchKeywords(region);

  // 1. Obtener datos web reales en vivo (Serper Google -> Tavily -> DDG)
  const liveWebSnippets = await fetchRealWebResults(searchTerm, region);
  console.log(`📑 [WebSupplierSearch] Fragmentos web reales encontrados: ${liveWebSnippets.length}`);

  const webSnippetsText = liveWebSnippets.length > 0
    ? liveWebSnippets
      .map((s, i) => `[RESULTADO ${i + 1}]\nTítulo: ${s.title}\nURL: ${s.url}\nContenido / Snippet: ${s.snippet}`)
      .join('\n\n')
    : `No se obtuvieron resultados de búsqueda web directa para "${searchTerm}" en Venezuela (${regionKw}).`;

  // 2. Construir el prompt estricto con inyección de contexto
  const fullStrictPrompt = buildStrictExtractionPrompt(searchTerm, region, liveWebSnippets);

  // 3. Identificar claves disponibles
  const geminiKeys = getAllGeminiApiKeys(customApiKey);
  const groqKey = getGroqApiKey(customApiKey);
  const openRouterKey = getOpenRouterApiKey(customApiKey);

  let rawOutput: { text: string; model: string } | null = null;
  const errorsAcc: string[] = [];

  // 4. Ejecución del proveedor preferido (Gemini por defecto como solicitó el usuario)
  if (selectedProvider === 'gemini' && geminiKeys.length > 0) {
    try {
      rawOutput = await callGeminiAi(fullStrictPrompt, geminiKeys);
    } catch (err) {
      errorsAcc.push(`Gemini: ${err instanceof Error ? err.message : String(err)}`);
      console.warn('⚠️ [WebSupplierSearch] Gemini falló, intentando auto-fallback...');
    }
  } else if (selectedProvider === 'groq' && groqKey) {
    try {
      rawOutput = await callGroqAi(fullStrictPrompt, groqKey);
    } catch (err) {
      errorsAcc.push(`Groq: ${err instanceof Error ? err.message : String(err)}`);
      console.warn('⚠️ [WebSupplierSearch] Groq falló, intentando auto-fallback...');
    }
  } else if (selectedProvider === 'openrouter' && openRouterKey) {
    try {
      rawOutput = await callOpenRouterAi(fullStrictPrompt, openRouterKey);
    } catch (err) {
      errorsAcc.push(`OpenRouter: ${err instanceof Error ? err.message : String(err)}`);
      console.warn('⚠️ [WebSupplierSearch] OpenRouter falló, intentando auto-fallback...');
    }
  }

  // 5. Auto-Cascading Fallback si el preferido falló o si estamos en modo 'auto'
  if (!rawOutput) {
    // 1er intento prioritario: Gemini (Google AI Studio, pool de claves)
    if (geminiKeys.length > 0 && selectedProvider !== 'gemini') {
      try {
        rawOutput = await callGeminiAi(fullStrictPrompt, geminiKeys);
      } catch (err) {
        errorsAcc.push(`Gemini Fallback: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 2do intento: Groq
    if (!rawOutput && groqKey && selectedProvider !== 'groq') {
      try {
        rawOutput = await callGroqAi(fullStrictPrompt, groqKey);
      } catch (err) {
        errorsAcc.push(`Groq Fallback: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 3er intento: OpenRouter
    if (!rawOutput && openRouterKey && selectedProvider !== 'openrouter') {
      try {
        rawOutput = await callOpenRouterAi(fullStrictPrompt, openRouterKey);
      } catch (err) {
        errorsAcc.push(`OpenRouter Fallback: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Si aún no hay salida y ninguna clave estaba configurada
    if (!rawOutput) {
      if (geminiKeys.length === 0 && !groqKey && !openRouterKey) {
        throw new Error(
          'No hay ninguna clave de IA configurada ni en los secretos de Supabase ni localmente. Ingresa tu API Key de Gemini, Groq u OpenRouter en el botón de Configuración (icono de llave).'
        );
      }
      throw new Error(`Error en los motores de IA: ${errorsAcc.join(' | ')}`);
    }
  }

  console.log(`✅ [WebSupplierSearch] ¡Estructuración exitosa con ${rawOutput.model}!`);
  console.log('🤖 [WebSupplierSearch] Respuesta cruda de la IA:', rawOutput.text);
  return processAiOutput(rawOutput.text, liveWebSnippets, searchTerm, rawOutput.model);
}

// ==========================================
// NORMALIZADOR & FILTRO ANTI-EXTRANJERO
// ==========================================

const FORBIDDEN_FOREIGN_LOCATIONS = [
  'colombia', 'bogota', 'bogotá', 'medellin', 'medellín', 'cali', 'barranquilla', 'bucaramanga',
  'mexico', 'méxico', 'cdmx', 'guadalajara', 'monterrey',
  'españa', 'madrid', 'barcelona, españa', 'valencia, españa',
  'argentina', 'buenos aires', 'peru', 'perú', 'lima', 'chile', 'santiago de chile',
  'ecuador', 'quito', 'guayaquil'
];

function isForeignCompany(item: RawWebSupplierItem): boolean {
  const textToCheck = [
    item.name || '',
    item.city || '',
    item.state || '',
    item.summary || '',
    item.website || '',
  ].join(' ').toLowerCase();

  // Si menciona explícitamente ciudades o países extranjeros sin decir Venezuela
  for (const foreignKw of FORBIDDEN_FOREIGN_LOCATIONS) {
    if (textToCheck.includes(foreignKw) && !textToCheck.includes('venezuela') && !textToCheck.includes('aragua') && !textToCheck.includes('carabobo')) {
      return true;
    }
  }

  // Teléfonos extranjeros (+57 Colombia, +52 Mexico, +34 España, +54 Argentina, +51 Perú, +56 Chile, +593 Ecuador)
  const phone = (item.phone || item.whatsapp || '').replace(/[\s\-\(\)]/g, '');
  if (
    phone.startsWith('+57') || phone.startsWith('57') ||
    phone.startsWith('+52') || phone.startsWith('52') ||
    phone.startsWith('+34') || phone.startsWith('34') ||
    phone.startsWith('+54') || phone.startsWith('+51') || phone.startsWith('+56') || phone.startsWith('+593')
  ) {
    return true;
  }

  return false;
}

function inferVenezuelanState(city?: string, currentState?: string): string | undefined {
  if (!city) return currentState;
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

  // Filtrar estrictamente cualquier empresa extranjera
  const venezuelanItems = parsedItems.filter((item) => !isForeignCompany(item));
  console.log(`📑 [WebSupplierSearch] Elementos extraídos: ${parsedItems.length}, tras filtro Venezuela: ${venezuelanItems.length}`);

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
            // fallback
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
      products_detected: cleanProducts,
      source_urls: Array.from(allSourcesMap.values()).slice(0, 3),
      ai_provider: modelUsed,
    };
  });
}

function parseSuppliersJson(rawText: string): RawWebSupplierItem[] {
  let cleaned = rawText.trim();

  // Try extracting markdown JSON block: ```json ... ```
  const jsonBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
  const match = jsonBlockRegex.exec(cleaned);
  if (match && match[1]) {
    cleaned = match[1].trim();
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed as RawWebSupplierItem[];
    }
    if (typeof parsed === 'object' && parsed !== null) {
      const possibleArray = Object.values(parsed).find((val) => Array.isArray(val));
      if (possibleArray && Array.isArray(possibleArray)) {
        return possibleArray as RawWebSupplierItem[];
      }
      return [parsed as RawWebSupplierItem];
    }
  } catch (err) {
    console.warn('⚠️ [WebSupplierSearch] JSON Parse directo falló. Intentando substring [ ... ]', err);
    const firstBracket = cleaned.indexOf('[');
    const lastBracket = cleaned.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      const slice = cleaned.substring(firstBracket, lastBracket + 1);
      try {
        const subParsed = JSON.parse(slice);
        if (Array.isArray(subParsed)) {
          return subParsed as RawWebSupplierItem[];
        }
      } catch (subErr) {
        console.error('❌ [WebSupplierSearch] No se pudo recuperar array JSON:', subErr);
      }
    }
  }

  return [];
}
