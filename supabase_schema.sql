-- EDU BANK 2.0 - esquema inicial REAL para Supabase
-- Ejecutar en Supabase > SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique not null,
  city text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  dni text unique,
  role text not null check (role in ('superadmin','director','docente','alumno')),
  school_id uuid references public.schools(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  level text not null,
  teacher_id uuid references public.profiles(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  school_id uuid not null references public.schools(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  balance integer not null default 0 check (balance >= 0),
  xp integer not null default 0 check (xp >= 0),
  goal integer not null default 500 check (goal >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  type text not null check (type in ('in','out')),
  title text not null,
  meta text,
  amount integer not null check (amount <> 0),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  name text not null,
  cost integer not null check (cost > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  amount integer not null check (amount > 0),
  total integer not null check (total >= amount),
  paid integer not null default 0,
  status text not null default 'activo' check (status in ('activo','pagado','cancelado')),
  created_at timestamptz not null default now()
);

create or replace function public.my_profile()
returns public.profiles
language sql stable security definer set search_path=public
as $$ select p.* from public.profiles p where p.id=auth.uid() limit 1 $$;

create or replace function public.my_role()
returns text language sql stable security definer set search_path=public
as $$ select role from public.profiles where id=auth.uid() $$;

create or replace function public.my_school_id()
returns uuid language sql stable security definer set search_path=public
as $$ select school_id from public.profiles where id=auth.uid() $$;

alter table public.schools enable row level security;
alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.transactions enable row level security;
alter table public.purchases enable row level security;
alter table public.loans enable row level security;

-- Limpiar políticas antiguas con los mismos nombres

do $$ declare r record; begin
 for r in select policyname, tablename from pg_policies where schemaname='public' and tablename in ('schools','profiles','classes','students','transactions','purchases','loans') loop
   execute format('drop policy if exists %I on public.%I',r.policyname,r.tablename);
 end loop;
end $$;

create policy profiles_select on public.profiles for select to authenticated using (id=auth.uid() or my_role()='superadmin' or (school_id=my_school_id() and my_role() in ('director','docente')));
create policy profiles_update_self on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());
create policy profiles_admin on public.profiles for all to authenticated using (my_role()='superadmin') with check (my_role()='superadmin');

create policy schools_select on public.schools for select to authenticated using (my_role()='superadmin' or id=my_school_id());
create policy schools_admin on public.schools for all to authenticated using (my_role()='superadmin') with check (my_role()='superadmin');

create policy classes_select on public.classes for select to authenticated using (my_role()='superadmin' or school_id=my_school_id());
create policy classes_admin on public.classes for all to authenticated using (my_role() in ('superadmin','director') and (my_role()='superadmin' or school_id=my_school_id())) with check (my_role()='superadmin' or school_id=my_school_id());

create policy students_select on public.students for select to authenticated using (
  my_role()='superadmin' or school_id=my_school_id() or (my_role()='alumno' and profile_id=auth.uid())
);
create policy students_update on public.students for update to authenticated using (
  my_role()='superadmin' or (school_id=my_school_id() and my_role() in ('director','docente')) or profile_id=auth.uid()
) with check (my_role()='superadmin' or school_id=my_school_id());
create policy students_insert on public.students for insert to authenticated with check (my_role() in ('superadmin','director') and (my_role()='superadmin' or school_id=my_school_id()));

create policy transactions_select on public.transactions for select to authenticated using (
  my_role()='superadmin' or exists(select 1 from public.students s where s.id=student_id and (s.school_id=my_school_id() or s.profile_id=auth.uid()))
);
create policy transactions_insert on public.transactions for insert to authenticated with check (
  my_role() in ('superadmin','director','docente') and exists(select 1 from public.students s where s.id=student_id and (my_role()='superadmin' or s.school_id=my_school_id()))
  or (my_role()='alumno' and exists(select 1 from public.students s where s.id=student_id and s.profile_id=auth.uid()))
);

create policy purchases_all on public.purchases for all to authenticated using (
  my_role()='superadmin' or exists(select 1 from public.students s where s.id=student_id and (s.school_id=my_school_id() or s.profile_id=auth.uid()))
) with check (
  my_role()='superadmin' or exists(select 1 from public.students s where s.id=student_id and (s.school_id=my_school_id() or s.profile_id=auth.uid()))
);
create policy loans_all on public.loans for all to authenticated using (
  my_role()='superadmin' or exists(select 1 from public.students s where s.id=student_id and (s.school_id=my_school_id() or s.profile_id=auth.uid()))
) with check (
  my_role()='superadmin' or exists(select 1 from public.students s where s.id=student_id and (s.school_id=my_school_id() or s.profile_id=auth.uid()))
);

-- Permisos Data API
 grant select, insert, update, delete on public.schools, public.profiles, public.classes, public.students, public.transactions, public.purchases, public.loans to authenticated;
 grant usage on schema public to authenticated;

-- Trigger: crear perfil mínimo al registrar un usuario. Se puede editar el rol/colegio desde SQL o un panel admin.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public
as $$ begin
 insert into public.profiles(id,full_name,role) values (new.id,coalesce(new.raw_user_meta_data->>'full_name',split_part(new.email,'@',1)),'alumno') on conflict (id) do nothing;
 return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Operaciones atómicas para EduCoins (evita modificar saldo desde el navegador sin control)
create or replace function public.grant_educoins(p_student uuid, p_amount integer, p_title text, p_meta text default null)
returns public.students language plpgsql security definer set search_path=public
as $$ declare v public.students; begin
 if p_amount <= 0 then raise exception 'El monto debe ser positivo'; end if;
 select s.* into v from public.students s where s.id=p_student for update;
 if not found then raise exception 'Alumno no encontrado'; end if;
 if my_role() not in ('superadmin','director','docente') then raise exception 'No autorizado'; end if;
 if my_role()<>'superadmin' and v.school_id<>my_school_id() then raise exception 'Alumno fuera del colegio'; end if;
 update public.students set balance=balance+p_amount, xp=xp+greatest(5,least(50,p_amount/10)) where id=p_student returning * into v;
 insert into public.transactions(student_id,type,title,meta,amount,created_by) values(p_student,'in',p_title,p_meta,p_amount,auth.uid());
 return v;
end $$;

grant execute on function public.grant_educoins(uuid,integer,text,text) to authenticated;

create or replace function public.spend_educoins(p_student uuid, p_amount integer, p_title text, p_meta text default null)
returns public.students language plpgsql security definer set search_path=public
as $$ declare v public.students; begin
 if p_amount <= 0 then raise exception 'El monto debe ser positivo'; end if;
 select s.* into v from public.students s where s.id=p_student for update;
 if not found then raise exception 'Alumno no encontrado'; end if;
 if v.profile_id<>auth.uid() and my_role()<>'superadmin' then raise exception 'No autorizado'; end if;
 if v.balance < p_amount then raise exception 'Saldo insuficiente'; end if;
 update public.students set balance=balance-p_amount where id=p_student returning * into v;
 insert into public.transactions(student_id,type,title,meta,amount,created_by) values(p_student,'out',p_title,p_meta,-p_amount,auth.uid());
 return v;
end $$;

grant execute on function public.spend_educoins(uuid,integer,text,text) to authenticated;
