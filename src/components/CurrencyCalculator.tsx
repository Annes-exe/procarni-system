import React, { useState, useEffect, useCallback } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Calculator, 
  RefreshCw, 
  History, 
  TrendingUp, 
  DollarSign, 
  Euro,
  Calendar,
  Loader2
} from 'lucide-react';
import { currencyService, CurrencyRate, HistoryRate } from '@/services/currencyService';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ScrollArea } from '@/components/ui/scroll-area';
import { m, AnimatePresence } from 'framer-motion';

const CurrencyCalculator = () => {
  const [usdRate, setUsdRate] = useState<CurrencyRate | null>(null);
  const [eurRate, setEurRate] = useState<CurrencyRate | null>(null);
  const [usdHistory, setUsdHistory] = useState<HistoryRate[]>([]);
  const [eurHistory, setEurHistory] = useState<HistoryRate[]>([]);
  
  const [isLoading, setIsLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [activeCurrency, setActiveCurrency] = useState<'USD' | 'EUR'>('USD');
  
  // Values for calculation
  const [vesValue, setVesValue] = useState<string>('');
  const [usdValue, setUsdValue] = useState<string>('');
  const [eurValue, setEurValue] = useState<string>('');
  
  // Custom/Selected rates
  const [selectedUsdRate, setSelectedUsdRate] = useState<number | null>(null);
  const [selectedEurRate, setSelectedEurRate] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [usd, eur, usdHist, eurHist] = await Promise.all([
        currencyService.getUsdRate(),
        currencyService.getEurRate(),
        currencyService.getUsdHistory(),
        currencyService.getEurHistory()
      ]);
      
      setUsdRate(usd);
      setEurRate(eur);
      setUsdHistory(usdHist);
      setEurHistory(eurHist);
      
      if (!selectedUsdRate) setSelectedUsdRate(usd.promedio || usd.valor);
      if (!selectedEurRate) setSelectedEurRate(eur.promedio || eur.valor);
    } catch (error) {
      console.error('Error fetching currency data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedUsdRate, selectedEurRate]);

  useEffect(() => {
    fetchData();
  }, []);

  const calculateFromVes = (val: string) => {
    setVesValue(val);
    const num = parseFloat(val);
    if (isNaN(num)) {
      setUsdValue('');
      setEurValue('');
      return;
    }
    
    if (selectedUsdRate) setUsdValue((num / selectedUsdRate).toFixed(2));
    if (selectedEurRate) setEurValue((num / selectedEurRate).toFixed(2));
  };

  const calculateFromUsd = (val: string) => {
    setUsdValue(val);
    const num = parseFloat(val);
    if (isNaN(num)) {
      setVesValue('');
      setEurValue('');
      return;
    }
    
    if (selectedUsdRate) {
      const ves = num * selectedUsdRate;
      setVesValue(ves.toFixed(2));
      if (selectedEurRate) setEurValue((ves / selectedEurRate).toFixed(2));
    }
  };

  const calculateFromEur = (val: string) => {
    setEurValue(val);
    const num = parseFloat(val);
    if (isNaN(num)) {
      setVesValue('');
      setUsdValue('');
      return;
    }
    
    if (selectedEurRate) {
      const ves = num * selectedEurRate;
      setVesValue(ves.toFixed(2));
      if (selectedUsdRate) setUsdValue((ves / selectedUsdRate).toFixed(2));
    }
  };

  const handleSelectHistoryRate = (rate: number) => {
    if (activeCurrency === 'USD') {
      setSelectedUsdRate(rate);
      if (vesValue) calculateFromVes(vesValue);
    } else {
      setSelectedEurRate(rate);
      if (vesValue) calculateFromVes(vesValue);
    }
    setShowHistory(false);
  };

  const resetRates = () => {
    if (usdRate) setSelectedUsdRate(usdRate.promedio || usdRate.valor);
    if (eurRate) setSelectedEurRate(eurRate.promedio || eurRate.valor);
    if (vesValue) calculateFromVes(vesValue);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="relative h-11 w-11 rounded-2xl bg-gray-100/50 hover:bg-procarni-primary/10 text-procarni-primary transition-all duration-300 ring-1 ring-gray-200/50 hover:ring-procarni-primary/30 group"
        >
          <Calculator className="h-5 w-5 group-hover:scale-110 transition-transform" />
          <AnimatePresence>
            {isLoading && (
              <m.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute -top-1 -right-1"
              >
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-procarni-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-procarni-primary"></span>
                </span>
              </m.div>
            )}
          </AnimatePresence>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 overflow-hidden rounded-[1.5rem] border-none shadow-2xl ring-1 ring-black/5 bg-white/95 backdrop-blur-xl" align="end" sideOffset={8}>
        <div className="bg-procarni-primary p-4 text-white">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Calculadora de Divisas
            </h3>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-white hover:bg-white/20 rounded-lg"
              onClick={fetchData}
              disabled={isLoading}
            >
              <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            </Button>
          </div>
          <p className="text-[11px] opacity-80 font-medium">
            Tasa BCV Oficial - {format(new Date(), "dd 'de' MMMM", { locale: es })}
          </p>
        </div>

        <div className="p-4 space-y-4">
          <AnimatePresence mode="wait">
            {!showHistory ? (
              <m.div 
                key="calculator"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                {/* Inputs */}
                <div className="space-y-3">
                  <div className="relative">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Bolívares (VES)</label>
                    <div className="relative">
                      <Input 
                        type="number"
                        placeholder="0.00"
                        value={vesValue}
                        onChange={(e) => calculateFromVes(e.target.value)}
                        className="pl-9 h-12 rounded-xl border-gray-100 focus:ring-procarni-primary/20"
                      />
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">Bs</span>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="flex-1 relative">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Dólares (USD)</label>
                      <div className="relative">
                        <Input 
                          type="number"
                          placeholder="0.00"
                          value={usdValue}
                          onChange={(e) => calculateFromUsd(e.target.value)}
                          className="pl-8 h-12 rounded-xl border-gray-100 focus:ring-procarni-primary/20"
                        />
                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      </div>
                    </div>
                    <div className="flex-1 relative">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Euros (EUR)</label>
                      <div className="relative">
                        <Input 
                          type="number"
                          placeholder="0.00"
                          value={eurValue}
                          onChange={(e) => calculateFromEur(e.target.value)}
                          className="pl-8 h-12 rounded-xl border-gray-100 focus:ring-procarni-primary/20"
                        />
                        <Euro className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Currency Toggle (Slide) - NOW MOVED ABOVE RATE BOX */}
                <div className="flex bg-gray-100 p-1 rounded-xl">
                  <button 
                    onClick={() => { setActiveCurrency('USD'); setShowHistory(false); }}
                    className={cn(
                      "flex-1 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1",
                      activeCurrency === 'USD' ? "bg-white text-procarni-primary shadow-sm" : "text-gray-500 hover:text-gray-700"
                    )}
                  >
                    <DollarSign className="h-3 w-3" /> USD
                  </button>
                  <button 
                    onClick={() => { setActiveCurrency('EUR'); setShowHistory(false); }}
                    className={cn(
                      "flex-1 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1",
                      activeCurrency === 'EUR' ? "bg-white text-procarni-primary shadow-sm" : "text-gray-500 hover:text-gray-700"
                    )}
                  >
                    <Euro className="h-3 w-3" /> EUR
                  </button>
                </div>

                {/* Selected Rate Info */}
                <div className="bg-procarni-primary/5 p-3 rounded-xl border border-procarni-primary/10">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] font-bold text-procarni-primary uppercase">Tasa en uso ({activeCurrency})</span>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-6 text-[10px] font-bold text-procarni-primary hover:bg-procarni-primary/10"
                      onClick={() => setShowHistory(true)}
                    >
                      <History className="h-3 w-3 mr-1" /> Ver Historial
                    </Button>
                  </div>
                  <div className="flex justify-between items-end">
                    <span className="text-xl font-black text-procarni-blue tracking-tighter">
                      {activeCurrency === 'USD' ? selectedUsdRate?.toFixed(2) : selectedEurRate?.toFixed(2)}
                      <span className="text-[10px] text-gray-400 ml-1 font-medium">VES / {activeCurrency}</span>
                    </span>
                    {(activeCurrency === 'USD' ? selectedUsdRate !== usdRate?.promedio : selectedEurRate !== eurRate?.promedio) && (
                      <Button 
                        variant="link" 
                        className="h-auto p-0 text-[10px] text-amber-600 font-bold"
                        onClick={resetRates}
                      >
                        Resetear a hoy
                      </Button>
                    )}
                  </div>
                </div>
              </m.div>
            ) : (
              <m.div 
                key="history"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-gray-600 flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    Historial {activeCurrency}
                  </h4>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-7 text-[10px] font-bold"
                    onClick={() => setShowHistory(false)}
                  >
                    Volver
                  </Button>
                </div>
                
                <ScrollArea className="h-[200px] rounded-xl border border-gray-100">
                  <div className="divide-y divide-gray-50">
                    {(activeCurrency === 'USD' ? usdHistory : eurHistory).map((item, idx) => (
                      <button 
                        key={idx}
                        className="w-full px-3 py-2.5 flex items-center justify-between hover:bg-gray-50 transition-colors group"
                        onClick={() => handleSelectHistoryRate(item.promedio || item.valor)}
                      >
                        <div className="text-left">
                          <p className="text-[10px] text-gray-400 font-medium">
                            {(() => {
                              const dateStr = item.fecha.split('T')[0];
                              const [year, month, day] = dateStr.split('-');
                              const localDate = new Date(Number(year), Number(month) - 1, Number(day));
                              return format(localDate, "eee, dd MMM", { locale: es });
                            })()}
                          </p>
                          <p className="text-sm font-bold text-procarni-blue">
                            {item.promedio || item.valor}
                          </p>
                        </div>
                        <TrendingUp className="h-3.5 w-3.5 text-procarni-secondary opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </m.div>
            )}
          </AnimatePresence>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default CurrencyCalculator;
