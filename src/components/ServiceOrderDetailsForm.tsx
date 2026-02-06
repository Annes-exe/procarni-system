// src/components/ServiceOrderDetailsForm.tsx

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
import { searchCompanies } from '@/integrations/supabase/data';
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
  currency: 'USD' | 'VES';
  exchangeRate?: number;
  issueDate: Date;
  serviceDate?: Date;
  equipmentName: string;
  serviceType: string;
  detailedServiceDescription: string;
  destinationAddress: string;
  observations: string;
  
  onCompanySelect: (company: Company) => void;
  onCurrencyChange: (checked: boolean) => void;
  onExchangeRateChange: (value: number | undefined) => void;
  onIssueDateChange: (date: Date | undefined) => void;
  onServiceDateChange: (date: Date | undefined) => void;
  onEquipmentNameChange: (value: string) => void;
  onServiceTypeChange: (value: string) => void;
  onDetailedServiceDescriptionChange: (value: string) => void;
  onDestinationAddressChange: (value: string) => void;
  onObservationsChange: (value: string) => void;
}

const SERVICE_TYPES = [
  'Revisión', 'Reparación', 'Instalación', 'Mantenimiento', 'Otro'
];

const DESTINATION_ADDRESSES = [
  'PROCARNI', 'EMPOMACA', 'MONTANO'
];

const ServiceOrderDetailsForm: React.FC<ServiceOrderDetailsFormProps> = ({
  companyId,
  companyName,
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
  onCurrencyChange,
  onExchangeRateChange,
  onIssueDateChange,
  onServiceDateChange,
  onEquipmentNameChange,
  onServiceTypeChange,
  onDetailedServiceDescriptionChange,
  onDestinationAddressChange,
  onObservationsChange,
}) => {

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Empresa de Origen */}
        <div>
          <Label htmlFor="company">Empresa de Origen *</Label>
          <SmartSearch
            placeholder="Buscar empresa por RIF o nombre"
            onSelect={onCompanySelect}
            fetchFunction={searchCompanies}
            displayValue={companyName}
          />
          {companyName && <p className="text-sm text-muted-foreground mt-1">Empresa seleccionada: {companyName}</p>}
        </div>
        
        {/* Fecha de Emisión */}
        <div>
          <Label htmlFor="issueDate">Fecha de Emisión *</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={"outline"}
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !issueDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {issueDate ? format(issueDate, "PPP") : <span>Selecciona una fecha</span>}
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

        {/* Fecha de Servicio */}
        <div>
          <Label htmlFor="serviceDate">Fecha de Servicio *</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={"outline"}
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !serviceDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {serviceDate ? format(serviceDate, "PPP") : <span>Selecciona una fecha</span>}
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
        
        {/* Equipo o Maquinaria */}
        <div>
          <Label htmlFor="equipmentName">Equipo o Maquinaria *</Label>
          <Input
            id="equipmentName"
            type="text"
            value={equipmentName}
            onChange={(e) => onEquipmentNameChange(e.target.value)}
            placeholder="Ej: Montacargas #1, Máquina de corte"
          />
        </div>

        {/* Dirección Destino */}
        <div>
          <Label htmlFor="destinationAddress">Dirección Destino *</Label>
          <Select value={destinationAddress} onValueChange={onDestinationAddressChange}>
            <SelectTrigger id="destinationAddress">
              <SelectValue placeholder="Seleccione destino" />
            </SelectTrigger>
            <SelectContent>
              {DESTINATION_ADDRESSES.map(addr => (
                <SelectItem key={addr} value={addr}>{addr}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Moneda y Tasa */}
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
      </div>

      {/* Sección de Servicio a Realizar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 p-4 border rounded-lg bg-muted/50">
        <div className="md:col-span-1">
          <Label htmlFor="serviceType">Tipo de Servicio *</Label>
          <Select value={serviceType} onValueChange={onServiceTypeChange}>
            <SelectTrigger id="serviceType">
              <SelectValue placeholder="Seleccione tipo de servicio" />
            </SelectTrigger>
            <SelectContent>
              {SERVICE_TYPES.map(type => (
                <SelectItem key={type} value={type}>{type}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="detailedServiceDescription">Detalle del Servicio *</Label>
          <Textarea
            id="detailedServiceDescription"
            value={detailedServiceDescription}
            onChange={(e) => onDetailedServiceDescriptionChange(e.target.value)}
            placeholder="Descripción detallada del servicio a realizar."
            rows={2}
          />
        </div>
      </div>

      {/* Observaciones */}
      <div className="mb-6">
        <Label htmlFor="observations">Observaciones Adicionales</Label>
        <Textarea
          id="observations"
          value={observations}
          onChange={(e) => onObservationsChange(e.target.value)}
          placeholder="Añade cualquier observación relevante para esta orden de servicio."
          rows={3}
        />
      </div>
    </>
  );
};

export default ServiceOrderDetailsForm;