-- Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT,
    name TEXT,
    role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Setup Row Level Security for profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public select on profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Allow user to update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Create reference_layouts table
CREATE TABLE IF NOT EXISTS public.reference_layouts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    "storeType" TEXT NOT NULL,
    "storeWidth" NUMERIC NOT NULL,
    "storeHeight" NUMERIC NOT NULL,
    items JSONB DEFAULT '[]'::jsonb,
    "sourceImageBase64" TEXT,
    approved BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Setup Row Level Security for reference_layouts
ALTER TABLE public.reference_layouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public select on reference_layouts" ON public.reference_layouts FOR SELECT USING (true);
CREATE POLICY "Allow public insert on reference_layouts" ON public.reference_layouts FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on reference_layouts" ON public.reference_layouts FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on reference_layouts" ON public.reference_layouts FOR DELETE USING (true);

-- Create catalog_items table
CREATE TABLE IF NOT EXISTS public.catalog_items (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    name TEXT NOT NULL,
    icon TEXT,
    description TEXT,
    width NUMERIC NOT NULL,
    height NUMERIC NOT NULL,
    color TEXT,
    "fillColor" TEXT,
    "strokeColor" TEXT,
    "minWidth" NUMERIC,
    "maxWidth" NUMERIC,
    "minHeight" NUMERIC,
    "maxHeight" NUMERIC,
    rotatable BOOLEAN DEFAULT true,
    "isObstacle" BOOLEAN DEFAULT false,
    "isPillar" BOOLEAN DEFAULT false,
    "isDoor" BOOLEAN DEFAULT false,
    "isEmergency" BOOLEAN DEFAULT false,
    "isWallItem" BOOLEAN DEFAULT false,
    price NUMERIC DEFAULT 0,
    finish TEXT,
    code TEXT,
    height3d NUMERIC,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Setup Row Level Security for catalog_items
ALTER TABLE public.catalog_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public select on catalog_items" ON public.catalog_items FOR SELECT USING (true);
CREATE POLICY "Allow public insert/update/delete on catalog_items" ON public.catalog_items FOR ALL USING (true);

-- Setup Storage Buckets (if storage table exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('thumbnails', 'thumbnails', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('sketchup-prints', 'sketchup-prints', true)
ON CONFLICT (id) DO NOTHING;

-- Storage Policies for public read/write access
CREATE POLICY "Allow public select on thumbnails bucket" ON storage.objects FOR SELECT USING (bucket_id = 'thumbnails');
CREATE POLICY "Allow public insert on thumbnails bucket" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'thumbnails');
CREATE POLICY "Allow public update on thumbnails bucket" ON storage.objects FOR UPDATE USING (bucket_id = 'thumbnails');
CREATE POLICY "Allow public delete on thumbnails bucket" ON storage.objects FOR DELETE USING (bucket_id = 'thumbnails');

CREATE POLICY "Allow public select on sketchup-prints bucket" ON storage.objects FOR SELECT USING (bucket_id = 'sketchup-prints');
CREATE POLICY "Allow public insert on sketchup-prints bucket" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'sketchup-prints');
CREATE POLICY "Allow public update on sketchup-prints bucket" ON storage.objects FOR UPDATE USING (bucket_id = 'sketchup-prints');
CREATE POLICY "Allow public delete on sketchup-prints bucket" ON storage.objects FOR DELETE USING (bucket_id = 'sketchup-prints');

-- Automatically link new Auth users to profiles table
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role)
  VALUES (new.id, new.email, COALESCE(new.raw_user_meta_data->>'name', ''), 'user')
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
