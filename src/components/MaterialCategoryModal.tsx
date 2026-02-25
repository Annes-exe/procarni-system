"use client";

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusCircle, Trash2, Loader2, Tags } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getAllMaterialCategories, createMaterialCategory, deleteMaterialCategory } from '@/integrations/supabase/data';
import { showError, showSuccess } from '@/utils/toast';
import { useSession } from '@/components/SessionContextProvider';

interface MaterialCategoryModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const MaterialCategoryModal: React.FC<MaterialCategoryModalProps> = ({ open, onOpenChange }) => {
    const queryClient = useQueryClient();
    const { session } = useSession();
    const userId = session?.user?.id;
    const [newCategoryName, setNewCategoryName] = useState('');

    const { data: categories = [], isLoading } = useQuery({
        queryKey: ['material_categories'],
        queryFn: getAllMaterialCategories,
    });

    const createMutation = useMutation({
        mutationFn: (name: string) => createMaterialCategory(name, userId || ''),
        onSuccess: (data) => {
            if (data) {
                queryClient.invalidateQueries({ queryKey: ['material_categories'] });
                setNewCategoryName('');
                showSuccess('Categoría creada exitosamente.');
            }
        },
    });

    const deleteMutation = useMutation({
        mutationFn: deleteMaterialCategory,
        onSuccess: (success) => {
            if (success) {
                queryClient.invalidateQueries({ queryKey: ['material_categories'] });
                showSuccess('Categoría eliminada exitosamente.');
            }
        },
    });

    const handleAddCategory = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedName = newCategoryName.trim().toUpperCase();
        if (!trimmedName) return;

        if (categories.some(c => c.name.toUpperCase() === trimmedName)) {
            showError('Esta categoría ya existe.');
            return;
        }

        await createMutation.mutateAsync(trimmedName);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Tags className="h-5 w-5 text-procarni-primary" />
                        Gestionar Categorías
                    </DialogTitle>
                    <DialogDescription>
                        Añade o elimina las categorías utilizadas para clasificar los materiales.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleAddCategory} className="flex gap-2 my-4">
                    <Input
                        placeholder="Ej: LIMPIEZA, OFICINA, REPUESTOS"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        className="uppercase"
                        disabled={createMutation.isPending}
                    />
                    <Button
                        type="submit"
                        disabled={!newCategoryName.trim() || createMutation.isPending}
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
                                        Cargando categorías...
                                    </TableCell>
                                </TableRow>
                            ) : categories.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={2} className="h-24 text-center text-muted-foreground">
                                        No hay categorías registradas.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                categories.map((category) => (
                                    <TableRow key={category.id}>
                                        <TableCell className="font-medium">{category.name}</TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => {
                                                    if (window.confirm('¿Estás seguro de que deseas eliminar esta categoría?')) {
                                                        deleteMutation.mutate(category.id);
                                                    }
                                                }}
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

export default MaterialCategoryModal;
