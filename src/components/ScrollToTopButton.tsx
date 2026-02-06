import React, { useState, useEffect, RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScrollToTopButtonProps {
  scrollContainerRef: RefObject<HTMLElement>;
}

const ScrollToTopButton: React.FC<ScrollToTopButtonProps> = ({ scrollContainerRef }) => {
  const [isVisible, setIsVisible] = useState(false);

  // Función para manejar el desplazamiento
  const toggleVisibility = () => {
    const container = scrollContainerRef.current;
    if (container) {
      // Usamos scrollTop del contenedor
      if (container.scrollTop > 300) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    }
  };

  // Función para volver al inicio
  const scrollToTop = () => {
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    }
  };

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      // Escuchar el evento de desplazamiento en el contenedor específico
      container.addEventListener('scroll', toggleVisibility);
      // Ejecutar una vez al montar para el estado inicial
      toggleVisibility();
      
      return () => {
        container.removeEventListener('scroll', toggleVisibility);
      };
    }
  }, [scrollContainerRef]);

  return (
    <div className={cn(
      "fixed bottom-4 right-4 z-50 transition-opacity duration-300",
      isVisible ? "opacity-100" : "opacity-0 pointer-events-none"
    )}>
      <Button
        onClick={scrollToTop}
        size="icon"
        className="rounded-full shadow-lg bg-procarni-primary hover:bg-procarni-primary/90 h-12 w-12"
        aria-label="Volver arriba"
      >
        <ArrowUp className="h-6 w-6" />
      </Button>
    </div>
  );
};

export default ScrollToTopButton;