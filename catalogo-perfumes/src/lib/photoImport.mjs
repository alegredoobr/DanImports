export const DETAIL_FIELDS = ['description', 'olfactory_family', 'olfactory_notes', 'top_notes', 'heart_notes', 'base_notes'];
export const DETAIL_LABELS = ['Descrição', 'Família olfativa', 'Notas principais', 'Saída', 'Coração', 'Fundo'];

export function matchProduct(entry, products) {
  // Usa o slug estável do cadastro original; nome exato apenas como alternativa.
  // Nunca escolhe por semelhança ou quando há mais de um resultado.
  const bySlug = entry.target_slug ? products.filter(p => p.slug === entry.target_slug) : [];
  if (bySlug.length === 1) return bySlug[0].id;
  if (bySlug.length > 1) return '';
  const matches = products.filter(p => p.name === entry.target_name);
  return matches.length === 1 ? matches[0].id : '';
}
export function detailPatch(current, incoming, overwrite = false) {
  return Object.fromEntries(DETAIL_FIELDS.filter(key => incoming[key]?.trim() &&
    (overwrite || !current[key]?.trim()) && current[key] !== incoming[key].trim())
    .map(key => [key, incoming[key].trim()]));
}
export async function imageIdentity(productId, bytes, cryptoApi = globalThis.crypto) {
  const digest = new Uint8Array(await cryptoApi.subtle.digest('SHA-256', bytes));
  const hash = Array.from(digest, b => b.toString(16).padStart(2, '0')).join('');
  const idBytes = new Uint8Array(await cryptoApi.subtle.digest('SHA-256', new TextEncoder().encode(`${productId}:${hash}`)));
  idBytes[6] = (idBytes[6] & 15) | 80;
  idBytes[8] = (idBytes[8] & 63) | 128;
  const hex = Array.from(idBytes.slice(0,16), b => b.toString(16).padStart(2, '0')).join('');
  return { path: `${productId}/importacao/${hash}.jpg`, id: `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}` };
}
function checked(result) { if (result.error) throw result.error; return result.data; }
export async function importEntry(client, bucket, row, fetchPhoto = fetch) {
  // Releitura imediatamente antes da escrita: respeita edições feitas depois da prévia.
  const product = checked(await client.from('products').select(`id, ${DETAIL_FIELDS.join(',')}`).eq('id', row.productId).single());
  const patch = detailPatch(product, row, row.overwrite);
  if (Object.keys(patch).length) checked(await client.from('products').update(patch).eq('id', row.productId).select('id').single());
  let added = 0, existing = 0;
  for (const file of row.files) {
    const response = await fetchPhoto(file);
    if (!response.ok) throw new Error(`Não foi possível carregar a foto ${file}.`);
    const blob = await response.blob();
    if (blob.size > 5242880 || !['image/jpeg', 'image/jpg'].includes(blob.type)) throw new Error('Foto inválida: use JPG de até 5 MB.');
    const identity = await imageIdentity(row.productId, await blob.arrayBuffer());
    const linked = checked(await client.from('product_images').select('id').eq('product_id', row.productId).eq('path', identity.path));
    if (linked.length) { existing++; continue; }
    checked(await client.storage.from(bucket).upload(identity.path, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: true }));
    checked(await client.rpc('attach_import_photo', { p_product_id: row.productId, p_image_id: identity.id, p_path: identity.path }));
    added++;
  }
  return `Concluído: ${added} foto(s) enviada(s), ${existing} já importada(s). ${Object.keys(patch).length} campo(s) atualizado(s).`;
}
