# EduBank — Banco escolar multicolegio

Los EduSoles (E$) NO son dinero real. Cada colegio es un "tenant" aislado por Row Level Security.

## Estructura
```
edubank/
├── index.html        (app conectada a Supabase)
├── config.js         (URL y clave anon de Supabase)
├── demo.html         (prototipo con datos locales)
├── netlify.toml
├── README.md
└── supabase/
    ├── edubank_completo.sql   (ejecutar primero)
    └── conexion.sql           (ejecutar después)
```

## PASO 1 — Supabase
1. Crea cuenta en supabase.com → **New project**.
2. Abre **SQL Editor** → pega todo `supabase/schema.sql` → **Run**. Luego pega `supabase/conexion.sql` → **Run**. (`schema.sql` y `superadmin.sql` ya están dentro de `edubank_completo.sql`; no los ejecutes otra vez.)
3. En **Project Settings → API** copia `Project URL` y la clave `anon public` (es pública por diseño; la protege RLS). **Nunca** pongas la clave `service_role` en el código.

## PASO 2 — GitHub
1. Crea cuenta en github.com → **New repository** → nombre `edubank` (privado).
2. **Add file → Upload files** → sube la carpeta completa → **Commit**.

## PASO 3 — Netlify
1. netlify.com → **Add new site → Import from GitHub** → elige `edubank`.
2. Build command: vacío · Publish directory: `.` → **Deploy**.
3. Cada cambio que subas a GitHub se publica solo.

## Roles
- **Superadmin**: dueño del producto, sin colegio, ve y crea todos los colegios.
- **Admin / Docente / Estudiante**: pertenecen a un colegio.

## Alta de un colegio cliente
Como superadmin: `select crear_colegio('Nombre','pro',10000);` y luego `crear_perfil(...)` para sus usuarios (ver el final de `superadmin.sql`).

## Estado
- [x] Esquema multitenant, RLS, funciones atómicas (entregar, retirar, comprar)
- [x] Interfaz conectada: login, superadmin, Tesorería, entregas, movimientos, EduMarket
- [ ] Pasar ahorro, metas, retos, logros y reportes a Supabase
- [ ] Préstamos, retos y ahorro como funciones SQL
- [ ] Login real (correo/DNI) en lugar de cuentas demo
