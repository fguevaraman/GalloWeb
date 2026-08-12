-- ============================================================
--  GALLO · Configuración de base de datos en Supabase
--  Pegá y ejecutá TODO esto en:  Supabase → SQL Editor → New query
-- ============================================================

-- 1) Tabla de productos
create table if not exists public.productos (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  descripcion text,
  precio      numeric,
  imagenes    text[] default '{}',          -- hasta 3 URLs de imágenes
  created_at  timestamptz default now()
);

-- 2) Row Level Security
alter table public.productos enable row level security;

-- Cualquiera puede LEER el catálogo (sitio público)
create policy "Lectura pública de productos"
  on public.productos for select
  using (true);

-- Solo usuarios autenticados pueden crear / editar / borrar
create policy "Admin puede insertar"
  on public.productos for insert
  to authenticated with check (true);

create policy "Admin puede actualizar"
  on public.productos for update
  to authenticated using (true) with check (true);

create policy "Admin puede borrar"
  on public.productos for delete
  to authenticated using (true);

-- 3) Bucket de Storage para las imágenes (público para lectura)
insert into storage.buckets (id, name, public)
values ('productos', 'productos', true)
on conflict (id) do nothing;

-- Lectura pública de las imágenes
create policy "Imágenes: lectura pública"
  on storage.objects for select
  using (bucket_id = 'productos');

-- Subida / borrado solo para autenticados
create policy "Imágenes: subida autenticada"
  on storage.objects for insert
  to authenticated with check (bucket_id = 'productos');

create policy "Imágenes: borrado autenticado"
  on storage.objects for delete
  to authenticated using (bucket_id = 'productos');

-- ============================================================
--  Listo. Ahora creá el usuario administrador en:
--  Supabase → Authentication → Users → Add user
--  (email + contraseña). Con ese usuario se entra a admin.html
-- ============================================================
