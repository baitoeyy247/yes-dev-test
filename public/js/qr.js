const img = document.querySelector('#qr-preview');
const bg = document.querySelector('#qr-bg');
const size = document.querySelector('#qr-size');
const download = document.querySelector('#qr-download');

function refreshQr() {
  if (!img || !bg || !size || !download) return;
  const base = img.dataset.src;
  const query = `bg=${encodeURIComponent(bg.value)}&size=${encodeURIComponent(size.value)}`;
  img.src = `${base}?${query}`;
  download.href = `${base}?${query}&download=1`;
}

bg?.addEventListener('input', refreshQr);
size?.addEventListener('change', refreshQr);

document.querySelector('#copy-link')?.addEventListener('click', async (event) => {
  const button = event.currentTarget;
  const link = button.dataset.link || '';
  try {
    await navigator.clipboard.writeText(link);
    button.textContent = 'คัดลอกแล้ว';
  } catch {
    const field = document.querySelector('#public-url');
    field?.focus();
    field?.select();
    button.textContent = 'เลือกข้อความในช่องลิงก์แล้วคัดลอก';
  }
});
