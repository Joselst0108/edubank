// Crea un usuario de Supabase Auth + su perfil. Corre en el servidor de Netlify.
// Variables en Netlify: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (nunca en el código).
const U=process.env.SUPABASE_URL,K=process.env.SUPABASE_SERVICE_ROLE_KEY;
const H={apikey:K,Authorization:'Bearer '+K,'Content-Type':'application/json'};
const out=(c,o)=>({statusCode:c,headers:{'Content-Type':'application/json'},body:JSON.stringify(o)});
exports.handler=async ev=>{
 if(ev.httpMethod!=='POST')return out(405,{error:'Método no permitido'});
 if(!U||!K)return out(500,{error:'Falta configurar SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en Netlify'});
 try{
  const tk=(ev.headers.authorization||'').replace(/^Bearer /i,'');
  const ur=await fetch(U+'/auth/v1/user',{headers:{apikey:K,Authorization:'Bearer '+tk}});
  if(!ur.ok)return out(401,{error:'Sesión inválida'});
  const me=await ur.json();
  const pr=await (await fetch(`${U}/rest/v1/perfiles?id=eq.${me.id}&select=rol,colegio_id`,{headers:H})).json();
  const c=pr&&pr[0];
  if(!c||!['superadmin','admin'].includes(c.rol))return out(403,{error:'Sin permiso'});
  const b=JSON.parse(ev.body||'{}'),sup=c.rol==='superadmin',rol=b.rol,colegio=sup?b.colegio_id:c.colegio_id;
  if(!['admin','docente','estudiante'].includes(rol)||(!sup&&rol==='admin'))return out(403,{error:'Rol no permitido'});
  if(!colegio)return out(400,{error:'Falta el colegio'});
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email||''))return out(400,{error:'Correo inválido'});
  if(!b.password||b.password.length<6)return out(400,{error:'La contraseña debe tener al menos 6 caracteres'});
  if(!(b.nombres||'').trim())return out(400,{error:'Falta el nombre'});
  const cr=await fetch(U+'/auth/v1/admin/users',{method:'POST',headers:H,body:JSON.stringify({email:b.email.trim().toLowerCase(),password:b.password,email_confirm:true})});
  const u=await cr.json();
  if(!cr.ok)return out(400,{error:u.msg||u.message||u.error_description||'No se pudo crear el usuario'});
  const pf=await fetch(U+'/rest/v1/perfiles',{method:'POST',headers:{...H,Prefer:'return=minimal'},body:JSON.stringify({id:u.id,colegio_id:colegio,rol,nombres:b.nombres.trim(),apellidos:(b.apellidos||'').trim()})});
  if(!pf.ok){await fetch(U+'/auth/v1/admin/users/'+u.id,{method:'DELETE',headers:H});return out(500,{error:'No se pudo crear el perfil'});}
  return out(200,{ok:true,id:u.id});
 }catch(x){return out(500,{error:'Error del servidor'})}
};
