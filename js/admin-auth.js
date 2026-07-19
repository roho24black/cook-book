// Вход "автора" сайта. На экране показывается ТОЛЬКО поле пароля — email зашит в коде
// (см. admin-config.js) и нигде не отображается. Технически это обычный Firebase
// Email/Password вход — просто UI не просит email у человека.
//
// isAdmin определяется просто: user.isAnonymous === false. У нас в проекте только один
// такой (не анонимный) аккаунт может существовать — тот, что ты создашь в Firebase Console,
// поэтому этой проверки достаточно для интерфейса. Настоящая защита данных — в правилах
// Firestore (там сверяется конкретный UID), а не в этом клиентском флаге.

import { store } from './store.js';
import { auth } from './firebase-init.js';
import { ADMIN_EMAIL } from './admin-config.js';
import { showToast } from './utils.js';
import {
  signInWithEmailAndPassword, onAuthStateChanged, signOut
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

function updateAdminUI(){
  document.body.classList.toggle('is-admin', store.isAdmin);
  const link = document.getElementById('adminLoginLink');
  if(link) link.textContent = store.isAdmin ? '✓ Вы вошли как автор · Выйти' : '🔒 Вход для автора';
}

onAuthStateChanged(auth, (user)=>{
  store.isAdmin = !!(user && !user.isAnonymous);
  updateAdminUI();
});

document.getElementById('adminLoginLink').addEventListener('click', async ()=>{
  if(store.isAdmin){
    await signOut(auth);
    showToast('Вы вышли из режима автора');
    return;
  }
  document.getElementById('adminPasswordInput').value = '';
  document.getElementById('adminLoginError').textContent = '';
  document.getElementById('adminLoginOverlay').classList.add('open');
  setTimeout(()=> document.getElementById('adminPasswordInput').focus(), 50);
});

document.getElementById('adminLoginCloseBtn').addEventListener('click', ()=>{
  document.getElementById('adminLoginOverlay').classList.remove('open');
});
document.getElementById('adminLoginOverlay').addEventListener('click', (e)=>{
  if(e.target.id==='adminLoginOverlay') document.getElementById('adminLoginCloseBtn').click();
});

document.getElementById('adminLoginForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const password = document.getElementById('adminPasswordInput').value;
  const errEl = document.getElementById('adminLoginError');
  if(!password){ errEl.textContent = 'Введи пароль'; return; }
  if(ADMIN_EMAIL.includes('ВСТАВЬ_СЮДА')){ errEl.textContent = 'Вход ещё не настроен (см. admin-config.js)'; return; }
  errEl.textContent = 'Проверяю…';
  try{
    await signInWithEmailAndPassword(auth, ADMIN_EMAIL, password);
    document.getElementById('adminLoginOverlay').classList.remove('open');
    showToast('Вход выполнен — теперь можно редактировать рецепты');
  }catch(err){
    console.error(err);
    errEl.textContent = 'Неверный пароль';
  }
});
