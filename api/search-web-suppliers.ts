interface VercelReq {
  method?: string;
  body?: any;
  headers?: Record<string, string | string[] | undefined>;
}

interface VercelRes {
  status: (code: number) => VercelRes;
  json: (data: any) => VercelRes;
  end: () => VercelRes;
}

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

const GEMINI_FREE_MODELS = [
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-flash-latest',
  'gemini-flash-lite-latest',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
];

const GROQ_MODELS = [
  'llama-3.3-70b-specdec',
  'llama3-70b-8192',
  'llama3-8b-8192',
  'gemma2-9b-it',
  'llama-3.2-3b-preview',
];

const OPENROUTER_ACTIVE_MODELS = [
  'openrouter/free',
  'openrouter/auto',
  'meta-llama/llama-3.2-3b-instruct:free',
  'deepseek/deepseek-chat',
];

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
  return '(maracay OR valencia OR caracas OR barquisimeto OR aragua OR carabobo)';
}

function getSerperApiKey(customKey?: string): string | undefined {
  if (customKey && customKey.trim()) return customKey.trim();
  return process.env.SERPER_API_KEY || process.env.VITE_SERPER_API_KEY;
}

function getAllGeminiApiKeys(customApiKey?: string): string[] {
  const keys: string[] = [];
  const addKey = (raw?: string | null) => {
    if (!raw) return;
    raw.split(',').forEach((k) => {
      const trimmed = k.trim();
      if (trimmed && !keys.includes(trimmed)) keys.push(trimmed);
    });
  };

  addKey(customApiKey);

  Object.keys(process.env).forEach((envVar) => {
    if (
      envVar.startsWith('GOOGLE_AI_API_KEY') ||
      envVar.startsWith('GEMINI_API_KEY') ||
      envVar.startsWith('GOOGLE_API_KEY') ||
      envVar.startsWith('VITE_GOOGLE_AI_API_KEY') ||
      envVar.startsWith('VITE_GEMINI_API_KEY') ||
      envVar.startsWith('VITE_GOOGLE_API_KEY')
    ) {
      addKey(process.env[envVar]);
    }
  });

  return keys;
}

function getGroqApiKey(customKey?: string): string | undefined {
  if (customKey && customKey.trim()) return customKey.trim();
  return process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY;
}

function getOpenRouterApiKey(customKey?: string): string | undefined {
  if (customKey && customKey.trim()) return customKey.trim();
  return process.env.OPENROUTER_API_KEY || process.env.VITE_OPENROUTER_API_KEY;
}

async function fetchRealWebResults(searchTerm: string, region: string, customSerperKey?: string): Promise<WebSearchResult[]> {
  const serperKey = getSerperApiKey(customSerperKey);
  const cleanSearchTerm = searchTerm.replace(/["']/g, '').trim();
  const regionKw = getRegionSearchKeywords(region);

  if (serperKey) {
    try {
      const googleQuery = regionKw === 'venezuela'
        ? `"${cleanSearchTerm}" proveedores distribuidores venezuela`
        : `"${cleanSearchTerm}" ${regionKw} venezuela`;

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
      }

      if ((!Array.isArray(serperData.organic) || serperData.organic.length === 0) && regionKw !== 'venezuela') {
        const broadQuery = `"${cleanSearchTerm}" proveedores distribuidores venezuela`;
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
        return serperData.organic.map((item: { title?: string; snippet?: string; link?: string }) => ({
          title: item.title || 'Resultado Google',
          snippet: item.snippet || '',
          url: item.link || '',
        }));
      }
    } catch (serperErr) {
      console.warn('⚠️ [Serverless] Error Serper:', serperErr);
    }
  }

  // Fallback DuckDuckGo si Serper no está configurado
  try {
    const directDdgQuery = `${cleanSearchTerm} ${regionKw} venezuela`;
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
    return [];
  }
}

function buildStrictExtractionPrompt(contextoDeSerper: string): string {
  return `Eres un procesador y extractor de datos estructurados para el departamento de compras de Procarni en Venezuela.
Tu objetivo es analizar el TEXTO PROPORCIONADO (resultados reales de Google) y extraer cada empresa, distribuidor, fábrica, comercializadora o tienda B2B identificada en Venezuela.

TEXTO PROPORCIONADO:
${contextoDeSerper}

INSTRUCCIONES DE EXTRACCIÓN:
1. Extrae cada empresa, distribuidora, fábrica o comercio que ofrezca productos o servicios relacionados con el rubro buscado.
2. Identifica el nombre comercial del proveedor (ej. en títulos como "Nombre Empresa - Producto", nombres de marcas o distribuidoras).
3. Ubicación: Identifica la ciudad y estado en Venezuela (ej. Maracay/Aragua, Valencia/Carabobo, Caracas/Miranda, Barquisimeto/Lara, etc.). Si no se especifica ciudad pero opera en Venezuela, indica "Venezuela".
4. Contactos: Extrae RIF, teléfonos (0241, 0243, 0212, 0414, 0424, 0412, etc.), WhatsApp, correos o Instagram si aparecen explícitamente. Si no aparecen, coloca null.
5. Filtro Geográfico: Incluye solo proveedores que operen en Venezuela. Si un resultado es claramente de otro país (ej: Colombia, México, España), descártalo.
6. Si el texto no contiene ningún proveedor para este rubro, devuelve exactamente un array vacío: [].

FORMATO DE SALIDA:
Devuelve ÚNICAMENTE un array JSON válido (sin explicaciones, sin bloques markdown adicionales, solo el JSON):
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
    "instagram": "Usuario o enlace de Instagram si aparece o null",
    "summary": "Resumen de lo que ofrece según el texto",
    "products_detected": ["producto 1", "producto 2"],
    "sources": ["URL de la fuente"]
  }
]`;
}

async function callGeminiAi(fullPrompt: string, apiKeys: string[]): Promise<{ text: string; model: string }> {
  if (apiKeys.length === 0) throw new Error('No hay claves de Google Gemini disponibles.');

  let lastError: Error | null = null;
  for (const model of GEMINI_FREE_MODELS) {
    for (let kIdx = 0; kIdx < apiKeys.length; kIdx++) {
      const apiKey = apiKeys[kIdx];
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const payload = {
        contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
        generationConfig: { temperature: 0.1 },
      };

      try {
        const response = await fetchWithTimeout(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }, 15000);

        if (!response.ok) {
          const errText = await response.text();
          lastError = new Error(`Google Gemini [${response.status}]: ${errText}`);
          continue;
        }

        const jsonResponse = await response.json();
        const textOutput = jsonResponse.candidates?.[0]?.content?.parts?.[0]?.text;
        if (textOutput) {
          return { text: textOutput, model: `Google Gemini (${model})` };
        }
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }
  }
  throw lastError || new Error('No se pudo obtener respuesta de Google Gemini.');
}

async function callGroqAi(fullPrompt: string, apiKey: string): Promise<{ text: string; model: string }> {
  let lastError: Error | null = null;
  for (const model of GROQ_MODELS) {
    try {
      const response = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: fullPrompt }],
          temperature: 0.1,
        }),
      }, 7000);

      if (!response.ok) {
        const errText = await response.text();
        lastError = new Error(`Groq [${response.status}]: ${errText}`);
        continue;
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content;
      if (text) return { text, model: `Groq (${model})` };
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastError || new Error('No se pudo obtener respuesta de Groq.');
}

async function callOpenRouterAi(fullPrompt: string, apiKey: string): Promise<{ text: string; model: string }> {
  let lastError: Error | null = null;
  for (const model of OPENROUTER_ACTIVE_MODELS) {
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
          messages: [{ role: 'user', content: fullPrompt }],
          temperature: 0.1,
        }),
      }, 6000);

      if (!response.ok) {
        const errText = await response.text();
        lastError = new Error(`OpenRouter [${response.status}]: ${errText}`);
        continue;
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content;
      const routedModel = data.model ? data.model.replace(':free', '') : model;
      if (text) return { text, model: `OpenRouter (${routedModel})` };
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastError || new Error('No se pudo obtener respuesta de OpenRouter.');
}

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

  for (const foreignKw of FORBIDDEN_FOREIGN_LOCATIONS) {
    if (textToCheck.includes(foreignKw) && !textToCheck.includes('venezuela') && !textToCheck.includes('aragua') && !textToCheck.includes('carabobo')) {
      return true;
    }
  }

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
      const possibleArray = Object.values(parsed).find((val) => Array.isArray(val));
      if (possibleArray && Array.isArray(possibleArray)) {
        return possibleArray as RawWebSupplierItem[];
      }
      return [parsed as RawWebSupplierItem];
    }
  } catch (err) {
    const firstBracket = cleaned.indexOf('[');
    const lastBracket = cleaned.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      const slice = cleaned.substring(firstBracket, lastBracket + 1);
      try {
        const subParsed = JSON.parse(slice);
        if (Array.isArray(subParsed)) return subParsed as RawWebSupplierItem[];
      } catch (subErr) {
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
      products_detected: cleanProducts,
      source_urls: Array.from(allSourcesMap.values()).slice(0, 3),
      ai_provider: modelUsed,
    };
  });
}

export default async function handler(req: VercelReq, res: VercelRes) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { searchTerm, category, region = 'Eje Central (Aragua, Carabobo, Caracas, Lara)', provider, customApiKey } = req.body || {};

    if (!searchTerm || typeof searchTerm !== 'string' || !searchTerm.trim()) {
      return res.status(400).json({ error: 'searchTerm es requerido.' });
    }

    const liveWebSnippets = await fetchRealWebResults(searchTerm, region, customApiKey);
    const webSnippetsText = liveWebSnippets.length > 0
      ? liveWebSnippets.map((s, i) => `[RESULTADO ${i + 1}]\nTítulo: ${s.title}\nURL: ${s.url}\nContenido: ${s.snippet}`).join('\n\n')
      : `No se obtuvieron resultados de búsqueda web directa para "${searchTerm}".`;

    const fullStrictPrompt = buildStrictExtractionPrompt(webSnippetsText);
    const geminiKeys = getAllGeminiApiKeys(customApiKey);
    const groqKey = getGroqApiKey(customApiKey);
    const openRouterKey = getOpenRouterApiKey(customApiKey);

    let rawOutput: { text: string; model: string } | null = null;
    const errorsAcc: string[] = [];

    const selectedProvider = provider || 'gemini';

    if (selectedProvider === 'gemini' && geminiKeys.length > 0) {
      try {
        rawOutput = await callGeminiAi(fullStrictPrompt, geminiKeys);
      } catch (err) {
        errorsAcc.push(`Gemini: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else if (selectedProvider === 'groq' && groqKey) {
      try {
        rawOutput = await callGroqAi(fullStrictPrompt, groqKey);
      } catch (err) {
        errorsAcc.push(`Groq: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else if (selectedProvider === 'openrouter' && openRouterKey) {
      try {
        rawOutput = await callOpenRouterAi(fullStrictPrompt, openRouterKey);
      } catch (err) {
        errorsAcc.push(`OpenRouter: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (!rawOutput) {
      if (geminiKeys.length > 0 && selectedProvider !== 'gemini') {
        try {
          rawOutput = await callGeminiAi(fullStrictPrompt, geminiKeys);
        } catch (err) {
          errorsAcc.push(`Gemini Fallback: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      if (!rawOutput && groqKey && selectedProvider !== 'groq') {
        try {
          rawOutput = await callGroqAi(fullStrictPrompt, groqKey);
        } catch (err) {
          errorsAcc.push(`Groq Fallback: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      if (!rawOutput && openRouterKey && selectedProvider !== 'openrouter') {
        try {
          rawOutput = await callOpenRouterAi(fullStrictPrompt, openRouterKey);
        } catch (err) {
          errorsAcc.push(`OpenRouter Fallback: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      if (!rawOutput) {
        if (geminiKeys.length === 0 && !groqKey && !openRouterKey) {
          return res.status(400).json({
            error: 'No hay ninguna clave de IA configurada en el servidor Vercel. Configura GOOGLE_AI_API_KEY, GROQ_API_KEY o OPENROUTER_API_KEY.',
          });
        }
        return res.status(500).json({ error: `Error en los motores de IA del servidor: ${errorsAcc.join(' | ')}` });
      }
    }

    const candidates = processAiOutput(rawOutput.text, liveWebSnippets, searchTerm, rawOutput.model);
    return res.status(200).json({ candidates, model: rawOutput.model });
  } catch (error: unknown) {
    console.error('❌ [Serverless Error]:', error);
    const msg = error instanceof Error ? error.message : 'Error en la búsqueda serverless.';
    return res.status(500).json({ error: msg });
  }
}
