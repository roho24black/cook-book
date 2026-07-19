// Инициализация Firebase: приложение, авторизация, база данных, хранилище файлов.
// Все остальные модули берут db/auth/storage/recipesCol отсюда, а не создают их заново.

import { firebaseConfig } from '../firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  getFirestore, collection, enableIndexedDbPersistence
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';

export const isConfigured = Boolean(firebaseConfig.apiKey) && !firebaseConfig.apiKey.includes('ВСТАВЬ');

if (!isConfigured) {
  const banner = document.getElementById('setupBanner');
  if (banner) banner.style.display = 'block';
}

export let db, auth, storage, recipesCol;

if (isConfigured) {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
  storage = getStorage(app);
  recipesCol = collection(db, 'recipes');
  try { await enableIndexedDbPersistence(db); } catch (e) { /* несколько вкладок открыто — не критично */ }
}
