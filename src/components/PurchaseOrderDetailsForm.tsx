import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Calendar as CalendarIcon } from 'lucide-react';
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import SmartSearch from '@/components/SmartSearch';
import { searchCompanies, getSupplierDetails } from '@/integrations/supabase/data';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import ExchangeRateInput from './ExchangeRateInput'; // NEW IMPORT

interface Company {
  id: string;
  name: string;
  rif: string;
}

interface PurchaseOrderDetailsFormProps {
  companyId: string;
  companyName: string;
  supplierId: string; // Still needed for fetching details
  supplierName: string; // Still needed for fetching details
  currency: 'USD' | 'VES';
  exchangeRate?: number;
  deliveryDate?: Date;
  paymentTerms: 'Contado' | 'Crédito' | 'Otro';
  customPaymentTerms: string;
  creditDays: number;
  observations: string;
  onCompanySelect: (company: Company) => void;
  // REMOVED: onSupplierSelect: (supplier: { id: string; name: string }) => void;
  onCurrencyChange: (checked: boolean) => void;
  onExchangeRateChange: (value: number | undefined) => void;
  onDeliveryDateChange: (date: Date | undefined) => void;
  onPaymentTermsChange: (value: 'Contado' | 'Crédito' | 'Otro') => void;
  onCustomPaymentTermsChange: (value: string) => void;
  onCreditDaysChange: (value: number) => void;
  onObservationsChange: (value: string) => void;
}

const PurchaseOrderDetailsForm: React.FC<PurchaseOrderDetailsFormProps> = ({
  companyId,
  companyName,
  supplierId,
  supplierName,
  currency,
  exchangeRate,
  deliveryDate,
  paymentTerms,
  customPaymentTerms,
  creditDays,
  observations,
  onCompanySelect,
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

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div>
          <Label htmlFor="company">Empresa de Origen</Label>
          <SmartSearch
            placeholder="Buscar empresa por RIF o nombre"
            onSelect={onCompanySelect}
            fetchFunction={searchCompanies}
            displayValue={companyName}
          />
          {companyName && <p className="text-sm text-muted-foreground mt-1">Empresa seleccionada: {companyName}</p>}
        </div>
        <div className="md:col-span-1">
          <Label htmlFor="deliveryDate">Fecha de Entrega</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={"outline"}
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !deliveryDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {deliveryDate ? format(deliveryDate, "PPP") : <span>Selecciona una fecha</span>}
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
        <div className="flex items-center space-x-2">
          <Label htmlFor="currency">Moneda (USD/VES)</Label>
          <Switch
            id="currency"
            checked={currency === 'VES'}
            onCheckedChange={onCurrencyChange}
          />
          <span>{currency}</span>
        </div>
        {currency === 'VES' && (
          <ExchangeRateInput
            currency={currency}
            exchangeRate={exchangeRate}
            onExchangeRateChange={onExchangeRateChange}
          />
        )}
        <div>
          <Label htmlFor="paymentTerms">Condición de Pago</Label>
          <Select value={paymentTerms} onValueChange={onPaymentTermsChange}>
            <SelectTrigger id="paymentTerms">
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
            <Label htmlFor="creditDays">Días de Crédito</Label>
            <Input
              id="creditDays"
              type="number"
              value={creditDays}
              onChange={(e) => onCreditDaysChange(parseInt(e.target.value) || 0)}
              min="0"
              placeholder="Ej: 30"
            />
          </div>
        )}
        {paymentTerms === 'Otro' && (
          <div className="md:col-span-2">
            <Label htmlFor="customPaymentTerms">Términos de Pago Personalizados</Label>
            <Input
              id="customPaymentTerms"
              type="text"
              value={customPaymentTerms}
              onChange={(e) => onCustomPaymentTermsChange(e.target.value)}
              placeholder="Describa los términos de pago"
            />
          </div>
        )}
      </div>

      <div className="mb-6">
        <Label htmlFor="observations">Observaciones</Label>
        <Textarea
          id="observations"
          value={observations}
          onChange={(e) => onObservationsChange(e.target.value)}
          placeholder="Añade cualquier observación relevante para esta orden de compra."
          rows={3}
        />
      </div>
    </>
  );
};

export default PurchaseOrderDetailsForm;