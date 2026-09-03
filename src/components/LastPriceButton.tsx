import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getPriceHistoryByMaterialId } from '@/integrations/supabase/data';
import { Check, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface LastPriceButtonProps {
  materialId?: string | null;
  unitId?: string | null;
  supplierId?: string | null;
  currency: 'USD' | 'VES' | 'EUR';
  exchangeRate?: number | null;
  currentOrderId?: string | null;
  currentPrice: number;
  onApplyPrice: (price: number) => void;
  autoApplyIfZero?: boolean;
  className?: string;
}

export const convertPriceToCurrency = (
  price: number,
  fromCurrency: string,
  toCurrency: 'USD' | 'VES' | 'EUR',
  currentExchangeRate?: number | null,
  entryExchangeRate?: number | null
): number => {
  if (fromCurrency === toCurrency) {
    return parseFloat(price.toFixed(2));
  }

  // Convert from origin currency to USD first
  let priceInUSD = price;
  if (fromCurrency === 'VES') {
    const rate = entryExchangeRate || currentExchangeRate || 1;
    priceInUSD = rate > 0 ? price / rate : price;
  }

  // Convert from USD to target currency
  let finalPrice = priceInUSD;
  if (toCurrency === 'VES') {
    const rate = currentExchangeRate || entryExchangeRate || 1;
    finalPrice = priceInUSD * rate;
  }

  return parseFloat(finalPrice.toFixed(2));
};

export const LastPriceButton: React.FC<LastPriceButtonProps> = ({
  materialId,
  unitId,
  supplierId,
  currency,
  exchangeRate,
  currentOrderId,
  currentPrice,
  onApplyPrice,
  className,
}) => {
  const [applied, setApplied] = React.useState(false);

  const { data: history = [], isLoading } = useQuery({
    queryKey: ['materialPriceHistoryForWarning', materialId, unitId],
    queryFn: () => getPriceHistoryByMaterialId(materialId!, unitId || undefined),
    enabled: !!materialId,
    staleTime: 1000 * 60 * 5,
  });

  // Filter out the current order's record
  const filteredHistory = React.useMemo(() => {
    return history.filter(
      (h) =>
        h.purchase_order_id !== currentOrderId &&
        h.service_order_id !== currentOrderId
    );
  }, [history, currentOrderId]);

  // Find the most relevant entry: prioritize same supplier, then latest overall
  const latestEntry = React.useMemo(() => {
    if (filteredHistory.length === 0) return null;
    if (supplierId) {
      const sameSupplierEntry = filteredHistory.find((h) => h.supplier_id === supplierId);
      if (sameSupplierEntry) return sameSupplierEntry;
    }
    return filteredHistory[0];
  }, [filteredHistory, supplierId]);

  const convertedLastPrice = React.useMemo(() => {
    if (!latestEntry) return null;
    return convertPriceToCurrency(
      latestEntry.unit_price,
      latestEntry.currency,
      currency,
      exchangeRate,
      latestEntry.exchange_rate
    );
  }, [latestEntry, currency, exchangeRate]);

  if (!materialId || isLoading || !latestEntry || convertedLastPrice === null) {
    return null;
  }

  const currencySymbol = currency === 'USD' ? '$' : currency === 'VES' ? 'Bs.' : '€';
  const isMatch = Math.abs(currentPrice - convertedLastPrice) < 0.01;

  const handleApply = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onApplyPrice(convertedLastPrice);
    setApplied(true);
    setTimeout(() => setApplied(false), 2000);
  };

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleApply}
            className={cn(
              "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-all select-none cursor-pointer",
              isMatch
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60 opacity-90"
                : "bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border border-slate-200/80 shadow-2xs hover:scale-[1.02] active:scale-[0.98]",
              className
            )}
          >
            {applied || isMatch ? (
              <Check className="h-2.5 w-2.5 text-emerald-600" />
            ) : (
              <Clock className="h-2.5 w-2.5 text-slate-400" />
            )}
            <span>
              Último: <strong className="font-semibold">{currencySymbol} {convertedLastPrice.toFixed(2)}</strong>
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <p className="font-semibold">Último precio registrado:</p>
          <p className="text-slate-300">
            {latestEntry.currency} {latestEntry.unit_price.toFixed(2)} {latestEntry.suppliers?.name ? `(${latestEntry.suppliers.name})` : ''}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">Haz clic para aplicar a este ítem.</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
