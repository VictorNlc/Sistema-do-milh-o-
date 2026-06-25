-- Adicionar restrição de validação para limite máximo de área da farmácia para até 700m²
ALTER TABLE public.layouts
  ADD CONSTRAINT chk_layouts_store_area CHECK ("storeWidth" * "storeHeight" <= 700) NOT VALID;
