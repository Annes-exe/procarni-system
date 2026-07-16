
import { supabase } from "@/integrations/supabase/client";
import { QuoteRequest, QuoteRequestItem } from "@/integrations/supabase/types";

export interface CreateQuoteRequestInput {
    status: 'Draft' | 'Sent' | 'Approved' | 'Rejected' | 'Archived';
    company_id: string;
    supplier_id: string;
    issue_date: string;
    deadline_date: string;
    observations?: string | null;
    currency: 'USD' | 'VES';
    exchange_rate?: number | null;
}

export interface UpdateQuoteRequestInput {
    status?: 'Draft' | 'Sent' | 'Approved' | 'Rejected' | 'Archived';
    company_id?: string;
    issue_date?: string;
    deadline_date?: string;
    observations?: string | null;
    currency?: 'USD' | 'VES';
    exchange_rate?: number | null;
    last_sent_at?: string | null;
    send_method?: string | null;
    pdf_url?: string | null;
}

export interface CreateQuoteRequestItemInput {
    material_id: string; // Linking to material is standard now
    material_name: string;
    quantity: number;
    unit: string;
    unit_id?: string | null; // ADDED
    description?: string; // Optional override or additional info
}

export const quoteRequestService = {

    async getAll(statusFilter?: 'Active' | 'History' | 'Draft' | 'Approved' | 'Rejected' | 'Archived', onlyRawMaterials: boolean = false) {
        let query = supabase
            .from('quote_requests')
            .select(`
        *,
        suppliers(name, rif),
        companies(name, rif)
      `)
            .order('created_at', { ascending: false });

        if (statusFilter === 'Active') {
            query = query.in('status', ['Draft', 'Sent', 'Approved']);
        } else if (statusFilter === 'History') {
            query = query.in('status', ['Rejected', 'Archived']);
        } else if (statusFilter === 'Rejected') {
            query = query.eq('status', 'Rejected');
        } else if (statusFilter) {
            query = query.eq('status', statusFilter);
        }

        if (onlyRawMaterials) {
            const categoriesToMatch = [
                'SECA', 'FRESCA', 'EMPAQUE',
                'seca', 'fresca', 'empaque',
                'Seca', 'Fresca', 'Empaque',
                'SECAS', 'FRESCAS', 'EMPAQUES',
                'secas', 'frescas', 'empaques',
                'Secas', 'Frescas', 'Empaques'
            ];
            const { data: matchedRawMaterials } = await supabase
                .from('materials')
                .select('id, name')
                .in('category', categoriesToMatch);
            const rawMaterialIds = matchedRawMaterials?.map(m => m.id).filter(Boolean) || [];
            const rawMaterialNames = matchedRawMaterials?.map(m => m.name).filter(Boolean) || [];
            
            if (rawMaterialIds.length > 0 || rawMaterialNames.length > 0) {
                const { data: matchedById } = await supabase
                    .from('quote_request_items')
                    .select('request_id')
                    .in('material_id', rawMaterialIds);
                    
                const { data: matchedByName } = await supabase
                    .from('quote_request_items')
                    .select('request_id')
                    .in('material_name', rawMaterialNames);
                    
                const rawRequestIds = Array.from(new Set([
                    ...(matchedById?.map(item => item.request_id) || []),
                    ...(matchedByName?.map(item => item.request_id) || [])
                ].filter(Boolean)));
                
                if (rawRequestIds.length > 0) {
                    query = query.in('id', rawRequestIds);
                } else {
                    query = query.eq('id', '00000000-0000-0000-0000-000000000000'); // Force empty
                }
            } else {
                query = query.eq('id', '00000000-0000-0000-0000-000000000000'); // Force empty
            }
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
                material_name: item.material_name,
                quantity: item.quantity,
                unit: item.unit,
                unit_id: item.unit_id,
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

    async update(id: string, orderData: UpdateQuoteRequestInput, items?: CreateQuoteRequestItemInput[]) {
        const { error: orderError } = await supabase
            .from('quote_requests')
            .update(orderData)
            .eq('id', id);

        if (orderError) throw orderError;

        if (items) {
            const { error: deleteError } = await supabase
                .from('quote_request_items')
                .delete()
                .eq('request_id', id);

            if (deleteError) throw deleteError;

            if (items.length > 0) {
                const itemsToInsert = items.map(item => ({
                    request_id: id,
                    material_id: item.material_id,
                    material_name: item.material_name,
                    quantity: item.quantity,
                    unit: item.unit,
                    unit_id: item.unit_id,
                    description: item.description,
                }));

                const { error: itemsError } = await supabase
                    .from('quote_request_items')
                    .insert(itemsToInsert);

                if (itemsError) throw itemsError;
            }
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

    async updateStatus(id: string, status: 'Draft' | 'Sent' | 'Approved' | 'Rejected' | 'Archived') {
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
