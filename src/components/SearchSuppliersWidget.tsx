import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import SmartSearch from './SmartSearch';
import { searchMaterials } from '@/integrations/supabase/data';

const SearchSuppliersWidget = () => {
    const navigate = useNavigate();
    const [selectedMaterial, setSelectedMaterial] = useState<{ id: string; name: string } | null>(null);

    const handleSearch = () => {
        if (selectedMaterial) {
            navigate(`/search-suppliers-by-material?query=${encodeURIComponent(selectedMaterial.name)}`);
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
                        onClick={handleSearch}
                        disabled={!selectedMaterial}
                        className="w-full bg-procarni-primary hover:bg-procarni-primary/90 text-white transition-colors"
                    >
                        Buscar Proveedores
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
};

export default SearchSuppliersWidget;
