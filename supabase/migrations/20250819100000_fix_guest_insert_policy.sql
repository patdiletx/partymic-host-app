-- Primero, eliminamos la política de inserción anterior para evitar conflictos.
DROP POLICY IF EXISTS "Public can insert into the queue" ON public.song_queue;
DROP POLICY IF EXISTS "Allow public insert for guests" ON public.song_queue;

-- Creamos una nueva política que permite a CUALQUIERA (incluidos los anónimos)
-- insertar una nueva fila en la tabla song_queue.
CREATE POLICY "Allow public insert for guests"
    ON public.song_queue FOR INSERT
    TO anon, authenticated -- Se aplica a anónimos y autenticados
    WITH CHECK (true); -- No hay restricciones en la data que se inserta