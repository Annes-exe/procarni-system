-- SQL Script to Reset Requisition Sequences and Clear Data
-- WARNING: This will delete all existing generated requisition records and reset their sequence counters to 1.

-- 1. Delete all records from the requisitions table
TRUNCATE TABLE public.requisitions CASCADE;

-- 2. Restart the sequence generators for each type
ALTER SEQUENCE IF EXISTS public.purchase_requisition_sequence RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.service_requisition_sequence RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.warehouse_requisition_sequence RESTART WITH 1;
