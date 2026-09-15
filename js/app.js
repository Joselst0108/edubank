async function usuarios() {
  let query = window.eduBankSupabase
    .from('profiles')
    .select('id, nombres, apellidos, dni, role, school_id, activo, balance, created_at')
    .order('nombres');

  if (me.role !== 'superadmin' && me.school_id) {
    query = query.eq('school_id', me.school_id);
  }

  const { data, error } = await query;
  if (error) return layout('Usuarios', `<div class="panel"><h2>Error</h2><p>${error.message}</p></div>`);

  window.usersListCache = data || [];

  return layout(
    'Usuarios',
    `
      <div class="panel" style="margin-bottom: 20px;">
        <h2 id="userFormTitle">Registrar Usuario con Acceso al Sistema</h2>
        <div style="display: grid; gap: 10px; margin-top: 15px;">
          <input type="hidden" id="editUserId" value="">
          <input type="text" id="uNombres" placeholder="Nombres" style="padding: 10px; border-radius: 8px; border: 1px solid #333; background: #111; color: #fff;">
          <input type="text" id="uApellidos" placeholder="Apellidos" style="padding: 10px; border-radius: 8px; border: 1px solid #333; background: #111; color: #fff;">
          <input type="text" id="uDni" placeholder="DNI" style="padding: 10px; border-radius: 8px; border: 1px solid #333; background: #111; color: #fff;">
          <input type="email" id="uEmail" placeholder="Correo electrónico (para acceso al login)" style="padding: 10px; border-radius: 8px; border: 1px solid #333; background: #111; color: #fff;">
          <input type="password" id="uPassword" placeholder="Contraseña provisional (mínimo 6 caracteres)" style="padding: 10px; border-radius: 8px; border: 1px solid #333; background: #111; color: #fff;">
          
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

          <select id="uActivo" style="padding: 10px; border-radius: 8px; border: 1px solid #333; background: #111; color: #fff;">
            <option value="true">Activo</option>
            <option value="false">Inactivo</option>
          </select>

          <div style="display: flex; gap: 10px;">
            <button class="primary" style="flex: 1;" onclick="saveUserWithAuth()" id="userBtnSubmit">+ Crear Usuario y Dar Acceso</button>
            <button id="cancelUserEdit" style="display:none; padding: 10px; border-radius: 8px; border: 1px solid #555; background: #333; color: #fff; cursor: pointer;" onclick="resetUserForm()">Cancelar</button>
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="paneltitle">
          <h2>Usuarios con acceso al sistema (${window.usersListCache.length})</h2>
        </div>
        ${window.usersListCache.map(p => `
          <div class="listrow" style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <b>${p.nombres || ''} ${p.apellidos || ''}</b>
              <small>Rol: ${p.role} · DNI: ${p.dni || '—'} · Colegio: ${schoolName(p.school_id)} · Saldo: ${money(p.balance || 0)} 🪙</small>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <span class="status" style="background: ${p.activo !== false ? 'rgba(16, 185, 129, 0.1); color: #34d399;' : 'rgba(239, 68, 68, 0.1); color: #ef4444;'}">
                ${p.activo !== false ? 'Activo' : 'Inactivo'}
              </span>
              <button onclick="editUser('${p.id}')" style="padding: 6px 12px; border-radius: 6px; background: #2563eb; color: #fff; border: none; cursor: pointer; font-size: 12px;">Editar</button>
            </div>
          </div>
        `).join('') || empty()}
      </div>
    `
  );
}
async function saveUserWithAuth() {
  const id = $('#editUserId').value;
  const nombres = $('#uNombres').value.trim();
  const apellidos = $('#uApellidos').value.trim();
  const dni = $('#uDni').value.trim();
  const email = $('#uEmail').value.trim();
  const password = $('#uPassword').value.trim();
  const role = $('#uRole').value;
  const school_id = $('#uSchool').value;
  const activo = $('#uActivo').value === 'true';

  if (!nombres || !apellidos || !dni) {
    return alert('Por favor, completa los campos de nombres, apellidos y DNI.');
  }

  // Si es un usuario NUEVO, exigimos correo y contraseña para darle acceso
  if (!id && (!email || !password)) {
    return alert('Para darle acceso directo al sistema, debes ingresar un correo y una contraseña provisional.');
  }

  if (id) {
    // Si estamos editando datos existentes en la tabla profiles
    const userData = { nombres, apellidos, dni, role, activo };
    if (school_id) userData.school_id = school_id;
    else userData.school_id = null;

    const { error } = await window.eduBankSupabase
      .from('profiles')
      .update(userData)
      .eq('id', id);

    if (error) return alert('Error al actualizar perfil: ' + error.message);
    alert('¡Usuario actualizado correctamente!');
  } else {
    // Si es NUEVO: Creamos el usuario en Supabase Auth para que tenga acceso al login
    // Nota: esto creará la cuenta de acceso y la trigger o inserción manejará el perfil
    const { data: authData, error: authError } = await window.eduBankSupabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          nombres,
          apellidos,
          dni,
          role,
          school_id: school_id || null
        }
      }
    });

    if (authError) {
      return alert('Error al crear credenciales de acceso: ' + authError.message);
    }

    // Por seguridad, aseguramos también la inserción directa en profiles usando el ID generado en Auth si lo devuelve
    if (authData && authData.user) {
      const newUserId = authData.user.id;
      await window.eduBankSupabase.from('profiles').upsert({
        id: newUserId,
        nombres,
        apellidos,
        dni,
        role,
        school_id: school_id || null,
        activo: true,
        balance: 0
      });
    }

    alert('¡Usuario creado con éxito! Ya puede iniciar sesión en EduBank con su correo y contraseña.');
  }

  resetUserForm();
  await loadGlobalData();
  render('usuarios');
}

function resetUserForm() {
  $('#editUserId').value = '';
  $('#uNombres').value = '';
  $('#uApellidos').value = '';
  $('#uDni').value = '';
  $('#uEmail').value = '';
  $('#uPassword').value = '';
  $('#uRole').value = 'docente';
  $('#uSchool').value = '';
  $('#uActivo').value = 'true';

  $('#userFormTitle').textContent = 'Registrar Usuario con Acceso al Sistema';
  $('#userBtnSubmit').textContent = '+ Crear Usuario y Dar Acceso';
  $('#cancelUserEdit').style.display = 'none';
}
/* =========================================================
   ENRUTADOR DE VISTAS (RENDER)
========================================================= */
async function render(view) {
  let contentHtml = '';

  if (me.role === 'alumno') {
    if (view === 'inicio' || view === 'cuenta') {
      contentHtml = studentHome();
    } else if (view === 'movimientos') {
      contentHtml = movementsView();
    } else {
      contentHtml = layout('Tienda', '<div class="panel"><h2>Tienda Escolar</h2><p>Módulo de canjes activo.</p></div>');
    }
  } else if (me.role === 'docente') {
    if (view === 'inicio') {
      contentHtml = adminHome();
    } else if (view === 'alumnos') {
      contentHtml = renderAlumnosList();
    } else if (view === 'recompensas') {
      contentHtml = rewardsView();
    } else if (view === 'movimientos') {
      contentHtml = movementsView();
    }
  } else {
    // Director o Superadmin
    if (view === 'inicio') {
      contentHtml = adminHome();
    } else if (view === 'colegios') {
      contentHtml = colegiosView();
    } else if (view === 'usuarios') {
      contentHtml = await usuarios(); // Carga la vista de usuarios que ya pegaste
    } else if (view === 'movimientos') {
      contentHtml = movementsView();
    } else if (view === 'reportes') {
      contentHtml = reportsView();
    } else {
      contentHtml = adminHome();
    }
  }

  const contentEl = $('#content');
  if (contentEl) contentEl.innerHTML = contentHtml;
}
function adminHome() {
  return `
    <div class="cards" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px;">
      <div class="stat" style="background: #1e293b; padding: 20px; border-radius: 8px;">
        <span>👥 TOTAL USUARIOS</span>
        <h3 style="font-size: 24px; margin: 5px 0 0 0;">${students.length}</h3>
      </div>
      <div class="stat" style="background: #1e293b; padding: 20px; border-radius: 8px;">
        <span>🏫 COLEGIOS EN RED</span>
        <h3 style="font-size: 24px; margin: 5px 0 0 0;">${schoolList.length}</h3>
      </div>
    </div>
    <div class="panel" style="background: #1e293b; padding: 20px; border-radius: 8px;">
      <h2>Bienvenido al Panel de Control</h2>
      <p style="color: #94a3b8;">Usa el menú lateral para gestionar los accesos, los colegios y los registros del sistema EduBank.</p>
    </div>
  `;
}

function studentHome() {
  return `
    <div class="panel" style="background: #1e293b; padding: 20px; border-radius: 8px;">
      <h2>Mi Cuenta Escolar</h2>
      <p>Saldo actual: <b>${money(me.balance || 0)} EduCoins 🪙</b></p>
    </div>
  `;
}

function renderAlumnosList() {
  return `
    <div class="panel" style="background: #1e293b; padding: 20px; border-radius: 8px;">
      <h2>Alumnos (${students.length})</h2>
      ${students.map(s => `
        <div class="listrow" style="padding: 10px 0; border-bottom: 1px solid #334155; display: flex; justify-content: space-between;">
          <div><b>${s.nombres || ''} ${s.apellidos || ''}</b> <small>(${s.dni || 'Sin DNI'})</small></div>
          <span>${money(s.balance || 0)} 🪙</span>
        </div>
      `).join('') || empty()}
    </div>
  `;
}

function colegiosView() {
  return `
    <div class="panel" style="background: #1e293b; padding: 20px; border-radius: 8px;">
      <h2>Colegios Registrados (${schoolList.length})</h2>
      ${schoolList.map(s => `
        <div class="listrow" style="padding: 10px 0; border-bottom: 1px solid #334155;">
          <b>${s.name}</b> <small>ID: ${s.id}</small>
        </div>
      `).join('') || empty()}
    </div>
  `;
}

function movementsView() {
  return `
    <div class="panel" style="background: #1e293b; padding: 20px; border-radius: 8px;">
      <h2>Historial de Movimientos</h2>
      <p style="color: #94a3b8;">No hay movimientos recientes registrados en este módulo.</p>
    </div>
  `;
}

function reportsView() {
  return `
    <div class="panel" style="background: #1e293b; padding: 20px; border-radius: 8px;">
      <h2>Reportes del Sistema</h2>
      <p style="color: #94a3b8;">Estadísticas generales de EduBank activas.</p>
    </div>
  `;
}

function rewardsView() {
  return `
    <div class="panel" style="background: #1e293b; padding: 20px; border-radius: 8px;">
      <h2>Entregar Recompensas</h2>
      <p style="color: #94a3b8;">Módulo de asignación de EduCoins a estudiantes.</p>
    </div>
  `;
}
function colegiosView() {
  return `
    <div class="panel" style="background: #1e293b; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
      <h2 id="schoolFormTitle">Registrar Nuevo Colegio</h2>
      <div style="display: grid; gap: 10px; margin-top: 15px;">
        <input type="hidden" id="editSchoolId" value="">
        <input type="text" id="schoolName" placeholder="Nombre del colegio" style="padding: 10px; border-radius: 6px; border: 1px solid #334155; background: #0f172a; color: #fff;">
        <input type="text" id="schoolCode" placeholder="Código modular o abreviatura" style="padding: 10px; border-radius: 6px; border: 1px solid #334155; background: #0f172a; color: #fff;">
        
        <select id="schoolActivo" style="padding: 10px; border-radius: 6px; border: 1px solid #334155; background: #0f172a; color: #fff;">
          <option value="true">Activo</option>
          <option value="false">Inactivo</option>
        </select>

        <div style="display: flex; gap: 10px;">
          <button class="primary" style="flex: 1; padding: 10px; border-radius: 6px; border: none; background: #0284c7; color: white; font-weight: bold; cursor: pointer;" onclick="saveSchoolSubmit()" id="schoolBtnSubmit">+ Crear Colegio</button>
          <button id="cancelSchoolEdit" style="display:none; padding: 10px; border-radius: 6px; border: 1px solid #475569; background: #334155; color: #fff; cursor: pointer;" onclick="resetSchoolForm()">Cancelar</button>
        </div>
      </div>
    </div>

    <div class="panel" style="background: #1e293b; padding: 20px; border-radius: 8px;">
      <h2>Colegios Registrados en el Sistema (${schoolList.length})</h2>
      <div style="margin-top: 15px;">
        ${schoolList.map(s => `
          <div class="listrow" style="padding: 12px 0; border-bottom: 1px solid #334155; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <b style="font-size: 16px;">${s.name}</b><br>
              <small style="color: #94a3b8;">Código: ${s.code || '—'} · ID: ${s.id}</small>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <span class="status" style="padding: 4px 8px; border-radius: 4px; font-size: 12px; background: ${s.activo !== false ? 'rgba(16, 185, 129, 0.1); color: #34d399;' : 'rgba(239, 68, 68, 0.1); color: #ef4444;'}">
                ${s.activo !== false ? 'Activo' : 'Inactivo'}
              </span>
              <button onclick="editSchool('${s.id}')" style="padding: 6px 12px; border-radius: 6px; background: #2563eb; color: #fff; border: none; cursor: pointer; font-size: 12px;">Editar</button>
            </div>
          </div>
        `).join('') || empty()}
      </div>
    </div>
  `;
}
function editSchool(id) {
  const s = schoolList.find(item => item.id === id);
  if (!s) return;

  $('#editSchoolId').value = s.id;
  $('#schoolName').value = s.name || '';
  $('#schoolCode').value = s.code || '';
  $('#schoolActivo').value = String(s.activo !== false);

  $('#schoolFormTitle').textContent = `Editar Colegio: ${s.name}`;
  $('#schoolBtnSubmit').textContent = '💾 Actualizar Colegio';
  $('#cancelSchoolEdit').style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetSchoolForm() {
  $('#editSchoolId').value = '';
  $('#schoolName').value = '';
  $('#schoolCode').value = '';
  $('#schoolActivo').value = 'true';

  $('#schoolFormTitle').textContent = 'Registrar Nuevo Colegio';
  $('#schoolBtnSubmit').textContent = '+ Crear Colegio';
  $('#cancelSchoolEdit').style.display = 'none';
}

async function saveSchoolSubmit() {
  const id = $('#editSchoolId').value;
  const name = $('#schoolName').value.trim();
  const code = $('#schoolCode').value.trim();
  const activo = $('#schoolActivo').value === 'true';

  if (!name || !code) {
    return alert('Por favor, ingresa el nombre y el código del colegio.');
  }

  const schoolData = { name, code, activo };

  let error;
  if (id) {
    // Actualizar colegio existente
    const res = await window.eduBankSupabase
      .from('schools')
      .update(schoolData)
      .eq('id', id);
    error = res.error;
  } else {
    // Insertar nuevo colegio
    const res = await window.eduBankSupabase
      .from('schools')
      .insert([schoolData]);
    error = res.error;
  }

  if (error) {
    return alert('Error al guardar el colegio: ' + error.message);
  }

  alert(id ? '¡Colegio actualizado correctamente!' : '¡Colegio creado con éxito!');
  resetSchoolForm();
  await loadGlobalData(); // Recarga las listas globales
  render('colegios');      // Vuelve a pintar la vista
}
} else if (view === 'colegios') {
  contentHtml = colegiosView();
}
