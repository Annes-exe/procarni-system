-- Fix registrar_reverso_inventario to prevent reversals if the original transaction falls within a closed period.
CREATE OR REPLACE FUNCTION public.registrar_reverso_inventario(
  p_transaction_id_a_revertir UUID,
  p_motivo                    TEXT,
  p_created_by                UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_original public.inventory_transactions%ROWTYPE;
  v_reverso_id UUID;
BEGIN
  -- Obtener la transacción original
  SELECT * INTO v_original FROM public.inventory_transactions WHERE id = p_transaction_id_a_revertir;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transacción original no encontrada: %', p_transaction_id_a_revertir;
  END IF;

  -- No se puede reversar un reverso
  IF v_original.transaction_type = 'REVERSAL' THEN
    RAISE EXCEPTION 'No se puede reversar una transacción de REVERSAL (ID: %).', p_transaction_id_a_revertir;
  END IF;

  -- No se puede reversar si ya tiene un reverso
  IF EXISTS (SELECT 1 FROM public.inventory_transactions WHERE reverses_id = p_transaction_id_a_revertir) THEN
    RAISE EXCEPTION 'La transacción % ya tiene un reverso registrado.', p_transaction_id_a_revertir;
  END IF;

  -- Verificar si la transacción pertenece a un periodo contable cerrado
  IF EXISTS (
    SELECT 1 FROM public.inventory_periods
    WHERE v_original.transaction_date::date BETWEEN start_date AND end_date
      AND status = 'CERRADO'
  ) THEN
    RAISE EXCEPTION 'OPERACIÓN DENEGADA: La transacción original pertenece a un periodo contable cerrado y no puede ser revertida.';
  END IF;

  -- Insertar el reverso con cantidad opuesta
  INSERT INTO public.inventory_transactions (
    material_id, transaction_date, transaction_type,
    quantity, expected_quantity, actual_quantity,
    unit_cost, reference_doc, destination_data,
    reverses_id, created_by, audit_note
  ) VALUES (
    v_original.material_id,
    NOW(),
    'REVERSAL',
    -v_original.quantity,   -- Cantidad opuesta para neutralizar el efecto
    v_original.expected_quantity,
    v_original.actual_quantity,
    v_original.unit_cost,
    v_original.reference_doc,
    v_original.destination_data,
    p_transaction_id_a_revertir,
    p_created_by,
    FORMAT('REVERSO AUTORIZADO. Transacción original: %s. Motivo: %s', p_transaction_id_a_revertir, p_motivo)
  )
  RETURNING id INTO v_reverso_id;

  RETURN jsonb_build_object(
    'success',          true,
    'reverso_id',       v_reverso_id,
    'original_id',      p_transaction_id_a_revertir,
    'cantidad_revertida', v_original.quantity
  );
END;
$$;
