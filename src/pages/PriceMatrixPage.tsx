import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ListOrdered } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PriceComparisonMatrix from '@/components/PriceComparisonMatrix';
import { DynamicBreadcrumbs } from '@/components/DynamicBreadcrumbs';

export default function PriceMatrixPage() {
  const navigate = useNavigate();

  return (
    <div className="container mx-auto p-4 md:p-8 max-w-[1600px] pb-24">
      <div className="mb-4">
        <DynamicBreadcrumbs />
      </div>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-6 mt-2">
        <div>
          <h1 className="text-2xl font-bold text-procarni-dark tracking-tight flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-500 hover:text-procarni-primary"
              onClick={() => navigate('/quote-comparison-management?tab=matrix')}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            Matriz de Proveedores
          </h1>
          <p className="text-muted-foreground text-sm mt-1 max-w-2xl pl-10">
            Simula, compara precios y analiza la matriz de proveedores de materia prima.
          </p>
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          <Button 
            variant="outline" 
            onClick={() => navigate('/quote-comparison-management?tab=matrix')} 
            className="flex-1 md:flex-none shadow-sm hover:shadow-md transition-shadow"
          >
            <ListOrdered className="mr-2 h-4 w-4" /> Ver Matrices Guardadas
          </Button>
        </div>
      </div>

      <PriceComparisonMatrix />
    </div>
  );
}
