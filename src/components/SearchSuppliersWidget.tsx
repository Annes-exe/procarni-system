import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Search, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import SmartSearch from './SmartSearch';
import { searchMaterials } from '@/integrations/supabase/data';

const SearchSuppliersWidget = () => {
    const navigate = useNavigate();
    const [selectedMaterial, setSelectedMaterial] = useState<{ id: string; name: string } | null>(null);
    const [lastMaterial, setLastMaterial] = useState<{ id: string; name: string } | null>(null);

    useEffect(() => {
        const saved = localStorage.getItem('last_searched_material');
        if (saved) {
            try {
                setLastMaterial(JSON.parse(saved));
            } catch (e) {
                console.error('Error parsing last searched material', e);
            }
        }
    }, []);

    const handleSearch = (material?: { id: string; name: string }) => {
        const target = material || selectedMaterial;
        if (target) {
            localStorage.setItem('last_searched_material', JSON.stringify(target));
            navigate(`/search-suppliers-by-material?query=${encodeURIComponent(target.name)}`);
        }
    };

    return (
        <Card className="shadow-lg h-full">
            <CardHeader className="pb-3">
                <CardTitle className="text-lg font-semibold text-procarni-primary flex items-center">
                    <Search className="mr-2 h-5 w-5" /> Buscar Proveedores
                </CardTitle>
                <CardDescription>
                    Encuentra rápidamente qué proveedores ofrecen un material específico.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex flex-col gap-4">
                    <SmartSearch
                        placeholder="Escribe el nombre del material..."
                        onSelect={(item) => setSelectedMaterial(item)}
                        fetchFunction={searchMaterials}
                        displayValue={selectedMaterial?.name || ''}
                        selectedId={selectedMaterial?.id}
                    />
                    <Button
                        onClick={() => handleSearch()}
                        disabled={!selectedMaterial}
                        className="w-full bg-procarni-primary hover:bg-procarni-primary/90 text-white transition-colors"
                    >
                        Buscar Proveedores
                    </Button>

                    {lastMaterial && (
                        <div className="mt-2 pt-3 border-t border-gray-100 animate-in fade-in slide-in-from-top-1 duration-500">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1.5 flex items-center">
                                <Clock className="mr-1 h-3 w-3" /> Último material buscado
                            </p>
                            <button
                                onClick={() => handleSearch(lastMaterial)}
                                className="text-sm font-medium text-procarni-primary hover:text-procarni-primary/80 transition-colors text-left flex items-center gap-2 w-full group"
                            >
                                <span className="truncate flex-1 bg-gray-50 px-2 py-1.5 rounded border border-transparent group-hover:border-procarni-primary/20 group-hover:bg-procarni-primary/5 transition-all">
                                    {lastMaterial.name}
                                </span>
                            </button>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
};

export default SearchSuppliersWidget;
