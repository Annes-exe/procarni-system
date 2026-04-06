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
        <Card className="border-none bg-white/70 backdrop-blur-xl shadow-2xl shadow-gray-200/50 ring-1 ring-white rounded-[2rem] overflow-hidden h-full">
            <CardHeader className="pb-4 p-7 bg-gradient-to-br from-gray-50/50 to-transparent border-b border-gray-100/50">
                <div className="flex items-center gap-3 mb-1">
                    <div className="p-2.5 rounded-xl bg-procarni-primary/10 text-procarni-primary">
                        <Search className="h-[18px] w-[18px]" />
                    </div>
                    <CardTitle className="text-[21px] font-black text-procarni-blue tracking-tight">
                        Buscar Proveedores
                    </CardTitle>
                </div>
                <CardDescription className="text-[13px] text-gray-500 font-medium italic">
                    Encuentra qué proveedores ofrecen un material específico.
                </CardDescription>
            </CardHeader>
            <CardContent className="p-7">
                <div className="flex flex-col gap-5">
                    <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-400 ml-1">Material Objetivo</label>
                        <SmartSearch
                            placeholder="Escribe el nombre del material..."
                            onSelect={(item) => setSelectedMaterial(item)}
                            fetchFunction={searchMaterials}
                            displayValue={selectedMaterial?.name || ''}
                            selectedId={selectedMaterial?.id}
                        />
                    </div>
                    
                    <Button
                        onClick={() => handleSearch()}
                        disabled={!selectedMaterial}
                        className="w-full h-[2.75rem] rounded-xl bg-gradient-to-r from-procarni-primary to-procarni-blue hover:shadow-lg hover:shadow-procarni-primary/20 transition-all font-bold text-[15px] scale-[1.02] active:scale-[0.98]"
                    >
                        Localizar Proveedores
                    </Button>

                    {lastMaterial && (
                        <div className="mt-1 pt-4 border-t border-gray-100 animate-in fade-in slide-in-from-top-2 duration-700">
                            <p className="text-[9px] text-gray-400 uppercase tracking-[0.2em] font-black mb-2 flex items-center">
                                <Clock className="mr-2 h-3 w-3 text-procarni-secondary" /> Última búsqueda
                            </p>
                            <button
                                onClick={() => handleSearch(lastMaterial)}
                                className="group w-full text-left transition-all"
                            >
                                <div className="flex items-center gap-3 p-2.5 rounded-xl bg-gray-50/50 border border-transparent group-hover:border-procarni-primary/30 group-hover:bg-white group-hover:shadow-md transition-all">
                                    <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center shadow-sm">
                                        <Search className="h-3 w-3 text-gray-400 group-hover:text-procarni-primary transition-colors" />
                                    </div>
                                    <span className="text-xs font-bold text-gray-700 group-hover:text-procarni-blue transition-colors truncate">
                                        {lastMaterial.name}
                                    </span>
                                </div>
                            </button>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
};

export default SearchSuppliersWidget;
