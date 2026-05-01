// src/components/DocumentDatePicker.tsx

import React from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarIcon } from 'lucide-react';
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface DocumentDatePickerProps {
  label: string;
  id: string;
  date?: Date;
  onDateChange: (date: Date | undefined) => void;
  required?: boolean;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

const DocumentDatePicker: React.FC<DocumentDatePickerProps> = ({
  label,
  id,
  date,
  onDateChange,
  required = false,
  placeholder = "Selecciona fecha",
  className,
  disabled = false,
}) => {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id} className="block text-sm font-semibold text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </Label>
      <div className="relative">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              id={id}
              variant={"outline"}
              disabled={disabled}
              className={cn(
                "w-full pl-10 pr-4 py-2.5 h-auto justify-start text-left font-normal rounded-lg border-gray-300 focus:ring-2 focus:ring-procarni-primary focus:border-procarni-primary transition shadow-sm",
                !date && "text-muted-foreground"
              )}
            >
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                <CalendarIcon className="h-5 w-5" />
              </span>
              {date ? format(date, "PPP") : <span>{placeholder}</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={date}
              onSelect={onDateChange}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
};

export default DocumentDatePicker;
