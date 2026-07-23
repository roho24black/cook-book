// Планировщик на неделю: раскидываем рецепты по дням, ингредиенты объединяются
// в общий список покупок сразу на всю неделю (переиспользует ту же логику слияния,
// что и обычный список покупок).

import { store } from './store.js';
import { db } from './firebase-init.js';
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { escapeHtml, fmtQty, showToast } from './utils.js';
import { setBottomTab } from './bottom-nav.js';
import { openDetail } from './detail.js';

const DAYS = [
  { key:'mon', label:'Понедельник' }, { key:'tue', label:'Вторник' }, { key:'wed', label:'Среда' },
  { key:'thu', label:'Четверг' }, { key:'fri', label:'Пятница' }, { key:'sat', label:'Суббота' },
  { key:'sun', label:'Воскресенье' }
];

let plan = {}; // { mon: [recipeId, ...], ... }

async function loadPlan(){
  try{
    const snap = await getDoc(doc(db, 'meta', 'weeklyPlan'));
    plan = snap.exists() ? (snap.data().days || {}) : {};
  }catch(e){ console.error(e); plan = {}; }
}
async function savePlan(){
  try{ await setDoc(doc(db, 'meta', 'weeklyPlan'), { days: plan, updatedAt: new Date().toISOString() }); }
  catch(e){ console.error(e); showToast('Не удалось сохранить планировщик'); }
}

export async function openPlannerTab(){
  document.getElementById('referenceOverlay').classList.remove('open');
  document.getElementById('shopOverlay').classList.remove('open');
  document.getElementById('galleryOverlay').classList.remove('open');
  document.getElementById('reviewsFeedOverlay').classList.remove('open');
  setBottomTab('planner');
  document.getElementById('plannerOverlay').classList.add('open');
  await loadPlan();
  renderPlanner();
}
document.getElementById('plannerBtn').addEventListener('click', ()=> openPlannerTab());

document.getElementById('plannerCloseBtn').addEventListener('click', ()=>{
  document.getElementById('plannerOverlay').classList.remove('open');
  setBottomTab('recipes');
});

function renderPlanner(){
  const wrap = document.getElementById('plannerDays');
  wrap.innerHTML = DAYS.map(d=>{
    const ids = plan[d.key] || [];
    const recipes = ids.map(id=> store.recipes.find(r=>r.id===id)).filter(Boolean);
    return `<div class="planner-day">
      <div class="planner-day-title">${d.label}</div>
      <div class="planner-day-recipes" data-day="${d.key}">
        ${recipes.map(r=> `<div class="planner-chip" data-day="${d.key}" data-id="${r.id}">${escapeHtml(r.title)} <span class="planner-remove">×</span></div>`).join('') || '<span class="planner-empty">пусто</span>'}
      </div>
      <select class="planner-add" data-day="${d.key}">
        <option value="">+ добавить рецепт…</option>
        ${store.recipes.map(r=> `<option value="${r.id}">${escapeHtml(r.title)}</option>`).join('')}
      </select>
    </div>`;
  }).join('');

  wrap.querySelectorAll('.planner-add').forEach(sel=>{
    sel.addEventListener('change', async ()=>{
      const day = sel.dataset.day;
      const id = sel.value;
      if(!id) return;
      plan[day] = plan[day] || [];
      if(!plan[day].includes(id)) plan[day].push(id);
      await savePlan();
      renderPlanner();
    });
  });
  wrap.querySelectorAll('.planner-remove').forEach(btn=>{
    btn.addEventListener('click', async (e)=>{
      e.stopPropagation();
      const chip = btn.closest('.planner-chip');
      const day = chip.dataset.day, id = chip.dataset.id;
      plan[day] = (plan[day]||[]).filter(x=>x!==id);
      await savePlan();
      renderPlanner();
    });
  });
  wrap.querySelectorAll('.planner-chip').forEach(chip=>{
    chip.addEventListener('click', (e)=>{
      if(e.target.classList.contains('planner-remove')) return;
      document.getElementById('plannerOverlay').classList.remove('open');
      openDetail(chip.dataset.id);
    });
  });
}

document.getElementById('plannerShopBtn').addEventListener('click', ()=>{
  const allIds = Object.values(plan).flat();
  if(allIds.length===0){ showToast('Сначала добавь рецепты на неделю'); return; }
  const merged = {};
  allIds.forEach(id=>{
    const r = store.recipes.find(x=>x.id===id);
    if(!r) return;
    (r.ingredients||[]).forEach(i=>{
      const key = (i.name||'').toLowerCase().trim() + '|' + (i.unit||'');
      if(!merged[key]) merged[key] = { name:i.name, unit:i.unit, qty: (i.qty!==null&&i.qty!==undefined)?i.qty:null };
      else if(merged[key].qty!==null && i.qty!==null && i.qty!==undefined) merged[key].qty += i.qty;
      else if(i.qty===null) merged[key].qty = null;
    });
  });
  const items = Object.values(merged).sort((a,b)=> a.name.localeCompare(b.name,'ru'));
  const text = items.map(i=>{
    const amt = (i.qty!==null && i.qty!==undefined) ? `${fmtQty(i.qty)} ${i.unit||''}`.trim() : (i.unit||'');
    return `- ${i.name}${amt?` — ${amt}`:''}`;
  }).join('\n');
  navigator.clipboard?.writeText('Список покупок на неделю:\n'+text).then(()=>{
    showToast(`Скопировано: ${items.length} позиций на всю неделю`);
  }).catch(()=> showToast('Не удалось скопировать'));
});

document.getElementById('plannerClearBtn').addEventListener('click', async ()=>{
  plan = {};
  await savePlan();
  renderPlanner();
  showToast('Планировщик очищен');
});
