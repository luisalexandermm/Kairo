const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY
  || process.env.SUPABASE_SECRET_KEY
  || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error(
    'Faltan las variables de entorno de Supabase (URL y clave secreta).\n' +
    'Copia el archivo .env.example a .env y rellena los valores de tu proyecto Supabase.'
  );
}

const supabase = createClient(url, key, {
  auth: { persistSession: false }
});

module.exports = supabase;
