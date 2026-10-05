-- Execute uma vez no SQL Editor antes de publicar a atualização.
-- Pode repetir: preserva produtos, preços, fotos, administradores e políticas.
alter table public.products
  add column if not exists description text not null default '',
  add column if not exists olfactory_family text not null default '',
  add column if not exists olfactory_notes text not null default '',
  add column if not exists top_notes text not null default '',
  add column if not exists heart_notes text not null default '',
  add column if not exists base_notes text not null default '';
notify pgrst, 'reload schema';

-- Associa uma foto importada sem duplicar e sem mudar a foto principal existente.
-- O bloqueio por produto evita disputa de posição entre importações simultâneas.
create or replace function public.attach_import_photo(p_product_id uuid, p_image_id uuid, p_path text)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Acesso exclusivo do administrador' using errcode = '42501'; end if;
  if p_path not like p_product_id::text || '/importacao/%' then raise exception 'Caminho inválido'; end if;
  perform id from public.products where id = p_product_id for update;
  if not found then raise exception 'Produto não encontrado'; end if;
  if exists (select 1 from public.product_images where product_id = p_product_id and path = p_path) then return; end if;
  insert into public.product_images(id, product_id, path, position)
  select p_image_id, p_product_id, p_path, coalesce(max(position) + 1, 0)
  from public.product_images where product_id = p_product_id;
end;
$$;
revoke all on function public.attach_import_photo(uuid, uuid, text) from public, anon;
grant execute on function public.attach_import_photo(uuid, uuid, text) to authenticated;
notify pgrst, 'reload schema';
