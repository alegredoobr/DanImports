-- =====================================================================
-- CATÁLOGO DE PERFUMES — esquema do Supabase
-- Cole este arquivo inteiro no SQL Editor do Supabase e execute (Run).
-- Pode ser executado de novo sem problemas (é idempotente).
-- =====================================================================

-- ---------- Administradores ----------
-- Só quem estiver nesta tabela pode alterar dados. A tabela tem RLS ativo e NENHUMA
-- policy, então ninguém consegue lê-la ou alterá-la pela API; você a preenche
-- manualmente pelo SQL Editor (veja o README, passo "Criar o administrador").
create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------- Produtos ----------
create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null check (char_length(btrim(name)) between 1 and 200),
  price_cents integer not null check (price_cents >= 0),
  category    text not null check (category in ('masculino', 'feminino', 'unissex', 'cuidados')),
  available   boolean not null default true,   -- false = "Indisponível" (continua visível)
  visible     boolean not null default true,   -- false = oculto da vitrine
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists products_touch_updated_at on public.products;
create trigger products_touch_updated_at
  before update on public.products
  for each row execute function public.touch_updated_at();

-- ---------- Imagens dos produtos ----------
-- "position" define a ordem; a imagem de position mais baixa é a principal.
create table if not exists public.product_images (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  path       text not null,                    -- caminho no bucket "product-images"
  position   integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists product_images_product_idx
  on public.product_images (product_id, position);

-- ---------- Configurações da loja (uma única linha) ----------
create table if not exists public.store_settings (
  id         integer primary key default 1 check (id = 1),
  store_name text not null default 'Catálogo de Perfumes',
  logo_path  text,
  whatsapp   text check (whatsapp is null or whatsapp ~ '^[0-9]{10,15}$'),  -- só dígitos, com DDI
  updated_at timestamptz not null default now()
);
insert into public.store_settings (id) values (1) on conflict (id) do nothing;

drop trigger if exists store_settings_touch_updated_at on public.store_settings;
create trigger store_settings_touch_updated_at
  before update on public.store_settings
  for each row execute function public.touch_updated_at();

-- ---------- Row Level Security ----------
alter table public.products       enable row level security;
alter table public.product_images enable row level security;
alter table public.store_settings enable row level security;

-- products: visitantes veem só os visíveis; administrador vê e altera tudo
drop policy if exists "products_select" on public.products;
create policy "products_select" on public.products
  for select using (visible = true or public.is_admin());

drop policy if exists "products_insert" on public.products;
create policy "products_insert" on public.products
  for insert with check (public.is_admin());

drop policy if exists "products_update" on public.products;
create policy "products_update" on public.products
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "products_delete" on public.products;
create policy "products_delete" on public.products
  for delete using (public.is_admin());

-- product_images: visitantes veem só imagens de produtos visíveis
drop policy if exists "product_images_select" on public.product_images;
create policy "product_images_select" on public.product_images
  for select using (
    public.is_admin()
    or exists (select 1 from public.products p where p.id = product_id and p.visible)
  );

drop policy if exists "product_images_insert" on public.product_images;
create policy "product_images_insert" on public.product_images
  for insert with check (public.is_admin());

drop policy if exists "product_images_update" on public.product_images;
create policy "product_images_update" on public.product_images
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "product_images_delete" on public.product_images;
create policy "product_images_delete" on public.product_images
  for delete using (public.is_admin());

-- store_settings: leitura pública, escrita só do administrador
drop policy if exists "store_settings_select" on public.store_settings;
create policy "store_settings_select" on public.store_settings
  for select using (true);

drop policy if exists "store_settings_insert" on public.store_settings;
create policy "store_settings_insert" on public.store_settings
  for insert with check (public.is_admin());

drop policy if exists "store_settings_update" on public.store_settings;
create policy "store_settings_update" on public.store_settings
  for update using (public.is_admin()) with check (public.is_admin());

-- ---------- Armazenamento (Storage) ----------
-- Bucket público para LEITURA das fotos (as URLs aparecem na vitrine).
-- Limite de 5 MB e somente JPEG/PNG/WebP, validado também no servidor.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Escrita no bucket: somente administrador.
drop policy if exists "product_images_storage_select" on storage.objects;
create policy "product_images_storage_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "product_images_storage_insert" on storage.objects;
create policy "product_images_storage_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "product_images_storage_update" on storage.objects;
create policy "product_images_storage_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images' and public.is_admin())
  with check (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "product_images_storage_delete" on storage.objects;
create policy "product_images_storage_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images' and public.is_admin());
