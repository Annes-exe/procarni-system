import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { showError, showSuccess, showLoading, dismissToast } from '@/utils/toast';
import { useSession } from '@/components/SessionContextProvider';

interface EmailSenderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (message: string, sendWhatsApp: boolean) => Promise<void>;
  recipientEmail: string;
  recipientPhone?: string;
  documentType: 'Solicitud de Cotización' | 'Orden de Compra';
  documentId: string;
}

const EmailSenderModal: React.FC<EmailSenderModalProps> = ({
  isOpen,
  onClose,
  onSend,
  recipientEmail,
  recipientPhone,
  documentType,
  documentId,
}) => {
  const [message, setMessage] = useState('');
  const [sendWhatsApp, setSendWhatsApp] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const { session } = useSession();

  const handleSend = async () => {
    if (!session?.user?.email) {
      showError('No se pudo determinar el correo del usuario.');
      return;
    }

    if (!recipientEmail) {
      showError('No se encontró el correo del proveedor.');
      return;
    }

    setIsSending(true);
    const toastId = showLoading(`Enviando ${documentType}...`);

    try {
      await onSend(message, sendWhatsApp);
      showSuccess(`${documentType} enviada exitosamente.`);
      onClose();
    } catch (error: any) {
      console.error('[EmailSenderModal] Error sending email:', error);
      showError(error.message || 'Error al enviar el correo.');
    } finally {
      dismissToast(toastId);
      setIsSending(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Enviar {documentType} #{documentId.substring(0, 8)}</DialogTitle>
          <DialogDescription>
            Se enviará un correo a <strong>{recipientEmail}</strong> con el PDF adjunto.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="message">Mensaje personalizado (opcional)</Label>
            <Textarea
              id="message"
              placeholder="Ej: Hola, te adjunto la solicitud de cotización para tu revisión."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
            />
          </div>
          {recipientPhone && (
            <div className="flex items-center space-x-2">
              <Checkbox
                id="whatsapp"
                checked={sendWhatsApp}
                onCheckedChange={(checked) => setSendWhatsApp(!!checked)}
              />
              <Label htmlFor="whatsapp" className="text-sm">
                Enviar notificación por WhatsApp al {recipientPhone}
              </Label>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSending}>
            Cancelar
          </Button>
          <Button onClick={handleSend} disabled={isSending} className="bg-procarni-secondary hover:bg-green-700">
            {isSending ? 'Enviando...' : 'Enviar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EmailSenderModal;