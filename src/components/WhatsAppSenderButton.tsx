import React from 'react';
import { Button } from '@/components/ui/button';
import { MessageSquare } from 'lucide-react'; // Usar MessageSquare en lugar de WhatsApp
import { showError } from '@/utils/toast';
import { cn } from '@/lib/utils';

interface WhatsAppSenderButtonProps {
  recipientPhone?: string;
  documentType: 'Solicitud de Cotización' | 'Orden de Compra';
  documentId: string;
  documentNumber: string;
  companyName: string;
  asChild?: boolean; // NEW: Added asChild prop
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link' | null | undefined; // NEW: Added variant prop
}

const WhatsAppSenderButton = React.forwardRef<HTMLButtonElement, WhatsAppSenderButtonProps>(({
  recipientPhone,
  documentType,
  documentId,
  documentNumber,
  companyName,
  asChild = false,
  variant = 'default',
}, ref) => {
  const handleSendWhatsApp = () => {
    if (!recipientPhone) {
      showError('No se encontró el número de teléfono del proveedor.');
      return;
    }

    const formattedPhone = recipientPhone.replace(/\D/g, '');
    const finalPhone = formattedPhone.startsWith('58') ? formattedPhone : `58${formattedPhone}`;
    
    const message = `Hola, te he enviado por correo la ${documentType} #${documentNumber} de ${companyName}. Por favor, revisa tu bandeja de entrada.`;
    
    const whatsappUrl = `https://wa.me/${finalPhone}?text=${encodeURIComponent(message)}`;
    
    window.open(whatsappUrl, '_blank');
  };

  return (
    <Button
      onClick={handleSendWhatsApp}
      disabled={!recipientPhone}
      variant={variant}
      asChild={asChild}
      className={cn("flex items-center gap-2", !asChild ? "bg-green-600 hover:bg-green-700" : "w-full justify-start")} // Apply custom color only if not rendering as child (i.e., not inside dropdown)
      ref={ref} // Forward the ref to the Button component
    >
      {/* Wrap content in a single span element to ensure it's a single child element */}
      <span className="flex items-center gap-2">
        <MessageSquare className="mr-2 h-4 w-4" /> Enviar por WhatsApp
      </span>
    </Button>
  );
});

WhatsAppSenderButton.displayName = "WhatsAppSenderButton";

export default WhatsAppSenderButton;