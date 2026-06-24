-- Adicionar restrições de validação (CHECK constraints) no banco de dados para garantir integridade

-- 1. Validações na tabela appointments
ALTER TABLE public.appointments
  ADD CONSTRAINT chk_appointments_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$') NOT VALID,
  ADD CONSTRAINT chk_appointments_status CHECK (status IN ('novo', 'em_analise', 'confirmado', 'proposta_enviada', 'concluido')) NOT VALID,
  ADD CONSTRAINT chk_appointments_storeType CHECK ("storeType" IN ('Popular', 'Premium', 'Manipulação', 'Completa')) NOT VALID;

-- 2. Validações na tabela layouts
ALTER TABLE public.layouts
  ADD CONSTRAINT chk_layouts_storeWidth CHECK ("storeWidth" > 0 AND "storeWidth" <= 100) NOT VALID,
  ADD CONSTRAINT chk_layouts_storeHeight CHECK ("storeHeight" > 0 AND "storeHeight" <= 100) NOT VALID,
  ADD CONSTRAINT chk_layouts_storeType CHECK ("storeType" IN ('popular', 'premium', 'manipulacao', 'completa')) NOT VALID;
