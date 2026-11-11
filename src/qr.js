import QRCode from 'qrcode';

export function normalizeHex(input) {
  const text = String(input || '').trim();
  const short = /^#([0-9a-fA-F]{3})$/.exec(text);
  if (short) {
    const [r, g, b] = short[1].split('');
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  const full = /^#([0-9a-fA-F]{6})$/.exec(text);
  if (full) return `#${full[1].toLowerCase()}`;
  return null;
}

function luminance(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function qrColors(background) {
  const light = normalizeHex(background) || '#fffdfb';
  const dark = luminance(light) < 0.45 ? '#ffffff' : '#241c18';
  return { dark, light };
}

export function qrSize(input) {
  const size = Number.parseInt(input, 10);
  if (!Number.isFinite(size)) return 512;
  return Math.min(1200, Math.max(200, size));
}

export async function qrPng(url, { background, size } = {}) {
  const colors = qrColors(background);
  return QRCode.toBuffer(url, {
    type: 'png',
    width: qrSize(size),
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: colors.dark, light: colors.light },
  });
}
