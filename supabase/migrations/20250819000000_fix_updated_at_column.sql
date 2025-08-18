-- Añade la columna 'updated_at' a la tabla song_queue si no existe.
ALTER TABLE public.song_queue
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();