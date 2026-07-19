// Точка входа. Импортирует все модули (чтобы выполнился их код регистрации обработчиков событий)
// и запускает само приложение: статус синхронизации, service worker, авторизация, подписка на рецепты.

import { store } from './store.js';
import { isConfigured, auth, recipesCol } from './firebase-init.js';
import { seedIfNeeded } from './seed.js';
import { render, loadingLabel } from './render-list.js';

// Модули ниже нужны, чтобы выполнился их код навешивания обработчиков на кнопки —
// сами функции напрямую в этом файле не используются.
import './detail.js';
import './form.js';
import './cooking-mode.js';
import './shopping-list.js';
import './gallery-reviews-feed.js';
import './bottom-nav.js';
import './import-recipe.js';

import { signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { onSnapshot, query, orderBy } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ---------- Статус онлайн/офлайн ----------
const syncDot = document.getElementById('syncDot');
const syncText = document.getElementById('syncText');
function setSyncStatus(online){
  syncDot.classList.toggle('offline', !online);
  syncText.textContent = online ? 'синхронизировано' : 'офлайн (сохранится позже)';
}
window.addEventListener('online', () => setSyncStatus(true));
window.addEventListener('offline', () => setSyncStatus(false));
setSyncStatus(navigator.onLine);

// ---------- Service worker ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(()=>{}));
}

// ---------- Авторизация и загрузка рецептов ----------
if (isConfigured) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) { signInAnonymously(auth).catch(err => { loadingLabel.textContent = 'ошибка входа'; console.error(err); }); return; }
    seedIfNeeded().catch(()=>{});
    const q = query(recipesCol, orderBy('dateAdded', 'asc'));
    onSnapshot(q, (snapshot) => {
      store.recipes = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      store.hasLoadedOnce = true;
      loadingLabel.textContent = store.recipes.length + (store.recipes.length===1?' рецепт':' рецептов');
      setSyncStatus(true);
      render();
    }, (err) => { console.error(err); setSyncStatus(false); store.hasLoadedOnce = true; loadingLabel.textContent = 'ошибка загрузки'; render(); });
  });
} else {
  loadingLabel.textContent = 'настрой Firebase';
  store.hasLoadedOnce = true;
  render();
}
