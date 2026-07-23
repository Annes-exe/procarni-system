import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator
} from '@/components/ui/command';
import {
    Search,
    FileText,
    Truck,
    Package,
    ClipboardList,
    Wrench,
    Loader2
} from 'lucide-react';
import { searchService, SearchResult } from '@/integrations/supabase/services/searchService';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface GlobalSearchProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const GlobalSearch: React.FC<GlobalSearchProps> = ({ open, onOpenChange }) => {
    const navigate = useNavigate();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        const handler = setTimeout(async () => {
            if (query.length >= 2) {
                setIsLoading(true);
                const searchResults = await searchService.unifiedSearch(query);
                setResults(searchResults);
                setIsLoading(false);
            } else {
                setResults([]);
            }
        }, 300);

        return () => clearTimeout(handler);
    }, [query]);

    const handleSelect = (url: string) => {
        onOpenChange(false);
        navigate(url);
        setQuery('');
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'purchase_order': return <FileText className="mr-2 h-4 w-4 text-blue-500" />;
            case 'service_order': return <Wrench className="mr-2 h-4 w-4 text-orange-500" />;
            case 'quote_request': return <ClipboardList className="mr-2 h-4 w-4 text-purple-500" />;
            case 'supplier': return <Truck className="mr-2 h-4 w-4 text-green-500" />;
            case 'material': return <Package className="mr-2 h-4 w-4 text-slate-500" />;
            default: return <Search className="mr-2 h-4 w-4" />;
        }
    };

    const getTypeLabel = (type: string) => {
        switch (type) {
            case 'purchase_order': return 'Orden de Compra';
            case 'service_order': return 'Orden de Servicio';
            case 'quote_request': return 'Solicitud de Cotización';
            case 'supplier': return 'Proveedor';
            case 'material': return 'Material';
            default: return type;
        }
    };

    const groupedResults = results.reduce((acc, result) => {
        if (!acc[result.type]) acc[result.type] = [];
        acc[result.type].push(result);
        return acc;
    }, {} as Record<string, SearchResult[]>);

    return (
        <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={false}>
            <CommandInput
                placeholder="Busca órdenes, proveedores, materiales..."
                value={query}
                onValueChange={setQuery}
            />
            <CommandList>
                <CommandEmpty>
                    {isLoading ? (
                        <div className="flex items-center justify-center py-6">
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            <span>Buscando...</span>
                        </div>
                    ) : query.length < 2 ? (
                        "Escribe al menos 2 caracteres para buscar."
                    ) : (
                        "No se encontraron resultados."
                    )}
                </CommandEmpty>

                {Object.entries(groupedResults).map(([type, items]) => (
                    <React.Fragment key={type}>
                        <CommandGroup heading={getTypeLabel(type)}>
                            {items.map((item) => (
                                <CommandItem
                                    key={`${item.type}-${item.id}`}
                                    onSelect={() => handleSelect(item.url)}
                                    className="flex items-center justify-between cursor-pointer"
                                >
                                    <div className="flex items-center">
                                        {getTypeIcon(item.type)}
                                        <div className="flex flex-col">
                                            <span>{item.title}</span>
                                            <span className="text-xs text-muted-foreground">{item.subtitle}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {item.type === 'material' && (
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-7 w-7 text-procarni-secondary hover:text-green-700 hover:bg-green-50 transition-colors"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleSelect(`/search-suppliers-by-material?query=${encodeURIComponent(item.title)}`);
                                                            }}
                                                        >
                                                            <Truck className="h-4 w-4" />
                                                        </Button>
                                                    </TooltipTrigger>
                                                    <TooltipContent side="left">
                                                        <p>Ver proveedores x material</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        )}
                                        <Badge variant="outline" className="text-[10px] uppercase">
                                            {getTypeLabel(type)}
                                        </Badge>
                                    </div>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                        <CommandSeparator />
                    </React.Fragment>
                ))}
            </CommandList>
        </CommandDialog>
    );
};

export default GlobalSearch;
