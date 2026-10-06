import { supabase } from './supabase.js';

const STORAGE_KEY = 'danimports-affiliate-coupon';

export const normalizeCouponCode = (value) =>
  String(value || '').trim().toUpperCase().replace(/\s+/g, '');

export function saveCouponCode(code) {
  const normalized = normalizeCouponCode(code);
  if (!normalized) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ code: normalized, savedAt: Date.now() }));
  } catch {
    // Navegadores em modo privado podem bloquear storage; o cupom continua na sessão atual.
  }
}

export function loadCouponCode() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return '';
    const parsed = JSON.parse(raw);
    const maxAge = 30 * 24 * 60 * 60 * 1000;
    if (!parsed?.code || !parsed?.savedAt || Date.now() - parsed.savedAt > maxAge) {
      localStorage.removeItem(STORAGE_KEY);
      return '';
    }
    return normalizeCouponCode(parsed.code);
  } catch {
    return '';
  }
}

export function clearCouponCode() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // nada a fazer
  }
}

export async function validateCoupon(code) {
  const normalized = normalizeCouponCode(code);
  if (!normalized) return { valid: false, message: 'Digite um cupom.' };

  const { data, error } = await supabase.rpc('get_affiliate_coupon', { p_code: normalized });
  if (error) {
    if (/get_affiliate_coupon|function|schema cache/i.test(error.message || '')) {
      return { valid: false, setupMissing: true, message: 'Sistema de cupons ainda não foi ativado.' };
    }
    return { valid: false, message: 'Não foi possível validar o cupom agora.' };
  }

  const coupon = Array.isArray(data) ? data[0] : data;
  if (!coupon) return { valid: false, message: 'Cupom inválido ou expirado.' };

  saveCouponCode(coupon.code);
  return {
    valid: true,
    coupon: {
      code: coupon.code,
      discount_percent: Number(coupon.discount_percent),
    },
  };
}

export const discountedCents = (priceCents, percent) =>
  Math.max(0, Math.round(priceCents - priceCents * (Number(percent || 0) / 100)));
