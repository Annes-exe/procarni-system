
import { supabase } from "@/integrations/supabase/client";
import { QuoteRequest, QuoteRequestItem } from "@/integrations/supabase/types";

export interface CreateQuoteRequestInput {
    status: 'Draft' | 'Approved' | 'Rejected' | 'Archived';
    company_id: string;
    supplier_id: string;
    issue_date: string;
    deadline_date: string;
    observations?: string | null;
    currency: 'USD' | 'VES';
}

export interface UpdateQuoteRequestInput {
    status?: 'Draft' | 'Approved' | 'Rejected' | 'Archived';
    company_id?: string;
    issue_date?: string;
    deadline_date?: string;
    observations?: string | null;
    currency?: 'USD' | 'VES';
}

export interface CreateQuoteRequestItemInput {
    material_id: string; // Linking to material is standard now
    quantity: number;
    unit: string;
    description?: string; // Optional override or additional info
}

export const quoteRequestService = {

    async getAll(statusFilter?: 'Active' | 'History' | 'Draft' | 'Approved' | 'Rejected' | 'Archived') {
        let query = supabase
            .from('quote_requests')
            .select(`
        *,
        suppliers(name, rif),
        companies(name, rif)
      `)
            .order('created_at', { ascending: false });

        if (statusFilter === 'Active') {
            query = query.in('status', ['Draft']);
        } else if (statusFilter === 'History') {
            query = query.in('status', ['Approved', 'Rejected', 'Archived']);
        } else if (statusFilter === 'Rejected') {
            query = query.eq('status', 'Rejected');
        } else if (statusFilter) {
            query = query.eq('status', statusFilter);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data as (QuoteRequest & { suppliers: { name: string, rif: string } | null, companies: { name: string, rif: string } | null })[];
    },

    async getById(id: string) {
        const { data, error } = await supabase
            .from('quote_requests')
            .select(`
        *,
        suppliers(*),
        companies(*),
        quote_request_items(*)
      `)
            .eq('id', id)
            .single();

        if (error) throw error;

        const { data: itemsWithMaterials, error: itemsError } = await supabase
            .from('quote_request_items')
            .select('*, materials(name)')
            .eq('request_id', id);

        if (itemsError) throw itemsError;

        return { ...data, quote_request_items: itemsWithMaterials } as (QuoteRequest & {
            suppliers: any,
            companies: any,
            quote_request_items: (QuoteRequestItem & { materials: { name: string } | null })[]
        });
    },

    async create(orderData: CreateQuoteRequestInput, items: CreateQuoteRequestItemInput[]) {
        const { data: lastOrder } = await supabase
            .from('quote_requests')
            .select('sequence_number')
            .order('sequence_number', { ascending: false })
            .limit(1)
            .single();

        const sequence_number = (lastOrder?.sequence_number || 0) + 1;
        const user_id = (await supabase.auth.getUser()).data.user?.id;

        const { data: newOrder, error: orderError } = await supabase
            .from('quote_requests')
            .insert([{ ...orderData, sequence_number, user_id }])
            .select()
            .single();

        if (orderError) throw orderError;
        if (!newOrder) throw new Error('Failed to create quote request');

        if (items.length > 0) {
            const itemsToInsert = items.map(item => ({
                request_id: newOrder.id,
                material_id: item.material_id,
                quantity: item.quantity,
                unit: item.unit,
                description: item.description,
            }));

            const { error: itemsError } = await supabase
                .from('quote_request_items')
                .insert(itemsToInsert);

            if (itemsError) throw itemsError;
        }

        // Create Notification
        try {
            await supabase.from('notifications').insert({
                user_id,
                title: 'Nueva Solicitud de Cotización',
                message: `Se ha generado una nueva solicitud de cotización.`,
                type: 'crud',
                resource_type: 'quote_request',
                resource_id: newOrder.id
            });
        } catch (e) {
            console.error('Error creating notification:', e);
        }

        return newOrder;
    },

    async update(id: string, orderData: UpdateQuoteRequestInput, items: CreateQuoteRequestItemInput[]) {
        const { error: orderError } = await supabase
            .from('quote_requests')
            .update(orderData)
            .eq('id', id);

        if (orderError) throw orderError;

        const { error: deleteError } = await supabase
            .from('quote_request_items')
            .delete()
            .eq('request_id', id);

        if (deleteError) throw deleteError;

        if (items.length > 0) {
            const itemsToInsert = items.map(item => ({
                request_id: id,
                material_id: item.material_id,
                quantity: item.quantity,
                unit: item.unit,
                description: item.description,
            }));

            const { error: itemsError } = await supabase
                .from('quote_request_items')
                .insert(itemsToInsert);

            if (itemsError) throw itemsError;
        }

        // Create Notification
        try {
            const user_id = (await supabase.auth.getUser()).data.user?.id;
            await supabase.from('notifications').insert({
                user_id,
                title: 'Solicitud Actualizada',
                message: `Se ha actualizado la solicitud de cotización.`,
                type: 'crud',
                resource_type: 'quote_request',
                resource_id: id
            });
        } catch (e) {
            console.error('Error creating notification:', e);
        }

        return true;
    },

    async updateStatus(id: string, status: 'Draft' | 'Approved' | 'Rejected' | 'Archived') {
        const { error } = await supabase
            .from('quote_requests')
            .update({ status })
            .eq('id', id);

        if (error) throw error;

        // Create Notification
        try {
            const user_id = (await supabase.auth.getUser()).data.user?.id;
            await supabase.from('notifications').insert({
                user_id,
                title: 'Estado de Solicitud Cambiado',
                message: `La solicitud de cotización ha cambiado de estado a: ${status}`,
                type: 'crud',
                resource_type: 'quote_request',
                resource_id: id
            });
        } catch (e) {
            console.error('Error creating notification:', e);
        }

        return true;
    },

    async delete(id: string) {
        const { error } = await supabase
            .from('quote_requests')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return true;
    }
};
