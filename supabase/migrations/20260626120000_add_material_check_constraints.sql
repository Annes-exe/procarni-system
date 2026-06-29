-- Migration: Add check constraints to prevent self-parenting and master materials having a parent
-- Target Database: hsspvhxneuetpatafdzy

-- Clean up any self-referencing records first to prevent constraint validation failure
UPDATE public.materials SET base_material_id = null WHERE base_material_id = id;

ALTER TABLE public.materials ADD CONSTRAINT chk_not_self_parent CHECK (id <> base_material_id);
ALTER TABLE public.materials ADD CONSTRAINT chk_master_no_parent CHECK (is_master = false OR base_material_id IS NULL);
