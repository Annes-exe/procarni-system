-- Fix permission denied error by adding SECURITY DEFINER
-- This ensures the function runs with the privileges of the creator (postgres)
-- allowing it to insert into public.profiles even if the triggering user lacks permissions.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER 
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name, email, username)
  VALUES (
    new.id, 
    new.raw_user_meta_data ->> 'first_name', 
    new.raw_user_meta_data ->> 'last_name',
    new.email,
    new.raw_user_meta_data ->> 'username'
  );
  RETURN new;
END;
$$;
