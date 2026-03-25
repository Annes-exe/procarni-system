import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Smartphone, Send, ExternalLink, Loader2 } from 'lucide-react';
import { showLoading, dismissToast, showError, showSuccess } from '@/utils/toast';
import { useSession } from '@/components/SessionContextProvider';

interface WhatsAppShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  type: 'purchase' | 'service' | 'quote_request';
  supplierName: string;
  orderNumber: string;
  phones: {
    primary: string | null;
    secondary: string | null;
  };
}

const WhatsAppShareModal = ({
  isOpen,
  onClose,
  orderId,
  type,
  supplierName,
  orderNumber,
  phones
}: WhatsAppShareModalProps) => {
  const { session } = useSession();
  const [selectedPhone, setSelectedPhone] = useState<string>(phones.primary || phones.secondary || '');
  const [isGenerating, setIsGenerating] = useState(false);

  const availablePhones = [
    { label: 'Teléfono Principal', value: phones.primary },
    { label: 'Teléfono Secundario', value: phones.secondary }
  ].filter(p => !!p.value);

  const handleShare = async () => {
    if (!selectedPhone) {
      showError('Por favor seleccione un número de teléfono.');
      return;
    }

    setIsGenerating(true);
    const toastId = showLoading('Generando link temporal...');

    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-temp-pdf`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderId, type }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al generar el documento.');
      }

      const { url } = await response.json();
      
      // Clean phone number (remove non-digits)
      const cleanPhone = selectedPhone.replace(/\D/g, '');
      
      const getDocName = () => {
        switch (type) {
          case 'purchase': return 'Orden de Compra';
          case 'service': return 'Orden de Servicio';
          case 'quote_request': return 'Solicitud de Cotización';
          default: return 'Documento';
        }
      };
      
      const message = `Hola ${supplierName}, le adjuntamos la ${getDocName()} #${orderNumber}:\n\n${url}\n\nEste enlace es temporal y expirará en 72 horas.`;
      const waUrl = `https://wa.me/${cleanPhone.startsWith('58') ? cleanPhone : '58' + cleanPhone}?text=${encodeURIComponent(message)}`;
      
      window.open(waUrl, '_blank');
      showSuccess('Link generado y enviado a WhatsApp.');
      onClose();
    } catch (error: any) {
      showError(error.message);
    } finally {
      setIsGenerating(false);
      dismissToast(toastId);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-procarni-dark">
            <Smartphone className="h-5 w-5 text-procarni-primary" />
            Enviar por WhatsApp
          </DialogTitle>
          <DialogDescription>
            Selecciona el número de teléfono para enviar el documento #{orderNumber}.
          </DialogDescription>
        </DialogHeader>

        <div className="py-6">
          <p className="text-sm text-gray-500 mb-4">
            Seleccione el número de contacto para enviar la <strong>{orderNumber}</strong>:
          </p>

          <RadioGroup value={selectedPhone} onValueChange={setSelectedPhone} className="space-y-3">
            {availablePhones.map((phone, index) => (
              <div key={index} className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50 transition-colors">
                <RadioGroupItem value={phone.value!} id={`phone-${index}`} />
                <Label htmlFor={`phone-${index}`} className="flex flex-col cursor-pointer flex-1">
                  <span className="font-medium text-procarni-dark">{phone.label}</span>
                  <span className="text-sm text-gray-500">{phone.value}</span>
                </Label>
              </div>
            ))}
          </RadioGroup>

          <div className="mt-6 p-3 bg-amber-50 border border-amber-100 rounded-md">
            <p className="text-[11px] text-amber-700 leading-tight">
              <strong>Nota:</strong> Se generará un enlace público temporal en Cloudinary. El archivo se eliminará automáticamente en 72 horas.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={isGenerating}>
            Cancelar
          </Button>
          <Button 
            onClick={handleShare} 
            disabled={isGenerating || !selectedPhone}
            className="bg-[#25D366] hover:bg-[#128C7E] text-white gap-2"
          >
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar WhatsApp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default WhatsAppShareModal;
