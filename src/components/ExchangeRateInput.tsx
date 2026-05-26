import React, { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
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
import { currencyService, getEffectiveRate, parseLocalDate, toLocalDateString, findRateForDate } from '@/services/currencyService';

interface ExchangeRateInputProps {
  baseCurrency: 'USD' | 'EUR';
  exchangeRate?: number;
  onExchangeRateChange: (value: number | undefined) => void;
  disableAutoFetch?: boolean;
  compact?: boolean;
  issueDate?: Date;
}

interface RateHistoryItem {
  fecha: string;
  promedio: number;
}

const ExchangeRateInput: React.FC<ExchangeRateInputProps> = ({
  baseCurrency,
  exchangeRate,
  onExchangeRateChange,
  disableAutoFetch = false,
  compact = false,
  issueDate,
}) => {
  const [dailyRate, setDailyRate] = useState<number | undefined>(undefined);
  const [rateSource, setRateSource] = useState<'custom' | 'daily'>('daily');
  const [isLoadingRate, setIsLoadingRate] = useState(false);
  const [nextDayWarningStr, setNextDayWarningStr] = useState<string | null>(null);
  const [history, setHistory] = useState<RateHistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const fetchDailyRate = useCallback(async () => {
    setIsLoadingRate(true);
    try {
      const [rateObj, historyList] = await Promise.all([
        baseCurrency === 'EUR' ? currencyService.getEurRate() : currencyService.getUsdRate(),
        baseCurrency === 'EUR' ? currencyService.getEurHistory() : currencyService.getUsdHistory()
      ]);

      const effective = getEffectiveRate(rateObj, historyList);
      if (!effective) throw new Error('No se pudo obtener la tasa');

      const rate = effective.promedio || effective.valor;

      if (typeof rate === 'number' && rate > 0) {
        setDailyRate(rate);

        const updateDateObj = parseLocalDate(effective.fechaActualizacion);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (updateDateObj.getTime() > today.getTime()) {
           setNextDayWarningStr(format(updateDateObj, "eeee dd 'de' MMMM", { locale: es }));
        } else {
           setNextDayWarningStr(null);
        }

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
      const historyList = await (baseCurrency === 'EUR' ? currencyService.getEurHistory() : currencyService.getUsdHistory());
      // Take the most recent 15 days (the list is already reversed/most recent first)
      setHistory(historyList.slice(0, 15));
    } catch (e) {
      console.error('[ExchangeRateInput] Error fetching history:', e);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [baseCurrency]);

  const resolvedIssueDate = React.useMemo(() => {
    return issueDate || new Date();
  }, [issueDate]);

  const isFirstRender = React.useRef(true);
  const lastProcessedKey = React.useRef<string>('');
  const exchangeRateRef = React.useRef(exchangeRate);

  useEffect(() => {
    exchangeRateRef.current = exchangeRate;
  }, [exchangeRate]);

  // Effect to manage rate fetching and default selection when currency or emission date changes
  useEffect(() => {
    const dateStr = toLocalDateString(resolvedIssueDate);
    const key = `${baseCurrency}-${dateStr}`;

    if (lastProcessedKey.current === key) return;
    lastProcessedKey.current = key;

    const initializeOrUpdateRate = async () => {
      setIsLoadingRate(true);
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const compareDate = new Date(resolvedIssueDate);
        compareDate.setHours(0, 0, 0, 0);

        const isTodayOrFuture = compareDate.getTime() >= today.getTime();

        if (isFirstRender.current) {
          isFirstRender.current = false;
          if (disableAutoFetch) {
            // First render with auto-fetch disabled: resolve historical rate but preserve the prop value
            const historyList = await (baseCurrency === 'EUR' ? currencyService.getEurHistory() : currencyService.getUsdHistory());
            setHistory(historyList.slice(0, 15));

            let resolvedRate: number | undefined;
            if (isTodayOrFuture) {
              const dailyRateObj = baseCurrency === 'EUR' ? await currencyService.getEurRate() : await currencyService.getUsdRate();
              const effective = getEffectiveRate(dailyRateObj, historyList);
              resolvedRate = effective ? (effective.promedio || effective.valor) : undefined;
            } else {
              const matched = findRateForDate(resolvedIssueDate, historyList);
              resolvedRate = matched ? (matched.promedio || matched.valor) : undefined;
            }

            const currentExchangeRate = exchangeRateRef.current;
            if (resolvedRate !== undefined && currentExchangeRate !== undefined && Math.abs(resolvedRate - currentExchangeRate) < 0.001) {
              setDailyRate(resolvedRate);
              setRateSource('daily');
            } else {
              setDailyRate(resolvedRate);
              setRateSource('custom');
            }
            return;
          }
        }

        // Normal flow (subsequent changes, or first render with disableAutoFetch = false)
        if (isTodayOrFuture) {
          const rate = await fetchDailyRate();
          if (rate) {
            setRateSource('daily');
            onExchangeRateChange(rate);
          }
        } else {
          const historyList = await (baseCurrency === 'EUR' ? currencyService.getEurHistory() : currencyService.getUsdHistory());
          setHistory(historyList.slice(0, 15));

          const matched = findRateForDate(resolvedIssueDate, historyList);
          if (matched) {
            const rate = matched.promedio || matched.valor;
            setDailyRate(rate);
            setRateSource('daily');
            onExchangeRateChange(rate);

            const matchedDate = parseLocalDate(matched.fecha);
            const formattedMatchedDate = format(matchedDate, "dd/MM/yyyy");
            showSuccess(`Tasa oficial seleccionada para el ${format(resolvedIssueDate, "dd/MM/yyyy")}: ${rate.toFixed(2)} VES/${baseCurrency} (Tasa del ${formattedMatchedDate})`);
          } else {
            showWarning(`No se encontró tasa histórica para el ${format(resolvedIssueDate, "dd/MM/yyyy")}. Ingrese una tasa personalizada.`);
            setRateSource('custom');
            onExchangeRateChange(undefined);
          }
        }
      } catch (e) {
        console.error('[ExchangeRateInput] Error resolving rate:', e);
      } finally {
        setIsLoadingRate(false);
      }
    };

    initializeOrUpdateRate();
  }, [resolvedIssueDate, baseCurrency, disableAutoFetch, fetchDailyRate, onExchangeRateChange]);

  // Effect to synchronize external exchangeRate state with internal rateSource/dailyRate
  useEffect(() => {
    if (rateSource === 'daily' && dailyRate !== undefined && dailyRate !== exchangeRate) {
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
    if (rate) {
      showSuccess(`Tasa ${baseCurrency === 'EUR' ? 'Euro' : 'Dólar'} cargada: ${rate.toFixed(2)} VES/${baseCurrency}`);
      if (rateSource === 'daily') {
        onExchangeRateChange(rate);
      }
    }
  };


  const handleSelectHistoricalRate = (rate: number) => {
    setRateSource('custom');
    onExchangeRateChange(rate);
    showWarning(`Se ha seleccionado una tasa de cambio anterior: ${rate.toFixed(2)} VES/${baseCurrency}`);
    setIsDialogOpen(false);
  };

  return (
    <div className={cn("space-y-3", compact && "space-y-2")}>
      {!compact && (
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
      )}

      {compact && (
        <div className="flex items-center justify-between mb-1">
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Tasa</label>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-4 w-4 text-gray-400 hover:text-procarni-primary" onClick={fetchHistory}>
                <History className="h-3 w-3" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Historial de Tasas</DialogTitle>
              </DialogHeader>
              <div className="py-2">
                {isLoadingHistory ? (
                  <div className="flex justify-center p-4"><Loader2 className="h-6 w-6 animate-spin text-procarni-primary" /></div>
                ) : (
                  <ScrollArea className="h-[250px]">
                    <Table>
                      <TableBody>
                        {history.map((item, idx) => (
                          <TableRow key={idx} className="cursor-pointer hover:bg-gray-50" onClick={() => handleSelectHistoricalRate(item.promedio)}>
                            <TableCell className="text-xs">
                              {item.fecha.split('T')[0]}
                            </TableCell>
                            <TableCell className="text-right text-xs font-mono">{item.promedio.toFixed(2)}</TableCell>
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
      )}

      <Select value={rateSource} onValueChange={handleRateSourceChange}>
        <SelectTrigger id="rate-source" className={cn(compact && "h-8 text-xs")}>
          <SelectValue placeholder="Selecciona fuente de tasa" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="daily">
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
            className={cn("bg-gray-100 dark:bg-gray-700", compact && "h-8 text-xs")}
          />
          <Button
            variant="outline"
            size="icon"
            className={cn(compact && "h-8 w-8")}
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
          className={cn(compact && "h-8 text-xs")}
        />
      )}

      {!compact && nextDayWarningStr && (
        <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2.5 mt-2">
          <Calendar className="h-4 w-4 text-amber-500 shrink-0 mt-0.5 animate-pulse" />
          <div className="flex-1">
            <p className="text-[10px] font-black text-amber-600 uppercase tracking-wider">Tasa del Día Siguiente</p>
            <p className="text-[10px] text-gray-600 font-medium mt-0.5 leading-relaxed">
              Por feriado o día bancario, se está utilizando la tasa oficial del próximo día hábil ({nextDayWarningStr}).
            </p>
          </div>
        </div>
      )}

      {!compact && !nextDayWarningStr && (
        <p className="text-[11px] text-muted-foreground bg-blue-50/50 p-2 rounded border border-blue-100/50 mt-1 flex items-start gap-1">
          <Info className="h-3 w-3 inline mt-0.5 text-blue-500 shrink-0" />
          <span>Tasa oficial actualizada para el cierre del día.</span>
        </p>
      )}
    </div>
  );
};

export default ExchangeRateInput;