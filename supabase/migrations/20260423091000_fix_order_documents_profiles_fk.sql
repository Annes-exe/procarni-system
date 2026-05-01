-- Add explicit relationship between order_documents and profiles for joined queries
ALTER TABLE public.order_documents
ADD CONSTRAINT order_documents_user_id_profiles_fkey
FOREIGN KEY (user_id) REFERENCES public.profiles(id);

-- Update RLS policies to be more descriptive if needed
-- (The existing policy "Allow authenticated access to order documents" is fine for now)
