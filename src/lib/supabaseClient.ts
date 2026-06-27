import { createClient } from '@supabase/supabase-js';
import { Database } from '../types/database.types';

// Leer variables de entorno con fallback para prevenir errores de compilación
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-url.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  console.warn(
    '⚠️ ADVERTENCIA: Las variables de entorno de Supabase no están configuradas.\n' +
    'Por favor, crea un archivo .env.local en la raíz con:\n' +
    'NEXT_PUBLIC_SUPABASE_URL=tu_url_de_supabase\n' +
    'NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key_de_supabase'
  );
}

// Inicializar el cliente de Supabase tipado
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  // Opciones optimizadas para Realtime
  realtime: {
    params: {
      eventsPerSecond: 10, // Control de flujo de datos en baja conectividad
    }
  }
});
