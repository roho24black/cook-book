import { store } from './store.js';
import { CATEGORY_EMOJI, CATEGORY_GRADIENT } from './constants.js';
import { escapeHtml, highlightMatch } from './utils.js';
import { db } from './firebase-init.js';
import { doc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { openDetail } from './detail.js';
import { persistShopCart } from './shopping-list.js';

const catList = document.getElementById('catList');
const grid = document.getElementById('grid');
const emptyState = document.getElementById('emptyState');
const viewTitle = document.getElementById('viewTitle');
const loadingLabel = document.getElementById('loadingLabel');

export { loadingLabel };

function getCategories(){
  const set = new Set(store.recipes.map(r=>r.category || 'Без категории'));
  return Array.from(set).sort((a,b)=>a.localeCompare(b,'ru'));
}

function renderCategories(){
  const cats = getCategories();
  let html = `<li class="cat-tab ${store.activeCategory==='Все'?'active':''}" data-cat="Все">
    <span class="cat-emoji">📚</span>Все рецепты<span class="cat-count">${store.recipes.length}</span></li>`;
  cats.forEach(c=>{
    const count = store.recipes.filter(r=>(r.category||'Без категории')===c).length;
    const emoji = CATEGORY_EMOJI[c] || '🍽️';
    html += `<li class="cat-tab ${store.activeCategory===c?'active':''}" data-cat="${escapeHtml(c)}">
      <span class="cat-emoji">${emoji}</span>${escapeHtml(c)}<span class="cat-count">${count}</span></li>`;
  });
  catList.innerHTML = html;
  catList.querySelectorAll('.cat-tab').forEach(el=>{
    el.addEventListener('click', ()=>{ store.activeCategory = el.dataset.cat; render(); });
  });
  document.getElementById('catOptions').innerHTML = cats.map(c=>`<option value="${escapeHtml(c)}">`).join('');
}

document.querySelectorAll('.filter-chip').forEach(chip=>{
  chip.addEventListener('click', ()=>{
    const d = chip.dataset.diff;
    store.activeDifficulty = store.activeDifficulty === d ? null : d;
    document.querySelectorAll('.filter-chip').forEach(c=>c.classList.toggle('active', c.dataset.diff===store.activeDifficulty));
    render();
  });
});
document.getElementById('sortSelect').addEventListener('change', (e)=>{ store.sortMode = e.target.value; render(); });
document.getElementById('favToggleSidebar').addEventListener('click', ()=>{
  store.favOnly = !store.favOnly;
  document.getElementById('favToggleSidebar').classList.toggle('active', store.favOnly);
  render();
});
document.getElementById('queueToggleSidebar').addEventListener('click', ()=>{
  store.queueOnly = !store.queueOnly;
  document.getElementById('queueToggleSidebar').classList.toggle('active', store.queueOnly);
  render();
});
document.getElementById('randomBtn').addEventListener('click', ()=>{
  const list = getFilteredList();
  if(list.length===0) return;
  openDetail(list[Math.floor(Math.random()*list.length)].id);
});
document.getElementById('searchInput').addEventListener('input', (e)=>{ store.searchQuery = e.target.value; render(); });

export function getFilteredList(){
  let list = store.recipes.filter(r => store.activeCategory==='Все' || (r.category||'Без категории')===store.activeCategory);
  if(store.activeDifficulty) list = list.filter(r => (r.difficulty||'Легко') === store.activeDifficulty);
  if(store.activeTag) list = list.filter(r => (r.tags||[]).includes(store.activeTag));
  if(store.favOnly) list = list.filter(r => r.favorite);
  if(store.queueOnly) list = list.filter(r => r.willCook);
  if(store.searchQuery){
    const q = store.searchQuery.toLowerCase();
    list = list.filter(r => (r.title||'').toLowerCase().includes(q) || (r.ingredients||[]).some(i => (i.name||'').toLowerCase().includes(q)));
  }
  const sorted = [...list];
  if(store.sortMode==='new') sorted.sort((a,b)=> new Date(b.dateAdded||0) - new Date(a.dateAdded||0));
  else if(store.sortMode==='old') sorted.sort((a,b)=> new Date(a.dateAdded||0) - new Date(b.dateAdded||0));
  else if(store.sortMode==='az') sorted.sort((a,b)=> (a.title||'').localeCompare(b.title||'','ru'));
  else if(store.sortMode==='time') sorted.sort((a,b)=> (a.cookTime||9999) - (b.cookTime||9999));
  return sorted;
}

export function render(){
  renderCategories();
  document.getElementById('favToggleSidebar').classList.toggle('active', store.favOnly);
  document.getElementById('queueToggleSidebar').classList.toggle('active', store.queueOnly);
  document.getElementById('shopModeBtn').classList.toggle('active', store.shopMode);
  document.getElementById('shopModeBtn').textContent = `🛒 Список покупок${store.selectedForShop.size?` (${store.selectedForShop.size})`:''}`;
  viewTitle.textContent = store.favOnly ? '⭐ Избранное' : (store.queueOnly ? '📌 Буду готовить' : (store.activeCategory === 'Все' ? 'Все рецепты' : store.activeCategory));
  if(store.activeTag) viewTitle.textContent += ` · #${store.activeTag}`;
  const list = getFilteredList();

  if(!store.hasLoadedOnce){
    grid.style.display = 'grid'; emptyState.style.display = 'none';
    grid.innerHTML = Array.from({length:6}).map(()=>`<div class="skeleton-card"><div class="sk-banner"></div><div class="sk-line" style="width:60%"></div><div class="sk-line" style="width:85%"></div></div>`).join('');
    return;
  }

  if(list.length === 0){ grid.style.display='none'; emptyState.style.display='block'; return; }
  grid.style.display = 'grid'; emptyState.style.display = 'none';

  grid.innerHTML = list.map(r => `
    <div class="recipe-card ${store.shopMode?'select-mode':''} ${store.selectedForShop.has(r.id)?'selected':''}" data-id="${r.id}">
      <div class="card-banner" style="background:${CATEGORY_GRADIENT[r.category]||CATEGORY_GRADIENT['Без категории']}">
        ${CATEGORY_EMOJI[r.category]||'🍽️'}
        <div class="select-check">${store.selectedForShop.has(r.id)?'✓':''}</div>
        ${!store.shopMode ? `
          <button class="queue-btn ${r.willCook?'active':''}" data-queueid="${r.id}" title="Буду готовить">📌</button>
          <button class="fav-btn ${r.favorite?'active':''}" data-favid="${r.id}">${r.favorite?'★':'☆'}</button>
        ` : ''}
      </div>
      <div class="card-content">
        <div class="card-top"><div class="card-cat">${escapeHtml(r.category || 'Без категории')}</div></div>
        <p class="card-title">${highlightMatch(r.title, store.searchQuery)}</p>
        <div class="card-meta">
          ${r.cookTime ? `<span>⏱ ${r.cookTime} мин</span>` : (r.meta?`<span>${escapeHtml(r.meta)}</span>`:'')}
          ${r.servings ? `<span>👥 ${r.servings}</span>` : ''}
          ${r.difficulty ? `<span class="badge ${r.difficulty}">${r.difficulty}</span>` : ''}
        </div>
        ${(r.tags||[]).length ? `<div class="card-tags">${r.tags.map(t=>`<span class="tag-chip ${store.activeTag===t?'active':''}" data-tag="${escapeHtml(t)}">#${escapeHtml(t)}</span>`).join('')}</div>` : ''}
      </div>
    </div>`).join('');

  grid.querySelectorAll('.recipe-card').forEach(el=>{
    el.addEventListener('click', (e)=>{
      const tagChip = e.target.closest('.tag-chip');
      if(tagChip){
        store.activeTag = store.activeTag === tagChip.dataset.tag ? null : tagChip.dataset.tag;
        render();
        return;
      }
      if(store.shopMode){
        const id = el.dataset.id;
        if(store.selectedForShop.has(id)) store.selectedForShop.delete(id); else store.selectedForShop.add(id);
        persistShopCart();
        render();
        return;
      }
      if(e.target.closest('.fav-btn') || e.target.closest('.queue-btn')) return;
      openDetail(el.dataset.id);
    });
  });
  grid.querySelectorAll('.queue-btn').forEach(el=>{
    el.addEventListener('click', async (e)=>{
      e.stopPropagation();
      const r = store.recipes.find(x=>x.id===el.dataset.queueid);
      r.willCook = !r.willCook;
      el.classList.toggle('active', r.willCook);
      try { await updateDoc(doc(db,'recipes',r.id), { willCook: r.willCook }); }
      catch(e){ r.willCook = !r.willCook; render(); }
    });
  });
  grid.querySelectorAll('.fav-btn').forEach(el=>{
    el.addEventListener('click', async (e)=>{
      e.stopPropagation();
      const r = store.recipes.find(x=>x.id===el.dataset.favid);
      r.favorite = !r.favorite;
      el.textContent = r.favorite ? '★' : '☆';
      el.classList.toggle('active', r.favorite);
      try { await updateDoc(doc(db,'recipes',r.id), { favorite: r.favorite }); }
      catch(e){ r.favorite = !r.favorite; render(); }
    });
  });
}
