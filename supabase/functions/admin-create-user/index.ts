import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Sesión requerida')
    const url = Deno.env.get('SUPABASE_URL')!
    const publishable = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY')!
    const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const userClient = createClient(url, publishable, { global: { headers: { Authorization: authHeader } } })
    const { data: { user: caller }, error: callerError } = await userClient.auth.getUser()
    if (callerError || !caller) throw new Error('Sesión inválida')
    const admin = createClient(url, secret, { auth: { autoRefreshToken:false, persistSession:false } })
    const { data: me, error: meError } = await admin.from('profiles').select('role').eq('id', caller.id).single()
    if (meError || me?.role !== 'superadmin') throw new Error('Solo el SuperAdmin puede crear usuarios')
    const body = await req.json()
    const { email, password, full_name, role, school_id, dni } = body
    if (!email || !password || !full_name || !role) throw new Error('Faltan datos obligatorios')
    if (!['superadmin','director','docente','alumno'].includes(role)) throw new Error('Rol inválido')
    if (role !== 'superadmin' && !school_id) throw new Error('El colegio es obligatorio para este rol')
    const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name } })
    if (createError) throw createError
    const uid = created.user!.id
    const { error: profileError } = await admin.from('profiles').update({ full_name, dni, role, school_id, active:true }).eq('id', uid)
    if (profileError) { await admin.auth.admin.deleteUser(uid); throw profileError }
    if (role === 'alumno') {
      const { error: studentError } = await admin.from('students').insert({ profile_id: uid, school_id, balance:0, xp:0, goal:500, active:true })
      if (studentError) { await admin.auth.admin.deleteUser(uid); throw studentError }
    }
    return new Response(JSON.stringify({ ok:true, user_id:uid }), { headers:{...cors,'Content-Type':'application/json'} })
  } catch (e) {
    return new Response(JSON.stringify({ ok:false, error:e?.message || String(e) }), { status:400, headers:{...cors,'Content-Type':'application/json'} })
  }
})
