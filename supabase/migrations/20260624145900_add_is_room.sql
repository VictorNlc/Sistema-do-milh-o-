-- Add missing isRoom and isRound columns to catalog_items
ALTER TABLE public.catalog_items ADD COLUMN IF NOT EXISTS "isRoom" BOOLEAN DEFAULT false;
ALTER TABLE public.catalog_items ADD COLUMN IF NOT EXISTS "isRound" BOOLEAN DEFAULT false;
