# EduBank 2.0 – conexión real

La versión anterior mostraba los botones pero `addStudent()` y `addClass()` eran marcadores. Esta versión habilita el alta de colegios y usuarios reales.

## 1. SQL
Ejecuta `supabase_schema.sql` en SQL Editor si todavía no lo hiciste.

## 2. Edge Function obligatoria para crear usuarios
Crear usuarios de Auth requiere una operación de servidor; la `service_role`/secret key nunca debe ir en el navegador. Supabase recomienda `auth.admin.createUser()` únicamente en servidor.

Crea una Edge Function llamada `admin-create-user` y pega el contenido de:
`supabase/functions/admin-create-user/index.ts`

Puedes crearla desde **Supabase → Edge Functions → Create function** y desplegarla desde el Dashboard.

La función usa el JWT del SuperAdmin para autorizar la operación y usa la clave privilegiada solo en el entorno de la función.

## 3. Secretos de la función
En la función deben estar disponibles:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (o la clave secreta equivalente del entorno; nunca en el HTML/JS)
- `SUPABASE_PUBLISHABLE_KEY` si tu entorno no la proporciona automáticamente

## 4. Primer SuperAdmin
El usuario con el que ya estás entrando debe tener en `public.profiles`:
`role = 'superadmin'`.

## 5. Uso
En EduBank:
- SuperAdmin → **Colegios** → `+ Colegio`
- SuperAdmin → **Usuarios** → `+ Usuario`

Los usuarios se crean en Supabase Auth y su perfil se enlaza a `public.profiles`. Si el rol es `alumno`, también se crea su cuenta en `public.students`.
