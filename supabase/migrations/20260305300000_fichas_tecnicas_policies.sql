-- Añadir políticasfaltantes para fichas_tecnicas
CREATE POLICY "Authenticated users can delete own fichas_tecnicas" 
ON public.fichas_tecnicas 
FOR DELETE 
TO authenticated 
USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can update own fichas_tecnicas" 
ON public.fichas_tecnicas 
FOR UPDATE 
TO authenticated 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
