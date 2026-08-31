-- Add explicit relationship between purchase_orders, service_orders, quote_requests and profiles for joined queries
ALTER TABLE public.purchase_orders
ADD CONSTRAINT purchase_orders_user_id_profiles_fkey
FOREIGN KEY (user_id) REFERENCES public.profiles(id);

ALTER TABLE public.service_orders
ADD CONSTRAINT service_orders_user_id_profiles_fkey
FOREIGN KEY (user_id) REFERENCES public.profiles(id);

ALTER TABLE public.quote_requests
ADD CONSTRAINT quote_requests_user_id_profiles_fkey
FOREIGN KEY (user_id) REFERENCES public.profiles(id);
