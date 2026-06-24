-- Add missing RLS policies for appointments table to allow public sync (select, update, delete)
CREATE POLICY "Allow public select on appointments" ON public.appointments FOR SELECT USING (true);
CREATE POLICY "Allow public update on appointments" ON public.appointments FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on appointments" ON public.appointments FOR DELETE USING (true);
