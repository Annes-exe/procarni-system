import React from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Calendar as CalendarIcon } from 'lucide-react';
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { getSupplierDetails } from '@/integrations/supabase/data';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
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
  currency: 'USD' | 'VES';
  exchangeRate?: number;
  deliveryDate?: Date;
  paymentTerms: 'Contado' | 'Crédito' | 'Otro';
  customPaymentTerms: string;
  creditDays: number;
  observations: string;
  onCompanySelect: (company: Company) => void;
  onCurrencyChange: (checked: boolean) => void;
  onExchangeRateChange: (value: number | undefined) => void;
  onDeliveryDateChange: (date: Date | undefined) => void;
  onPaymentTermsChange: (value: 'Contado' | 'Crédito' | 'Otro') => void;
  onCustomPaymentTermsChange: (value: string) => void;
  onCreditDaysChange: (value: number) => void;
  onObservationsChange: (value: string) => void;
}

const PurchaseOrderDetailsForm: React.FC<PurchaseOrderDetailsFormProps> = ({
  supplierId,
  currency,
  exchangeRate,
  deliveryDate,
  paymentTerms,
  customPaymentTerms,
  creditDays,
  observations,
  onCurrencyChange,
  onExchangeRateChange,
  onDeliveryDateChange,
  onPaymentTermsChange,
  onCustomPaymentTermsChange,
  onCreditDaysChange,
  onObservationsChange,
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
  const microLabelClass = "text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-1.5 block";
  const flatInputClass = "bg-gray-50/50 border-gray-200 text-procarni-dark font-medium text-sm focus-visible:ring-procarni-primary/20 transition-all";

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 mb-8">
        {/* Fecha de Entrega - 3 Cols */}
        <div className="md:col-span-3">
          <label className={microLabelClass}>Fecha de Entrega</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={"outline"}
                className={cn(
                  "w-full justify-start text-left font-normal h-10",
                  flatInputClass,
                  !deliveryDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4 text-gray-400" />
                {deliveryDate ? format(deliveryDate, "PPP") : <span>Seleccionar</span>}
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

        {/* Moneda - 3 Cols */}
        <div className="md:col-span-3">
          <label className={microLabelClass}>Moneda (USD/VES)</label>
          <div className={cn("flex items-center justify-between h-10 px-3 rounded-md border", flatInputClass)}>
            <span className="text-sm text-gray-600">{currency}</span>
            <Switch
              id="currency"
              checked={currency === 'VES'}
              onCheckedChange={onCurrencyChange}
              className="data-[state=checked]:bg-procarni-primary scale-90"
            />
          </div>
        </div>

        {/* Tasa de Cambio - 2 Cols (Condicional) */}
        {currency === 'VES' && (
          <div className="md:col-span-2">
            <ExchangeRateInput
              currency={currency}
              exchangeRate={exchangeRate}
              onExchangeRateChange={onExchangeRateChange}
            />
          </div>
        )}

        {/* Condición de Pago - 4 Cols (Adjusted if no Exchange Rate) */}
        <div className={currency === 'VES' ? "md:col-span-4" : "md:col-span-6"}>
          <label className={microLabelClass}>Condición de Pago</label>
          <Select value={paymentTerms} onValueChange={onPaymentTermsChange}>
            <SelectTrigger className={cn("h-10", flatInputClass)}>
              <SelectValue placeholder="Seleccione condición" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Contado">Contado</SelectItem>
              <SelectItem value="Crédito">Crédito</SelectItem>
              <SelectItem value="Otro">Otro</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Días de Crédito - Full Width Row if Active */}
        {paymentTerms === 'Crédito' && (
          <div className="md:col-span-12">
            <label className={microLabelClass}>Días de Crédito</label>
            <Input
              id="creditDays"
              type="number"
              value={creditDays}
              onChange={(e) => onCreditDaysChange(parseInt(e.target.value) || 0)}
              min="0"
              placeholder="Ej: 30"
              className={cn("max-w-xs h-10", flatInputClass)}
            />
          </div>
        )}

        {/* Términos Personalizados - Full Width Row if Active */}
        {paymentTerms === 'Otro' && (
          <div className="md:col-span-12">
            <label className={microLabelClass}>Términos de Pago Personalizados</label>
            <Input
              id="customPaymentTerms"
              type="text"
              value={customPaymentTerms}
              onChange={(e) => onCustomPaymentTermsChange(e.target.value)}
              placeholder="Describa los términos de pago"
              className={cn("h-10", flatInputClass)}
            />
          </div>
        )}

        {/* Observaciones - Full Width */}
        <div className="md:col-span-12">
          <label className={microLabelClass}>Observaciones</label>
          <Textarea
            id="observations"
            value={observations}
            onChange={(e) => onObservationsChange(e.target.value)}
            placeholder="Añade cualquier observación relevante para esta orden de compra."
            rows={2}
            className={cn("resize-none min-h-[60px]", flatInputClass)}
          />
        </div>
      </div>
    </>
  );
};

export default PurchaseOrderDetailsForm;