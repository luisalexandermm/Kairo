const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY; // service_role key (admin)

if (!url || !key) {
  throw new Error(
    'Faltan las variables de entorno SUPABASE_URL y SUPABASE_SERVICE_KEY.\n' +
    'Copia el archivo .env.example a .env y rellena los valores de tu proyecto Supabase.'
  );
}

const supabase = createClient(url, key, {
  auth: { persistSession: false }
});

module.exports = supabase;
