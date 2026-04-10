import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Trash2, ExternalLink, FileText, UploadCloud, FileImage, FileCode2, Image as ImageIcon, CheckCircle2, Loader2, Camera, FolderOpen } from 'lucide-react';
import { uploadToCloudinary } from '@/services/cloudinaryService';
import { OrderDocumentService } from '@/integrations/supabase/services/orderDocumentService';
import { showError, showSuccess } from '@/utils/toast';
import { OrderDocument } from '@/integrations/supabase/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface OrderDocumentManagerProps {
  orderId: string;
  orderType: 'PO' | 'SO';
  supplierName: string;
  sequenceNumber: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

type DocumentType = 'Factura' | 'Nota de Entrega' | 'Otro';

const getDocumentTypeIcon = (type: string) => {
  switch (type) {
    case 'Factura': return <FileText className="h-5 w-5 text-blue-500" />;
    case 'Nota de Entrega': return <FileCode2 className="h-5 w-5 text-amber-500" />;
    case 'Otro': return <FileImage className="h-5 w-5 text-gray-500" />;
    default: return <FileText className="h-5 w-5" />;
  }
};

const getDocumentTypeColor = (type: string) => {
  switch (type) {
    case 'Factura': return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'Nota de Entrega': return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'Otro': return 'bg-gray-50 text-gray-700 border-gray-200';
    default: return 'bg-gray-100 text-gray-800';
  }
};

export const OrderDocumentManager: React.FC<OrderDocumentManagerProps> = ({ 
  orderId, 
  orderType, 
  supplierName, 
  sequenceNumber,
  isOpen,
  onOpenChange
}) => {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [documentType, setDocumentType] = useState<DocumentType>('Factura');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const queryKey = ['orderDocuments', orderId, orderType];

  const { data: documents, isLoading } = useQuery({
    queryKey,
    queryFn: () => OrderDocumentService.getDocumentsByOrderId(orderId, orderType),
    enabled: isOpen && !!orderId,
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, cloudinaryPublicId }: { id: string; cloudinaryPublicId?: string }) => 
      OrderDocumentService.deleteDocument(id, cloudinaryPublicId),
    onSuccess: (success) => {
      if (success) {
        showSuccess('Documento eliminado.');
        queryClient.invalidateQueries({ queryKey });
      }
    }
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      // Basic validation
      if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
        showError('Solo se permiten imágenes y archivos PDF.');
        setSelectedFile(null);
        if (e.target) e.target.value = '';
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    try {
      // 1. Sanitize folder parts
      const sanitizedSupplier = supplierName
        .trim().toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '_')
        .replace(/-+/g, '_');
      
      const folderPath = `fac_ne/${sanitizedSupplier}/${sequenceNumber}`;

      // 2. Upload to Cloudinary
      const cloudinaryResponse = await uploadToCloudinary(selectedFile, folderPath);

      // 3. Save to database
      const result = await OrderDocumentService.saveDocument({
        purchase_order_id: orderType === 'PO' ? orderId : undefined,
        service_order_id: orderType === 'SO' ? orderId : undefined,
        document_type: documentType,
        file_url: cloudinaryResponse.secure_url,
        cloudinary_public_id: cloudinaryResponse.public_id
      });

      if (result) {
        showSuccess('Documento subido correctamente.');
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        if (cameraInputRef.current) cameraInputRef.current.value = '';
        queryClient.invalidateQueries({ queryKey });
      }
    } catch (error: any) {
      console.error('Error in handleUpload', error);
      showError(error.message || 'Ocurrió un error al cargar el archivo.');
    } finally {
      setIsUploading(false);
    }
  };

  // Resets state when modal is closed
  useEffect(() => {
    if (!isOpen) {
      setSelectedFile(null);
      setDocumentType('Factura');
    }
  }, [isOpen]);

  const handleDelete = (doc: OrderDocument) => {
    if (confirm('¿Estás seguro de que deseas eliminar este documento? Esta acción no se puede deshacer.')) {
      deleteMutation.mutate({ id: doc.id, cloudinaryPublicId: doc.cloudinary_public_id });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-white p-0 overflow-hidden rounded-2xl border-none shadow-2xl">
        <DialogHeader className="p-6 pb-4 border-b border-gray-100 bg-gray-50/50">
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-procarni-secondary" />
            Documentos Adjuntos
          </DialogTitle>
          <DialogDescription className="text-gray-500">
            Gestiona facturas, notas de entrega y otros comprobantes para {sequenceNumber}.
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 space-y-6">
          
          {/* UPLOAD SECTION */}
          <div className="p-5 bg-white border border-gray-100 rounded-xl shadow-sm space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-gray-500 uppercase">Tipo de Documento</Label>
                <Select value={documentType} onValueChange={(value: any) => setDocumentType(value)} disabled={isUploading}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Seleccione el tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Factura">Factura</SelectItem>
                    <SelectItem value="Nota de Entrega">Nota de Entrega</SelectItem>
                    <SelectItem value="Otro">Otro Documento</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Action Buttons for Selection */}
              <div className="flex gap-2 relative">
                {/* INVISIBLE INPUTS */}
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={handleFileChange}
                  ref={fileInputRef}
                  disabled={isUploading}
                />
                
                {/* Cámara (Solo dispositivos móviles se beneficiarán completamente del capture="environment") */}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleFileChange}
                  ref={cameraInputRef}
                  disabled={isUploading}
                />

                {!selectedFile ? (
                   <div className="flex w-full gap-2">
                     <Button 
                       type="button" 
                       variant="outline" 
                       className="flex-1 bg-white hover:bg-gray-50 text-gray-700 h-10 border-gray-200"
                       onClick={() => fileInputRef.current?.click()}
                     >
                       <UploadCloud className="h-4 w-4 mr-2" /> Galería/Archivos
                     </Button>
                     <Button 
                       type="button" 
                       variant="outline" 
                       className="bg-white hover:bg-gray-50 text-procarni-primary h-10 border-gray-200 md:hidden"
                       onClick={() => cameraInputRef.current?.click()}
                       title="Usar Cámara"
                     >
                       <Camera className="h-4 w-4" />
                     </Button>
                   </div>
                ) : (
                  <div className="flex flex-1 items-center gap-3">
                    <div className="flex-1 flex items-center bg-gray-50 border border-gray-200 rounded-md px-3 h-10 overflow-hidden">
                      <ImageIcon className="h-4 w-4 text-gray-400 mr-2 shrink-0" />
                      <span className="text-sm text-gray-600 truncate">{selectedFile.name}</span>
                    </div>
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="icon" 
                      className="h-10 w-10 text-destructive border border-transparent hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                      onClick={() => {
                        setSelectedFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                        if (cameraInputRef.current) cameraInputRef.current.value = '';
                      }}
                      disabled={isUploading}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {selectedFile && (
              <Button 
                onClick={handleUpload}
                disabled={isUploading}
                className="w-full bg-procarni-secondary hover:bg-green-700 text-white h-10 transition-colors"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Subiendo Documento...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Confirmar Tipo y Subir
                  </>
                )}
              </Button>
            )}
          </div>

          {/* LIST OF DOCUMENTS */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-gray-900 border-b border-gray-100 pb-2">Archivos Subidos</h4>
            
            {isLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-6 w-6 text-gray-300 animate-spin" />
              </div>
            ) : documents && documents.length > 0 ? (
              <ScrollArea className="h-[250px] pr-4">
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <div 
                      key={doc.id} 
                      className="flex items-center justify-between p-3 border border-gray-100 rounded-lg hover:border-gray-300 hover:shadow-sm transition-all bg-white group"
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="shrink-0 p-2 bg-gray-50 rounded-md">
                          {getDocumentTypeIcon(doc.document_type)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-900 leading-none">{doc.document_type}</span>
                            <Badge variant="outline" className={`h-5 text-[10px] px-1.5 font-medium border-0 ${getDocumentTypeColor(doc.document_type)}`}>
                              {format(new Date(doc.created_at), 'dd/MM/yyyy HH:mm')}
                            </Badge>
                          </div>
                          <p className="text-xs text-gray-500 mt-1 truncate">
                            Subido por: <span className="font-medium text-gray-700">{doc.users?.email || 'Usuario'}</span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button 
                          asChild
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-procarni-secondary hover:bg-procarni-secondary/10"
                          title="Ver Archivo"
                        >
                          <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-gray-400 hover:text-red-600 hover:bg-red-50"
                          onClick={() => handleDelete(doc)}
                          disabled={deleteMutation.isPending}
                          title="Eliminar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center bg-gray-50 border border-dashed border-gray-200 rounded-xl">
                <FileText className="h-8 w-8 text-gray-300 mb-2" />
                <p className="text-sm text-gray-500 font-medium">No hay documentos registrados.</p>
                <p className="text-xs text-gray-400 mt-1">Usa la opción superior para adjuntar un archivo.</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
