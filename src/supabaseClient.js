// src/supabaseClient.js
import { createClient } from '@supabase/supabase-js'

// Vite expone las variables de entorno en el objeto import.meta.env
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: {
    // Esta opción le dice al cliente que siempre trabaje
    // sobre el esquema 'public', lo que ayuda a evitar
    // problemas de caché.
    schema: 'public',
  },
})