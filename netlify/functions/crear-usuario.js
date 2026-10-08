exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  const reply = (code, obj) => ({
    statusCode: code,
    headers: { ...cors, 'Content-Type': 'application/json' },
    body: JSON.stringify(obj)
  });

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Método no permitido' });

  const URL = process.env.SUPABASE_URL;
  const SERVICE = process.env.SUPABASE_SERVICE_KEY;
  const ANON = process.env.SUPABASE_ANON_KEY;
  if (!URL || !SERVICE || !ANON) return reply(500, { error: 'Faltan variables de entorno en Netlify' });

  const token = (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return reply(401, { error: 'Sin autorización' });

  const meRes = await fetch(`${URL}/auth/v1/user`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}` }
  });
  if (!meRes.ok) return reply(401, { error: 'Sesión inválida' });
  const me = await meRes.json();

  const pRes = await fetch(`${URL}/rest/v1/perfiles?id=eq.${me.id}&select=rol,colegio_id`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` }
  });
  const perfil = (await pRes.json())[0];
  if (!perfil || !['superadmin', 'admin'].includes(perfil.rol)) return reply(403, { error: 'Sin permiso' });

  let b;
  try { b = JSON.parse(event.body || '{}'); } catch { return reply(400, { error: 'JSON inválido' }); }
  const { email, password, colegio_id, rol, nombres, apellidos } = b;

  if (!email || !password || !nombres || !colegio_id || !rol) return reply(400, { error: 'Faltan datos' });
  if (password.length < 6) return reply(400, { error: 'La contraseña debe tener al menos 6 caracteres' });
  if (rol === 'superadmin') return reply(403, { error: 'No permitido' });

  if (perfil.rol === 'admin') {
    if (colegio_id !== perfil.colegio_id) return reply(403, { error: 'Solo puedes crear usuarios de tu colegio' });
    if (!['docente', 'estudiante'].includes(rol)) return reply(403, { error: 'Solo puedes crear docentes o estudiantes' });
  }

  const createRes = await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true })
  });
  const created = await createRes.json();
  if (!createRes.ok) return reply(400, { error: created.msg || created.message || 'Error al crear usuario' });

  const insRes = await fetch(`${URL}/rest/v1/perfiles`, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ id: created.id, colegio_id, rol, nombres, apellidos: apellidos || '' })
  });
  if (!insRes.ok) {
    const err = await insRes.text();
    await fetch(`${URL}/auth/v1/admin/users/${created.id}`, {
      method: 'DELETE',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` }
    });
    return reply(400, { error: 'Error al crear perfil: ' + err });
  }

  return reply(200, { ok: true, id: created.id, email: created.email });
};
