
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

export const currencyService = {
  async getUsdRate(): Promise<CurrencyRate> {
    const todayStr = toLocalDateString(new Date());

    // 1. Check local Supabase database first
    const dbRate = await exchangeRateService.getRateByDate(todayStr, 'USD');
    if (dbRate) {
      return {
        moneda: 'USD',
        nombre: 'Oficial',
        valor: Number(dbRate.rate),
        promedio: Number(dbRate.rate),
        fechaActualizacion: dbRate.effective_date || dbRate.rate_date
      };
    }

    // 2. Fetch from External API
    try {
      const response = await fetch(`${BASE_URL}/dolares/oficial`);
      if (!response.ok) throw new Error('Failed to fetch USD rate from API');
      const data: CurrencyRate = await response.json();

      // Persist to Supabase in background
      const rateDate = data.fechaActualizacion ? data.fechaActualizacion.substring(0, 10) : todayStr;
      const rateVal = data.promedio || data.valor;
      if (rateVal && rateVal > 0) {
        exchangeRateService.upsertRate({
          rate_date: rateDate,
          currency: 'USD',
          rate: rateVal,
          source: 'BCV',
          effective_date: data.fechaActualizacion
        }).catch(err => console.warn('[currencyService] Failed to cache USD rate in DB:', err));
      }

      return data;
    } catch (apiError) {
      console.warn('[currencyService] API fetch failed, falling back to latest DB rate:', apiError);
      const latestDbRate = await exchangeRateService.getLatestRate('USD');
      if (latestDbRate) {
        return {
          moneda: 'USD',
          nombre: 'Oficial (Caché Local)',
          valor: Number(latestDbRate.rate),
          promedio: Number(latestDbRate.rate),
          fechaActualizacion: latestDbRate.effective_date || latestDbRate.rate_date
        };
      }
      throw apiError;
    }
  },

  async getEurRate(): Promise<CurrencyRate> {
    const todayStr = toLocalDateString(new Date());

    // 1. Check local Supabase database first
    const dbRate = await exchangeRateService.getRateByDate(todayStr, 'EUR');
    if (dbRate) {
      return {
        moneda: 'EUR',
        nombre: 'Oficial',
        valor: Number(dbRate.rate),
        promedio: Number(dbRate.rate),
        fechaActualizacion: dbRate.effective_date || dbRate.rate_date
      };
    }

    // 2. Fetch from External API
    try {
      const response = await fetch(`${BASE_URL}/euros/oficial`);
      if (!response.ok) throw new Error('Failed to fetch EUR rate from API');
      const data: CurrencyRate = await response.json();

      // Persist to Supabase in background
      const rateDate = data.fechaActualizacion ? data.fechaActualizacion.substring(0, 10) : todayStr;
      const rateVal = data.promedio || data.valor;
      if (rateVal && rateVal > 0) {
        exchangeRateService.upsertRate({
          rate_date: rateDate,
          currency: 'EUR',
          rate: rateVal,
          source: 'BCV',
          effective_date: data.fechaActualizacion
        }).catch(err => console.warn('[currencyService] Failed to cache EUR rate in DB:', err));
      }

      return data;
    } catch (apiError) {
      console.warn('[currencyService] API fetch failed, falling back to latest DB rate:', apiError);
      const latestDbRate = await exchangeRateService.getLatestRate('EUR');
      if (latestDbRate) {
        return {
          moneda: 'EUR',
          nombre: 'Oficial (Caché Local)',
          valor: Number(latestDbRate.rate),
          promedio: Number(latestDbRate.rate),
          fechaActualizacion: latestDbRate.effective_date || latestDbRate.rate_date
        };
      }
      throw apiError;
    }
  },

  async getUsdHistory(): Promise<HistoryRate[]> {
    try {
      const response = await fetch(`${BASE_URL}/historicos/dolares/oficial`);
      if (!response.ok) throw new Error('Failed to fetch USD history');
      const data: HistoryRate[] = await response.json();
      const reversed = data.reverse(); // Most recent first

      // Sync recent historical rates to DB in background
      const toUpsert = reversed.slice(0, 15).map(item => ({
        rate_date: item.fecha.substring(0, 10),
        currency: 'USD' as const,
        rate: item.promedio || item.valor,
        source: 'BCV'
      }));
      exchangeRateService.batchUpsertRates(toUpsert).catch(e => console.warn('[currencyService] Failed to batch cache USD history:', e));

      return reversed;
    } catch (apiError) {
      console.warn('[currencyService] History API fetch failed, loading from DB:', apiError);
      const dbHistory = await exchangeRateService.getHistory('USD', 30);
      if (dbHistory.length > 0) {
        return dbHistory.map(item => ({
          fecha: item.rate_date,
          valor: Number(item.rate),
          promedio: Number(item.rate)
        }));
      }
      throw apiError;
    }
  },

  async getEurHistory(): Promise<HistoryRate[]> {
    try {
      const response = await fetch(`${BASE_URL}/historicos/euros/oficial`);
      if (!response.ok) throw new Error('Failed to fetch EUR history');
      const data: HistoryRate[] = await response.json();
      const reversed = data.reverse(); // Most recent first

      // Sync recent historical rates to DB in background
      const toUpsert = reversed.slice(0, 15).map(item => ({
        rate_date: item.fecha.substring(0, 10),
        currency: 'EUR' as const,
        rate: item.promedio || item.valor,
        source: 'BCV'
      }));
      exchangeRateService.batchUpsertRates(toUpsert).catch(e => console.warn('[currencyService] Failed to batch cache EUR history:', e));

      return reversed;
    } catch (apiError) {
      console.warn('[currencyService] EUR History API fetch failed, loading from DB:', apiError);
      const dbHistory = await exchangeRateService.getHistory('EUR', 30);
      if (dbHistory.length > 0) {
        return dbHistory.map(item => ({
          fecha: item.rate_date,
          valor: Number(item.rate),
          promedio: Number(item.rate)
        }));
      }
      throw apiError;
    }
  }
};

