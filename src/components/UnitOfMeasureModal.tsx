"use client";

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusCircle, Trash2, Loader2, Ruler } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getAllUnits, createUnit, deleteUnit } from '@/integrations/supabase/data';
import { showError, showSuccess } from '@/utils/toast';
import { useSession } from '@/components/SessionContextProvider';

interface UnitOfMeasureModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const UnitOfMeasureModal: React.FC<UnitOfMeasureModalProps> = ({ open, onOpenChange }) => {
    const queryClient = useQueryClient();
    const { session } = useSession();
    const userId = session?.user?.id;
    const [newUnitName, setNewUnitName] = useState('');

    const { data: units = [], isLoading } = useQuery({
        queryKey: ['units_of_measure'],
        queryFn: getAllUnits,
    });

    const createMutation = useMutation({
        mutationFn: (name: string) => createUnit(name, userId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['units_of_measure'] });
            setNewUnitName('');
            showSuccess('Unidad de medida creada.');
        },
    });

    const deleteMutation = useMutation({
        mutationFn: deleteUnit,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['units_of_measure'] });
            showSuccess('Unidad de medida eliminada.');
        },
    });

    const handleAddUnit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newUnitName.trim()) return;
        await createMutation.mutateAsync(newUnitName);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Ruler className="h-5 w-5 text-procarni-primary" />
                        Gestionar Unidades de Medida
                    </DialogTitle>
                    <DialogDescription>
                        Añade o elimina las unidades de medida utilizadas para los materiales.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleAddUnit} className="flex gap-2 my-4">
                    <Input
                        placeholder="Ej: TON, MTS, DOC"
                        value={newUnitName}
                        onChange={(e) => setNewUnitName(e.target.value)}
                        className="uppercase"
                        disabled={createMutation.isPending}
                    />
                    <Button
                        type="submit"
                        disabled={!newUnitName.trim() || createMutation.isPending}
                        className="bg-procarni-secondary hover:bg-green-700 shrink-0"
                    >
                        {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4 mr-2" />}
                        Añadir
                    </Button>
                </form>

                <div className="max-h-[300px] overflow-y-auto rounded-md border">
                    <Table>
                        <TableHeader className="bg-muted/50 sticky top-0">
                            <TableRow>
                                <TableHead>Nombre</TableHead>
                                <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={2} className="h-24 text-center">
                                        Cargando unidades...
                                    </TableCell>
                                </TableRow>
                            ) : units.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={2} className="h-24 text-center text-muted-foreground">
                                        No hay unidades registradas.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                units.map((unit) => (
                                    <TableRow key={unit.id}>
                                        <TableCell className="font-medium">{unit.name}</TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => deleteMutation.mutate(unit.id)}
                                                disabled={deleteMutation.isPending}
                                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cerrar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default UnitOfMeasureModal;
