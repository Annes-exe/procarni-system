import React, { useState, useEffect } from 'react';
import { Input } from './ui/input';

interface PriceInputProps {
  value: number;
  onChange: (val: number) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  min?: string;
  max?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

export const PriceInput: React.FC<PriceInputProps> = ({
  value,
  onChange,
  className,
  placeholder = '0.00',
  disabled = false,
  min,
  max,
  onKeyDown,
}) => {
  // If the value is 0, we treat it as empty string so it shows the placeholder
  const [inputValue, setInputValue] = useState<string>(value === 0 ? '' : value.toString());

  useEffect(() => {
    // Sync state if value changes from outside (e.g. recalculations, preset changes)
    const numericInput = parseFloat(inputValue);
    const currentVal = isNaN(numericInput) ? 0 : numericInput;
    if (currentVal !== value) {
      setInputValue(value === 0 ? '' : value.toString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    setInputValue(rawValue);

    const parsed = parseFloat(rawValue);
    const finalVal = isNaN(parsed) ? 0 : parsed;
    onChange(finalVal);
  };

  const handleBlur = () => {
    // Format on blur if it's a valid number, or clean it up if it's empty/0
    const parsed = parseFloat(inputValue);
    if (isNaN(parsed) || parsed <= 0) {
      setInputValue('');
      onChange(0);
    } else {
      setInputValue(parsed.toString());
      onChange(parsed);
    }
  };

  return (
    <Input
      type="number"
      step="0.01"
      value={inputValue}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={onKeyDown}
      className={className}
      placeholder={placeholder}
      disabled={disabled}
      min={min}
      max={max}
      onWheel={(e) => e.currentTarget.blur()}
    />
  );
};
