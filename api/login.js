const supabase = require('../lib/supabase');
const { ok, err, allowCors, makeToken } = require('../lib/helpers');

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

  if (String(password) !== String(data.admin_password)) {
    return err(res, 'Contraseña incorrecta', 401);
  }

  ok(res, { token: makeToken() });
};
