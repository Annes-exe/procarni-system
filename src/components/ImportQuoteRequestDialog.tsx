import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Search, Loader2 } from 'lucide-react';
import { getAllQuoteRequests, getQuoteRequestDetails } from '@/integrations/supabase/data';
import { QuoteRequest } from '@/integrations/supabase/types';

interface ImportQuoteRequestDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onImport: (selectedRequests: QuoteRequest[]) => void;
}

const ImportQuoteRequestDialog: React.FC<ImportQuoteRequestDialogProps> = ({ isOpen, onClose, onImport }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isImporting, setIsImporting] = useState(false);

    // Consider Active and Approved quote requests since they might have valid quotes
    const { data: quoteRequests, isLoading } = useQuery({
        queryKey: ['quoteRequests', 'ImportModal'],
        queryFn: async () => {
            const active = await getAllQuoteRequests('Active');
            const approved = await getAllQuoteRequests('Approved');
            return [...active, ...approved].sort((a, b) =>
                new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
            );
        },
        enabled: isOpen,
    });

    const filteredRequests = useMemo(() => {
        if (!quoteRequests) return [];
        if (!searchTerm) return quoteRequests;

        const lowerCaseSearchTerm = searchTerm.toLowerCase();
        return quoteRequests.filter(req =>
            // @ts-ignore
            (req.suppliers?.name || '').toLowerCase().includes(lowerCaseSearchTerm) ||
            // @ts-ignore
            (req.companies?.name || '').toLowerCase().includes(lowerCaseSearchTerm) ||
            req.id.toLowerCase().includes(lowerCaseSearchTerm)
        );
    }, [quoteRequests, searchTerm]);

    const toggleSelection = (id: string) => {
        const newSelected = new Set(selectedIds);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedIds(newSelected);
    };

    const toggleAll = () => {
        if (selectedIds.size === filteredRequests.length && filteredRequests.length > 0) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredRequests.map(q => q.id)));
        }
    };

    const handleImportClick = async () => {
        if (selectedIds.size === 0 || !quoteRequests) return;

        setIsImporting(true);
        try {
            // Fetch full details for selected requests
            const fullRequestsPromises = Array.from(selectedIds).map(id => getQuoteRequestDetails(id));
            const fullRequests = await Promise.all(fullRequestsPromises);

            // Filter out any nulls
            const validRequests = fullRequests.filter((req): req is QuoteRequest => req !== null);

            onImport(validRequests);
            setSelectedIds(new Set()); // Reset selection after successful import
        } catch (error) {
            console.error("Error fetching full quote requests details:", error);
        } finally {
            setIsImporting(false);
        }
    };

    // Reset state when modal closes/opens
    React.useEffect(() => {
        if (isOpen) {
            setSelectedIds(new Set());
            setSearchTerm('');
        }
    }, [isOpen]);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[700px] max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Importar Solicitudes de Cotización (SC)</DialogTitle>
                    <DialogDescription>
                        Selecciona las solicitudes de compra que deseas importar a la tabla de comparación.
                        Se precargarán los materiales y el proveedor correspondiente.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex items-center space-x-2 my-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar por ID, proveedor..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-8"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto min-h-[300px] border rounded-md">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center h-full p-8 text-muted-foreground">
                            <Loader2 className="h-8 w-8 animate-spin mb-2" />
                            <p>Cargando solicitudes...</p>
                        </div>
                    ) : filteredRequests.length === 0 ? (
                        <div className="flex items-center justify-center h-full p-8 text-muted-foreground text-center">
                            {searchTerm ? 'No se encontraron solicitudes con esa búsqueda.' : 'No hay solicitudes activas o aprobadas disponibles.'}
                        </div>
                    ) : (
                        <Table>
                            <TableHeader className="sticky top-0 bg-white z-10 shadow-sm">
                                <TableRow>
                                    <TableHead className="w-[50px] text-center">
                                        <Checkbox
                                            checked={filteredRequests.length > 0 && selectedIds.size === filteredRequests.length}
                                            onCheckedChange={toggleAll}
                                        />
                                    </TableHead>
                                    <TableHead>ID</TableHead>
                                    <TableHead>Proveedor</TableHead>
                                    <TableHead>Fecha</TableHead>
                                    <TableHead>Estado</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredRequests.map((req) => (
                                    <TableRow key={req.id} className="cursor-pointer" onClick={() => toggleSelection(req.id)}>
                                        <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                                            <Checkbox
                                                checked={selectedIds.has(req.id)}
                                                onCheckedChange={() => toggleSelection(req.id)}
                                            />
                                        </TableCell>
                                        <TableCell className="font-mono text-xs">{req.id.substring(0, 8)}</TableCell>
                                        {/* @ts-ignore */}
                                        <TableCell className="font-medium">{req.suppliers?.name || 'Desconocido'}</TableCell>
                                        <TableCell className="text-sm text-gray-500">
                                            {req.created_at ? new Date(req.created_at).toLocaleDateString() : '---'}
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            {req.status === 'Approved' ? 'Aprobada' : 'Borrador'}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </div>

                <DialogFooter className="mt-4">
                    <Button variant="outline" onClick={onClose} disabled={isImporting}>
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleImportClick}
                        disabled={selectedIds.size === 0 || isImporting}
                        className="bg-procarni-secondary hover:bg-green-700"
                    >
                        {isImporting ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importando...</>
                        ) : (
                            `Importar Seleccionadas (${selectedIds.size})`
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default ImportQuoteRequestDialog;
