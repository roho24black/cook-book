import { store } from './store.js';
import { UNITS } from './constants.js';
import { escapeHtml, showToast } from './utils.js';
import { db, recipesCol } from './firebase-init.js';
import {
  doc, addDoc, updateDoc
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

function migrateIngredient(i){
  if(i.qty !== undefined) return i; // уже новый формат
  // старый формат: { amount: "200 г", name: "..." } — не теряем данные, переносим как есть
  return { qty: null, unit: 'по вкусу', name: i.amount ? `${i.name} — ${i.amount}` : i.name };
}

function ingRowHtml(i){
  const m = i ? migrateIngredient(i) : null;
  const qty = m && m.qty!==undefined && m.qty!==null ? m.qty : '';
  const unit = m ? (m.unit||'г') : 'г';
  const name = m ? (m.name||'') : '';
  return `<div class="ing-row">
    <input type="number" step="0.1" inputmode="decimal" class="ing-qty" placeholder="кол-во" value="${qty}">
    <select class="ing-unit">${UNITS.map(u=>`<option ${u===unit?'selected':''}>${u}</option>`).join('')}</select>
    <input type="text" class="ing-name" placeholder="название" value="${escapeHtml(name)}">
    <button type="button" class="row-remove">×</button>
  </div>`;
}
function stepRowHtml(s){
  const text = s ? (typeof s==='string' ? s : s.text) : '';
  const tm = s && typeof s==='object' ? (s.timerMinutes||'') : '';
  return `<div class="step-row">
    <textarea rows="2" class="step-text" placeholder="Что делать на этом шаге">${escapeHtml(text)}</textarea>
    <input type="number" inputmode="numeric" class="step-timer" placeholder="таймер, мин" value="${tm}">
    <button type="button" class="row-remove">×</button>
  </div>`;
}

function addIngRow(data){
  const wrap = document.getElementById('ingRows');
  const div = document.createElement('div');
  div.innerHTML = ingRowHtml(data);
  const row = div.firstElementChild;
  row.querySelector('.row-remove').addEventListener('click', ()=> row.remove());
  wrap.appendChild(row);
}
function addStepRow(data){
  const wrap = document.getElementById('stepRows');
  const div = document.createElement('div');
  div.innerHTML = stepRowHtml(data);
  const row = div.firstElementChild;
  row.querySelector('.row-remove').addEventListener('click', ()=> row.remove());
  wrap.appendChild(row);
}
document.getElementById('addIngRow').addEventListener('click', ()=> addIngRow(null));
document.getElementById('addStepRow').addEventListener('click', ()=> addStepRow(null));

export function openForm(recipe){
  store.editingId = recipe ? recipe.id : null;
  document.getElementById('formTitle').textContent = recipe ? 'Редактировать рецепт' : 'Новый рецепт';
  document.getElementById('f-title').value = recipe ? recipe.title : '';
  document.getElementById('f-category').value = recipe ? (recipe.category||'') : '';
  document.getElementById('f-servings').value = recipe ? (recipe.servings||4) : 4;
  document.getElementById('f-cooktime').value = recipe ? (recipe.cookTime||30) : 30;
  document.getElementById('f-difficulty').value = recipe ? (recipe.difficulty||'Легко') : 'Легко';
  document.getElementById('f-notes').value = recipe ? (recipe.notes||'') : '';
  document.getElementById('f-tags').value = recipe ? (recipe.tags||[]).join(', ') : '';

  document.getElementById('ingRows').innerHTML = '';
  document.getElementById('stepRows').innerHTML = '';
  if(recipe && recipe.ingredients && recipe.ingredients.length){
    recipe.ingredients.forEach(i=> addIngRow(i));
  } else { addIngRow(null); addIngRow(null); addIngRow(null); }
  if(recipe && recipe.steps && recipe.steps.length){
    recipe.steps.forEach(s=> addStepRow(s));
  } else { addStepRow(null); addStepRow(null); }

  document.getElementById('formOverlay').classList.add('open');
}
export function closeForm(){ document.getElementById('formOverlay').classList.remove('open'); store.editingId = null; }

document.getElementById('openAddBtn').addEventListener('click', ()=> openForm(null));
document.getElementById('formCloseBtn').addEventListener('click', closeForm);
document.getElementById('formCancelBtn').addEventListener('click', closeForm);
document.getElementById('formOverlay').addEventListener('click', (e)=>{ if(e.target.id === 'formOverlay') closeForm(); });

document.getElementById('formSaveBtn').addEventListener('click', async ()=>{
  const title = document.getElementById('f-title').value.trim();
  if(!title){ showToast('Введите название рецепта'); return; }

  const ingredients = Array.from(document.querySelectorAll('#ingRows .ing-row')).map(row=>{
    const qtyRaw = row.querySelector('.ing-qty').value;
    const name = row.querySelector('.ing-name').value.trim();
    return name ? { qty: qtyRaw==='' ? null : parseFloat(qtyRaw), unit: row.querySelector('.ing-unit').value, name } : null;
  }).filter(Boolean);

  const steps = Array.from(document.querySelectorAll('#stepRows .step-row')).map(row=>{
    const text = row.querySelector('.step-text').value.trim();
    const tmRaw = row.querySelector('.step-timer').value;
    return text ? { text, timerMinutes: tmRaw==='' ? null : parseInt(tmRaw) } : null;
  }).filter(Boolean);

  const data = {
    title,
    category: document.getElementById('f-category').value.trim() || 'Без категории',
    servings: parseInt(document.getElementById('f-servings').value) || 4,
    cookTime: parseInt(document.getElementById('f-cooktime').value) || 30,
    difficulty: document.getElementById('f-difficulty').value,
    ingredients, steps,
    notes: document.getElementById('f-notes').value.trim(),
    tags: document.getElementById('f-tags').value.split(',').map(t=>t.trim().toLowerCase()).filter(Boolean).slice(0,10)
  };

  if(store.editingId){
    const existing = store.recipes.find(r=>r.id===store.editingId);
    // dateAdded намеренно не трогаем — редактирование не должно менять "возраст" рецепта
    // и ломать сортировку "Сначала новые/старые".
    await updateDoc(doc(db, 'recipes', store.editingId), { ...data, favorite: existing ? !!existing.favorite : false });
    showToast('Рецепт обновлён');
  } else {
    await addDoc(recipesCol, { ...data, favorite:false, dateAdded: new Date().toISOString() });
    showToast('Рецепт добавлен');
  }
  closeForm();
});
