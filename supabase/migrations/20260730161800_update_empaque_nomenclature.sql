-- Migration: Update empaque nomenclature validation function to support TRIPAS, BOLSAS, and TERMOFORMADO
-- Policies:
-- 1. TRIPAS PLASTICA 90X300 CM ROJO (METROS X CAJA: 500 MT) CORRUGADA TIMBRADA
-- 2. BOLSAS/TERMOFORMADO AL VACIO 20X30 CM TRANSPARENTE (MICRA: 70 UM) (USO: TOCINETA) ALTA BARRERA TIMBRADA

DROP FUNCTION IF EXISTS validate_tripas_nomenclature(text);

CREATE OR REPLACE FUNCTION validate_empaque_nomenclature(name text)
RETURNS boolean AS $$
BEGIN
  -- If name starts with TRIPAS, validate under Tripas rules
  IF name ILIKE 'TRIPAS%' THEN
    RETURN name ~* '^TRIPAS\s+(PLASTICA|CELULOSA|FIBROSA|COLAGENO|CERO\s+MERMA)(\s+[^\s]+\s+CM)?(\s+[^()]+)?(\s+\(METROS\s+X\s+CAJA:\s*[^\s]+\s+MT\))?(\s+(CORRUGADA|LISA|TIMBRADA)+)?\s*$';
  END IF;

  -- If name starts with BOLSAS or TERMOFORMADO, validate under Bolsas/Termoformado rules (variations at the end)
  IF name ILIKE 'BOLSAS%' OR name ILIKE 'TERMOFORMADO%' THEN
    RETURN name ~* '^(BOLSAS|TERMOFORMADO)\s+(AL VACIO|TERMOENCOGIBLES|PARA BULTOS|CON ASAS|PARA CESTAS)(\s+[^\s]+\s+(CM|IN|KG))?(\s+[^()]+)?(\s+\(MICRA:\s*[^\s]+\s*UM\))?(\s+\(USO:\s*[^)]+\))?(\s+(ALTA BARRERA|GRIP AND TEAR|RESPIRABLE S/BARRERA|TIMBRADA)+)?\s*$';
  END IF;

  -- If it doesn't match these prefixes, we don't apply these specific empaque rules
  RETURN true;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION validate_empaque_nomenclature(text) IS 'Valida la nomenclatura estructurada para tripas, bolsas y termoformados en la categoria de empaques.';
