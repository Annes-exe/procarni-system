
import { exchangeRateService } from '@/integrations/supabase/services/exchangeRateService';

export interface CurrencyRate {
  moneda: string;
  nombre: string;
  valor: number;
  promedio: number;
  fechaActualizacion: string;
}

export interface HistoryRate {
  fecha: string;
  valor: number;
  promedio: number;
}

const BASE_URL = 'https://ve.dolarapi.com/v1';

export const parseLocalDate = (dateStr: string) => {
  try {
    const cleanStr = dateStr.substring(0, 10);
    const [year, month, day] = cleanStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  } catch (e) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }
};

export const toLocalDateString = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const findRateForDate = (targetDate: Date, history: HistoryRate[]): HistoryRate | null => {
  const targetTime = targetDate.getTime();
  
  // 1. Try to find exact match
  const targetStr = toLocalDateString(targetDate);
  const exact = history.find(item => item.fecha.startsWith(targetStr));
  if (exact) return exact;

  // 2. If no exact match, find the closest preceding date
  let closestPreceding: HistoryRate | null = null;
  let minDiff = Infinity;
  
  for (const item of history) {
    const itemDate = parseLocalDate(item.fecha);
    const itemTime = itemDate.getTime();
    
    if (itemTime <= targetTime) {
      const diff = targetTime - itemTime;
      if (diff < minDiff) {
        minDiff = diff;
        closestPreceding = item;
      }
    }
  }
  
  return closestPreceding;
};

export const getEffectiveRate = (currentRate: CurrencyRate | null, history: HistoryRate[]) => {
  if (!currentRate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const currentDateObj = parseLocalDate(currentRate.fechaActualizacion);

  if (currentDateObj.getTime() > today.getTime()) {
    return currentRate;
  }

  const futureHistoryRate = history.find(item => {
    const itemDate = parseLocalDate(item.fecha);
    return itemDate.getTime() > today.getTime();
  });

  if (futureHistoryRate) {
    return {
      ...currentRate,
      valor: futureHistoryRate.valor,
      promedio: futureHistoryRate.promedio,
      fechaActualizacion: `${futureHistoryRate.fecha}T00:00:00-04:00`
    };
  }

  return currentRate;
};

// Caché en memoria para evitar consultas redundantes en la misma sesión
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const memoryCache: {
  usdRate?: CacheEntry<CurrencyRate>;
  eurRate?: CacheEntry<CurrencyRate>;
  usdHistory?: CacheEntry<HistoryRate[]>;
  eurHistory?: CacheEntry<HistoryRate[]>;
} = {};

export const currencyService = {
  /**
   * Obtiene la tasa oficial USD (BCV), leyendo de Supabase con caché en memoria.
   */
  async getUsdRate(): Promise<CurrencyRate> {
    const now = Date.now();
    if (memoryCache.usdRate && (now - memoryCache.usdRate.timestamp < CACHE_TTL_MS)) {
      return memoryCache.usdRate.data;
    }

    // 1. Consultar en base de datos la tasa más reciente registrada
    const latestDbRate = await exchangeRateService.getLatestRate('USD');
    if (latestDbRate) {
      const rateObj: CurrencyRate = {
        moneda: 'USD',
        nombre: 'Oficial',
        valor: Number(latestDbRate.rate),
        promedio: Number(latestDbRate.rate),
        fechaActualizacion: latestDbRate.effective_date || latestDbRate.rate_date
      };
      memoryCache.usdRate = { data: rateObj, timestamp: now };
      return rateObj;
    }

    // 2. Si la base de datos no tiene tasas (ej. primer despliegue), disparar Edge Function del servidor
    console.warn('[currencyService] No USD rate found in DB, attempting server sync...');
    const synced = await exchangeRateService.triggerServerSync();
    if (synced) {
      const syncedRate = await exchangeRateService.getLatestRate('USD');
      if (syncedRate) {
        const rateObj: CurrencyRate = {
          moneda: 'USD',
          nombre: 'Oficial',
          valor: Number(syncedRate.rate),
          promedio: Number(syncedRate.rate),
          fechaActualizacion: syncedRate.effective_date || syncedRate.rate_date
        };
        memoryCache.usdRate = { data: rateObj, timestamp: now };
        return rateObj;
      }
    }

    // 3. Fallback de emergencia a la API externa en memoria (sin escrituras en BD desde el cliente)
    try {
      const response = await fetch(`${BASE_URL}/dolares/oficial`);
      if (!response.ok) throw new Error('Failed to fetch USD rate from API');
      const data: CurrencyRate = await response.json();
      memoryCache.usdRate = { data, timestamp: now };
      return data;
    } catch (apiError) {
      console.error('[currencyService] Critical: Failed to retrieve USD rate from DB and API:', apiError);
      throw apiError;
    }
  },

  /**
   * Obtiene la tasa oficial EUR (BCV), leyendo de Supabase con caché en memoria.
   */
  async getEurRate(): Promise<CurrencyRate> {
    const now = Date.now();
    if (memoryCache.eurRate && (now - memoryCache.eurRate.timestamp < CACHE_TTL_MS)) {
      return memoryCache.eurRate.data;
    }

    // 1. Consultar en base de datos la tasa más reciente registrada
    const latestDbRate = await exchangeRateService.getLatestRate('EUR');
    if (latestDbRate) {
      const rateObj: CurrencyRate = {
        moneda: 'EUR',
        nombre: 'Oficial',
        valor: Number(latestDbRate.rate),
        promedio: Number(latestDbRate.rate),
        fechaActualizacion: latestDbRate.effective_date || latestDbRate.rate_date
      };
      memoryCache.eurRate = { data: rateObj, timestamp: now };
      return rateObj;
    }

    // 2. Si la base de datos no tiene tasas, disparar Edge Function del servidor
    console.warn('[currencyService] No EUR rate found in DB, attempting server sync...');
    const synced = await exchangeRateService.triggerServerSync();
    if (synced) {
      const syncedRate = await exchangeRateService.getLatestRate('EUR');
      if (syncedRate) {
        const rateObj: CurrencyRate = {
          moneda: 'EUR',
          nombre: 'Oficial',
          valor: Number(syncedRate.rate),
          promedio: Number(syncedRate.rate),
          fechaActualizacion: syncedRate.effective_date || syncedRate.rate_date
        };
        memoryCache.eurRate = { data: rateObj, timestamp: now };
        return rateObj;
      }
    }

    // 3. Fallback de emergencia a la API externa en memoria (sin escrituras en BD desde el cliente)
    try {
      const response = await fetch(`${BASE_URL}/euros/oficial`);
      if (!response.ok) throw new Error('Failed to fetch EUR rate from API');
      const data: CurrencyRate = await response.json();
      memoryCache.eurRate = { data, timestamp: now };
      return data;
    } catch (apiError) {
      console.error('[currencyService] Critical: Failed to retrieve EUR rate from DB and API:', apiError);
      throw apiError;
    }
  },

  /**
   * Obtiene el histórico de tasas USD de los últimos 30 días directamente de Supabase.
   */
  async getUsdHistory(): Promise<HistoryRate[]> {
    const now = Date.now();
    if (memoryCache.usdHistory && (now - memoryCache.usdHistory.timestamp < CACHE_TTL_MS)) {
      return memoryCache.usdHistory.data;
    }

    // 1. Consultar histórico centralizado en Supabase
    const dbHistory = await exchangeRateService.getHistory('USD', 30);
    if (dbHistory.length > 0) {
      const historyList: HistoryRate[] = dbHistory.map(item => ({
        fecha: item.effective_date || item.rate_date,
        valor: Number(item.rate),
        promedio: Number(item.rate)
      }));
      memoryCache.usdHistory = { data: historyList, timestamp: now };
      return historyList;
    }

    // 2. Si la base de datos está vacía, sincronizar desde el servidor
    console.warn('[currencyService] No USD history in DB, attempting server sync...');
    const synced = await exchangeRateService.triggerServerSync();
    if (synced) {
      const syncedHistory = await exchangeRateService.getHistory('USD', 30);
      if (syncedHistory.length > 0) {
        const historyList: HistoryRate[] = syncedHistory.map(item => ({
          fecha: item.effective_date || item.rate_date,
          valor: Number(item.rate),
          promedio: Number(item.rate)
        }));
        memoryCache.usdHistory = { data: historyList, timestamp: now };
        return historyList;
      }
    }

    // 3. Fallback en memoria solo si no hay datos en BD
    try {
      const response = await fetch(`${BASE_URL}/historicos/dolares/oficial`);
      if (!response.ok) throw new Error('Failed to fetch USD history');
      const data: HistoryRate[] = await response.json();
      const reversed = data.reverse();
      memoryCache.usdHistory = { data: reversed, timestamp: now };
      return reversed;
    } catch (apiError) {
      console.error('[currencyService] History API fetch failed:', apiError);
      return [];
    }
  },

  /**
   * Obtiene el histórico de tasas EUR de los últimos 30 días directamente de Supabase.
   */
  async getEurHistory(): Promise<HistoryRate[]> {
    const now = Date.now();
    if (memoryCache.eurHistory && (now - memoryCache.eurHistory.timestamp < CACHE_TTL_MS)) {
      return memoryCache.eurHistory.data;
    }

    // 1. Consultar histórico centralizado en Supabase
    const dbHistory = await exchangeRateService.getHistory('EUR', 30);
    if (dbHistory.length > 0) {
      const historyList: HistoryRate[] = dbHistory.map(item => ({
        fecha: item.effective_date || item.rate_date,
        valor: Number(item.rate),
        promedio: Number(item.rate)
      }));
      memoryCache.eurHistory = { data: historyList, timestamp: now };
      return historyList;
    }

    // 2. Si la base de datos está vacía, sincronizar desde el servidor
    console.warn('[currencyService] No EUR history in DB, attempting server sync...');
    const synced = await exchangeRateService.triggerServerSync();
    if (synced) {
      const syncedHistory = await exchangeRateService.getHistory('EUR', 30);
      if (syncedHistory.length > 0) {
        const historyList: HistoryRate[] = syncedHistory.map(item => ({
          fecha: item.effective_date || item.rate_date,
          valor: Number(item.rate),
          promedio: Number(item.rate)
        }));
        memoryCache.eurHistory = { data: historyList, timestamp: now };
        return historyList;
      }
    }

    // 3. Fallback en memoria solo si no hay datos en BD
    try {
      const response = await fetch(`${BASE_URL}/historicos/euros/oficial`);
      if (!response.ok) throw new Error('Failed to fetch EUR history');
      const data: HistoryRate[] = await response.json();
      const reversed = data.reverse();
      memoryCache.eurHistory = { data: reversed, timestamp: now };
      return reversed;
    } catch (apiError) {
      console.error('[currencyService] EUR History API fetch failed:', apiError);
      return [];
    }
  },

  /**
   * Limpia la memoria caché local forzando una nueva lectura en la siguiente consulta.
   */
  clearCache() {
    delete memoryCache.usdRate;
    delete memoryCache.eurRate;
    delete memoryCache.usdHistory;
    delete memoryCache.eurHistory;
  }
};

