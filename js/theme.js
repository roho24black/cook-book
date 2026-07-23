// Тёмная тема: по умолчанию берём системную настройку, дальше пользователь может
// переключить вручную — выбор запоминается в localStorage.

const STORAGE_KEY = 'theme';

function applyTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('themeToggleBtn');
  if(btn) btn.textContent = theme === 'dark' ? '☀️ Светлая тема' : '🌙 Тёмная тема';
}

function getInitialTheme(){
  const saved = localStorage.getItem(STORAGE_KEY);
  if(saved) return saved;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

applyTheme(getInitialTheme());

document.getElementById('themeToggleBtn').addEventListener('click', ()=>{
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem(STORAGE_KEY, next);
  applyTheme(next);
});
