import React from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Textarea } from '@/components/ui/textarea';
import { Calendar as CalendarIcon, Info, Search, Building2, PlusCircle, DollarSign, Coins } from 'lucide-react';
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { getSupplierDetails, searchCompanies, searchSuppliers } from '@/integrations/supabase/data';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import SmartSearch from '@/components/SmartSearch';
import ExchangeRateInput from './ExchangeRateInput';

interface Company {
  id: string;
  name: string;
  rif: string;
}

interface PurchaseOrderDetailsFormProps {
  companyId: string;
  companyName: string;
  supplierId: string;
  supplierName: string;
  baseCurrency: 'USD' | 'EUR';
  currency: 'USD' | 'VES' | 'EUR';
  exchangeRate?: number;
  deliveryDate?: Date;
  paymentTerms: 'Contado' | 'Crédito' | 'Otro';
  customPaymentTerms: string;
  creditDays: number;
  observations: string;
  onCompanySelect: (company: Company) => void;
  onBaseCurrencyChange: (value: 'USD' | 'EUR') => void;
  onCurrencyChange: (value: 'USD' | 'VES' | 'EUR') => void;
  onExchangeRateChange: (value: number | undefined) => void;
  onDeliveryDateChange: (date: Date | undefined) => void;
  onPaymentTermsChange: (value: 'Contado' | 'Crédito' | 'Otro') => void;
  onCustomPaymentTermsChange: (value: string) => void;
  onCreditDaysChange: (value: number) => void;
  onObservationsChange: (value: string) => void;
  onSupplierSelect?: (supplier: any) => void;
  onAddNewSupplier?: () => void;
}

const PurchaseOrderDetailsForm: React.FC<PurchaseOrderDetailsFormProps> = ({
  companyId,
  companyName,
  supplierId,
  supplierName,
  baseCurrency,
  currency,
  exchangeRate,
  deliveryDate,
  paymentTerms,
  customPaymentTerms,
  creditDays,
  observations,
  onCompanySelect,
  onBaseCurrencyChange,
  onCurrencyChange,
  onExchangeRateChange,
  onDeliveryDateChange,
  onPaymentTermsChange,
  onCustomPaymentTermsChange,
  onCreditDaysChange,
  onObservationsChange,
  onSupplierSelect,
  onAddNewSupplier,
}) => {
  // Fetch supplier details to get default payment terms
  const { data: supplierDetails } = useQuery({
    queryKey: ['supplierDetails', supplierId],
    queryFn: () => getSupplierDetails(supplierId),
    enabled: !!supplierId,
  });

  // Effect to set default payment terms when supplier changes
  React.useEffect(() => {
    if (supplierDetails) {
      const terms = supplierDetails.payment_terms as 'Contado' | 'Crédito' | 'Otro';
      onPaymentTermsChange(terms);
      onCustomPaymentTermsChange(supplierDetails.custom_payment_terms || '');
      onCreditDaysChange(supplierDetails.credit_days || 0);
    } else {
      // Reset if supplier is cleared
      onPaymentTermsChange('Contado');
      onCustomPaymentTermsChange('');
      onCreditDaysChange(0);
    }
  }, [supplierDetails]);

  // Shared Styles
  const flatInputClass = "bg-gray-50/50 border-gray-200 text-procarni-dark font-medium text-sm focus-visible:ring-procarni-primary/20 transition-all";

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* COLUMNA 1 */}
        <div className="space-y-6">
          {/* Proveedor Principal */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <Label htmlFor="supplier" className="text-sm font-semibold text-gray-700">
                Proveedor Principal <span className="text-red-500">*</span>
              </Label>
              {onAddNewSupplier && (
                <div
                  className="text-xs font-semibold text-procarni-primary hover:text-green-700 cursor-pointer flex items-center transition-colors"
                  onClick={onAddNewSupplier}
                >
                  <PlusCircle className="h-3 w-3 mr-1" /> Nuevo Proveedor
                </div>
              )}
            </div>
            <SmartSearch
              placeholder="Buscar proveedor por RIF o nombre"
              onSelect={onSupplierSelect || (() => { })}
              fetchFunction={searchSuppliers}
              displayValue={supplierName}
              className="w-full rounded-lg border-gray-300 focus:ring-2 focus:ring-procarni-primary focus:border-procarni-primary transition shadow-sm placeholder-gray-400 pl-3"
              icon={<Search className="h-4 w-4 text-gray-400" />}
              autoFocus={true}
            />
          </div>

          {/* Empresa de Origen */}
          <div>
            <Label htmlFor="company" className="block text-sm font-semibold text-gray-700 mb-2">
              Empresa de Origen <span className="text-red-500">*</span>
            </Label>
            <SmartSearch
              placeholder="Buscar empresa por RIF o nombre"
              onSelect={onCompanySelect}
              fetchFunction={searchCompanies}
              displayValue={companyName}
              className="w-full rounded-lg border-gray-300 focus:ring-2 focus:ring-procarni-primary focus:border-procarni-primary transition shadow-sm appearance-none pl-3"
              icon={<Building2 className="h-4 w-4 text-gray-400" />}
            />
          </div>

          {/* Condición de Pago (Moved Here from Col 2) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="paymentTerms" className="block text-sm font-semibold text-gray-700 mb-2">
                Condición de Pago
              </Label>
              <Select value={paymentTerms} onValueChange={onPaymentTermsChange}>
                <SelectTrigger id="paymentTerms" className="w-full py-2.5 h-auto rounded-lg border-gray-300 focus:ring-2 focus:ring-procarni-primary focus:border-procarni-primary transition shadow-sm">
                  <SelectValue placeholder="Seleccione condición" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Contado">Contado</SelectItem>
                  <SelectItem value="Crédito">Crédito</SelectItem>
                  <SelectItem value="Otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {paymentTerms === 'Crédito' && (
              <div>
                <Label htmlFor="creditDays" className="block text-sm font-semibold text-gray-700 mb-2">
                  Días de Crédito
                </Label>
                <Input
                  id="creditDays"
                  type="number"
                  value={creditDays}
                  onChange={(e) => onCreditDaysChange(parseInt(e.target.value) || 0)}
                  min="0"
                  placeholder="Ej: 30"
                  className="w-full py-2.5 h-auto rounded-lg border-gray-300 focus:ring-2 focus:ring-procarni-primary focus:border-procarni-primary transition shadow-sm"
                />
              </div>
            )}
            {paymentTerms === 'Otro' && (
              <div>
                <Label htmlFor="customPaymentTerms" className="block text-sm font-semibold text-gray-700 mb-2">
                  Detalle
                </Label>
                <Input
                  id="customPaymentTerms"
                  type="text"
                  value={customPaymentTerms}
                  onChange={(e) => onCustomPaymentTermsChange(e.target.value)}
                  placeholder="Especifique"
                  className="w-full py-2.5 h-auto rounded-lg border-gray-300 focus:ring-2 focus:ring-procarni-primary focus:border-procarni-primary transition shadow-sm"
                />
              </div>
            )}
          </div>
        </div>

        {/* COLUMNA 2 */}
        <div className="space-y-6">
          {/* Fecha de Entrega */}
          <div>
            <Label htmlFor="deliveryDate" className="block text-sm font-semibold text-gray-700 mb-2">
              Fecha de Entrega <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className={cn(
                      "w-full pl-10 pr-4 py-2.5 h-auto justify-start text-left font-normal rounded-lg border-gray-300 focus:ring-2 focus:ring-procarni-primary focus:border-procarni-primary transition shadow-sm",
                      !deliveryDate && "text-muted-foreground"
                    )}
                  >
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                      <CalendarIcon className="h-5 w-5" />
                    </span>
                    {deliveryDate ? format(deliveryDate, "PPP") : <span>Selecciona fecha</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={deliveryDate}
                    onSelect={onDeliveryDateChange}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Toggles de Moneda Separados (Divisa Base y Moneda de la Orden) */}
          <div className="bg-white border text-card-foreground shadow-sm rounded-lg p-5">
            <div className="flex items-center gap-2 mb-4">
              <Coins className="h-5 w-5 text-procarni-primary" />
              <h3 className="font-semibold text-gray-800">Configuración de Moneda</h3>
            </div>
            
            <div className="space-y-4">
              <div>
                <Label className="block text-sm font-medium text-gray-700 mb-2">
                  Divisa Base de Referencia
                </Label>
                <ToggleGroup
                  type="single"
                  value={baseCurrency}
                  onValueChange={(value) => {
                    if (value) {
                      onBaseCurrencyChange(value as 'USD' | 'EUR');
                      // Si la moneda seleccionada era la divisa antigua, actualizarla a la nueva divisa base
                      if (currency !== 'VES') {
                        onCurrencyChange(value as 'USD' | 'EUR');
                      }
                    }
                  }}
                  className="justify-start bg-gray-50 border border-gray-200 rounded-lg p-1 w-fit"
                >
                  <ToggleGroupItem value="USD" className="px-4 py-1.5 data-[state=on]:bg-procarni-primary data-[state=on]:text-white">
                    USD ($)
                  </ToggleGroupItem>
                  <ToggleGroupItem value="EUR" className="px-4 py-1.5 data-[state=on]:bg-procarni-primary data-[state=on]:text-white">
                    EUR (€)
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>

              <div>
                <Label className="block text-sm font-medium text-gray-700 mb-2">
                  Moneda de Ingreso de Ítems
                </Label>
                <ToggleGroup
                  type="single"
                  value={currency === 'VES' ? 'VES' : 'DIVISA'}
                  onValueChange={(value) => {
                    if (value) {
                      if (value === 'VES') {
                        onCurrencyChange('VES');
                      } else {
                        onCurrencyChange(baseCurrency);
                      }
                    }
                  }}
                  className="justify-start bg-gray-50 border border-gray-200 rounded-lg p-1 w-fit"
                >
                  <ToggleGroupItem value="DIVISA" className="px-4 py-1.5 data-[state=on]:bg-procarni-primary data-[state=on]:text-white">
                    {baseCurrency} (Divisa)
                  </ToggleGroupItem>
                  <ToggleGroupItem value="VES" className="px-4 py-1.5 data-[state=on]:bg-procarni-primary data-[state=on]:text-white">
                    Bolívares (VES)
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100">
                <ExchangeRateInput
                  baseCurrency={baseCurrency}
                  exchangeRate={exchangeRate}
                  onExchangeRateChange={onExchangeRateChange}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER: Observaciones */}
      <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
        <Label htmlFor="observations" className="block text-sm font-semibold text-gray-700 mb-2">
          Observaciones Adicionales
        </Label>
        <div className="relative">
          <Textarea
            id="observations"
            value={observations}
            onChange={(e) => onObservationsChange(e.target.value)}
            placeholder="Añade cualquier observación relevante para esta orden de compra."
            rows={3}
            className="w-full p-4 rounded-lg border-gray-300 bg-white focus:ring-2 focus:ring-procarni-primary focus:border-procarni-primary transition shadow-sm placeholder-gray-400 resize-none min-h-[100px]"
          />
        </div>
      </div>
    </div>
  );
};

export default PurchaseOrderDetailsForm;