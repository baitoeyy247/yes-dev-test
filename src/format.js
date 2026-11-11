const whenFormat = new Intl.DateTimeFormat('th-TH', {
  timeZone: 'Asia/Bangkok',
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function formatWhen(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return whenFormat.format(date);
}

export function formatPrice(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  const hasDecimal = Math.round(num * 100) % 100 !== 0;
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: hasDecimal ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(num);
}

export function priceInput(value) {
  const num = Math.round(Number(value) * 100) / 100;
  if (!Number.isFinite(num)) return '';
  return Number.isInteger(num) ? String(num) : num.toFixed(2);
}

export function bangkokStartOfDayIso(now = new Date()) {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return new Date(`${day}T00:00:00+07:00`).toISOString();
}

export function clip(value, length) {
  const text = String(value || '');
  if (text.length <= length) return text;
  return `${text.slice(0, length)}…`;
}
