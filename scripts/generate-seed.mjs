// Gera supabase/02_seed_products.sql a partir de scripts/products-data.mjs.
// Uso: npm run seed:generate
import { writeFileSync } from 'node:fs';
import { PRODUCTS } from './products-data.mjs';

const slugify = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

const seen = new Set();
const rows = PRODUCTS.map((p) => {
  const slug = `${p.category}-${slugify(p.name)}`;
  if (seen.has(slug)) throw new Error(`Slug duplicado: ${slug}`);
  seen.add(slug);
  return `  (${q(slug)}, ${q(p.name)}, ${p.cents}, ${q(p.category)})`;
});

const sql = `-- IMPORTAÇÃO INICIAL DOS PRODUTOS DO PDF (${PRODUCTS.length} itens)
-- Gerado por scripts/generate-seed.mjs — não edite à mão.
--
-- Seguro para executar mais de uma vez: a chave única é o "slug" e o comando usa
-- ON CONFLICT DO NOTHING. Itens já existentes NÃO são alterados, então suas edições
-- futuras de nome, preço, disponibilidade, visibilidade e fotos nunca são sobrescritas.
-- (Se você excluir um produto no painel e rodar este arquivo de novo, ele volta.)

insert into public.products (slug, name, price_cents, category)
values
${rows.join(',\n')}
on conflict (slug) do nothing;
`;

writeFileSync(new URL('../supabase/02_seed_products.sql', import.meta.url), sql);
console.log(`OK: ${PRODUCTS.length} produtos escritos em supabase/02_seed_products.sql`);
