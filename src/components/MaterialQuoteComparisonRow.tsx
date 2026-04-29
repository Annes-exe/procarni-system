import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { PlusCircle, Trash2, Scale, X, CheckCircle2, ChevronRight, Tags, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getSuppliersByMaterial, getAllSuppliers } from '@/integrations/supabase/data';
import ExchangeRateInput from './ExchangeRateInput';
import { isGenericRif } from '@/utils/validators';
import { useIsMobile, useIsTablet } from '@/hooks/use-mobile';

interface MaterialSearchResult {
  id: string;
  name: string;
  code: string;
}

interface SupplierResult {
  id: string;
  name: string;
  rif: string;
  code?: string;
}

interface QuoteEntry {
  supplierId: string;
  supplierName: string;
  unitPrice: number;
  currency: 'USD' | 'VES' | 'EUR';
  exchangeRate?: number;
}

interface ComparisonResult {
  material: MaterialSearchResult;
  results: (QuoteEntry & { convertedPrice: number | null; isValid: boolean; error: string | null })[];
  bestPrice: number | null;
}

interface MaterialQuoteComparisonRowProps {
  comparisonData: ComparisonResult;
  baseCurrency: 'USD' | 'VES' | 'EUR'; // This will now always be 'USD' from the parent
  globalExchangeRate?: number;
  globalEurRate?: number;
  onAddQuoteEntry: (materialId: string) => void;
  onRemoveQuoteEntry: (materialId: string, quoteIndex: number) => void;
  // Updated signature to include optional supplierName for supplierId changes
  onQuoteChange: (materialId: string, quoteIndex: number, field: keyof QuoteEntry, value: any, supplierName?: string) => void;
  onRemoveMaterial: (materialId: string) => void;
}

const MaterialQuoteComparisonRow: React.FC<MaterialQuoteComparisonRowProps> = ({
  comparisonData,
  baseCurrency,
  globalExchangeRate,
  globalEurRate,
  onAddQuoteEntry,
  onRemoveQuoteEntry,
  onQuoteChange,
  onRemoveMaterial,
}) => {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const { material, results, bestPrice } = comparisonData;

  // Fetch suppliers associated with this specific material ID
  const { data: associatedSuppliers, isLoading: isLoadingAssociated } = useQuery<SupplierResult[]>({
    queryKey: ['suppliersByMaterial', material.id],
    queryFn: async () => {
      const fetchedResults = await getSuppliersByMaterial(material.id);
      return fetchedResults.map((s: any) => ({
        id: s.id,
        name: s.name,
        rif: s.rif,
        code: s.code,
      }));
    },
    enabled: !!material.id,
  });

  const { data: allSuppliers, isLoading: isLoadingAll } = useQuery({
    queryKey: ['allSuppliers'],
    queryFn: async () => {
      const fetchedResults = await getAllSuppliers();
      return fetchedResults.map((s: any) => ({
        id: s.id,
        name: s.name,
        rif: s.rif,
        code: s.code,
      }));
    },
  });

  const isLoadingSuppliers = isLoadingAssociated || isLoadingAll;

  const formatPrice = (price: number | null, currency: string) => {
    if (price === null || isNaN(price)) return 'N/A';
    return `${currency} ${price.toFixed(2)}`;
  };

  const handleQuoteUpdate = React.useCallback((index: number, field: keyof QuoteEntry, value: any) => {
    onQuoteChange(material.id, index, field, value);
  }, [material.id, onQuoteChange]);

  const handlePriceChange = React.useCallback((index: number, value: string) => {
    handleQuoteUpdate(index, 'unitPrice', parseFloat(value) || 0);
  }, [handleQuoteUpdate]);

  const handleCurrencyChange = React.useCallback((index: number, value: string) => {
    handleQuoteUpdate(index, 'currency', value as 'USD' | 'VES' | 'EUR');
  }, [handleQuoteUpdate]);

  const handleExchangeRateChange = React.useCallback((index: number, value: number | undefined) => {
    handleQuoteUpdate(index, 'exchangeRate', value);
  }, [handleQuoteUpdate]);

  const supplierOptions = useMemo(() => {
    if (isLoadingSuppliers) {
      return { associated: [], others: [] };
    }
    
    const associatedIds = new Set(associatedSuppliers?.map(s => s.id) || []);
    const otherSuppliers = allSuppliers?.filter(s => !associatedIds.has(s.id)) || [];

    return {
      associated: associatedSuppliers || [],
      others: otherSuppliers
    };
  }, [associatedSuppliers, allSuppliers, isLoadingSuppliers]);

  const handleSupplierChange = (materialId: string, quoteIndex: number, supplierId: string) => {
    const selectedSupplier = associatedSuppliers?.find(s => s.id === supplierId) || allSuppliers?.find(s => s.id === supplierId);
    const supplierName = selectedSupplier?.name || '';

    // Pass both ID and Name back to the parent
    onQuoteChange(materialId, quoteIndex, 'supplierId', supplierId, supplierName);
  };

  // Sub-component for supplier selection to handle local popover state
  const SupplierSelector = ({ 
    quote, 
    index 
  }: { 
    quote: any, 
    index: number 
  }) => {
    const [open, setOpen] = useState(false);

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "w-full justify-between h-9 px-3 text-left font-normal bg-white/50 focus:bg-white transition-colors",
              !quote.supplierId && "text-muted-foreground"
            )}
            disabled={isLoadingSuppliers}
          >
            <span className="truncate">
              {quote.supplierId 
                ? (quote.supplierName || "Proveedor seleccionado") 
                : "Selecciona proveedor..."}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar proveedor..." />
            <CommandList className="max-h-[300px]">
              <CommandEmpty>No se encontró proveedor.</CommandEmpty>
              
              {supplierOptions.associated.length > 0 && (
                <CommandGroup heading="Proveedores Sugeridos">
                  {supplierOptions.associated.map((supplier) => (
                    <CommandItem
                      key={supplier.id}
                      value={supplier.name}
                      onSelect={() => {
                        handleSupplierChange(material.id, index, supplier.id);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          quote.supplierId === supplier.id ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <div className="flex flex-col">
                        <span>{supplier.name}</span>
                        {isGenericRif(supplier.rif) && (
                          <span className="text-[10px] text-amber-600 font-medium">Rif Faltante</span>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {supplierOptions.others.length > 0 && (
                <CommandGroup heading="Otros Proveedores">
                  {supplierOptions.others.map((supplier) => (
                    <CommandItem
                      key={supplier.id}
                      value={supplier.name}
                      onSelect={() => {
                        handleSupplierChange(material.id, index, supplier.id);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          quote.supplierId === supplier.id ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <div className="flex flex-col">
                        <span>{supplier.name}</span>
                        {isGenericRif(supplier.rif) && (
                          <span className="text-[10px] text-amber-600 font-medium">Rif Faltante</span>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  };

  return (
    <div className="p-2 sm:p-4">
      <div className="pb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-gray-100 gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-procarni-primary/10 flex items-center justify-center shrink-0">
            <Tags className="h-5 w-5 text-procarni-primary" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-procarni-dark leading-tight">
              {material.name}
            </h3>
            <p className="text-xs font-mono text-muted-foreground mt-0.5">
              Ref: {material.code}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => onRemoveMaterial(material.id)} className="text-destructive hover:bg-destructive/10 hover:text-destructive shrink-0 self-end sm:self-auto">
          <Trash2 className="h-4 w-4 mr-2" /> Eliminar Material
        </Button>
      </div>

      <div className="pt-4">
        {isTablet ? (
          <div className="flex flex-col gap-4 w-full">
            {results.map((quote, index) => {
              const isBestPrice = quote.isValid && quote.convertedPrice === bestPrice;
              return (
                <Card key={index} className={cn(
                  "border shadow-sm relative overflow-hidden transition-all",
                  isBestPrice ? "border-procarni-secondary bg-green-50/20 ring-1 ring-procarni-secondary/30" : "border-gray-100 bg-white",
                  !isMobile ? "p-3" : "p-4"
                )}>
                  {isBestPrice && (
                    <div className="absolute top-0 right-0 bg-procarni-secondary text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg flex items-center gap-1 z-10">
                      <CheckCircle2 className="h-3 w-3" /> MEJOR PRECIO
                    </div>
                  )}
                  
                  {/* Row 1: Supplier and Delete Button */}
                  <div className={cn("flex items-end gap-2", !isMobile ? "mb-3" : "mb-4")}>
                    <div className="flex-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Proveedor</label>
                      <SupplierSelector quote={quote} index={index} />
                    </div>
                    {results.length > 1 && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => onRemoveQuoteEntry(material.id, index)} 
                        className={cn("text-destructive hover:bg-red-50 shrink-0", !isMobile ? "h-9 w-9" : "h-10 w-10")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  {/* Row 2: Price Inputs and Result */}
                  {!isMobile ? (
                    // Compact Tablet Layout (Row 2)
                    <div className="flex flex-wrap items-end gap-4 w-full">
                      <div className="flex-1 min-w-[140px]">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Precio Original</label>
                        <div className="relative">
                          <span className="absolute left-3 top-2.5 text-gray-400 text-sm">{quote.currency === 'USD' ? '$' : 'Bs'}</span>
                          <Input
                            type="number"
                            step="0.01"
                            value={quote.unitPrice || ''}
                            onChange={(e) => onQuoteChange(material.id, index, 'unitPrice', parseFloat(e.target.value) || 0)}
                            onWheel={(e) => (e.target as HTMLElement).blur()}
                            className="h-10 pl-8 text-base bg-gray-50/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none w-full font-semibold"
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                      <div className="w-[100px] shrink-0">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Moneda</label>
                        <Select
                          value={quote.currency}
                          onValueChange={(value) => onQuoteChange(material.id, index, 'currency', value as 'USD' | 'VES' | 'EUR')}
                        >
                          <SelectTrigger className="h-10 text-sm bg-gray-50/50 font-medium">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="USD">USD</SelectItem>
                            <SelectItem value="VES">VES</SelectItem>
                            <SelectItem value="EUR">EUR</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="w-[140px] shrink-0">
                        <ExchangeRateInput
                          compact
                          baseCurrency={quote.currency === 'EUR' ? 'EUR' : 'USD'}
                          exchangeRate={quote.exchangeRate || globalExchangeRate}
                          onExchangeRateChange={(val) => onQuoteChange(material.id, index, 'exchangeRate', val)}
                          disableAutoFetch={true}
                        />
                      </div>
                      <div className={cn(
                        "flex-1 min-w-[150px] flex items-center justify-between px-3 h-10 rounded-lg border",
                        isBestPrice ? "bg-procarni-secondary/10 border-procarni-secondary/30" : "bg-gray-50 border-gray-100"
                      )}>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">Total USD</span>
                        <div className="text-right">
                          <span className={cn(
                            "text-base font-bold block",
                            isBestPrice ? "text-procarni-secondary" : "text-procarni-dark"
                          )}>
                            {formatPrice(quote.convertedPrice, '')}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    // Standard Mobile Layout (Rows 2, 3, 4)
                    <>
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Precio Original</label>
                          <div className="relative">
                            <span className="absolute left-2.5 top-2.5 text-gray-400 text-xs">{quote.currency === 'USD' ? '$' : 'Bs'}</span>
                            <Input
                              type="number"
                              step="0.01"
                              value={quote.unitPrice || ''}
                              onChange={(e) => onQuoteChange(material.id, index, 'unitPrice', parseFloat(e.target.value) || 0)}
                              onWheel={(e) => (e.target as HTMLElement).blur()}
                              className="h-10 pl-8 bg-gray-50/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none w-full"
                              placeholder="0.00"
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Moneda</label>
                          <Select
                            value={quote.currency}
                            onValueChange={(value) => onQuoteChange(material.id, index, 'currency', value as 'USD' | 'VES' | 'EUR')}
                          >
                            <SelectTrigger className="h-10 w-full bg-gray-50/50">
                              <SelectValue placeholder="Moneda" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="USD">USD</SelectItem>
                              <SelectItem value="VES">VES</SelectItem>
                              <SelectItem value="EUR">EUR</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="mb-4 space-y-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Tasa de Cambio</label>
                        <Input
                          type="number"
                          step="0.01"
                          value={quote.exchangeRate || globalExchangeRate || ''}
                          onChange={(e) => onQuoteChange(material.id, index, 'exchangeRate', parseFloat(e.target.value) || undefined)}
                          onWheel={(e) => (e.target as HTMLElement).blur()}
                          placeholder={globalExchangeRate ? `Global: ${globalExchangeRate}` : 'Tasa'}
                          className="h-10 bg-gray-50/50 w-full"
                        />
                      </div>

                      <div className={cn(
                        "flex items-center justify-between p-3 rounded-lg",
                        isBestPrice ? "bg-procarni-secondary/10" : "bg-gray-100/50"
                      )}>
                        <span className="text-xs font-semibold text-gray-500 uppercase">Precio Comparado (USD)</span>
                        <div className="text-right">
                          <span className={cn(
                            "text-base font-bold block",
                            isBestPrice ? "text-procarni-secondary" : "text-procarni-dark"
                          )}>
                            {formatPrice(quote.convertedPrice, 'USD')}
                          </span>
                          {!quote.isValid && quote.error && (
                            <p className="text-[10px] text-red-500 mt-0.5 font-medium">{quote.error}</p>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                  {!quote.isValid && quote.error && isMobile && (
                    <p className="text-[10px] text-red-500 mt-2 font-medium">{quote.error}</p>
                  )}
                  {!quote.isValid && quote.error && !isMobile && (
                    <p className="text-[10px] text-red-500 mt-1 font-medium text-right">{quote.error}</p>
                  )}
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <Table>
              <TableHeader className="bg-gray-50/80">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[35%] min-w-[240px] text-xs font-semibold text-gray-500 uppercase tracking-wider pl-3 sm:pl-4">Proveedor</TableHead>
                  <TableHead className="w-[22%] min-w-[180px] text-xs font-semibold text-gray-500 uppercase tracking-wider">Precio Original</TableHead>
                  <TableHead className="w-[8%] min-w-[80px] text-xs font-semibold text-gray-500 uppercase tracking-wider">Moneda</TableHead>
                  <TableHead className="w-[20%] min-w-[200px] text-xs font-semibold text-gray-500 uppercase tracking-wider">Tasa</TableHead>
                  <TableHead className="w-[18%] min-w-[160px] text-right font-bold text-xs uppercase tracking-wider text-procarni-dark">Precio Comparado (USD)</TableHead>
                  <TableHead className="w-[5%] min-w-[50px] text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((quote, index) => {
                  const isBestPrice = quote.isValid && quote.convertedPrice === bestPrice;

                  return (
                    <TableRow
                      key={index}
                      className={cn(
                        "transition-colors",
                        isBestPrice
                          ? "bg-green-50/40 hover:bg-green-50/60 border-l-4 border-procarni-secondary shadow-sm relative z-10"
                          : "hover:bg-gray-50/50 bg-white",
                        !quote.isValid && "bg-red-50/40 text-muted-foreground opacity-75"
                      )}
                    >
                      <TableCell className="pl-3 sm:pl-4 py-3">
                        <SupplierSelector quote={quote} index={index} />
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="relative">
                          <span className="absolute left-2.5 top-2 text-gray-400 text-sm">{quote.currency === 'USD' ? '$' : 'Bs'}</span>
                          <Input
                            type="number"
                            step="0.01"
                            value={quote.unitPrice || ''}
                            onChange={(e) => onQuoteChange(material.id, index, 'unitPrice', parseFloat(e.target.value) || 0)}
                            onWheel={(e) => (e.target as HTMLElement).blur()}
                            className="h-9 pl-10 bg-white/50 focus:bg-white transition-colors w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            placeholder="0.00"
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={quote.currency}
                          onValueChange={(value) => onQuoteChange(material.id, index, 'currency', value as 'USD' | 'VES' | 'EUR')}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Moneda" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="USD">USD</SelectItem>
                            <SelectItem value="VES">VES</SelectItem>
                            {/* <SelectItem value="EUR">EUR</SelectItem> */}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <ExchangeRateInput
                          compact
                          baseCurrency={'USD' /* quote.currency === 'EUR' ? 'EUR' : 'USD' */}
                          exchangeRate={quote.exchangeRate || globalExchangeRate /* (quote.currency === 'EUR' ? globalEurRate : globalExchangeRate) */}
                          onExchangeRateChange={(val) => handleExchangeRateChange(index, val)}
                          disableAutoFetch={true}
                        />
                      </TableCell>
                      <TableCell className={cn("text-right py-3", isBestPrice ? "font-bold text-procarni-secondary" : "font-semibold text-gray-700")}>
                        <div className="flex items-center justify-end gap-2">
                          {isBestPrice && <CheckCircle2 className="h-4 w-4 text-procarni-secondary fill-procarni-secondary/20" />}
                          <span className="text-sm font-bold">{formatPrice(quote.convertedPrice, 'USD')}</span>
                        </div>
                        {!quote.isValid && quote.error && (
                          <p className="text-[10px] text-red-500 mt-1 font-medium">{quote.error}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-right py-3 pr-3 sm:pr-4">
                        <Button variant="ghost" size="icon" onClick={() => onRemoveQuoteEntry(material.id, index)} className="h-8 w-8 text-gray-400 hover:text-red-500 hover:bg-red-50">
                          <X className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <div className="mt-4 flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onAddQuoteEntry(material.id)}
          className="text-procarni-secondary border-procarni-secondary/30 hover:bg-procarni-secondary/10"
        >
          <PlusCircle className="mr-2 h-4 w-4" /> Añadir Nueva Oferta
        </Button>
      </div>
    </div>
  );
};

export default MaterialQuoteComparisonRow;