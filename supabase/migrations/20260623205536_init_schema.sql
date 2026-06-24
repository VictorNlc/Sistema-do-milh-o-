-- Create layouts table
CREATE TABLE public.layouts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    "layoutName" TEXT NOT NULL,
    "storeWidth" NUMERIC NOT NULL,
    "storeHeight" NUMERIC NOT NULL,
    "storeType" TEXT NOT NULL,
    "layoutDensity" TEXT,
    items JSONB DEFAULT '[]'::jsonb,
    "shareToken" TEXT UNIQUE,
    thumbnail TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create appointments table
CREATE TABLE public.appointments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    city TEXT NOT NULL,
    "storeType" TEXT NOT NULL,
    "storeArea" TEXT NOT NULL,
    date DATE NOT NULL,
    time TIME NOT NULL,
    notes TEXT,
    "layoutId" UUID REFERENCES public.layouts(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'novo',
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Setup Row Level Security
ALTER TABLE public.layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- Create policies (Assuming anonymous usage for saving layouts)
CREATE POLICY "Allow public select on layouts via share token" ON public.layouts FOR SELECT USING (true);
CREATE POLICY "Allow public insert on layouts" ON public.layouts FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on layouts" ON public.layouts FOR UPDATE USING (true);

CREATE POLICY "Allow public insert on appointments" ON public.appointments FOR INSERT WITH CHECK (true);
