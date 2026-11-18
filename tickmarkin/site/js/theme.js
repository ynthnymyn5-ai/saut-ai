// Applies the saved or system color theme before first paint (loaded synchronously in <head>).
(() => {
  let t = null;
  try { t = localStorage.getItem('tm-theme'); } catch {}
  if (!t) t = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
})();
