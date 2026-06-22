import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Material } from '@/integrations/supabase/types';
import MaterialFusionModal from '@/components/MaterialFusionModal';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Combine, Search } from 'lucide-react';
import { getAllMaterials } from '@/integrations/supabase/data';

// Función para obtener las sugerencias desde la vista SQL
const getFusionSuggestions = async () => {
  const { data, error } = await supabase
    .from('vw_material_fusion_suggestions')
    .select('*')
    .limit(50); // Limitamos a los 50 casos más críticos para no saturar la vista
    
  if (error) throw error;
  return data;
};

const MaterialCleanupDashboard = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Traemos las sugerencias de la IA de Postgres
  const { data: suggestions, isLoading: isLoadingSuggestions, refetch } = useQuery({
    queryKey: ['fusion_suggestions'],
    queryFn: getFusionSuggestions,
  });

  // Traemos los materiales completos (Requerimiento de tu modal actual)
  const { data: materials = [] } = useQuery({
    queryKey: ['materials'],
    queryFn: getAllMaterials,
  });

  const handleOpenFusion = (targetId: string, sourceId: string) => {
    // Le pasamos al modal los dos IDs que Postgres sugiere fusionar
    setSelectedIds([targetId, sourceId]);
    setIsModalOpen(true);
  };

  const getScoreColor = (score: number) => {
    if (score > 80) return "bg-red-100 text-red-800 border-red-200";
    if (score > 60) return "bg-orange-100 text-orange-800 border-orange-200";
    return "bg-yellow-100 text-yellow-800 border-yellow-200";
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold tracking-tight">Limpieza de Catálogo</h2>
        <p className="text-muted-foreground">
          El sistema ha analizado la base de datos y detectado materiales con nombres similares que podrían ser duplicados.
        </p>
      </div>

      <Card>
        <CardHeader className="bg-slate-50 border-b">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Search className="w-5 h-5" />
            Sugerencias de Fusión Automáticas
          </CardTitle>
          <CardDescription>
            Revisa los pares encontrados. Haz clic en "Evaluar Fusión" para decidir cuál será el Material Maestro.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoadingSuggestions ? (
            <div className="p-8 text-center text-muted-foreground">Calculando similitudes trigramáticas...</div>
          ) : suggestions?.length === 0 ? (
            <div className="p-8 text-center text-green-600 flex flex-col items-center gap-2">
              <AlertCircle className="w-8 h-8" />
              <p className="font-medium">¡Catálogo Limpio!</p>
              <p className="text-sm">No se encontraron materiales con alta similitud.</p>
            </div>
          ) : (
            <div className="divide-y">
              {suggestions?.map((suggestion, index) => (
                <div key={index} className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors">
                  <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center flex-1 mr-6">
                    
                    {/* Material A */}
                    <div className="text-right">
                      <p className="font-medium text-slate-900">{suggestion.target_name}</p>
                      <p className="text-xs text-muted-foreground font-mono truncate max-w-[200px] ml-auto">{suggestion.target_id}</p>
                    </div>

                    {/* Porcentaje de Similitud */}
                    <div className="flex flex-col items-center px-4">
                      <Badge variant="outline" className={`font-mono ${getScoreColor(suggestion.similarity_score)}`}>
                        {suggestion.similarity_score}% coincidencia
                      </Badge>
                      <div className="h-px w-full bg-slate-200 mt-2 relative">
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-1 text-[10px] text-slate-400">VS</div>
                      </div>
                    </div>

                    {/* Material B */}
                    <div className="text-left">
                      <p className="font-medium text-slate-900">{suggestion.source_name}</p>
                      <p className="text-xs text-muted-foreground font-mono truncate max-w-[200px]">{suggestion.source_id}</p>
                    </div>

                  </div>

                  <Button 
                    onClick={() => handleOpenFusion(suggestion.target_id, suggestion.source_id)}
                    variant="secondary"
                    className="shrink-0 flex items-center gap-2"
                  >
                    <Combine className="w-4 h-4" />
                    Evaluar Fusión
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reutilizamos el modal robusto que ya programaste */}
      {isModalOpen && (
        <MaterialFusionModal
          open={isModalOpen}
          onOpenChange={setIsModalOpen}
          selectedIds={selectedIds}
          materials={materials as Material[]}
          onSuccess={() => {
            refetch(); // Recargamos la vista de Postgres después de una fusión exitosa
          }}
        />
      )}
    </div>
  );
};

export default MaterialCleanupDashboard;
