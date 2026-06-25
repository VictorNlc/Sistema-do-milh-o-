-- Adicionar novas colunas na tabela de perfis para salvar os dados do formulário de contato do cliente
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS "pharmacyName" TEXT,
  ADD COLUMN IF NOT EXISTS "phone" TEXT,
  ADD COLUMN IF NOT EXISTS "country" TEXT,
  ADD COLUMN IF NOT EXISTS "postalCode" TEXT,
  ADD COLUMN IF NOT EXISTS "city" TEXT,
  ADD COLUMN IF NOT EXISTS "state" TEXT,
  ADD COLUMN IF NOT EXISTS "address" TEXT,
  ADD COLUMN IF NOT EXISTS "number" TEXT,
  ADD COLUMN IF NOT EXISTS "complement" TEXT,
  ADD COLUMN IF NOT EXISTS "employees" TEXT,
  ADD COLUMN IF NOT EXISTS "storeWidth" NUMERIC,
  ADD COLUMN IF NOT EXISTS "storeHeight" NUMERIC;

-- Remover a restrição de chave estrangeira (foreign key) com auth.users para permitir que leads anônimos criem perfis sem registro
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- Permitir inserção e atualização públicas na tabela de perfis para salvar dados do lead
DROP POLICY IF EXISTS "Allow public insert on profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow public update on profiles" ON public.profiles;

CREATE POLICY "Allow public insert on profiles" ON public.profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on profiles" ON public.profiles FOR UPDATE USING (true);
