const supabase = require('../lib/supabase');
const { ok, err, allowCors, makeToken, verifyPassword, hashPassword } = require('../lib/helpers');

module.exports = async (req, res) => {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return err(res, 'Método no permitido', 405);

  const { password } = req.body || {};
  if (!password) return err(res, 'Ingresa la contraseña', 400);

  const { data, error } = await supabase
    .from('settings')
    .select('admin_password')
    .eq('id', 'app')
    .single();

  if (error || !data) return err(res, 'Error de configuración', 500);

  if (!verifyPassword(password, data.admin_password)) {
    return err(res, 'Contraseña incorrecta', 401);
  }

  // Si la contraseña seguía guardada en texto plano (instalación antigua), la migramos a hash
  if (!String(data.admin_password).startsWith('scrypt$')) {
    supabase.from('settings').update({ admin_password: hashPassword(password) }).eq('id', 'app')
      .then(({ error: migrateError }) => { if (migrateError) console.error('No se pudo migrar la contraseña a hash:', migrateError.message); });
  }

  try {
    ok(res, { token: makeToken() });
  } catch (e) {
    console.error(e.message);
    err(res, 'El panel no está configurado: falta TOKEN_SECRET en el servidor', 500);
  }
};
