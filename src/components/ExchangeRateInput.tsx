import React, { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, RefreshCw } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';

interface ExchangeRateInputProps {
  currency: 'USD' | 'VES';
  exchangeRate?: number;
  onExchangeRateChange: (value: number | undefined) => void;
}

const ExchangeRateInput: React.FC<ExchangeRateInputProps> = ({
  currency,
  exchangeRate,
  onExchangeRateChange,
}) => {
  const [dailyRate, setDailyRate] = useState<number | undefined>(undefined);
  const [rateSource, setRateSource] = useState<'custom' | 'daily'>('custom');
  const [isLoadingRate, setIsLoadingRate] = useState(false);

  const fetchDailyRate = useCallback(async () => {
    setIsLoadingRate(true);
    try {
      const response = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
      if (!response.ok) {
        throw new Error('Failed to fetch daily rate');
      }
      const data = await response.json();
      
      const rate = data.promedio || data.valor; 
      
      if (typeof rate === 'number' && rate > 0) {
        setDailyRate(rate);
        showSuccess(`Tasa del día cargada: ${rate.toFixed(2)} VES/USD`);
        return rate;
      } else {
        throw new Error('Formato de tasa de cambio inválido.');
      }
    } catch (e: any) {
      console.error('[ExchangeRateInput] Error fetching daily rate:', e);
      showError(`Error al cargar la tasa del día: ${e.message}`);
      setDailyRate(undefined);
      return undefined;
    } finally {
      setIsLoadingRate(false);
    }
  }, []);

  // Effect to manage rate fetching and default selection when currency switches to VES
  useEffect(() => {
    if (currency === 'VES') {
      // If we switch to VES, try to fetch the daily rate and default to it
      fetchDailyRate().then(rate => {
        if (rate) {
          setRateSource('daily');
          onExchangeRateChange(rate);
        } else {
          setRateSource('custom');
          // If rate fetch fails, keep current exchangeRate or set undefined
        }
      });
    } else {
      // If we switch to USD, clear daily rate and custom rate
      setDailyRate(undefined);
      setRateSource('custom');
      onExchangeRateChange(undefined);
    }
  }, [currency]); // Only run when currency changes

  // Effect to synchronize external exchangeRate state with internal rateSource/dailyRate
  useEffect(() => {
    if (currency === 'VES') {
      if (rateSource === 'daily' && dailyRate !== undefined) {
        onExchangeRateChange(dailyRate);
      } else if (rateSource === 'custom' && exchangeRate !== undefined) {
        // If custom, ensure the external state is reflected internally if the user types
        // This is handled by the input onChange below, but this ensures external updates are caught.
      }
    }
  }, [rateSource, dailyRate]); // Run when internal rate source changes

  const handleRateSourceChange = (source: 'custom' | 'daily') => {
    setRateSource(source);
    if (source === 'daily' && dailyRate !== undefined) {
      onExchangeRateChange(dailyRate);
    } else if (source === 'custom') {
      // When switching to custom, clear the rate if it was the daily rate, 
      // allowing the user to input a new one.
      if (exchangeRate === dailyRate) {
        onExchangeRateChange(undefined);
      }
    }
  };

  const handleRefreshRate = async () => {
    const rate = await fetchDailyRate();
    if (rate && rateSource === 'daily') {
      onExchangeRateChange(rate);
    }
  };

  if (currency === 'USD') {
    return null;
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="exchangeRate">Tasa de Cambio (USD a VES)</Label>
      <Select value={rateSource} onValueChange={handleRateSourceChange}>
        <SelectTrigger id="rate-source">
          <SelectValue placeholder="Selecciona fuente de tasa" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="daily" disabled={dailyRate === undefined}>
            Tasa del día {dailyRate ? `(${dailyRate.toFixed(2)} VES/USD)` : '(Cargando...)'}
          </SelectItem>
          <SelectItem value="custom">Tasa personalizada</SelectItem>
        </SelectContent>
      </Select>

      {rateSource === 'daily' && (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            step="0.01"
            value={exchangeRate || dailyRate || ''}
            placeholder="Tasa del día"
            disabled
            className="bg-gray-100 dark:bg-gray-700"
          />
          <Button 
            variant="outline" 
            size="icon" 
            onClick={handleRefreshRate} 
            disabled={isLoadingRate}
          >
            {isLoadingRate ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      )}

      {rateSource === 'custom' && (
        <Input
          id="exchangeRate"
          type="number"
          step="0.01"
          value={exchangeRate || ''}
          onChange={(e) => onExchangeRateChange(parseFloat(e.target.value) || undefined)}
          placeholder="Ej: 36.50"
        />
      )}
    </div>
  );
};

export default ExchangeRateInput;