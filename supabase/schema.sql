-- Pizarra Hockey 3D: tabla de planteos tácticos en la nube (SIN login).
-- Pegá todo esto en Supabase → SQL Editor → New query → Run.
-- Ojo: cualquiera con la app (la clave es pública) puede ver, editar y borrar los planteos.

create table if not exists public.proyectos (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null default 'Sin nombre',
  datos       jsonb not null,
  creado      timestamptz not null default now(),
  actualizado timestamptz not null default now()
);

-- (si la tabla venía de la versión con login, se quitan las reglas por usuario y la columna user_id)
drop policy if exists "ver los propios"    on public.proyectos;
drop policy if exists "crear los propios"  on public.proyectos;
drop policy if exists "editar los propios" on public.proyectos;
drop policy if exists "borrar los propios" on public.proyectos;
alter table public.proyectos drop column if exists user_id;

create index if not exists proyectos_act_idx on public.proyectos (actualizado desc);

alter table public.proyectos enable row level security;
drop policy if exists "acceso publico" on public.proyectos;
create policy "acceso publico" on public.proyectos for all to anon, authenticated using (true) with check (true);

create or replace function public.proyectos_touch() returns trigger language plpgsql as $$
begin new.actualizado := now(); return new; end $$;

drop trigger if exists proyectos_touch on public.proyectos;
create trigger proyectos_touch before update on public.proyectos
  for each row execute function public.proyectos_touch();
