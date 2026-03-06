import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Search, Loader2 } from 'lucide-react';
import { getAllQuoteRequests, getQuoteRequestDetails } from '@/integrations/supabase/data';
import { showError, showSuccess } from '@/utils/toast';
import { cn } from '@/lib/utils';
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
            const results = await getAllQuoteRequests(['Draft', 'Approved']);
            return results.sort((a, b) =>
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
            <DialogContent className="w-[95vw] sm:max-w-[700px] h-[95vh] sm:h-auto sm:max-h-[90vh] flex flex-col p-4 sm:p-6 overflow-hidden bg-gray-50 rounded-2xl border-none shadow-2xl">
                <DialogHeader className="text-left bg-white p-4 rounded-xl shadow-sm border border-gray-100 relative shrink-0">
                    <div className="absolute top-0 left-0 w-1 rounded-l-xl h-full bg-procarni-secondary/80"></div>
                    <DialogTitle className="text-lg sm:text-xl font-bold text-procarni-dark pl-2">Importar Cotizaciones (SC)</DialogTitle>
                    <DialogDescription className="text-sm pl-2 mt-1">
                        Selecciona las solicitudes de compra aprobadas o en borrador para importar sus materiales y proveedor a la matriz de comparación actúal.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex items-center space-x-2 my-2 shrink-0">
                    <div className="relative flex-1 group">
                        <Search className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground group-focus-within:text-procarni-secondary transition-colors" />
                        <Input
                            placeholder="Buscar por ID corto o proveedor..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10 h-10 bg-white border-gray-200 focus:border-procarni-secondary focus:ring-procarni-secondary/20 shadow-sm rounded-xl transition-all"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto min-h-0 rounded-xl border border-gray-100 bg-white shadow-sm">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center h-full p-8 text-muted-foreground">
                            <Loader2 className="h-8 w-8 animate-spin mb-2 text-procarni-secondary" />
                            <p className="text-sm font-medium">Buscando documentos disponibles...</p>
                        </div>
                    ) : filteredRequests.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full p-8 text-muted-foreground text-center">
                            <div className="bg-gray-100 p-4 rounded-full mb-3">
                                <Search className="h-6 w-6 text-gray-400" />
                            </div>
                            <p className="text-sm font-medium text-gray-900 mb-1">
                                {searchTerm ? 'Sin coincidencias' : 'Bandeja vacía'}
                            </p>
                            <p className="text-xs text-gray-500 max-w-[250px]">
                                {searchTerm ? 'No se encontraron solicitudes con esa búsqueda. Intenta con otro término.' : 'No hay solicitudes activas o aprobadas disponibles para importar en este momento.'}
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table className="min-w-[500px]">
                                <TableHeader className="bg-gray-50/80 sticky top-0 z-10 shadow-sm backdrop-blur-md">
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead className="w-[50px] text-center">
                                            <Checkbox
                                                checked={filteredRequests.length > 0 && selectedIds.size === filteredRequests.length}
                                                onCheckedChange={toggleAll}
                                                className="data-[state=checked]:bg-procarni-secondary data-[state=checked]:border-procarni-secondary"
                                            />
                                        </TableHead>
                                        <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wider">ID Documento</TableHead>
                                        <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Proveedor</TableHead>
                                        <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Fecha</TableHead>
                                        <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Estado</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredRequests.map((req) => (
                                        <TableRow
                                            key={req.id}
                                            className={cn(
                                                "cursor-pointer transition-colors hover:bg-gray-50",
                                                selectedIds.has(req.id) && "bg-procarni-secondary/5"
                                            )}
                                            onClick={() => toggleSelection(req.id)}
                                        >
                                            <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                                                <Checkbox
                                                    checked={selectedIds.has(req.id)}
                                                    onCheckedChange={() => toggleSelection(req.id)}
                                                    className="data-[state=checked]:bg-procarni-secondary data-[state=checked]:border-procarni-secondary"
                                                />
                                            </TableCell>
                                            <TableCell className="font-mono text-xs font-semibold text-gray-700">
                                                {req.id.substring(0, 8).toUpperCase()}
                                            </TableCell>
                                            {/* @ts-ignore */}
                                            <TableCell className="font-medium text-gray-900">{req.suppliers?.name || 'Desconocido'}</TableCell>
                                            <TableCell className="text-sm text-gray-500">
                                                {req.created_at ? new Date(req.created_at).toLocaleDateString() : '---'}
                                            </TableCell>
                                            <TableCell>
                                                <span className={cn(
                                                    "px-2 py-1 rounded-full text-xs font-medium border",
                                                    req.status === 'Approved' ? "bg-green-50 text-green-700 border-green-200" : "bg-orange-50 text-orange-700 border-orange-200"
                                                )}>
                                                    {req.status === 'Approved' ? 'Aprobada' : 'Borrador'}
                                                </span>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </div>

                <DialogFooter className="mt-4 flex-col sm:flex-row gap-2 sm:gap-0 shrink-0">
                    <Button variant="outline" onClick={onClose} disabled={isImporting} className="w-full sm:w-auto">
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleImportClick}
                        disabled={selectedIds.size === 0 || isImporting}
                        className="bg-procarni-secondary hover:bg-green-700 w-full sm:w-auto"
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
