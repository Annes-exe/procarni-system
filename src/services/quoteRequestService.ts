
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
}

export interface UpdateQuoteRequestInput {
    status?: 'Draft' | 'Sent' | 'Approved' | 'Rejected' | 'Archived';
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

    async getAll(statusFilter?: 'Active' | 'History' | 'Draft' | 'Sent' | 'Approved' | 'Rejected' | 'Archived') {
        let query = supabase
            .from('quote_requests')
            .select(`
        *,
        suppliers(name, rif),
        companies(name, rif)
      `)
            .order('created_at', { ascending: false });

        if (statusFilter === 'Active') {
            // Logic for 'Active': Draft, Sent, Approved. 
            // Actually 'Approved' usually moves to PO, but for QR it might stay open? 
            // Let's assume Active = Draft, Sent. Approved/Rejected/Archived = History?
            // Or maybe strictly follow status if provided in UI tabs.
            // If UI sends 'Active', let's return Draft and Sent.
            query = query.in('status', ['Draft', 'Sent']);
        } else if (statusFilter === 'History') {
            // All history: Approved, Rejected, Archived
            query = query.in('status', ['Approved', 'Rejected', 'Archived']);
        } else if (statusFilter) {
            // Specific status
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

        // We might need to join materials to get names for items if not stored directly
        // The current quote_request_items has material_id. Fetching its name might require a separate query or better join.
        // Let's see if we can join materials in the same query.
        // quote_request_items(*, materials(name))

        // Check if the relation exists in types or enabling it.
        // Ideally: quote_request_items(..., materials(name))

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
        // 1. Get next sequence number
        const { data: lastOrder } = await supabase
            .from('quote_requests')
            .select('sequence_number')
            .order('sequence_number', { ascending: false })
            .limit(1)
            .single();

        const sequence_number = (lastOrder?.sequence_number || 0) + 1;

        // 2. Create Quote Request
        const { data: newOrder, error: orderError } = await supabase
            .from('quote_requests')
            .insert([{ ...orderData, sequence_number, user_id: (await supabase.auth.getUser()).data.user?.id }])
            .select()
            .single();

        if (orderError) throw orderError;
        if (!newOrder) throw new Error('Failed to create quote request');

        // 3. Create Items
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

            if (itemsError) {
                // Rollback? complex. Just throw for now.
                console.error('Error creating items:', itemsError);
                throw itemsError;
            }
        }

        return newOrder;
    },

    async update(id: string, orderData: UpdateQuoteRequestInput, items: CreateQuoteRequestItemInput[]) {
        // 1. Update Order
        const { error: orderError } = await supabase
            .from('quote_requests')
            .update(orderData)
            .eq('id', id);

        if (orderError) throw orderError;

        // 2. Replace Items (Delete all and re-create)
        // For simplicity in this project, we replace all items on update.
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

        return true;
    },

    async updateStatus(id: string, status: 'Draft' | 'Sent' | 'Approved' | 'Rejected' | 'Archived') {
        const { error } = await supabase
            .from('quote_requests')
            .update({ status })
            .eq('id', id);

        if (error) throw error;
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
