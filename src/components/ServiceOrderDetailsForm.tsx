// src/components/ServiceOrderDetailsForm.tsx

import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Textarea } from '@/components/ui/textarea';
import { Calendar as CalendarIcon, CloudUpload, Info, Search, Building2, Tractor, Wrench, MapPin, PlusCircle, DollarSign, Edit, Coins } from 'lucide-react';
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import SmartSearch from '@/components/SmartSearch';
import { searchCompanies, searchSuppliers } from '@/integrations/supabase/data';
import { Button } from '@/components/ui/button';
import ExchangeRateInput from './ExchangeRateInput';

interface Company {
  id: string;
  name: string;
  rif: string;
}

interface ServiceOrderDetailsFormProps {
  companyId: string;
  companyName: string;
  baseCurrency: 'USD' | 'EUR';
  currency: 'USD' | 'VES' | 'EUR';
  exchangeRate?: number;
  issueDate: Date;
  serviceDate?: Date;
  equipmentName: string;
  serviceType: string;
  detailedServiceDescription: string;
  destinationAddress: string;
  observations: string;

  onCompanySelect: (company: Company) => void;
  onBaseCurrencyChange: (value: 'USD' | 'EUR') => void;
  onCurrencyChange: (value: 'USD' | 'VES' | 'EUR') => void;
  onExchangeRateChange: (value: number | undefined) => void;
  onIssueDateChange: (date: Date | undefined) => void;
  onServiceDateChange: (date: Date | undefined) => void;
  onEquipmentNameChange: (value: string) => void;
  onServiceTypeChange: (value: string) => void;
  onDetailedServiceDescriptionChange: (value: string) => void;
  onDestinationAddressChange: (value: string) => void;
  onObservationsChange: (value: string) => void;
  supplierId?: string;
  supplierName?: string;
  onSupplierSelect?: (supplier: any) => void;
  onAddNewSupplier?: () => void;
}

const SERVICE_TYPES = [
  'Revisión', 'Reparación', 'Instalación', 'Mantenimiento', 'Otro'
];

const DESTINATION_ADDRESSES = [
  'PROCARNI', 'EMPOMACA', 'MONTANO', 'LOCAL'
];

const ServiceOrderDetailsForm: React.FC<ServiceOrderDetailsFormProps> = ({
  companyId,
  companyName,
  baseCurrency,
  currency,
  exchangeRate,
  issueDate,
  serviceDate,
  equipmentName,
  serviceType,
  detailedServiceDescription,
  destinationAddress,
  observations,
  onCompanySelect,
  onBaseCurrencyChange,
  onCurrencyChange,
  onExchangeRateChange,
  onIssueDateChange,
  onServiceDateChange,
  onEquipmentNameChange,
  onServiceTypeChange,
  onDetailedServiceDescriptionChange,
  onDestinationAddressChange,
  onObservationsChange,
  supplierId,
  supplierName,
  onSupplierSelect,
  onAddNewSupplier,
}) => {

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
              onSelect={onSupplierSelect}
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

          {/* Equipo o Maquinaria */}
          <div>
            <Label htmlFor="equipmentName" className="block text-sm font-semibold text-gray-700 mb-2">
              Equipo o Maquinaria <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                <Tractor className="h-5 w-5" />
              </span>
              <Input
                id="equipmentName"
                type="text"
                value={equipmentName}
                onChange={(e) => onEquipmentNameChange(e.target.value)}
                placeholder="Ej: Montacargas #1, Máquina de corte"
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border-gray-300 bg-white text-gray-900 focus:ring-2 focus:ring-procarni-primary focus:border-procarni-primary transition shadow-sm placeholder-gray-400"
              />
            </div>
          </div>

          {/* Tipo de Servicio */}
          <div>
            <Label htmlFor="serviceType" className="block text-sm font-semibold text-gray-700 mb-2">
              Tipo de Servicio <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 z-10">
                <Wrench className="h-5 w-5" />
              </span>
              <Select value={serviceType} onValueChange={onServiceTypeChange}>
                <SelectTrigger id="serviceType" className="w-full pl-10 pr-4 py-2.5 h-auto rounded-lg border-gray-300 focus:ring-2 focus:ring-procarni-primary focus:border-procarni-primary transition shadow-sm">
                  <SelectValue placeholder="Seleccione tipo de servicio" />
                </SelectTrigger>
                <SelectContent>
                  {SERVICE_TYPES.map(type => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

        </div>

        {/* COLUMNA 2 */}
        <div className="space-y-6">

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Fecha de Emisión */}
            <div>
              <Label htmlFor="issueDate" className="block text-sm font-semibold text-gray-700 mb-2">
                Fecha de Emisión <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={"outline"}
                      className={cn(
                        "w-full pl-10 pr-4 py-2.5 h-auto justify-start text-left font-normal rounded-lg border-gray-300 focus:ring-2 focus:ring-procarni-primary focus:border-procarni-primary transition shadow-sm",
                        !issueDate && "text-muted-foreground"
                      )}
                    >
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                        <CalendarIcon className="h-5 w-5" />
                      </span>
                      {issueDate ? format(issueDate, "PPP") : <span>Selecciona fecha</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={issueDate}
                      onSelect={onIssueDateChange}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Fecha de Servicio */}
            <div>
              <Label htmlFor="serviceDate" className="block text-sm font-semibold text-gray-700 mb-2">
                Fecha de Servicio <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={"outline"}
                      className={cn(
                        "w-full pl-10 pr-4 py-2.5 h-auto justify-start text-left font-normal rounded-lg border-gray-300 focus:ring-2 focus:ring-procarni-primary focus:border-procarni-primary transition shadow-sm",
                        !serviceDate && "text-muted-foreground"
                      )}
                    >
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                        <CalendarIcon className="h-5 w-5" />
                      </span>
                      {serviceDate ? format(serviceDate, "PPP") : <span>Selecciona fecha</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={serviceDate}
                      onSelect={onServiceDateChange}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>

          {/* Dirección Destino */}
          <div>
            <Label htmlFor="destinationAddress" className="block text-sm font-semibold text-gray-700 mb-2">
              Dirección Destino <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 z-10">
                <MapPin className="h-5 w-5" />
              </span>
              <Select value={destinationAddress} onValueChange={onDestinationAddressChange}>
                <SelectTrigger id="destinationAddress" className="w-full pl-10 pr-4 py-2.5 h-auto rounded-lg border-gray-300 focus:ring-2 focus:ring-procarni-primary focus:border-procarni-primary transition shadow-sm">
                  <SelectValue placeholder="Seleccione destino" />
                </SelectTrigger>
                <SelectContent>
                  {DESTINATION_ADDRESSES.map(addr => (
                    <SelectItem key={addr} value={addr}>{addr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

      {/* FOOTER: Detalle y Observaciones */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-4 border-t border-gray-100 dark:border-gray-800">
        <div className="h-full">
          <Label htmlFor="detailedServiceDescription" className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1">
            <Info className="h-4 w-4 text-gray-400" /> Detalle del Servicio <span className="text-red-500">*</span>
          </Label>
          <div className="relative">
            <Textarea
              id="detailedServiceDescription"
              value={detailedServiceDescription}
              onChange={(e) => onDetailedServiceDescriptionChange(e.target.value)}
              placeholder="Descripción detallada del servicio a realizar."
              rows={4}
              className="w-full p-4 rounded-lg border-gray-300 bg-white focus:ring-2 focus:ring-procarni-primary focus:border-procarni-primary transition shadow-sm placeholder-gray-400 resize-none min-h-[120px]"
            />
          </div>
        </div>
        <div className="h-full">
          <Label htmlFor="observations" className="block text-sm font-semibold text-gray-700 mb-2">
            Observaciones Adicionales
          </Label>
          <div className="relative">
            <Textarea
              id="observations"
              value={observations}
              onChange={(e) => onObservationsChange(e.target.value)}
              placeholder="Añade cualquier observación relevante para esta orden de servicio."
              rows={4}
              className="w-full p-4 rounded-lg border-gray-300 bg-white focus:ring-2 focus:ring-procarni-primary focus:border-procarni-primary transition shadow-sm placeholder-gray-400 resize-none min-h-[120px]"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ServiceOrderDetailsForm;