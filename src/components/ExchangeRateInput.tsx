import React, { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, RefreshCw, Info, History, Calendar } from 'lucide-react';
import { showError, showSuccess, showWarning } from '@/utils/toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface ExchangeRateInputProps {
  baseCurrency: 'USD' | 'EUR';
  exchangeRate?: number;
  onExchangeRateChange: (value: number | undefined) => void;
}

interface RateHistoryItem {
  fecha: string;
  promedio: number;
}

const ExchangeRateInput: React.FC<ExchangeRateInputProps> = ({
  baseCurrency,
  exchangeRate,
  onExchangeRateChange,
}) => {
  const [dailyRate, setDailyRate] = useState<number | undefined>(undefined);
  const [rateSource, setRateSource] = useState<'custom' | 'daily'>('custom');
  const [isLoadingRate, setIsLoadingRate] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const [history, setHistory] = useState<RateHistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const fetchDailyRate = useCallback(async () => {
    setIsLoadingRate(true);
    try {
      const endpoint = baseCurrency === 'EUR'
        ? 'https://ve.dolarapi.com/v1/euros/oficial'
        : 'https://ve.dolarapi.com/v1/dolares/oficial';

      const response = await fetch(endpoint);
      if (!response.ok) {
        throw new Error('Failed to fetch daily rate');
      }
      const data = await response.json();

      const rate = data.promedio || data.valor;
      const updateDate = data.fechaActualizacion;

      if (typeof rate === 'number' && rate > 0) {
        setDailyRate(rate);

        // Holiday detection logic: check if the update date is today
        if (updateDate) {
          const apiDate = new Date(updateDate);
          const today = new Date();
          const isSameDay = apiDate.getUTCFullYear() === today.getUTCFullYear() &&
            apiDate.getUTCMonth() === today.getUTCMonth() &&
            apiDate.getUTCDate() === today.getUTCDate();

          setIsStale(!isSameDay);
        }

        showSuccess(`Tasa ${baseCurrency === 'EUR' ? 'Euro' : 'Dólar'} cargada: ${rate.toFixed(2)} VES/${baseCurrency}`);
        return rate;
      } else {
        throw new Error('Formato de tasa de cambio inválido.');
      }
    } catch (e: unknown) {
      console.error('[ExchangeRateInput] Error fetching daily rate:', e);
      const errorMessage = e instanceof Error ? e.message : 'Error desconocido';
      showError(`Error al cargar la tasa del día: ${errorMessage}`);
      setDailyRate(undefined);
      return undefined;
    } finally {
      setIsLoadingRate(false);
    }
  }, [baseCurrency]);

  const fetchHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const endpoint = baseCurrency === 'EUR'
        ? 'https://ve.dolarapi.com/v1/historicos/euros/oficial'
        : 'https://ve.dolarapi.com/v1/historicos/dolares/oficial';
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error('Failed to fetch history');
      const data = await response.json();
      // Reverse to show most recent first and take last 15 days
      setHistory(data.slice(-15).reverse());
    } catch (e) {
      console.error('[ExchangeRateInput] Error fetching history:', e);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [baseCurrency]);

  // Effect to manage rate fetching and default selection when currency changes
  useEffect(() => {
    // We always try to fetch the daily rate and default to it (even for USD, we fetch USD rate)
    fetchDailyRate().then(rate => {
      if (rate) {
        setRateSource('daily');
        onExchangeRateChange(rate);
      } else {
        setRateSource('custom');
      }
    });
  }, [baseCurrency, fetchDailyRate, onExchangeRateChange]);

  // Effect to synchronize external exchangeRate state with internal rateSource/dailyRate
  useEffect(() => {
    if (rateSource === 'daily' && dailyRate !== undefined) {
      onExchangeRateChange(dailyRate);
    }
  }, [rateSource, dailyRate, exchangeRate, onExchangeRateChange]);

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


  const handleSelectHistoricalRate = (rate: number) => {
    setRateSource('custom');
    onExchangeRateChange(rate);
    showWarning(`Se ha seleccionado una tasa de cambio anterior: ${rate.toFixed(2)} VES/${baseCurrency}`);
    setIsDialogOpen(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <Label htmlFor="exchangeRate">
          Tasa de Cambio ({baseCurrency} a VES)
        </Label>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs flex items-center gap-1 text-muted-foreground hover:text-procarni-primary"
                onClick={fetchHistory}
              >
                <History className="h-3 w-3" />
                Historial
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-procarni-primary" />
                  Historial de Tasas ({baseCurrency === 'EUR' ? 'Euro' : 'Dólar'})
                </DialogTitle>
              </DialogHeader>
              <div className="py-2">
                {isLoadingHistory ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-procarni-primary" />
                  </div>
                ) : (
                  <ScrollArea className="h-[300px] pr-4">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Fecha</TableHead>
                          <TableHead className="text-right">Tasa (BCV)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {history.map((item, idx) => (
                          <TableRow 
                            key={idx} 
                            className="cursor-pointer hover:bg-gray-100 transition-colors"
                            onClick={() => handleSelectHistoricalRate(item.promedio)}
                          >
                            <TableCell className="font-medium">
                              {(() => {
                                // Extract just the date part (YYYY-MM-DD) to avoid timezone shifts
                                const dateStr = item.fecha.split('T')[0];
                                const [year, month, day] = dateStr.split('-');
                                const localDate = new Date(Number(year), Number(month) - 1, Number(day));
                                return format(localDate, "PPP", { locale: es });
                              })()}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {item.promedio.toFixed(2)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}
              </div>
            </DialogContent>
          </Dialog>
      </div>

      <Select value={rateSource} onValueChange={handleRateSourceChange}>
        <SelectTrigger id="rate-source">
          <SelectValue placeholder="Selecciona fuente de tasa" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="daily" disabled={dailyRate === undefined}>
            Tasa oficial {dailyRate ? `(${dailyRate.toFixed(2)} VES/${baseCurrency})` : '(Cargando...)'}
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
            placeholder="Tasa oficial"
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

      {isStale && (
        <p className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded border border-amber-200 mt-1 flex items-start gap-1">
          <Info className="h-3 w-3 shrink-0 mt-0.5 text-amber-500" />
          <span>
            <strong>Tasa no actualizada:</strong> La tasa oficial del BCV no coincide con la fecha de hoy. Esto suele ocurrir en feriados o fines de semana. Se recomienda usar una <strong>tasa personalizada</strong>.
          </span>
        </p>
      )}

      {!isStale && (
        <p className="text-[11px] text-muted-foreground bg-blue-50/50 p-2 rounded border border-blue-100/50 mt-1">
          <Info className="h-3 w-3 inline mr-1 text-blue-500" />
          Tasa oficial actualizada para el cierre del día.
        </p>
      )}
    </div>
  );
};

export default ExchangeRateInput;