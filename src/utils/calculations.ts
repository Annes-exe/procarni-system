// src/utils/calculations.ts

/**
 * Calcula la base imponible, el monto del IVA (16%), el monto del Porcentaje de Venta, el monto del Descuento y el total de una lista de ítems.
 * @param items Array de objetos con 'quantity', 'unit_price', 'tax_rate', 'is_exempt', 'sales_percentage', 'discount_percentage'.
 * @returns Objeto con baseImponible, montoIVA, montoVenta, montoDescuento, y total.
 */
export const calculateTotals = (items: Array<{
  quantity: number;
  unit_price: number;
  tax_rate?: number;
  is_exempt?: boolean;
  sales_percentage?: number; // NEW
  discount_percentage?: number; // NEW
}>) => {
  let subtotal = 0; // Suma bruta (Qty * Price)
  let baseImponible = 0; // Base para IVA
  let montoExento = 0; // Monto exento
  let montoIVA = 0;
  let montoVenta = 0;
  let montoDescuento = 0;
  let total = 0;

  items.forEach(item => {
    const itemValue = item.quantity * item.unit_price;
    subtotal += itemValue;

    // 1. Apply Discount
    const discountRate = (item.discount_percentage ?? 0) / 100;
    const discountAmount = itemValue * discountRate;
    montoDescuento += discountAmount;

    const subtotalAfterDiscount = itemValue - discountAmount;

    if (item.is_exempt) {
      montoExento += subtotalAfterDiscount;
    } else {
      baseImponible += subtotalAfterDiscount;
    }

    // 3. Apply Sales Percentage (Additional Tax)
    const salesRate = (item.sales_percentage ?? 0) / 100;
    const salesAmount = subtotalAfterDiscount * salesRate;
    montoVenta += salesAmount;

    // 4. Apply IVA (Standard Tax)
    let ivaAmount = 0;
    if (!item.is_exempt) {
      const taxRate = item.tax_rate ?? 0.16; // Default IVA 16%
      ivaAmount = subtotalAfterDiscount * taxRate;
      montoIVA += ivaAmount;
    }

    // 5. Calculate Total Item
    total += subtotalAfterDiscount + salesAmount + ivaAmount;
  });

  return {
    subtotal: parseFloat(subtotal.toFixed(2)),
    baseImponible: parseFloat(baseImponible.toFixed(2)),
    montoExento: parseFloat(montoExento.toFixed(2)),
    montoIVA: parseFloat(montoIVA.toFixed(2)),
    montoVenta: parseFloat(montoVenta.toFixed(2)),
    montoDescuento: parseFloat(montoDescuento.toFixed(2)),
    total: parseFloat(total.toFixed(2)),
  };
};

const unidades = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
const decenas = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const centenas = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];
const especiales = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];

function convertirGrupo(num: number): string {
  let c = Math.floor(num / 100);
  let d = Math.floor((num % 100) / 10);
  let u = num % 10;
  let texto = '';

  if (c === 1 && d === 0 && u === 0) {
    texto += 'CIEN';
  } else if (c > 0) {
    texto += centenas[c] + ' ';
  }

  if (d === 1) {
    texto += especiales[u];
  } else if (d > 1) {
    texto += decenas[d];
    if (u > 0) {
      texto += ' Y ' + unidades[u];
    }
  } else if (u > 0) {
    texto += unidades[u];
  }
  return texto.trim();
}

/**
 * Convierte un monto numérico a texto en español, con formato fiscal venezolano.
 * @param amount Monto numérico.
 * @param currency Moneda (ej. 'VES', 'USD').
 * @returns Monto en texto (Ej: 'CIEN BOLIVARES CON 00/100').
 */
export const numberToWords = (amount: number, currency: 'VES' | 'USD'): string => {
  if (amount === 0) {
    return `CERO ${currency === 'VES' ? 'BOLIVARES' : 'DOLARES'} CON 00/100`;
  }

  const [entero, decimal] = amount.toFixed(2).split('.').map(Number);

  let texto = '';
  let tempEntero = entero;

  if (tempEntero === 1) {
    texto = `UN ${currency === 'VES' ? 'BOLIVAR' : 'DOLAR'}`;
  } else if (tempEntero > 1) {
    let miles = Math.floor(tempEntero / 1000);
    let unidades = tempEntero % 1000;

    if (miles > 0) {
      if (miles === 1) {
        texto += 'MIL ';
      } else {
        texto += convertirGrupo(miles) + ' MIL ';
      }
    }
    texto += convertirGrupo(unidades);

    texto = texto.trim() + ` ${currency === 'VES' ? 'BOLIVARES' : 'DOLARES'}`;
  }

  const decimalTexto = decimal.toString().padStart(2, '0');

  return `${texto} CON ${decimalTexto}/100`.trim();
};