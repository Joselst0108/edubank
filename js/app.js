let me=null, schoolList=[], classes=[], students=[], teachers=[], transactions=[];
const $=s=>document.querySelector(s); const $$=s=>document.querySelectorAll(s);
const money=n=>new Intl.NumberFormat('es-PE').format(Number(n)||0);
const roleNames={alumno:'ALUMNO',docente:'DOCENTE',director:'DIRECTOR',superadmin:'SUPERADMIN'};
const level=xp=>xp>=1000?'Experto':xp>=700?'Financiero':xp>=400?'Ahorrador':'Principiante';
function empty(){return '<div class="empty">No hay registros todavía.</div>'}
function move(t){return `<div class="move"><i class="${t.type==='out'?'minus':''}">${t.type==='out'?'−':'+'}</i><div>${t.title}<small>${t.meta||new Date(t.created_at).toLocaleString('es-PE')}</small></div><b class="${t.amount<0?'negative':''}">${t.amount>0?'+':''}${money(t.amount)}</b></div>`}
function schoolName(id){return schoolList.find(s=>s.id===id)?.name||'Sin colegio'}
function studentName(id){return students.find(s=>s.id===id)?.profile?.full_name||'Alumno'}
async function init(){
 const {data:{session}}=await window.eduBankSupabase.auth.getSession();
 if(!session){location.href='login.html';return;}
 const {data:profile,error}=await window.eduBankSupabase.from('profiles').select('*').eq('id',session.user.id).single();
 if(error||!profile){await window.eduBankSupabase.auth.signOut(); location.href='login.html'; return;}
 me=profile;
 await loadData(); setup();
}
async function loadData(){
 const sid=me.school_id;
 let q= window.eduBankSupabase.from('schools').select('*').order('name');
 if(me.role!=='superadmin') q=q.eq('id',sid);
 let r=await q; schoolList=r.data||[];
 if(r.error) return fatal(r.error.message);
 let cq=window.eduBankSupabase.from('classes').select('*, teacher:teacher_id(id,full_name,role)').order('name');
 if(me.role!=='superadmin') cq=cq.eq('school_id',sid);
 r=await cq; classes=r.data||[]; if(r.error) return fatal(r.error.message);
 let sq=window.eduBankSupabase.from('students').select('*, profile:profile_id(id,full_name,dni,role), class:class_id(id,name)');
 if(me.role==='alumno') sq=sq.eq('profile_id',me.id); else if(me.role!=='superadmin') sq=sq.eq('school_id',sid);
 r=await sq.order('created_at',{ascending:false}); students=r.data||[]; if(r.error) return fatal(r.error.message);
 let tq=window.eduBankSupabase.from('profiles').select('*').eq('role','docente'); if(me.role!=='superadmin') tq=tq.eq('school_id',sid); r=await tq; teachers=r.data||[];
 let txq=window.eduBankSupabase.from('transactions').select('*').order('created_at',{ascending:false}).limit(100);
 if(me.role==='alumno' && students[0]) txq=txq.eq('student_id',students[0].id); else if(me.role!=='superadmin') txq=txq.in('student_id',students.map(s=>s.id));
 r=await txq; transactions=r.data||[];
}
function setup(){
 const name=me.full_name||'Usuario'; $('#hello').textContent=`¡Hola, ${name}! 👋`; $('#roleTag').textContent=roleNames[me.role]; $('#subtitle').textContent=me.role==='alumno'?'Administra tus EduCoins y aprende tomando decisiones.':'Gestiona EduBank con datos reales de tu colegio.'; $('#avatar').textContent=name[0].toUpperCase(); $('#schoolBadge').textContent=me.role==='superadmin'?'MULTICOLEGIO':schoolName(me.school_id).toUpperCase(); navItems(); render('inicio');
}
function navItems(){
 const common=me.role==='alumno'?[['inicio','⌂','Inicio'],['cuenta','💰','Mi cuenta'],['movimientos','↕','Movimientos'],['tienda','🎁','Tienda'],['prestamos','💳','Préstamos']]:me.role==='docente'?[['inicio','⌂','Panel docente'],['alumnos','👨‍🎓','Alumnos'],['recompensas','🪙','Entregar EduCoins'],['historial','↕','Movimientos']]:me.role==='director'?[['inicio','⌂','Dashboard'],['aulas','🏫','Aulas'],['alumnos','👨‍🎓','Alumnos'],['docentes','👨‍🏫','Docentes'],['movimientos','↕','Movimientos'],['reportes','📊','Reportes']]:[['inicio','⌂','Dashboard'],['colegios','🏫','Colegios'],['usuarios','👥','Usuarios'],['movimientos','↕','Movimientos'],['reportes','📊','Reportes']];
 $('#nav').innerHTML=common.map((x,i)=>`<a class="${i===0?'active':''}" data-view="${x[0]}">${x[1]} <span>${x[2]}</span></a>`).join(''); $$('#nav a').forEach(a=>a.onclick=()=>{$$('#nav a').forEach(x=>x.classList.remove('active'));a.classList.add('active');render(a.dataset.view)});
}
function layout(title,body){return `<section class="view"><div class="viewhead"><div><div class="tag">${title.toUpperCase()}</div><h2>${title}</h2></div></div>${body}</section>`}
function studentHome(){const s=students[0]; if(!s)return layout('Mi cuenta',empty()); const tx=transactions.filter(t=>t.student_id===s.id); return `<div class="cards"><div class="maincard"><div><small>SALDO DISPONIBLE</small><strong>${money(s.balance)}</strong><span>EduCoins</span></div><div class="cardicon">E</div><div class="meter"><b style="width:${Math.min(100,s.goal?Math.round(s.balance/s.goal*100):0)}%"></b></div><small>Meta de ahorro: ${money(s.goal)} EduCoins</small></div><div class="stat"><span>🏆 NIVEL</span><b>${level(s.xp)}</b><small>${s.xp} XP</small></div><div class="stat"><span>🏫 COLEGIO</span><b>${schoolName(s.school_id)}</b><small>Cuenta real</small></div></div><div class="columns"><section class="panel"><div class="paneltitle"><h2>Últimos movimientos</h2><a onclick="render('movimientos')">Ver todos</a></div>${tx.slice(0,6).map(move).join('')||empty()}</section><section class="challenge"><span>EDUBANK REAL</span><h2>Tu cuenta está conectada</h2><p>Saldo, XP y movimientos provienen directamente de Supabase. Ya no se cargan datos demo.</p></section></div>`}
function adminHome(){const total=students.reduce((a,s)=>a+s.balance,0),tx=transactions.length;return `<div class="cards"><div class="maincard"><div><small>SALDO TOTAL</small><strong>${money(total)}</strong><span>EduCoins en cuentas visibles</span></div><div class="cardicon">E</div></div><div class="stat"><span>🏫 COLEGIOS</span><b>${schoolList.length}</b><small>accesibles</small></div><div class="stat"><span>👨‍🎓 ALUMNOS</span><b>${students.length}</b><small>registros reales</small></div></div><div class="admincards"><div class="panel"><div class="paneltitle"><h2>Resumen</h2></div><div class="listrow"><div><b>Aulas</b><small>registradas en la cuenta</small></div><strong>${classes.length}</strong></div><div class="listrow"><div><b>Docentes</b><small>perfiles docentes</small></div><strong>${teachers.length}</strong></div><div class="listrow"><div><b>Movimientos</b><small>últimos 100</small></div><strong>${tx}</strong></div></div><div class="panel"><div class="paneltitle"><h2>Actividad reciente</h2></div>${transactions.slice(0,6).map(t=>move({...t,title:studentName(t.student_id)+' · '+t.title})).join('')||empty()}</div></div>`}
function renderAlumnos(){return layout('Alumnos',`<div class="panel"><div class="paneltitle"><h2>Alumnos reales</h2>${['superadmin','director'].includes(me.role)?'<button class="primary smallbtn" onclick="addStudent()">+ Alumno</button>':''}</div>${students.map(s=>`<div class="listrow"><div><b>${s.profile?.full_name||'Sin nombre'}</b><small>DNI: ${s.profile?.dni||'—'} · ${s.class?.name||'Sin aula'}</small></div><strong>${money(s.balance)} 🪙</strong></div>`).join('')||empty()}</div>`)}
function rewards(){return layout('Entregar EduCoins',`<div class="panel"><h2>Registrar recompensa</h2><p class="muted">La operación actualiza el saldo y registra el movimiento de forma atómica en Supabase.</p><select id="rewardStudent">${students.map(s=>`<option value="${s.id}">${s.profile?.full_name||'Alumno'} · ${s.profile?.dni||''}</option>`).join('')}</select><input id="rewardAmount" type="number" min="1" placeholder="EduCoins"><input id="rewardTitle" placeholder="Motivo de la recompensa"><button class="primary" onclick="grantReward()">Entregar EduCoins</button></div>`)}
function movements(){return layout('Movimientos',`<div class="panel">${transactions.map(t=>move({...t,title:studentName(t.student_id)+' · '+t.title})).join('')||empty()}</div>`)}
function aulas(){return layout('Aulas',`<div class="panel"><div class="paneltitle"><h2>Aulas reales</h2>${me.role==='director'?'<button class="primary smallbtn" onclick="addClass()">+ Aula</button>':''}</div>${classes.map(c=>`<div class="listrow"><div><b>${c.name}</b><small>${c.level} · Tutor: ${c.teacher?.full_name||'Sin asignar'}</small></div><strong>${students.filter(s=>s.class_id===c.id).length} alumnos</strong></div>`).join('')||empty()}</div>`)}
function docentes(){return layout('Docentes',`<div class="panel">${teachers.map(t=>`<div class="listrow"><div><b>${t.full_name}</b><small>${t.dni||'Sin DNI'} · ${schoolName(t.school_id)}</small></div><span class="status">Activo</span></div>`).join('')||empty()}</div>`)}
function colegios(){return layout('Colegios',`<div class="panel">${schoolList.map(s=>`<div class="listrow"><div><b>${s.name}</b><small>${s.code} · ${s.city||'—'}</small></div><span class="status">${s.active?'Activo':'Inactivo'}</span></div>`).join('')||empty()}</div>`)}
function usuarios(){return layout('Usuarios',`<div class="panel"><div class="paneltitle"><h2>Perfiles del sistema</h2></div>${teachers.concat(me.role==='superadmin'?[me]:[]).map(p=>`<div class="listrow"><div><b>${p.full_name}</b><small>${p.role.toUpperCase()} · ${p.dni||'—'}</small></div><span class="status">Activo</span></div>`).join('')||empty()}</div>`)}
function reportes(){const total=students.reduce((a,s)=>a+s.balance,0),ins=transactions.filter(t=>t.type==='in').reduce((a,t)=>a+t.amount,0),outs=Math.abs(transactions.filter(t=>t.type==='out').reduce((a,t)=>a+t.amount,0));return layout('Reportes',`<div class="cards"><div class="stat"><span>🪙 SALDO</span><b>${money(total)}</b><small>EduCoins</small></div><div class="stat"><span>↗ INGRESOS</span><b>${money(ins)}</b><small>movimientos</small></div><div class="stat"><span>↘ EGRESOS</span><b>${money(outs)}</b><small>movimientos</small></div></div>`)}
function account(){return studentHome()}
function store(){return layout('Tienda',`<div class="panel"><h2>Tienda escolar</h2><p class="muted">Los canjes se registrarán contra tu cuenta real.</p><div class="grid"><article><em>📓</em><h3>Cuaderno premium</h3><p>200 EduCoins</p><button class="primary" onclick="buy('Cuaderno premium',200)">Canjear</button></article><article><em>🎒</em><h3>Kit escolar</h3><p>500 EduCoins</p><button class="primary" onclick="buy('Kit escolar',500)">Canjear</button></article></div></div>`)}
async function buy(name,cost){if(!students[0])return;const {error}=await window.eduBankSupabase.rpc('spend_educoins',{p_student:students[0].id,p_amount:cost,p_title:name,p_meta:'Tienda escolar'});if(error)return alert(error.message);await loadData();render('tienda');alert('Canje realizado en la cuenta real.')}
function loans(){return layout('Préstamos',`<div class="panel"><h2>Simulador</h2><p class="muted">Esta primera conexión muestra el módulo sin datos demo. La aprobación real se añadirá después de validar las políticas.</p><input id="loanAmount" type="number" min="100" value="500"><button class="primary" onclick="alert('Módulo preparado; la aprobación real se conectará en la siguiente iteración.')">Simular</button></div>`)}
function movimientosStudent(){return movements()}
async function grantReward(){const student_id=$('#rewardStudent').value,amount=Number($('#rewardAmount').value),title=$('#rewardTitle').value.trim();if(!amount||amount<1||!title)return alert('Completa alumno, monto y motivo.');const {error}=await window.eduBankSupabase.rpc('grant_educoins',{p_student:student_id,p_amount:amount,p_title:title,p_meta:'EduBank · recompensa'});if(error)return alert(error.message);await loadData();render('recompensas');alert('EduCoins entregados y registrados en Supabase.')}
async function addStudent(){alert('Primero crea el usuario en Supabase Auth y luego asigna su perfil y aula. En la siguiente iteración añadiremos el alta administrativa completa.')}
async function addClass(){alert('En la siguiente iteración habilitaremos el formulario de alta de aulas con inserción segura en Supabase.')}
function render(v){let out;if(me.role==='alumno')out=v==='inicio'?studentHome():v==='cuenta'?account():v==='movimientos'?movimientosStudent():v==='tienda'?store():loans();else out=v==='inicio'?adminHome():v==='alumnos'?renderAlumnos():v==='recompensas'?rewards():v==='aulas'?aulas():v==='docentes'?docentes():v==='colegios'?colegios():v==='usuarios'?usuarios():v==='reportes'?reportes():movements();$('#content').innerHTML=out}
async function logout(){await window.eduBankSupabase.auth.signOut();location.href='login.html'}
function fatal(msg){$('#content').innerHTML=`<div class="panel"><h2>No se pudo cargar EduBank</h2><p class="errorbox">${msg}</p><p class="muted">Revisa que hayas ejecutado supabase_schema.sql y que las tablas estén expuestas en Data API.</p></div>`}
init();
