import { store } from './store.js';
import { escapeHtml } from './utils.js';
import { db } from './firebase-init.js';
import { collectionGroup, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { openDetail } from './detail.js';

export function renderGallery(){
  const items = [];
  store.recipes.forEach(r=>{ (r.photos||[]).forEach(url=> items.push({ url, recipeId:r.id, title:r.title })); });
  const grid = document.getElementById('photoGrid');
  const empty = document.getElementById('galleryEmpty');
  if(items.length===0){ grid.innerHTML=''; empty.style.display='block'; return; }
  empty.style.display = 'none';
  grid.innerHTML = items.map(it=>`
    <div class="photo-grid-item" data-recipe-id="${it.recipeId}">
      <img src="${it.url}" loading="lazy">
      <div class="photo-grid-caption">${escapeHtml(it.title)}</div>
    </div>`).join('');
  grid.querySelectorAll('.photo-grid-item').forEach(el=>{
    el.addEventListener('click', ()=>{
      document.getElementById('galleryOverlay').classList.remove('open');
      openDetail(el.dataset.recipeId);
    });
  });
}

export async function loadReviewsFeed(){
  const list = document.getElementById('reviewsFeedList');
  const empty = document.getElementById('reviewsFeedEmpty');
  list.innerHTML = `<p style="text-align:center; color:var(--ink-soft); font-size:13px;">Загрузка…</p>`;
  empty.style.display = 'none';
  try{
    const snap = await getDocs(collectionGroup(db, 'reviews'));
    const items = snap.docs.map(d=>{
      const recipeId = d.ref.parent.parent ? d.ref.parent.parent.id : null;
      const recipe = store.recipes.find(r=>r.id===recipeId);
      return { ...d.data(), recipeId, recipeTitle: recipe ? recipe.title : 'Рецепт' };
    }).sort((a,b)=> new Date(b.createdAt||0) - new Date(a.createdAt||0));
    if(items.length===0){ list.innerHTML=''; empty.style.display='block'; return; }
    list.innerHTML = items.map(rv=>`
      <div class="feed-review-item" data-recipe-id="${rv.recipeId||''}">
        <div class="feed-review-title">${escapeHtml(rv.recipeTitle)}</div>
        <div class="review-stars">${'★'.repeat(rv.rating||0)}${'☆'.repeat(5-(rv.rating||0))}<span class="review-date">${rv.createdAt ? new Date(rv.createdAt).toLocaleDateString('ru-RU') : ''}</span></div>
        ${rv.text ? `<div class="review-text">${escapeHtml(rv.text)}</div>` : ''}
      </div>`).join('');
    list.querySelectorAll('.feed-review-item').forEach(el=>{
      el.addEventListener('click', ()=>{
        if(!el.dataset.recipeId) return;
        document.getElementById('reviewsFeedOverlay').classList.remove('open');
        openDetail(el.dataset.recipeId);
      });
    });
  }catch(e){
    console.error(e);
    list.innerHTML = `<p style="text-align:center; color:var(--ink-soft); font-size:13px;">Не удалось загрузить отзывы</p>`;
  }
}
