-- POLÍTICAS PARA EL BUCKET fichas_tecnicas
-- 1. Permitir Lectura Pública (Bucket Público)
CREATE POLICY "Public Access" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'fichas_tecnicas');

-- 2. Permitir Subida a Usuarios Autenticados
CREATE POLICY "Authenticated Upload" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'fichas_tecnicas');

-- 3. Permitir Actualización a Usuarios Autenticados
CREATE POLICY "Authenticated Update" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'fichas_tecnicas');

-- 4. Permitir Eliminación a Usuarios Autenticados
CREATE POLICY "Authenticated Delete" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'fichas_tecnicas');
