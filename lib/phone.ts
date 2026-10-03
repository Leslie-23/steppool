/** Normalises 024 123 4567 / 24 123 4567 / +233 24 123 4567 to E.164. */
export function toE164(raw: string) {
  const digits = raw.replace(/\D/g, '').replace(/^233/, '').replace(/^0/, '');
  return digits.length === 9 ? `+233${digits}` : null;
}
