import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';
import SmartSearch from '@/components/SmartSearch';
import { searchMaterials } from '@/integrations/supabase/data'; // Import from centralized data file

interface SearchResult {
  id: string;
  name: string;
}

const MaterialSearchQuickAccess: React.FC = () => {
  const navigate = useNavigate();
  
  // State for SmartSearch selection
  const [selectedMaterial, setSelectedMaterial] = useState<SearchResult | null>(null);

  // Function to adapt searchMaterials for SmartSearch
  const fetchMaterialsForSmartSearch = async (query: string): Promise<SearchResult[]> => {
    // searchMaterials returns Material[], which is compatible with SearchResult { id, name }
    return searchMaterials(query);
  };

  const handleSmartSelect = (item: SearchResult) => {
    setSelectedMaterial(item);
    
    // Navigate immediately upon selection
    navigate(`/search-suppliers-by-material?query=${encodeURIComponent(item.name)}`);
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-md border border-gray-200 mb-6">
      <h3 className="text-xl font-semibold mb-4 text-procarni-primary">
        Buscar Proveedores por Material
      </h3>
      <p className="text-sm text-muted-foreground mb-4">
        Selecciona un material de la lista para encontrar rápidamente los proveedores asociados.
      </p>
      
      <div className="space-y-4">
        {/* Smart Search (Intelligent Search) */}
        <div className="flex flex-col space-y-2">
          <label className="text-sm font-medium">Seleccionar Material Existente:</label>
          <SmartSearch
            placeholder="Buscar o seleccionar un material..."
            onSelect={handleSmartSelect}
            fetchFunction={fetchMaterialsForSmartSearch}
            selectedId={selectedMaterial?.id}
            displayValue={selectedMaterial?.name}
          />
        </div>
      </div>
    </div>
  );
};

export default MaterialSearchQuickAccess;