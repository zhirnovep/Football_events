import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'Не заданы VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. ' +
    'Создайте файл .env на основе .env.example.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
