let me = null;
let schoolList = [];
let classes = [];
let students = [];
let teachers = [];
let transactions = [];

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

const money = n =>
  new Intl.NumberFormat('es-PE').format(Number(n) || 0);

const roleNames = {
  alumno: 'ALUMNO',
  docente: 'DOCENTE',
  director: 'DIRECTOR',
  superadmin: 'SUPERADMIN'
};

function empty() {
  return '<div class="empty">No hay registros todavía.</div>';
}

function move(t) {
  const esEgreso = t.tipo === 'egreso';
  return `
    <div class="move">
      <i class="${esEgreso ? 'minus' : ''}">
        ${esEgreso ? '−' : '+'}
      </i>
      <div>
        ${t.concepto || 'Transacción'}
        <small>${new Date(t.created_at).toLocaleString('es-PE')}</small>
      </div>
      <b class="${esEgreso ? 'negative' : ''}">
        ${esEgreso ? '-' : '+'}${money(t.amount)}
      </b>
    </div>
  `;
}

function schoolName(id) {
  if (!id) return 'Sin colegio';
  return schoolList.find(s => s.id === id)?.name || 'Sin colegio';
}

function studentName(id) {
  const st = students.find(s => s.id === id);
  return st ? `${st.nombres || ''} ${st.apellidos || ''}`.trim() : 'Alumno';
}

/* =========================================================
   INICIO
========================================================= */

async function init() {
  try {
    if (!window.eduBankSupabase) {
      throw new Error('No se encontró la conexión con Supabase.');
    }

    const {
      data: { session },
      error: sessionError
    } = await window.eduBankSupabase.auth.getSession();

    if (sessionError) throw sessionError;

    if (!session) {
      location.href = 'login.html';
      return;
    }

    const {
      data: profile,
      error
    } = await window.eduBankSupabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();

    if (error || !profile) {
      await window.eduBankSupabase.auth.signOut();
      alert('No se encontró el perfil del usuario.');
      location.href = 'login.html';
      return;
    }

    me = profile;

    await loadData();
    setup();

  } catch (error) {
    console.error(error);
    fatal(error.message || String(error));
  }
}

/* =========================================================
   CARGAR DATOS REALES (Esquema Supabase)
========================================================= */

async function loadData() {
  const sid = me.school_id;

  /* COLEGIOS */
  let q = window.eduBankSupabase
    .from('schools')
    .select('*')
    .order('name');

  if (me.role !== 'superadmin' && sid) {
    q = q.eq('id', sid);
  }

  let r = await q;
  if (r.error) {
    console.warn('Error cargando colegios:', r.error.message);
  }
  schoolList = r.data || [];

  /* AULAS */
  let cq = window.eduBankSupabase
    .from('classes')
    .select('*, docente:docente_id(id,nombres,apellidos,role)')
    .order('nombre');

  if (me.role !== 'superadmin' && sid) {
    cq = cq.eq('school_id', sid);
  }

  r = await cq;
  if (r.error) {
    console.warn('Error cargando aulas:', r.error.message);
  }
  classes = r.data || [];

  /* ALUMNOS */
  let sq = window.eduBankSupabase
    .from('profiles')
    .select('*')
    .eq('role', 'alumno');

  if (me.role === 'alumno') {
    sq = sq.eq('id', me.id);
  } else if (me.role !== 'superadmin' && sid) {
    sq = sq.eq('school_id', sid);
  }

  r = await sq.order('created_at', { ascending: false });
  if (r.error) {
    console.warn('Error cargando alumnos:', r.error.message);
  }
  students = r.data || [];

  /* DOCENTES */
  let tq = window.eduBankSupabase
    .from('profiles')
    .select('*')
    .eq('role', 'docente');

  if (me.role !== 'superadmin' && sid) {
    tq = tq.eq('school_id', sid);
  }

  r = await tq;
  if (r.error) {
    console.warn('Error cargando docentes:', r.error.message);
  }
  teachers = r.data || [];

  /* MOVIMIENTOS */
  let txq = window.eduBankSupabase
    .from('coin_transactions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (me.role === 'alumno') {
    txq = txq.eq('student_id', me.id);
  } else if (me.role !== 'superadmin') {
    if (students.length) {
      txq = txq.in('student_id', students.map(s => s.id));
    } else {
      transactions = [];
      return;
    }
  }

  r = await txq;
  if (r.error) {
    console.warn('Error cargando movimientos:', r.error.message);
  }
  transactions = r.data || [];
}

/* =========================================================
   CONFIGURACIÓN DEL PANEL
========================================================= */

function setup() {
  const fullName = `${me.nombres || ''} ${me.apellidos || ''}`.trim() || 'Usuario';

  $('#hello').textContent = `¡Hola, ${fullName}! 👋`;
  $('#roleTag').textContent = roleNames[me.role] || me.role.toUpperCase();
  $('#subtitle').textContent = me.role === 'alumno'
    ? 'Administra tus EduCoins y toma decisiones financieras.'
    : 'Gestiona EduBank con datos reales de tu colegio.';

  $('#avatar').textContent = fullName.charAt(0).toUpperCase();

  $('#schoolBadge').textContent = me.role === 'superadmin'
    ? 'MULTICOLEGIO'
    : schoolName(me.school_id).toUpperCase();

  navItems();
  render('inicio');
}

/* =========================================================
   MENÚ DE NAVEGACIÓN
========================================================= */

function navItems() {
  let common;

  if (me.role === 'alumno') {
    common = [
      ['inicio', '⌂', 'Inicio'],
      ['cuenta', '💰', 'Mi cuenta'],
      ['movimientos', '↕', 'Movimientos'],
      ['tienda', '🎁', 'Tienda'],
      ['prestamos', '💳', 'Préstamos']
    ];
  } else if (me.role === 'docente') {
    common = [
      ['inicio', '⌂', 'Panel docente'],
      ['alumnos', '👨‍🎓', 'Alumnos'],
      ['recompensas', '🪙', 'Entregar EduCoins'],
      ['movimientos', '↕', 'Movimientos']
    ];
  } else if (me.role === 'director') {
    common = [
      ['inicio', '⌂', 'Dashboard'],
      ['aulas', '🏫', 'Aulas'],
      ['alumnos', '👨‍🎓', 'Alumnos'],
      ['docentes', '👨‍🏫', 'Docentes'],
      ['movimientos', '↕', 'Movimientos'],
      ['reportes', '📊', 'Reportes']
    ];
  } else {
    common = [
      ['inicio', '⌂', 'Dashboard'],
      ['colegios', '🏫', 'Colegios'],
      ['usuarios', '👥', 'Usuarios'],
      ['movimientos', '↕', 'Movimientos'],
      ['reportes', '📊', 'Reportes']
    ];
  }

  $('#nav').innerHTML = common
    .map((x, i) => `
      <a class="${i === 0 ? 'active' : ''}" data-view="${x[0]}">
        ${x[1]} <span>${x[2]}</span>
      </a>
    `)
    .join('');

  $$('#nav a').forEach(a => {
    a.onclick = () => {
      $$('#nav a').forEach(x => x.classList.remove('active'));
      a.classList.add('active');
      render(a.dataset.view);
    };
  });
}

function layout(title, body) {
  return `
    <section class="view">
      <div class="viewhead">
        <div>
          <div class="tag">${title.toUpperCase()}</div>
          <h2>${title}</h2>
        </div>
      </div>
      ${body}
    </section>
  `;
}

/* =========================================================
   DASHBOARD / INICIO
========================================================= */

function studentHome() {
  const s = me;
  if (!s) return layout('Mi cuenta', empty());

  const tx = transactions.filter(t => t.student_id === s.id);

  return `
    <div class="cards">
      <div class="maincard">
        <div>
          <small>SALDO DISPONIBLE</small>
          <strong>${money(s.balance || 0)}</strong>
          <span>EduCoins</span>
        </div>
        <div class="cardicon">E</div>
      </div>
      <div class="stat">
        <span>🏫 COLEGIO</span>
        <b>${schoolName(s.school_id)}</b>
        <small>Cuenta real</small>
      </div>
    </div>

    <div class="columns">
      <section class="panel">
        <div class="paneltitle">
          <h2>Últimos movimientos</h2>
          <a onclick="render('movimientos')">Ver todos</a>
        </div>
        ${tx.slice(0, 6).map(move).join('') || empty()}
      </section>
    </div>
  `;
}

function adminHome() {
  const txCount = transactions.length;

  return `
    <div class="cards">
      <div class="maincard">
        <div>
          <small>SISTEMA EDUBANK</small>
          <strong>${students.length}</strong>
          <span>Alumnos en red</span>
        </div>
        <div class="cardicon">E</div>
      </div>
      <div class="stat">
        <span>🏫 COLEGIOS</span>
        <b>${schoolList.length}</b>
        <small>activos</small>
      </div>
      <div class="stat">
        <span>📊 MOVIMIENTOS</span>
        <b>${txCount}</b>
        <small>registros recientes</small>
      </div>
    </div>
  `;
}

/* =========================================================
   GESTIÓN DE COLEGIOS (SUPERADMIN)
========================================================= */

function colegios() {
  return layout(
    'Colegios',
    `
      <div class="panel" style="margin-bottom: 20px;">
        <h2>Registrar Nuevo Colegio</h2>
        <div style="display: grid; gap: 10px; margin-top: 15px;">
          <input type="text" id="newSchoolName" placeholder="Nombre del colegio" style="padding: 10px; border-radius: 8px; border: 1px solid #333; background: #111; color: #fff;">
          <input type="text" id="newSchoolCode" placeholder="Código modular o abreviatura" style="padding: 10px; border-radius: 8px; border: 1px solid #333; background: #111; color: #fff;">
          <button class="primary" onclick="createSchoolSubmit()">+ Crear Colegio</button>
        </div>
      </div>

      <div class="panel">
        <div class="paneltitle">
          <h2>Colegios registrados (${schoolList.length})</h2>
        </div>
        ${schoolList.map(s => `
          <div class="listrow">
            <div>
              <b>${s.name}</b>
              <small>Código: ${s.code || '—'} · ID: ${s.id}</small>
            </div>
            <span class="status">Activo</span>
          </div>
        `).join('') || empty()}
      </div>
    `
  );
}

async function createSchoolSubmit() {
  const name = $('#newSchoolName').value.trim();
  const code = $('#newSchoolCode').value.trim();

  if (!name || !code) {
    return alert('Por favor, completa el nombre y el código del colegio.');
  }

  const { error } = await window.eduBankSupabase
    .from('schools')
    .insert({ name, code, activo: true });

  if (error) {
    return alert('Error al crear colegio: ' + error.message);
  }

  alert('¡Colegio creado exitosamente!');
  await loadData();
  render('colegios');
}

/* =========================================================
   GESTIÓN DE USUARIOS
========================================================= */

async function usuarios() {
  let query = window.eduBankSupabase
    .from('profiles')
    .select('id, nombres, apellidos, dni, role, school_id, activo')
    .order('nombres');

  if (me.role !== 'superadmin' && me.school_id) {
    query = query.eq('school_id', me.school_id);
  }

  const { data, error } = await query;
  if (error) return layout('Usuarios', `<div class="panel"><h2>Error</h2><p>${error.message}</p></div>`);

  const users = data || [];

  return layout(
    'Usuarios',
    `
      <div class="panel" style="margin-bottom: 20px;">
        <h2>Registrar Nuevo Usuario / Personal</h2>
        <div style="display: grid; gap: 10px; margin-top: 15px;">
          <input type="text" id="uNombres" placeholder="Nombres" style="padding: 10px; border-radius: 8px; border: 1px solid #333; background: #111; color: #fff;">
          <input type="text" id="uApellidos" placeholder="Apellidos" style="padding: 10px; border-radius: 8px; border: 1px solid #333; background: #111; color: #fff;">
          <input type="text" id="uDni" placeholder="DNI" style="padding: 10px; border-radius: 8px; border: 1px solid #333; background: #111; color: #fff;">
          <select id="uRole" style="padding: 10px; border-radius: 8px; border: 1px solid #333; background: #111; color: #fff;">
            <option value="docente">Docente</option>
            <option value="director">Director</option>
            <option value="alumno">Alumno</option>
            <option value="superadmin">Superadmin</option>
          </select>
          <select id="uSchool" style="padding: 10px; border-radius: 8px; border: 1px solid #333; background: #111; color: #fff;">
            <option value="">Selecciona un colegio...</option>
            ${schoolList.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
          </select>
          <button class="primary" onclick="createUserSubmit()">+ Registrar Usuario en el Sistema</button>
        </div>
      </div>

      <div class="panel">
        <div class="paneltitle">
          <h2>Usuarios del sistema (${users.length})</h2>
        </div>
        ${users.map(p => `
          <div class="listrow">
            <div>
              <b>${p.nombres || ''} ${p.apellidos || ''}</b>
              <small>${roleNames[p.role] || p.role} · DNI: ${p.dni || '—'} · Colegio: ${schoolName(p.school_id)}</small>
            </div>
            <span class="status">${p.activo === false ? 'Inactivo' : 'Activo'}</span>
          </div>
        `).join('') || empty()}
      </div>
    `
  );
}

async function createUserSubmit() {
  const nombres = $('#uNombres').value.trim();
  const apellidos = $('#uApellidos').value.trim();
  const dni = $('#uDni').value.trim();
  const role = $('#uRole').value;
  const school_id = $('#uSchool').value;

  if (!nombres || !apellidos || !dni) {
    return alert('Por favor, completa los datos principales del usuario.');
  }

  const userData = {
    nombres,
    apellidos,
    dni,
    role,
    activo: true
  };

  if (school_id && school_id.trim() !== '') {
    userData.school_id = school_id;
  }

  const { error } = await window.eduBankSupabase
    .from('profiles')
    .insert(userData);

  if (error) {
    return alert('Error al registrar usuario: ' + error.message);
  }

  alert('¡Usuario registrado correctamente!');
  await loadData();
  render('usuarios');
}

/* =========================================================
   OTRAS VISTAS
========================================================= */

function renderAlumnos() {
  return layout(
    'Alumnos',
    `
      <div class="panel">
        <div class="paneltitle">
          <h2>Alumnos registrados (${students.length})</h2>
        </div>
        ${students.map(s => `
          <div class="listrow">
            <div>
              <b>${s.nombres || ''} ${s.apellidos || ''}</b>
              <small>DNI: ${s.dni || '—'} · Colegio: ${schoolName(s.school_id)}</small>
            </div>
            <strong>${money(s.balance || 0)} 🪙</strong>
          </div>
        `).join('') || empty()}
      </div>
    `
  );
}

function rewards() {
  return layout(
    'Entregar EduCoins',
    `
      <div class="panel">
        <h2>Registrar recompensa</h2>
        <div style="display: grid; gap: 10px; margin-top: 15px;">
          <select id="rewardStudent" style="padding: 10px; border-radius: 8px; border: 1px solid #333; background: #111; color: #fff;">
            ${students.map(s => `<option value="${s.id}">${s.nombres || ''} ${s.apellidos || ''} (${s.dni || 'Sin DNI'})</option>`).join('')}
          </select>
          <input id="rewardAmount" type="number" min="1" placeholder="Cantidad de EduCoins" style="padding: 10px; border-radius: 8px; border: 1px solid #333; background: #111; color: #fff;">
          <input id="rewardTitle" placeholder="Concepto o motivo" style="padding: 10px; border-radius: 8px; border: 1px solid #333; background: #111; color: #fff;">
          <button class="primary" onclick="grantReward()">Entregar EduCoins</button>
        </div>
      </div>
    `
  );
}

async function grantReward() {
  const student_id = $('#rewardStudent').value;
  const amount = Number($('#rewardAmount').value);
  const concepto = $('#rewardTitle').value.trim();

  if (!student_id || !amount || amount < 1 || !concepto) {
    return alert('Completa todos los campos correctamente.');
  }

  const { error } = await window.eduBankSupabase
    .from('coin_transactions')
    .insert({
      student_id,
      school_id: me.school_id || students.find(s => s.id === student_id)?.school_id,
      amount,
      tipo: 'ingreso',
      concepto,
      created_by: me.id
    });

  if (error) return alert('Error al registrar: ' + error.message);
  await loadData();
  render('recompensas');
  alert('¡EduCoins entregados con éxito!');
}

function aulas() {
  return layout(
    'Aulas',
    `
      <div class="panel">
        <div class="paneltitle"><h2>Aulas reales (${classes.length})</h2></div>
        ${classes.map(c => `
          <div class="listrow">
            <div>
              <b>${c.nombre} ${c.seccion || ''}</b>
              <small>Tutor: ${c.docente ? `${c.docente.nombres} ${c.docente.apellidos}` : 'Sin asignar'} · Colegio: ${schoolName(c.school_id)}</small>
            </div>
            <strong>${students.filter(s => s.class_id === c.id).length} alumnos</strong>
          </div>
        `).join('') || empty()}
      </div>
    `
  );
}

function docentes() {
  return layout(
    'Docentes',
    `
      <div class="panel">
        <div class="paneltitle"><h2>Docentes del sistema (${teachers.length})</h2></div>
        ${teachers.map(t => `
          <div class="listrow">
            <div>
              <b>${t.nombres || ''} ${t.apellidos || ''}</b>
              <small>DNI: ${t.dni || 'Sin DNI'} · Colegio: ${schoolName(t.school_id)}</small>
            </div>
            <span class="status">Activo</span>
          </div>
        `).join('') || empty()}
      </div>
    `
  );
}

function movements() {
  return layout(
    'Movimientos',
    `<div class="panel">${transactions.map(t => move({ ...t, concepto: `${studentName(t.student_id)} · ${t.concepto}` })).join('') || empty()}</div>`
  );
}

function reportes() {
  const total = students.reduce((a, s) => a + Number(s.balance || 0), 0);
  const ingresos = transactions.filter(t => t.tipo === 'ingreso').reduce((a, t) => a + Number(t.amount || 0), 0);
  const egresos = transactions.filter(t => t.tipo === 'egreso').reduce((a, t) => a + Number(t.amount || 0), 0);

  return layout(
    'Reportes',
    `
      <div class="cards">
        <div class="stat"><span>🪙 SALDO GLOBAL</span><b>${money(total)}</b><small>EduCoins</small></div>
        <div class="stat"><span>↗ INGRESOS</span><b>${money(ingresos)}</b><small>total</small></div>
        <div class="stat"><span>↘ EGRESOS</span><b>${money(egresos)}</b><small>total</small></div>
      </div>
    `
  );
}

function store() {
  return layout(
    'Tienda',
    `
      <div class="panel">
        <h2>Tienda escolar</h2>
        <div class="grid" style="margin-top: 15px;">
          <article style="padding: 15px; border: 1px solid #333; border-radius: 8px;">
            <em>📓</em>
            <h3>Cuaderno premium</h3>
            <p>200 EduCoins</p>
            <button class="primary" onclick="alert('Canje en desarrollo')" style="margin-top: 10px;">Canjear</button>
          </article>
        </div>
      </div>
    `
  );
}

function loans() {
  return layout(
    'Préstamos',
    `<div class="panel"><h2>Simulador de créditos</h2><p class="muted">Módulo disponible para solicitudes de crédito escolar.</p></div>`
  );
}

/* =========================================================
   ENRUTADOR DE VISTAS (RENDER)
========================================================= */

async function render(v) {
  let out;
  if (me.role === 'alumno') {
    out = v === 'inicio' ? studentHome() :
          v === 'cuenta' ? studentHome() :
          v === 'movimientos' ? movements() :
          v === 'tienda' ? store() : loans();
  } else {
    out = v === 'inicio' ? adminHome() :
          v === 'alumnos' ? renderAlumnos() :
          v === 'recompensas' ? rewards() :
          v === 'aulas' ? aulas() :
          v === 'docentes' ? docentes() :
          v === 'colegios' ? colegios() :
          v === 'usuarios' ? await usuarios() :
          v === 'reportes' ? reportes() : movements();
  }
  $('#content').innerHTML = out;
}

async function logout() {
  await window.eduBankSupabase.auth.signOut();
  location.href = 'login.html';
}

function fatal(msg) {
  console.error(msg);
  $('#content').innerHTML = `<div class="panel"><h2>Error en EduBank</h2><p class="errorbox">${msg}</p></div>`;
}

init();
async function createUserSubmit() {
  const nombres = $('#uNombres').value.trim();
  const apellidos = $('#uApellidos').value.trim();
  const dni = $('#uDni').value.trim();
  const role = $('#uRole').value;
  const school_id = $('#uSchool').value;

  if (!nombres || !apellidos || !dni) {
    return alert('Por favor, completa los datos principales del usuario.');
  }

  const userData = {
    id: crypto.randomUUID(), // Genera un UUID válido para que no sea nulo
    nombres,
    apellidos,
    dni,
    role,
    activo: true
  };

  if (school_id && school_id.trim() !== '') {
    userData.school_id = school_id;
  }

  const { error } = await window.eduBankSupabase
    .from('profiles')
    .insert(userData);

  if (error) {
    return alert('Error al registrar usuario: ' + error.message);
  }

  alert('¡Usuario registrado correctamente!');
  await loadData();
  render('usuarios');
}
