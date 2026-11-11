document.querySelectorAll('input[type="file"]').forEach((input) => {
  const chosen = input.form?.querySelector('.file-chosen');
  if (!chosen) return;
  const show = () => {
    chosen.textContent = input.files?.[0]?.name || chosen.dataset.empty || '';
  };
  input.addEventListener('change', show);
});
