export const CATEGORIES = [
  { value: 'masculino', label: 'Masculinos' },
  { value: 'feminino', label: 'Femininos' },
  { value: 'unissex', label: 'Unissex' },
  { value: 'cuidados', label: 'Cuidados pessoais' },
];

export const categoryLabel = (value) =>
  CATEGORIES.find((c) => c.value === value)?.label || value;

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const formatBRL = (cents) => brl.format((cents || 0) / 100);

// "350", "350,00", "1.250,50", "R$ 350,00" -> centavos (inteiro) ou null se inválido
export function parsePriceToCents(input) {
  let s = String(input ?? '').replace(/R\$|\s/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (!/^\d+\.\d{1,2}$/.test(s)) s = s.replace(/\./g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}

export const centsToInput = (cents) =>
  (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// minúsculas e sem acentos, para a busca
export const normalize = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

export const makeSlug = (name) =>
  `${normalize(name).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;

// Aceita (62) 99999-9999, 5562999999999 etc. Retorna só dígitos com DDI 55, ou null.
export function normalizeWhatsapp(input) {
  const digits = String(input ?? '').replace(/\D/g, '');
  if (!digits) return '';
  const full = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  return /^\d{10,15}$/.test(full) ? full : null;
}

export function whatsappLink(number, product) {
  if (!number) return null;
  const text = `Olá! Gostaria de pedir o perfume: ${product.name} — ${formatBRL(product.price_cents)}.`;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

export const ALLOWED_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export function validateImageFile(file) {
  if (!ALLOWED_TYPES[file.type]) return `"${file.name}": formato não aceito. Use JPG, PNG ou WebP.`;
  if (file.size > MAX_FILE_BYTES)
    return `"${file.name}": arquivo maior que 5 MB (${(file.size / 1048576).toFixed(1)} MB).`;
  return null;
}
