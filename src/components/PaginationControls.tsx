import React from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

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

  // Calcula hasta 5 números de página visibles centrados alrededor de la página actual
  const getPageNumbers = () => {
    const pages = [];
    const maxVisiblePages = 5;
    
    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      let start = Math.max(1, currentPage - 2);
      let end = Math.min(totalPages, currentPage + 2);
      
      if (currentPage <= 3) {
        start = 1;
        end = 5;
      } else if (currentPage >= totalPages - 2) {
        start = totalPages - 4;
        end = totalPages;
      }
      
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
    }
    
    return pages;
  };

  return (
    <div className={`flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 py-4 border-t border-gray-100 ${className}`}>
      <div className="text-sm text-muted-foreground order-2 sm:order-1">
        Mostrando <span className="font-medium text-procarni-primary">{startRange}</span> a <span className="font-medium text-procarni-primary">{endRange}</span> de <span className="font-medium text-procarni-primary">{totalCount}</span> resultados
      </div>
      
      <div className="flex items-center gap-1.5 order-1 sm:order-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="gap-1.5 h-9 px-3 border-gray-200 hover:border-procarni-secondary hover:text-procarni-secondary hover:bg-transparent transition-all duration-200"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline text-xs">Anterior</span>
        </Button>
        
        <div className="flex items-center gap-1">
          {getPageNumbers().map(pageNumber => (
            <Button
              key={pageNumber}
              variant={pageNumber === currentPage ? "default" : "outline"}
              size="sm"
              onClick={() => onPageChange(pageNumber)}
              className={cn(
                "h-9 w-9 p-0 transition-all duration-200 font-semibold text-xs",
                pageNumber === currentPage
                  ? "bg-procarni-primary text-white border-procarni-primary hover:bg-procarni-primary/90 shadow-sm"
                  : "border-gray-200 text-gray-500 hover:border-procarni-secondary hover:text-procarni-secondary hover:bg-transparent"
              )}
            >
              {pageNumber}
            </Button>
          ))}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="gap-1.5 h-9 px-3 border-gray-200 hover:border-procarni-secondary hover:text-procarni-secondary hover:bg-transparent transition-all duration-200"
        >
          <span className="hidden sm:inline text-xs">Siguiente</span>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default PaginationControls;

