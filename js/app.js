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

const level = xp =>
  xp >= 1000 ? 'Experto' :
  xp >= 700 ? 'Financiero' :
  xp >= 400 ? 'Ahorrador' :
  'Principiante';

function empty() {
  return '<div class="empty">No hay registros todavía.</div>';
}

function move(t) {
  return `
    <div class="move">
      <i class="${t.type === 'out' ? 'minus' : ''}">
        ${t.type === 'out' ? '−' : '+'}
      </i>
      <div>
        ${t.title}
        <small>${t.meta || new Date(t.created_at).toLocaleString('es-PE')}</small>
      </div>
      <b class="${Number(t.amount) < 0 ? 'negative' : ''}">
        ${Number(t.amount) > 0 ? '+' : ''}${money(t.amount)}
      </b>
    </div>
  `;
}

function schoolName(id) {
  return schoolList.find(s => s.id === id)?.name || 'Sin colegio';
}

function studentName(id) {
  return students.find(s => s.id === id)?.profile?.full_name || 'Alumno';
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
   CARGAR DATOS REALES
========================================================= */

async function loadData() {

  const sid = me.school_id;

  /* COLEGIOS */

  let q = window.eduBankSupabase
    .from('schools')
    .select('*')
    .order('name');

  if (me.role !== 'superadmin') {
    q = q.eq('id', sid);
  }

  let r = await q;

  if (r.error) {
    return fatal('Error cargando colegios: ' + r.error.message);
  }

  schoolList = r.data || [];


  /* AULAS */

  let cq = window.eduBankSupabase
    .from('classes')
    .select('*, teacher:teacher_id(id,full_name,role)')
    .order('name');

  if (me.role !== 'superadmin') {
    cq = cq.eq('school_id', sid);
  }

  r = await cq;

  if (r.error) {
    return fatal('Error cargando aulas: ' + r.error.message);
  }

  classes = r.data || [];


  /* ALUMNOS */

  let sq = window.eduBankSupabase
    .from('students')
    .select(`
      *,
      profile:profile_id(id,full_name,dni,role),
      class:class_id(id,name)
    `);

  if (me.role === 'alumno') {
    sq = sq.eq('profile_id', me.id);
  } else if (me.role !== 'superadmin') {
    sq = sq.eq('school_id', sid);
  }

  r = await sq.order('created_at', { ascending: false });

  if (r.error) {
    return fatal('Error cargando alumnos: ' + r.error.message);
  }

  students = r.data || [];


  /* DOCENTES */

  let tq = window.eduBankSupabase
    .from('profiles')
    .select('*')
    .eq('role', 'docente');

  if (me.role !== 'superadmin') {
    tq = tq.eq('school_id', sid);
  }

  r = await tq;

  if (r.error) {
    return fatal('Error cargando docentes: ' + r.error.message);
  }

  teachers = r.data || [];


  /* MOVIMIENTOS */

  let txq = window.eduBankSupabase
    .from('transactions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (me.role === 'alumno' && students[0]) {

    txq = txq.eq('student_id', students[0].id);

  } else if (me.role !== 'superadmin') {

    if (students.length) {
      txq = txq.in(
        'student_id',
        students.map(s => s.id)
      );
    } else {
      transactions = [];
      return;
    }
  }

  r = await txq;

  if (r.error) {
    return fatal('Error cargando movimientos: ' + r.error.message);
  }

  transactions = r.data || [];
}

/* =========================================================
   CONFIGURACIÓN DEL PANEL
========================================================= */

function setup() {

  const name = me.full_name || 'Usuario';

  $('#hello').textContent = `¡Hola, ${name}! 👋`;

  $('#roleTag').textContent =
    roleNames[me.role] || me.role.toUpperCase();

  $('#subtitle').textContent =
    me.role === 'alumno'
      ? 'Administra tus EduCoins y aprende tomando decisiones.'
      : 'Gestiona EduBank con datos reales de tu colegio.';

  $('#avatar').textContent =
    name.charAt(0).toUpperCase();

  $('#schoolBadge').textContent =
    me.role === 'superadmin'
      ? 'MULTICOLEGIO'
      : schoolName(me.school_id).toUpperCase();

  navItems();

  render('inicio');
}

/* =========================================================
   MENÚ
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
      ['historial', '↕', 'Movimientos']
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

      $$('#nav a').forEach(x =>
        x.classList.remove('active')
      );

      a.classList.add('active');

      render(a.dataset.view);
    };

  });
}

/* =========================================================
   ESTRUCTURA
========================================================= */

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
   DASHBOARD
========================================================= */

function studentHome() {

  const s = students[0];

  if (!s) {
    return layout('Mi cuenta', empty());
  }

  const tx =
    transactions.filter(t => t.student_id === s.id);

  return `
    <div class="cards">

      <div class="maincard">

        <div>
          <small>SALDO DISPONIBLE</small>

          <strong>${money(s.balance)}</strong>

          <span>EduCoins</span>
        </div>

        <div class="cardicon">E</div>

        <div class="meter">

          <b style="
            width:${Math.min(
              100,
              s.goal
                ? Math.round(s.balance / s.goal * 100)
                : 0
            )}%
          "></b>

        </div>

        <small>
          Meta de ahorro:
          ${money(s.goal)} EduCoins
        </small>

      </div>

      <div class="stat">
        <span>🏆 NIVEL</span>
        <b>${level(s.xp)}</b>
        <small>${s.xp} XP</small>
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
          <a onclick="render('movimientos')">
            Ver todos
          </a>
        </div>

        ${
          tx.slice(0, 6).map(move).join('')
          || empty()
        }

      </section>

      <section class="challenge">

        <span>EDUBANK REAL</span>

        <h2>Tu cuenta está conectada</h2>

        <p>
          Saldo, XP y movimientos provienen
          directamente de Supabase.
        </p>

      </section>

    </div>
  `;
}

function adminHome() {

  const total =
    students.reduce(
      (a, s) => a + Number(s.balance || 0),
      0
    );

  const tx = transactions.length;

  return `
    <div class="cards">

      <div class="maincard">

        <div>
          <small>SALDO TOTAL</small>

          <strong>${money(total)}</strong>

          <span>
            EduCoins en cuentas visibles
          </span>
        </div>

        <div class="cardicon">E</div>

      </div>

      <div class="stat">
        <span>🏫 COLEGIOS</span>
        <b>${schoolList.length}</b>
        <small>accesibles</small>
      </div>

      <div class="stat">
        <span>👨‍🎓 ALUMNOS</span>
        <b>${students.length}</b>
        <small>registros reales</small>
      </div>

    </div>

    <div class="admincards">

      <div class="panel">

        <div class="paneltitle">
          <h2>Resumen</h2>
        </div>

        <div class="listrow">
          <div>
            <b>Aulas</b>
            <small>registradas</small>
          </div>
          <strong>${classes.length}</strong>
        </div>

        <div class="listrow">
          <div>
            <b>Docentes</b>
            <small>perfiles docentes</small>
          </div>
          <strong>${teachers.length}</strong>
        </div>

        <div class="listrow">
          <div>
            <b>Movimientos</b>
            <small>últimos 100</small>
          </div>
          <strong>${tx}</strong>
        </div>

      </div>

      <div class="panel">

        <div class="paneltitle">
          <h2>Actividad reciente</h2>
        </div>

        ${
          transactions
            .slice(0, 6)
            .map(t =>
              move({
                ...t,
                title:
                  studentName(t.student_id)
                  + ' · '
                  + t.title
              })
            )
            .join('')
          || empty()
        }

      </div>

    </div>
  `;
}

/* =========================================================
   ALUMNOS
========================================================= */

function renderAlumnos() {

  return layout(
    'Alumnos',
    `
      <div class="panel">

        <div class="paneltitle">

          <h2>Alumnos reales</h2>

          ${
            ['superadmin', 'director'].includes(me.role)
              ? `
                <button
                  class="primary smallbtn"
                  onclick="addStudent()">
                  + Alumno
                </button>
              `
              : ''
          }

        </div>

        ${
          students.map(s => `
            <div class="listrow">

              <div>
                <b>
                  ${s.profile?.full_name || 'Sin nombre'}
                </b>

                <small>
                  DNI:
                  ${s.profile?.dni || '—'}
                  ·
                  ${s.class?.name || 'Sin aula'}
                </small>
              </div>

              <strong>
                ${money(s.balance)} 🪙
              </strong>

            </div>
          `).join('')
          || empty()
        }

      </div>
    `
  );
}

/* =========================================================
   COLEGIOS
========================================================= */

function colegios() {

  return layout(
    'Colegios',
    `
      <div class="panel">

        <div class="paneltitle">

          <h2>Colegios registrados</h2>

          ${
            me.role === 'superadmin'
              ? `
                <button
                  class="primary smallbtn"
                  onclick="addSchool()">
                  + Nuevo colegio
                </button>
              `
              : ''
          }

        </div>

        ${
          schoolList.map(s => `
            <div class="listrow">

              <div>

                <b>${s.name}</b>

                <small>
                  Código:
                  ${s.code || '—'}
                  ·
                  ${s.city || 'Sin ciudad'}
                </small>

              </div>

              <span class="status">
                ${s.active ? 'Activo' : 'Inactivo'}
              </span>

            </div>
          `).join('')
          || empty()
        }

      </div>
    `
  );
}

/* =========================================================
   USUARIOS
========================================================= */

async function usuarios() {

  let query = window.eduBankSupabase
    .from('profiles')
    .select(`
      id,
      full_name,
      dni,
      role,
      school_id,
      active
    `)
    .order('full_name');

  if (me.role !== 'superadmin') {
    query = query.eq('school_id', me.school_id);
  }

  const { data, error } = await query;

  if (error) {

    return layout(
      'Usuarios',
      `
        <div class="panel">

          <h2>Error cargando usuarios</h2>

          <p class="errorbox">
            ${error.message}
          </p>

        </div>
      `
    );
  }

  const users = data || [];

  return layout(
    'Usuarios',
    `
      <div class="panel">

        <div class="paneltitle">

          <h2>Usuarios del sistema</h2>

          ${
            me.role === 'superadmin'
              ? `
                <button
                  class="primary smallbtn"
                  onclick="addUser()">
                  + Nuevo usuario
                </button>
              `
              : ''
          }

        </div>

        ${
          users.map(p => `
            <div class="listrow">

              <div>

                <b>
                  ${p.full_name || 'Sin nombre'}
                </b>

                <small>

                  ${roleNames[p.role] || p.role}

                  · DNI:
                  ${p.dni || '—'}

                  · Colegio:
                  ${schoolName(p.school_id)}

                </small>

              </div>

              <span class="status">
                ${p.active === false ? 'Inactivo' : 'Activo'}
              </span>

            </div>
          `).join('')
          || empty()
        }

      </div>
    `
  );
}

/* =========================================================
   CREAR COLEGIO
========================================================= */

async function addSchool() {

  if (me.role !== 'superadmin') {
    alert('Solo el SuperAdmin puede crear colegios.');
    return;
  }

  const name = prompt(
    'Nombre del colegio:'
  );

  if (!name || !name.trim()) {
    return;
  }

  const code = prompt(
    'Código del colegio:'
  );

  if (!code || !code.trim()) {
    return;
  }

  const city = prompt(
    'Ciudad:',
    'Lima'
  );

  const {
    data,
    error
  } = await window.eduBankSupabase
    .from('schools')
    .insert({
      name: name.trim(),
      code: code.trim(),
      city: city?.trim() || null,
      active: true
    })
    .select()
    .single();

  if (error) {

    console.error('Error creando colegio:', error);

    alert(
      'NO SE PUDO CREAR EL COLEGIO\n\n' +
      error.message
    );

    return;
  }

  schoolList.push(data);

  alert(
    'Colegio creado correctamente.'
  );

  await loadData();

  render('colegios');
}

/* =========================================================
   CREAR USUARIO
========================================================= */

async function addUser() {

  if (me.role !== 'superadmin') {

    alert(
      'Solo el SuperAdmin puede crear usuarios.'
    );

    return;
  }

  if (!schoolList.length) {

    alert(
      'Primero debes crear al menos un colegio.'
    );

    return;
  }

  const name = prompt(
    'Nombre completo:'
  );

  if (!name || !name.trim()) {
    return;
  }

  const email = prompt(
    'Correo electrónico de acceso:'
  );

  if (!email || !email.trim()) {
    return;
  }

  const password = prompt(
    'Contraseña temporal (mínimo 6 caracteres):'
  );

  if (!password || password.length < 6) {

    alert(
      'La contraseña debe tener al menos 6 caracteres.'
    );

    return;
  }

  const role = prompt(
    'Rol:\n\n' +
    'superadmin\n' +
    'director\n' +
    'docente\n' +
    'alumno',
    'alumno'
  );

  if (
    ![
      'superadmin',
      'director',
      'docente',
      'alumno'
    ].includes(role?.trim().toLowerCase())
  ) {

    alert('Rol inválido.');

    return;
  }

  const selectedRole =
    role.trim().toLowerCase();

  let schoolId = null;

  if (selectedRole !== 'superadmin') {

    const options =
      schoolList
        .map(
          (s, i) =>
            `${i + 1}. ${s.name} (${s.code})`
        )
        .join('\n');

    const selected = prompt(
      'Selecciona el colegio escribiendo el número:\n\n' +
      options,
      '1'
    );

    const index =
      Number(selected) - 1;

    if (
      !Number.isInteger(index) ||
      !schoolList[index]
    ) {

      alert('Colegio inválido.');

      return;
    }

    schoolId = schoolList[index].id;
  }

  const dni =
    prompt('DNI (opcional):')?.trim() || null;


  /* LLAMADA A EDGE FUNCTION */

  try {

    const {
      data,
      error
    } = await window.eduBankSupabase
      .functions
      .invoke(
        'admin-create-user',
        {
          body: {
            email: email.trim(),
            password,
            full_name: name.trim(),
            role: selectedRole,
            school_id: schoolId,
            dni
          }
        }
      );

    console.log(
      'Respuesta admin-create-user:',
      data
    );

    if (error) {

      console.error(
        'Error Edge Function:',
        error
      );

      alert(
        'NO SE PUDO CREAR EL USUARIO\n\n' +
        (error.message || String(error)) +
        '\n\nVerifica que la Edge Function ' +
        '"admin-create-user" esté desplegada en Supabase.'
      );

      return;
    }

    if (data && data.ok === false) {

      alert(
        'NO SE PUDO CREAR EL USUARIO\n\n' +
        (data.error || 'Error desconocido')
      );

      return;
    }

    alert(
      'Usuario creado correctamente.\n\n' +
      'Ahora podrá ingresar con su correo y contraseña.'
    );

    await loadData();

    render('usuarios');

  } catch (err) {

    console.error(err);

    alert(
      'ERROR AL CREAR USUARIO\n\n' +
      (err.message || String(err))
    );
  }
}

/* =========================================================
   RECOMPENSAS
========================================================= */

function rewards() {

  return layout(
    'Entregar EduCoins',
    `
      <div class="panel">

        <h2>Registrar recompensa</h2>

        <p class="muted">
          La operación actualiza el saldo
          y registra el movimiento en Supabase.
        </p>

        <select id="rewardStudent">

          ${students.map(s => `
            <option value="${s.id}">
              ${s.profile?.full_name || 'Alumno'}
              ·
              ${s.profile?.dni || ''}
            </option>
          `).join('')}

        </select>

        <input
          id="rewardAmount"
          type="number"
          min="1"
          placeholder="EduCoins">

        <input
          id="rewardTitle"
          placeholder="Motivo de la recompensa">

        <button
          class="primary"
          onclick="grantReward()">

          Entregar EduCoins

        </button>

      </div>
    `
  );
}

async function grantReward() {

  const student_id =
    $('#rewardStudent').value;

  const amount =
    Number($('#rewardAmount').value);

  const title =
    $('#rewardTitle').value.trim();

  if (
    !amount ||
    amount < 1 ||
    !title
  ) {

    alert(
      'Completa alumno, monto y motivo.'
    );

    return;
  }

  const { error } =
    await window.eduBankSupabase
      .rpc(
        'grant_educoins',
        {
          p_student: student_id,
          p_amount: amount,
          p_title: title,
          p_meta: 'EduBank · recompensa'
        }
      );

  if (error) {

    alert(
      'No se pudo entregar EduCoins:\n\n' +
      error.message
    );

    return;
  }

  await loadData();

  render('recompensas');

  alert(
    'EduCoins entregados y registrados en Supabase.'
  );
}

/* =========================================================
   AULAS
========================================================= */

function aulas() {

  return layout(
    'Aulas',
    `
      <div class="panel">

        <div class="paneltitle">

          <h2>Aulas reales</h2>

          ${
            me.role === 'director'
              ? `
                <button
                  class="primary smallbtn"
                  onclick="addClass()">
                  + Aula
                </button>
              `
              : ''
          }

        </div>

        ${
          classes.map(c => `
            <div class="listrow">

              <div>

                <b>${c.name}</b>

                <small>
                  ${c.level || ''}
                  · Tutor:
                  ${c.teacher?.full_name || 'Sin asignar'}
                </small>

              </div>

              <strong>
                ${
                  students.filter(
                    s => s.class_id === c.id
                  ).length
                }
                alumnos
              </strong>

            </div>
          `).join('')
          || empty()
        }

      </div>
    `
  );
}

/* =========================================================
   DOCENTES
========================================================= */

function docentes() {

  return layout(
    'Docentes',
    `
      <div class="panel">

        ${
          teachers.map(t => `
            <div class="listrow">

              <div>

                <b>${t.full_name}</b>

                <small>
                  ${t.dni || 'Sin DNI'}
                  ·
                  ${schoolName(t.school_id)}
                </small>

              </div>

              <span class="status">
                Activo
              </span>

            </div>
          `).join('')
          || empty()
        }

      </div>
    `
  );
}

/* =========================================================
   MOVIMIENTOS
========================================================= */

function movements() {

  return layout(
    'Movimientos',
    `
      <div class="panel">

        ${
          transactions
            .map(t =>
              move({
                ...t,
                title:
                  studentName(t.student_id)
                  + ' · '
                  + t.title
              })
            )
            .join('')
          || empty()
        }

      </div>
    `
  );
}

/* =========================================================
   REPORTES
========================================================= */

function reportes() {

  const total =
    students.reduce(
      (a, s) =>
        a + Number(s.balance || 0),
      0
    );

  const ins =
    transactions
      .filter(t => t.type === 'in')
      .reduce(
        (a, t) =>
          a + Number(t.amount || 0),
        0
      );

  const outs =
    Math.abs(
      transactions
        .filter(t => t.type === 'out')
        .reduce(
          (a, t) =>
            a + Number(t.amount || 0),
          0
        )
    );

  return layout(
    'Reportes',
    `
      <div class="cards">

        <div class="stat">
          <span>🪙 SALDO</span>
          <b>${money(total)}</b>
          <small>EduCoins</small>
        </div>

        <div class="stat">
          <span>↗ INGRESOS</span>
          <b>${money(ins)}</b>
          <small>movimientos</small>
        </div>

        <div class="stat">
          <span>↘ EGRESOS</span>
          <b>${money(outs)}</b>
          <small>movimientos</small>
        </div>

      </div>
    `
  );
}

/* =========================================================
   CUENTA / TIENDA
========================================================= */

function account() {
  return studentHome();
}

function store() {

  return layout(
    'Tienda',
    `
      <div class="panel">

        <h2>Tienda escolar</h2>

        <p class="muted">
          Los canjes se registrarán
          contra tu cuenta real.
        </p>

        <div class="grid">

          <article>

            <em>📓</em>

            <h3>Cuaderno premium</h3>

            <p>200 EduCoins</p>

            <button
              class="primary"
              onclick="buy('Cuaderno premium',200)">

              Canjear

            </button>

          </article>

          <article>

            <em>🎒</em>

            <h3>Kit escolar</h3>

            <p>500 EduCoins</p>

            <button
              class="primary"
              onclick="buy('Kit escolar',500)">

              Canjear

            </button>

          </article>

        </div>

      </div>
    `
  );
}

async function buy(name, cost) {

  if (!students[0]) return;

  const { error } =
    await window.eduBankSupabase
      .rpc(
        'spend_educoins',
        {
          p_student: students[0].id,
          p_amount: cost,
          p_title: name,
          p_meta: 'Tienda escolar'
        }
      );

  if (error) {

    alert(error.message);

    return;
  }

  await loadData();

  render('tienda');

  alert(
    'Canje realizado en la cuenta real.'
  );
}

function loans() {

  return layout(
    'Préstamos',
    `
      <div class="panel">

        <h2>Simulador</h2>

        <p class="muted">
          Módulo preparado para conexión
          con préstamos reales.
        </p>

        <input
          id="loanAmount"
          type="number"
          min="100"
          value="500">

        <button
          class="primary"
          onclick="
            alert(
              'Módulo preparado para la siguiente iteración.'
            )
          ">

          Simular

        </button>

      </div>
    `
  );
}

function movimientosStudent() {
  return movements();
}

/* =========================================================
   ALTA TEMPORAL DE ALUMNO / AULA
========================================================= */

async function addStudent() {

  alert(
    'La creación administrativa de alumnos ' +
    'se realizará mediante el módulo Usuarios. ' +
    'Crea primero el usuario con rol ALUMNO.'
  );
}

async function addClass() {

  alert(
    'El módulo de creación de aulas ' +
    'se implementará después de validar ' +
    'la estructura de clases.'
  );
}

/* =========================================================
   RENDER
========================================================= */

async function render(v) {

  let out;

  if (me.role === 'alumno') {

    out =
      v === 'inicio'
        ? studentHome()
        : v === 'cuenta'
        ? account()
        : v === 'movimientos'
        ? movimientosStudent()
        : v === 'tienda'
        ? store()
        : loans();

  } else {

    if (v === 'inicio') {
      out = adminHome();

    } else if (v === 'alumnos') {
      out = renderAlumnos();

    } else if (v === 'recompensas') {
      out = rewards();

    } else if (v === 'aulas') {
      out = aulas();

    } else if (v === 'docentes') {
      out = docentes();

    } else if (v === 'colegios') {
      out = colegios();

    } else if (v === 'usuarios') {
      out = await usuarios();

    } else if (v === 'reportes') {
      out = reportes();

    } else {
      out = movements();
    }
  }

  $('#content').innerHTML = out;
}

/* =========================================================
   CERRAR SESIÓN
========================================================= */

async function logout() {

  await window.eduBankSupabase.auth.signOut();

  location.href = 'login.html';
}

/* =========================================================
   ERROR GENERAL
========================================================= */

function fatal(msg) {

  console.error(msg);

  $('#content').innerHTML = `
    <div class="panel">

      <h2>No se pudo cargar EduBank</h2>

      <p class="errorbox">
        ${msg}
      </p>

      <p class="muted">
        Revisa Supabase, las tablas,
        las políticas RLS y la conexión.
      </p>

    </div>
  `;
}

/* =========================================================
   ARRANQUE
========================================================= */

init();
