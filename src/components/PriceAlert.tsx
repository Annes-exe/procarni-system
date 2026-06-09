import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getPriceHistoryByMaterialId } from '@/integrations/supabase/data';
import { AlertTriangle } from 'lucide-react';

interface PriceAlertProps {
  materialId?: string | null;
  unitId?: string | null;
  currentPrice: number;
  currency: 'USD' | 'VES' | 'EUR';
  exchangeRate?: number | null;
  currentOrderId?: string | null;
}

export const PriceAlert: React.FC<PriceAlertProps> = ({
  materialId,
  unitId,
  currentPrice,
  currency,
  exchangeRate,
  currentOrderId,
}) => {
  const { data: history = [], isLoading } = useQuery({
    queryKey: ['materialPriceHistoryForWarning', materialId, unitId],
    queryFn: () => getPriceHistoryByMaterialId(materialId!, unitId || undefined),
    enabled: !!materialId,
    staleTime: 1000 * 60 * 5, // 5 minutes cache
  });

  if (!materialId || typeof currentPrice !== 'number' || currentPrice <= 0 || isLoading) {
    return null;
  }

  // Filter out the current order's history record
  const filteredHistory = history.filter(
    (h) =>
      h.purchase_order_id !== currentOrderId &&
      h.service_order_id !== currentOrderId
  );

  if (filteredHistory.length === 0) {
    return null;
  }

  // The latest registered entry
  const latestEntry = filteredHistory[0];
  const registeredPrice = latestEntry.unit_price;
  const registeredCurrency = latestEntry.currency as 'USD' | 'VES' | 'EUR';
  const registeredExchangeRate = latestEntry.exchange_rate;

  // Helper to convert to a common currency (USD) for comparison
  const convertToUSD = (price: number, curr: 'USD' | 'VES' | 'EUR', rate?: number | null) => {
    if (curr === 'USD') return price;
    if (curr === 'VES' && rate && rate > 0) return price / rate;
    // fallback if no rate
    return price;
  };

  const currentPriceInUSD = convertToUSD(currentPrice, currency, exchangeRate);
  const registeredPriceInUSD = convertToUSD(registeredPrice, registeredCurrency, registeredExchangeRate);

  // Compare USD prices (with a small epsilon to avoid float inaccuracies, e.g. 0.005)
  const isHigher = currentPriceInUSD > registeredPriceInUSD + 0.005;

  if (!isHigher) {
    return null;
  }

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-50 rounded border border-amber-100 mt-1.5 text-left animate-in fade-in slide-in-from-top-1 duration-300">
      <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
      <span className="text-[10px] text-amber-700 font-medium leading-normal">
        Precio mayor al último registrado: <strong className="font-semibold">{registeredCurrency} {registeredPrice.toFixed(2)}</strong>
      </span>
    </div>
  );
};
