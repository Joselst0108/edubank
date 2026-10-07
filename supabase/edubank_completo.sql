-- ============================================================
-- EDUBANK · SQL COMPLETO PARA SUPABASE (pegar todo y pulsar Run)
-- Incluye: esquema multicolegio + seguridad + funciones + superadmin
-- ============================================================

-- EduBank multi-colegio (multitenant) · Pegar completo en Supabase > SQL Editor > Run
create extension if not exists pgcrypto;

create table colegios(id uuid primary key default gen_random_uuid(), nombre text not null, plan text not null default 'prueba', activo boolean not null default true, creado timestamptz default now());
create table aulas(id uuid primary key default gen_random_uuid(), colegio_id uuid not null references colegios on delete cascade, nombre text not null, nivel text not null check (nivel in ('Inicial','Primaria','Secundaria')));
create table perfiles(id uuid primary key references auth.users on delete cascade, colegio_id uuid references colegios on delete cascade, rol text not null check (rol in ('superadmin','admin','docente','estudiante')), nombres text not null, apellidos text default '', aula_id uuid references aulas, ahorro numeric(12,2) not null default 0 check (ahorro>=0), puntos int not null default 0 check (puntos>=0), meta jsonb);
create table tesoreria(colegio_id uuid primary key references colegios on delete cascade, saldo numeric(12,2) not null default 0 check (saldo>=0));
create table config(colegio_id uuid primary key references colegios on delete cascade, ranking boolean default true, mercado boolean default true, prestamos boolean default true, prestamo_max numeric(12,2) default 200, inicial numeric(12,2) default 0, bono_ahorro numeric(4,2) default 5, interes_secundaria numeric(4,2) default 0, tope_docente_mes numeric(12,2) default 500);
create table movimientos(id uuid primary key default gen_random_uuid(), colegio_id uuid not null references colegios, estudiante_id uuid not null references perfiles, tipo text not null, monto numeric(12,2) not null check (monto<>0), saldo_anterior numeric(12,2) not null, saldo_posterior numeric(12,2) not null check (saldo_posterior>=0), motivo text not null, hecho_por uuid references perfiles, clave text not null, creado timestamptz not null default now(), unique (colegio_id,clave));
create table recompensas(id uuid primary key default gen_random_uuid(), colegio_id uuid not null references colegios, icono text default '🎁', nombre text not null, costo numeric(12,2) not null check (costo>0), activa boolean default true);
create table canjes(id uuid primary key default gen_random_uuid(), colegio_id uuid not null references colegios, estudiante_id uuid not null references perfiles, recompensa_id uuid references recompensas, nombre text, costo numeric(12,2), estado text default 'pendiente' check (estado in ('pendiente','entregado')), creado timestamptz default now());
create table prestamos(id uuid primary key default gen_random_uuid(), colegio_id uuid not null references colegios, estudiante_id uuid not null references perfiles, monto numeric(12,2) not null check (monto>0), motivo text, dias int not null check (dias>0), estado text default 'pendiente' check (estado in ('pendiente','activo','pagado','rechazado')), vence timestamptz, creado timestamptz default now());
create table retos(id uuid primary key default gen_random_uuid(), colegio_id uuid not null references colegios, nombre text not null, premio numeric(12,2) not null check (premio>=0), puntos int default 0, activo boolean default true);

create index on movimientos(colegio_id, estudiante_id, creado desc);
create index on perfiles(colegio_id, rol);

-- Cada colegio nuevo recibe su Tesorería y su configuración
create function colegio_nuevo() returns trigger language plpgsql as $$ begin insert into tesoreria(colegio_id) values(new.id); insert into config(colegio_id) values(new.id); return new; end $$;
create trigger t_colegio_nuevo after insert on colegios for each row execute function colegio_nuevo();

-- Ayudantes de seguridad
create function mi_colegio() returns uuid language sql stable security definer set search_path=public as $$ select colegio_id from perfiles where id=auth.uid() $$;
create function mi_rol() returns text language sql stable security definer set search_path=public as $$ select rol from perfiles where id=auth.uid() $$;

-- RLS: cada usuario solo ve datos de SU colegio
do $$ declare t text; begin
 foreach t in array array['aulas','perfiles','tesoreria','config','movimientos','recompensas','canjes','prestamos','retos'] loop
  execute format('alter table %I enable row level security', t);
 end loop;
 foreach t in array array['aulas','tesoreria','config','recompensas','retos'] loop
  execute format('create policy "%1$s_leer" on %1$I for select using (colegio_id=mi_colegio())', t);
 end loop;
 foreach t in array array['aulas','recompensas','retos'] loop
  execute format('create policy "%1$s_escribir" on %1$I for all using (colegio_id=mi_colegio() and mi_rol() in (''admin'',''docente'')) with check (colegio_id=mi_colegio() and mi_rol() in (''admin'',''docente''))', t);
 end loop;
 foreach t in array array['movimientos','canjes','prestamos'] loop
  execute format('create policy "%1$s_leer" on %1$I for select using (colegio_id=mi_colegio() and (mi_rol() in (''admin'',''docente'') or estudiante_id=auth.uid()))', t);
 end loop;
end $$;
create policy perfiles_leer on perfiles for select using (id=auth.uid() or (colegio_id=mi_colegio() and mi_rol() in ('admin','docente')));
create policy config_admin on config for update using (colegio_id=mi_colegio() and mi_rol()='admin');
create policy prestamos_pedir on prestamos for insert with check (colegio_id=mi_colegio() and estudiante_id=auth.uid() and estado='pendiente');
-- Nadie escribe movimientos ni saldos directamente: solo las funciones de abajo.

-- ENTREGAR / RETIRAR EDUSOLES (atómico, idempotente, sin dinero de la nada)
create function entregar_edusoles(p_est uuid, p_tipo text, p_monto numeric, p_motivo text, p_clave text)
returns movimientos language plpgsql security definer set search_path=public as $$
declare c uuid:=mi_colegio(); v_ant numeric; m movimientos; v_sal boolean:= p_tipo in ('Retiro','Reposición');
begin
 if mi_rol() not in ('admin','docente') then raise exception 'Sin permiso'; end if;
 if p_tipo not in ('Premio','Bono','Participación','Asistencia','Tarea','Logro','Conducta','Incentivo','Otro','Retiro','Reposición') then raise exception 'Tipo inválido'; end if;
 if p_monto is null or p_monto<=0 or p_monto>10000 then raise exception 'Cantidad inválida'; end if;
 if coalesce(trim(p_motivo),'')='' then raise exception 'Falta el motivo'; end if;
 select * into m from movimientos where colegio_id=c and clave=p_clave; if found then return m; end if;
 perform 1 from perfiles where id=p_est and colegio_id=c and rol='estudiante' for update;
 if not found then raise exception 'Estudiante inválido'; end if;
 select coalesce(sum(monto),0) into v_ant from movimientos where estudiante_id=p_est;
 if v_sal then
   if p_tipo='Reposición' and p_monto>v_ant*0.25 then raise exception 'La reposición no puede superar el 25%% del saldo'; end if;
   if p_monto > v_ant-(select ahorro from perfiles where id=p_est) then raise exception 'Saldo disponible insuficiente'; end if;
   update tesoreria set saldo=saldo+p_monto where colegio_id=c;
 else
   update tesoreria set saldo=saldo-p_monto where colegio_id=c and saldo>=p_monto;
   if not found then raise exception 'Tesorería sin fondos suficientes'; end if;
 end if;
 insert into movimientos(colegio_id,estudiante_id,tipo,monto,saldo_anterior,saldo_posterior,motivo,hecho_por,clave)
 values(c,p_est,p_tipo,case when v_sal then -p_monto else p_monto end,v_ant,v_ant+case when v_sal then -p_monto else p_monto end,p_motivo,auth.uid(),p_clave) returning * into m;
 return m;
end $$;

-- COMPRAR EN EDUMARKET (estudiante)
create function comprar_recompensa(p_recompensa uuid, p_clave text)
returns canjes language plpgsql security definer set search_path=public as $$
declare c uuid:=mi_colegio(); r recompensas; v_ant numeric; v_ah numeric; k canjes;
begin
 if mi_rol()<>'estudiante' then raise exception 'Solo estudiantes'; end if;
 if not (select mercado from config where colegio_id=c) then raise exception 'EduMarket desactivado'; end if;
 select * into r from recompensas where id=p_recompensa and colegio_id=c and activa; if not found then raise exception 'Recompensa no disponible'; end if;
 if exists(select 1 from movimientos where colegio_id=c and clave=p_clave) then raise exception 'Operación duplicada'; end if;
 select ahorro into v_ah from perfiles where id=auth.uid() for update;
 select coalesce(sum(monto),0) into v_ant from movimientos where estudiante_id=auth.uid();
 if r.costo > v_ant-v_ah then raise exception 'Saldo disponible insuficiente'; end if;
 insert into movimientos(colegio_id,estudiante_id,tipo,monto,saldo_anterior,saldo_posterior,motivo,hecho_por,clave)
 values(c,auth.uid(),'Compra',-r.costo,v_ant,v_ant-r.costo,'Compra de recompensa: '||r.nombre,auth.uid(),p_clave);
 update tesoreria set saldo=saldo+r.costo where colegio_id=c;
 insert into canjes(colegio_id,estudiante_id,recompensa_id,nombre,costo) values(c,auth.uid(),r.id,r.nombre,r.costo) returning * into k;
 return k;
end $$;

revoke all on function entregar_edusoles, comprar_recompensa from public;
grant execute on function entregar_edusoles, comprar_recompensa to authenticated;

-- Vista segura de ranking (solo puntos, nunca saldos)
create view ranking as select colegio_id, id, nombres, puntos from perfiles where rol='estudiante' and colegio_id=mi_colegio();
grant select on ranking to authenticated;

-- ALTA DE UN COLEGIO CLIENTE (ejecutar tú como dueño del SaaS):
-- insert into colegios(nombre,plan) values('I.E.P. Corazón de Santa María','pro') returning id;
-- update tesoreria set saldo=10000 where colegio_id='<id>';
-- Más fácil: usa superadmin.sql (crear_colegio, ajustar_fondos, crear_perfil).


-- EduBank · Superadmin (llave maestra). Ejecutar DESPUÉS de schema.sql, en SQL Editor > Run.

create function es_super() returns boolean language sql stable security definer set search_path=public as
$$ select coalesce((select rol='superadmin' from perfiles where id=auth.uid()),false) $$;

-- Seguridad que faltaba: la tabla colegios ahora también está protegida
alter table colegios enable row level security;
create policy colegios_leer on colegios for select using (es_super() or id=mi_colegio());
create policy colegios_super on colegios for all using (es_super()) with check (es_super());

-- El superadmin puede LEER todos los datos de todos los colegios
do $$ declare t text; begin
 foreach t in array array['aulas','perfiles','tesoreria','config','movimientos','recompensas','canjes','prestamos','retos'] loop
  execute format('create policy "%1$s_super_leer" on %1$I for select using (es_super())', t);
 end loop;
end $$;
create policy config_super on config for update using (es_super());

-- Registro de cada emisión de EduSoles hacia un colegio (nada nace sin rastro)
create table emisiones(id uuid primary key default gen_random_uuid(), colegio_id uuid not null references colegios, monto numeric(12,2) not null check (monto<>0), motivo text, hecho_por uuid references perfiles, creado timestamptz default now());
alter table emisiones enable row level security;
create policy emisiones_super on emisiones for select using (es_super());

-- Crear un colegio cliente (con su Tesorería inicial)
create function crear_colegio(p_nombre text, p_plan text default 'prueba', p_fondo numeric default 0)
returns uuid language plpgsql security definer set search_path=public as $$
declare v uuid;
begin
 if not es_super() then raise exception 'Solo el superadmin'; end if;
 if coalesce(trim(p_nombre),'')='' or p_fondo<0 then raise exception 'Datos inválidos'; end if;
 insert into colegios(nombre,plan) values(trim(p_nombre),p_plan) returning id into v;
 if p_fondo>0 then
  update tesoreria set saldo=p_fondo where colegio_id=v;
  insert into emisiones(colegio_id,monto,motivo,hecho_por) values(v,p_fondo,'Fondo inicial',auth.uid());
 end if;
 return v;
end $$;

-- Cargar (o reducir) fondos de la Tesorería de un colegio
create function ajustar_fondos(p_colegio uuid, p_monto numeric, p_motivo text)
returns numeric language plpgsql security definer set search_path=public as $$
declare n numeric;
begin
 if not es_super() then raise exception 'Solo el superadmin'; end if;
 if p_monto is null or p_monto=0 or coalesce(trim(p_motivo),'')='' then raise exception 'Datos inválidos'; end if;
 update tesoreria set saldo=saldo+p_monto where colegio_id=p_colegio returning saldo into n;
 if not found then raise exception 'Colegio no existe'; end if;
 insert into emisiones(colegio_id,monto,motivo,hecho_por) values(p_colegio,p_monto,p_motivo,auth.uid());
 return n;
end $$;

-- Crear el perfil de un usuario ya creado en Authentication.
-- Superadmin: cualquier colegio y rol. Admin de colegio: solo docentes/estudiantes de SU colegio.
create function crear_perfil(p_id uuid, p_colegio uuid, p_rol text, p_nombres text, p_apellidos text default '', p_aula uuid default null)
returns void language plpgsql security definer set search_path=public as $$
begin
 if es_super() then null;
 elsif mi_rol()='admin' and p_colegio=mi_colegio() and p_rol in ('docente','estudiante') then null;
 else raise exception 'Sin permiso'; end if;
 if p_rol='superadmin' and not es_super() then raise exception 'Sin permiso'; end if;
 if p_rol<>'superadmin' and p_colegio is null then raise exception 'Falta el colegio'; end if;
 insert into perfiles(id,colegio_id,rol,nombres,apellidos,aula_id) values(p_id,case when p_rol='superadmin' then null else p_colegio end,p_rol,p_nombres,p_apellidos,p_aula);
end $$;

revoke all on function crear_colegio, ajustar_fondos, crear_perfil from public;
grant execute on function crear_colegio, ajustar_fondos, crear_perfil to authenticated;

-- PRIMER SUPERADMIN (una sola vez):
-- 1) Authentication > Users > Add user (tu correo). Copia su UUID.
-- 2) Ejecuta:
-- insert into perfiles(id,rol,nombres) values('<TU-UUID>','superadmin','Dueño EduBank');
-- Desde ahí: select crear_colegio('I.E.P. Corazón de Santa María','pro',10000);
