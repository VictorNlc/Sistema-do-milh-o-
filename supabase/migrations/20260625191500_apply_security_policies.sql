-- 1. Habilitar a extensão pgcrypto se não estiver ativa
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Criar o usuário administrador do sistema na tabela auth.users se ele não existir
INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  aud,
  role
)
SELECT
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000000',
  'admin@projefarma.com.br',
  crypt('T20252050t@@', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"name":"Admin Projefarma"}',
  'authenticated',
  'authenticated'
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users WHERE email = 'admin@projefarma.com.br'
);

-- 3. Garantir que o perfil associado ao administrador possua a role 'admin'
UPDATE public.profiles
SET role = 'admin'
WHERE email = 'admin@projefarma.com.br';

-- 4. Recriar políticas de segurança para a tabela public.appointments
DROP POLICY IF EXISTS "Allow public select on appointments" ON public.appointments;
DROP POLICY IF EXISTS "Allow public update on appointments" ON public.appointments;
DROP POLICY IF EXISTS "Allow public delete on appointments" ON public.appointments;
DROP POLICY IF EXISTS "Allow public insert on appointments" ON public.appointments;

CREATE POLICY "Allow public insert on appointments" ON public.appointments FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow authenticated select on appointments" ON public.appointments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated update on appointments" ON public.appointments FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow authenticated delete on appointments" ON public.appointments FOR DELETE TO authenticated USING (true);

-- 5. Recriar políticas de segurança para a tabela public.reference_layouts
DROP POLICY IF EXISTS "Allow public select on reference_layouts" ON public.reference_layouts;
DROP POLICY IF EXISTS "Allow public insert on reference_layouts" ON public.reference_layouts;
DROP POLICY IF EXISTS "Allow public update on reference_layouts" ON public.reference_layouts;
DROP POLICY IF EXISTS "Allow public delete on reference_layouts" ON public.reference_layouts;

CREATE POLICY "Allow public select on reference_layouts" ON public.reference_layouts FOR SELECT USING (true);
CREATE POLICY "Allow authenticated insert/update/delete on reference_layouts" ON public.reference_layouts FOR ALL TO authenticated USING (true);

-- 6. Recriar políticas de segurança para a tabela public.catalog_items
DROP POLICY IF EXISTS "Allow public select on catalog_items" ON public.catalog_items;
DROP POLICY IF EXISTS "Allow public insert/update/delete on catalog_items" ON public.catalog_items;

CREATE POLICY "Allow public select on catalog_items" ON public.catalog_items FOR SELECT USING (true);
CREATE POLICY "Allow authenticated insert/update/delete on catalog_items" ON public.catalog_items FOR ALL TO authenticated USING (true);

-- 7. Recriar políticas de segurança para a tabela public.profiles
DROP POLICY IF EXISTS "Allow public select on profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow user to update own profile" ON public.profiles;

CREATE POLICY "Allow authenticated select on profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow user select own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Allow user to update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- 8. Recriar políticas de segurança para o bucket sketchup-prints
DROP POLICY IF EXISTS "Allow public select on sketchup-prints bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow public insert on sketchup-prints bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow public update on sketchup-prints bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow public delete on sketchup-prints bucket" ON storage.objects;

CREATE POLICY "Allow public select on sketchup-prints bucket" ON storage.objects FOR SELECT USING (bucket_id = 'sketchup-prints');
CREATE POLICY "Allow authenticated insert on sketchup-prints bucket" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'sketchup-prints');
CREATE POLICY "Allow authenticated update on sketchup-prints bucket" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'sketchup-prints');
CREATE POLICY "Allow authenticated delete on sketchup-prints bucket" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'sketchup-prints');
