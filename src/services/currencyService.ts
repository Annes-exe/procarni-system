
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
    const response = await fetch(`${BASE_URL}/dolares/oficial`);
    if (!response.ok) throw new Error('Failed to fetch USD rate');
    return response.json();
  },

  async getEurRate(): Promise<CurrencyRate> {
    const response = await fetch(`${BASE_URL}/euros/oficial`);
    if (!response.ok) throw new Error('Failed to fetch EUR rate');
    return response.json();
  },

  async getUsdHistory(): Promise<HistoryRate[]> {
    const response = await fetch(`${BASE_URL}/historicos/dolares/oficial`);
    if (!response.ok) throw new Error('Failed to fetch USD history');
    const data = await response.json();
    return data.reverse(); // Most recent first
  },

  async getEurHistory(): Promise<HistoryRate[]> {
    const response = await fetch(`${BASE_URL}/historicos/euros/oficial`);
    if (!response.ok) throw new Error('Failed to fetch EUR history');
    const data = await response.json();
    return data.reverse(); // Most recent first
  }
};
