import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SearchResult {
  id: string;
  name: string;
  [key: string]: any; // Allow other properties
}

interface SmartSearchProps {
  placeholder: string;
  onSelect: (item: SearchResult) => void;
  fetchFunction: (query: string) => Promise<SearchResult[]>;
  displayValue?: string; // Optional prop to control the displayed value
  selectedId?: string; // NEW: Optional prop to indicate the currently selected ID
  disabled?: boolean; // New prop
  className?: string;
  autoFocus?: boolean;
  icon?: React.ReactNode; // New prop for icon
}

const SmartSearch: React.FC<SmartSearchProps> = ({
  placeholder,
  onSelect,
  fetchFunction,
  displayValue,
  selectedId,
  disabled = false,
  className,
  autoFocus,
  icon
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedItem, setSelectedItem] = useState<SearchResult | null>(null);
  const debounceTimeoutRef = useRef<number | null>(null);
  const lastDisplayValueRef = useRef<string | undefined>(displayValue);

  // Update internal state if displayValue or selectedId changes from parent
  useEffect(() => {
    // Only update if displayValue actually changed from the outside
    // to avoid resetting the query while the user is typing
    if (displayValue !== lastDisplayValueRef.current) {
      if (displayValue) {
        setQuery(displayValue);
        setSelectedItem({ id: selectedId || '', name: displayValue });
      } else {
        setQuery('');
        setSelectedItem(null);
      }
      lastDisplayValueRef.current = displayValue;
    }
  }, [displayValue, selectedId]);

  // NEW: Handle autoFocus by opening popover on mount
  useEffect(() => {
    if (autoFocus && !disabled) {
      setOpen(true);
    }
  }, [autoFocus, disabled]);

  const debouncedFetch = useCallback(async (searchQuery: string) => {
    try {
      const data = await fetchFunction(searchQuery);
      setResults(data || []);
    } catch (error) {
      console.error('Error fetching search results:', error);
      setResults([]);
    }
  }, [fetchFunction]);

  useEffect(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    if (!disabled && open) { // Only fetch if popover is open
      debounceTimeoutRef.current = setTimeout(() => {
        const fetchQuery = query.trim() === '' ? '' : query;
        debouncedFetch(fetchQuery);
      }, query.trim() === '' ? 0 : 300) as unknown as number;
    }

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [query, debouncedFetch, disabled, open]);

  const handleSelect = (item: SearchResult) => {
    setSelectedItem(item);
    setQuery(item.name);
    lastDisplayValueRef.current = item.name; // Mark as current to avoid effect trigger
    onSelect(item);
    setOpen(false);
  };

  return (
    <Popover open={open && !disabled} onOpenChange={(newOpen) => {
      setOpen(newOpen);
      if (newOpen) {
        // When opening, if we don't have a selection, clear query to show all
        if (!selectedItem) {
          setQuery('');
        }
      }
    }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between overflow-hidden min-w-[150px] md:min-w-[200px] lg:min-w-[250px] text-left", className)}
          disabled={disabled}
        >
          <span className="flex items-center truncate w-full mr-2">
            {icon && <span className="mr-2 shrink-0">{icon}</span>}
            <span className="truncate">
              {selectedItem ? selectedItem.name : placeholder}
            </span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={placeholder}
            value={query}
            onValueChange={setQuery}
            autoFocus
          />
          <CommandList className="max-h-60 overflow-y-auto">
            <CommandEmpty>No se encontraron resultados.</CommandEmpty>
            <CommandGroup>
              {results.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.id} // Use ID as value for uniqueness
                  onSelect={() => handleSelect(item)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selectedId === item.id || selectedItem?.id === item.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex flex-col">
                    <span className="font-medium">{item.name}</span>
                    {item.code && (
                      <span className="text-[10px] text-muted-foreground uppercase">{item.code}</span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default SmartSearch;