-- Agregar la columna material_name a service_order_materials para guardar el nombre histórico y tener trazabilidad.
ALTER TABLE public.service_order_materials
ADD COLUMN material_name TEXT;

-- Llenar los valores existentes usando la tabla de materials.
UPDATE public.service_order_materials som
SET material_name = m.name
FROM public.materials m
WHERE som.material_id = m.id;
