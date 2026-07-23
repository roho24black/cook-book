// UI для импорта рецепта от Клода — сама логика разбора текста вынесена в
// recipe-text-format.js (без DOM-зависимостей, чтобы её можно было тестировать напрямую).

import { openForm } from './form.js';
import { showToast } from './utils.js';
import { TEMPLATE, parseStructuredRecipeText } from './recipe-text-format.js';

document.getElementById('importTemplateBtn').addEventListener('click', ()=>{
  navigator.clipboard?.writeText(TEMPLATE).then(()=>{
    showToast('Шаблон скопирован — вставь его в другой чат с Клодом');
  }).catch(()=>{
    showToast('Не удалось скопировать — выдели текст шаблона вручную');
  });
});

document.getElementById('importBtn').addEventListener('click', ()=>{
  document.getElementById('importTextInput').value = '';
  document.getElementById('importStatus').textContent = '';
  document.getElementById('importOverlay').classList.add('open');
});
document.getElementById('importCloseBtn').addEventListener('click', ()=>{
  document.getElementById('importOverlay').classList.remove('open');
});
document.getElementById('importOverlay').addEventListener('click', (e)=>{
  if(e.target.id==='importOverlay') document.getElementById('importCloseBtn').click();
});

document.getElementById('importParseBtn').addEventListener('click', ()=>{
  const text = document.getElementById('importTextInput').value.trim();
  const statusEl = document.getElementById('importStatus');
  if(!text){ statusEl.textContent = 'Вставь текст, который прислал Клод.'; return; }
  const parsed = parseStructuredRecipeText(text);
  if(!parsed || (parsed.ingredients.length===0 && parsed.steps.length===0)){
    statusEl.textContent = 'Не получилось разобрать — убедись, что текст в точности следует формату из шаблона (с заголовками НАЗВАНИЕ:, ИНГРЕДИЕНТЫ:, ШАГИ: и т.д.).';
    return;
  }
  document.getElementById('importOverlay').classList.remove('open');
  openForm(parsed);
  showToast(`Разобрано: ${parsed.ingredients.length} ингредиентов, ${parsed.steps.length} шагов — проверь и сохрани`);
});
