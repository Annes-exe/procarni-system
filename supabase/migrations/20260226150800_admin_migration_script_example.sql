-- SCRIPT DE MIGRACIÓN MANUAL (Ejecutar en el SQL Editor de Supabase)

-- 1. Asignar un 'username' y un 'role' a los usuarios que ya existen (si no lo tienen)
-- Se asignará como username la parte del correo antes del '@'
UPDATE public.profiles
SET 
  username = SPLIT_PART(email, '@', 1),
  role = 'normal'
WHERE username IS NULL OR role IS NULL;

-- 2. Configurar la cuenta de Administrador
-- Sustituye 'tu_correo_admin@procarni.com' por tu correo real, y pon el 'username' que desees
UPDATE public.profiles
SET 
  role = 'admin',
  username = 'Admin'
WHERE email = 'tu_correo_admin@example.com';
