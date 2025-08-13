export const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((v || "").trim());

export function normalizeUSPhone(v) {
  if (!v) return null;
  let digits = String(v).replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== 10) return null;
  const area = digits.slice(0, 3);
  const exch = digits.slice(3, 6);
  if (!/^[2-9]\d{2}$/.test(area)) return null;
  if (!/^[2-9]\d{2}$/.test(exch)) return null;
  return `+1${digits}`;
}
export const isValidUSPhone = (v) => normalizeUSPhone(v) !== null;
export const isValidName = (v) => /^[A-Za-zÀ-ÖØ-öø-ÿ'’\-\s]{3,}$/.test((v || "").trim());

export function formatUSPhoneNational(v) {
  const e164 = normalizeUSPhone(v);
  if (!e164) return v ?? "";
  const d = e164.slice(2);
  return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
}
export default { isValidEmail, normalizeUSPhone, isValidUSPhone, isValidName, formatUSPhoneNational };
