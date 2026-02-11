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
}

const SmartSearch: React.FC<SmartSearchProps> = ({
  placeholder,
  onSelect,
  fetchFunction,
  displayValue,
  selectedId,
  disabled = false,
  className,
  autoFocus
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedItem, setSelectedItem] = useState<SearchResult | null>(null);
  const debounceTimeoutRef = useRef<number | null>(null);

  // Update internal state if displayValue or selectedId changes from parent
  useEffect(() => {
    if (displayValue) {
      setQuery(displayValue);
      // Synchronize selectedItem based on displayValue and selectedId
      setSelectedItem({ id: selectedId || '', name: displayValue });
    } else {
      setQuery('');
      setSelectedItem(null);
    }
  }, [displayValue, selectedId]);

  const debouncedFetch = useCallback(async (searchQuery: string) => {
    try {
      const data = await fetchFunction(searchQuery);
      setResults(data);
    } catch (error) {
      console.error('Error fetching search results:', error);
      setResults([]);
    }
  }, [fetchFunction]);

  useEffect(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Only fetch if not disabled and query is present (or if we want default suggestions)
    if (!disabled) {
      debounceTimeoutRef.current = setTimeout(() => {
        // Si la consulta está vacía, cargamos todos los resultados (para el scroll)
        const fetchQuery = query.trim() === '' ? '' : query;
        debouncedFetch(fetchQuery);
      }, 300) as unknown as number;
    } else {
      setResults([]);
    }

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [query, debouncedFetch, disabled]);

  const handleSelect = (item: SearchResult) => {
    setSelectedItem(item);
    setQuery(item.name);
    onSelect(item);
    setOpen(false);
  };

  return (
    <Popover open={open && !disabled} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between overflow-hidden min-w-[150px] md:min-w-[200px] lg:min-w-[250px]", className)}
          disabled={disabled}
        >
          <span className="truncate text-left w-full mr-2">
            {selectedItem ? selectedItem.name : placeholder}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput
            placeholder={placeholder}
            value={query}
            onValueChange={setQuery}
            autoFocus={autoFocus}
          />
          <CommandList className="max-h-60 overflow-y-auto"> {/* Added max-h-60 and overflow-y-auto */}
            <CommandEmpty>No se encontraron resultados.</CommandEmpty>
            <CommandGroup>
              {results.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.name}
                  onSelect={() => handleSelect(item)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      // Check if the current item being rendered matches the selected ID from the parent
                      selectedId === item.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {item.name}
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