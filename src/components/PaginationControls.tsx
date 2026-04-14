import React from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationControlsProps {
  currentPage: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  className?: string;
}

const PaginationControls: React.FC<PaginationControlsProps> = ({
  currentPage,
  totalCount,
  pageSize,
  onPageChange,
  className = '',
}) => {
  const totalPages = Math.ceil(totalCount / pageSize);

  if (totalPages <= 1 && totalCount > 0) return (
    <div className={`mt-4 text-sm text-muted-foreground text-center ${className}`}>
      Mostrando todos los {totalCount} resultados
    </div>
  );
  
  if (totalCount === 0) return null;

  const startRange = (currentPage - 1) * pageSize + 1;
  const endRange = Math.min(currentPage * pageSize, totalCount);

  return (
    <div className={`flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 py-4 border-t border-gray-100 ${className}`}>
      <div className="text-sm text-muted-foreground order-2 sm:order-1">
        Mostrando <span className="font-medium text-procarni-primary">{startRange}</span> a <span className="font-medium text-procarni-primary">{endRange}</span> de <span className="font-medium text-procarni-primary">{totalCount}</span> resultados
      </div>
      
      <div className="flex items-center gap-2 order-1 sm:order-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="gap-2 h-9 px-4 border-gray-200 hover:border-procarni-secondary hover:text-procarni-secondary transition-all duration-200"
        >
          <ChevronLeft className="h-4 w-4" />
          Anterior
        </Button>
        
        <div className="flex items-center justify-center min-w-[100px] text-sm font-medium bg-gray-50 h-9 px-4 rounded-md border border-gray-100 italic">
          Página {currentPage} de {totalPages}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="gap-2 h-9 px-4 border-gray-200 hover:border-procarni-secondary hover:text-procarni-secondary transition-all duration-200"
        >
          Siguiente
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default PaginationControls;
