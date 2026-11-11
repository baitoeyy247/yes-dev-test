const input = document.querySelector('#image-file');
const note = document.querySelector('#image-note');
const chosen = input?.form?.querySelector('.file-chosen');

function rejectFile(message) {
  if (note) note.textContent = message;
  input.value = '';
  if (chosen) chosen.textContent = chosen.dataset.empty || '';
}

input?.addEventListener('change', () => {
  const file = input.files?.[0];
  if (!file || !note) return;
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (file.type && !allowed.includes(file.type)) {
    rejectFile('รองรับเฉพาะไฟล์ JPG, PNG หรือ WEBP');
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    rejectFile('ไฟล์ใหญ่เกิน 2 MB');
    return;
  }
  note.textContent = 'พร้อมอัปโหลด สัดส่วนที่แนะนำคือสี่เหลี่ยมจัตุรัสประมาณ 800×800 px';
});
