import { store } from './store.js';
import { showToast } from './utils.js';

document.getElementById('exportBackupBtn').addEventListener('click', ()=>{
  if(store.recipes.length === 0){ showToast('Пока нечего экспортировать'); return; }
  const payload = {
    exportedAt: new Date().toISOString(),
    recipeCount: store.recipes.length,
    recipes: store.recipes
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateStr = new Date().toISOString().slice(0,10);
  a.href = url;
  a.download = `cookbook-backup-${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast(`Скачано: ${store.recipes.length} рецептов`);
});

// ---------- Мягкое напоминание о бесплатных лимитах Firebase ----------
// Точные цифры использования (чтения/записи/место в хранилище) доступны только через
// Firebase Console — оттуда их нельзя получить прямо из браузера без серверного ключа.
// Здесь — грубая прикидка по количеству документов и фото, чтобы вовремя напомнить
// заглянуть в консоль, а не точный счётчик расходов.
const SOFT_LIMITS = { recipes: 3000, photosPerRecipe: 15 };
export function checkUsageWarning(){
  if(store.recipes.length > SOFT_LIMITS.recipes){
    showToast(`Рецептов уже ${store.recipes.length} — стоит заглянуть в Firebase Console → Usage`);
    return;
  }
  const heavyRecipe = store.recipes.find(r=> (r.photos||[]).length > SOFT_LIMITS.photosPerRecipe);
  if(heavyRecipe){
    showToast(`У «${heavyRecipe.title}» уже много фото — можно проверить объём в Storage`);
  }
}
