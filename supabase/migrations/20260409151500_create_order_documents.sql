CREATE TABLE IF NOT EXISTS public.order_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id UUID REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    service_order_id UUID REFERENCES public.service_orders(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL CHECK (document_type IN ('Factura', 'Nota de Entrega', 'Otro')),
    file_url TEXT NOT NULL,
    cloudinary_public_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    
    CONSTRAINT order_document_link_check CHECK (
        (purchase_order_id IS NOT NULL AND service_order_id IS NULL) OR
        (purchase_order_id IS NULL AND service_order_id IS NOT NULL)
    )
);

-- RLS
ALTER TABLE public.order_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated access to order documents" 
ON public.order_documents
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
