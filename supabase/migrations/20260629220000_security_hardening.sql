-- ============================================================
-- HARDENING DE SEGURANÇA — layouts table
-- 1. Adiciona coluna user_id (UUID do usuário anônimo/autenticado)
-- 2. Restringe UPDATE/DELETE ao dono do layout
-- 3. Mantém SELECT público para compartilhamento
-- ============================================================

-- 1. Adiciona coluna user_id vinculada ao auth.users
ALTER TABLE public.layouts
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Remove a política de UPDATE irrestrita
DROP POLICY IF EXISTS "Allow public update on layouts" ON public.layouts;

-- 3. Nova política: somente o dono (auth.uid) pode atualizar
--    Layouts legados (user_id IS NULL) permanecem editáveis por qualquer sessão temporariamente
CREATE POLICY "Allow owner update on layouts" ON public.layouts
  FOR UPDATE USING (
    user_id IS NULL OR auth.uid() = user_id
  );

-- 4. Política de DELETE: somente o dono pode deletar
DROP POLICY IF EXISTS "Allow public delete on layouts" ON public.layouts;
CREATE POLICY "Allow owner delete on layouts" ON public.layouts
  FOR DELETE USING (
    auth.uid() = user_id
  );
