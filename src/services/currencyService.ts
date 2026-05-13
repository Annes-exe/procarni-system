
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
    return data.slice(-30).reverse(); // Last 30 days, most recent first
  },

  async getEurHistory(): Promise<HistoryRate[]> {
    const response = await fetch(`${BASE_URL}/historicos/euros/oficial`);
    if (!response.ok) throw new Error('Failed to fetch EUR history');
    const data = await response.json();
    return data.slice(-30).reverse(); // Last 30 days, most recent first
  }
};
