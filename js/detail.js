import { store } from './store.js';
import { CATEGORY_EMOJI } from './constants.js';
import { escapeHtml, fmtQty, showToast, showConfirm } from './utils.js';
import { db, storage } from './firebase-init.js';
import {
  doc, updateDoc, deleteDoc, addDoc, collection, getDocs, query, orderBy, arrayUnion
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import {
  ref as storageRef, uploadBytes, getDownloadURL
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';
import { startCookMode } from './cooking-mode.js';
import { openForm } from './form.js';
import { persistShopCart } from './shopping-list.js';
import { setBottomTab } from './bottom-nav.js';

// ---------- Лайтбокс ----------
export function openLightbox(photos, startIdx){
  store.lightboxPhotos = photos;
  showLightboxPhoto(startIdx);
  document.getElementById('lightboxOverlay').classList.add('open');
}
export function showLightboxPhoto(idx){
  if(idx < 0) idx = store.lightboxPhotos.length - 1;
  if(idx >= store.lightboxPhotos.length) idx = 0;
  store.lightboxIndex = idx;
  document.getElementById('lightboxImg').src = store.lightboxPhotos[idx];
}
export function closeLightbox(){ document.getElementById('lightboxOverlay').classList.remove('open'); }
document.getElementById('lightboxCloseBtn').addEventListener('click', closeLightbox);
document.getElementById('lightboxPrev').addEventListener('click', ()=> showLightboxPhoto(store.lightboxIndex-1));
document.getElementById('lightboxNext').addEventListener('click', ()=> showLightboxPhoto(store.lightboxIndex+1));
document.getElementById('lightboxOverlay').addEventListener('click', (e)=>{ if(e.target.id==='lightboxOverlay') closeLightbox(); });

document.getElementById('photoInput').addEventListener('change', async (e)=>{
  const files = Array.from(e.target.files || []);
  if(files.length===0 || !store.currentPhotoUploadRecipeId) return;
  const rid = store.currentPhotoUploadRecipeId;
  showToast('Загружаю фото…');
  for(const file of files){
    try{
      const path = `recipes/${rid}/${Date.now()}-${file.name}`;
      const fileRef = storageRef(storage, path);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);
      await updateDoc(doc(db,'recipes',rid), { photos: arrayUnion(url) });
    }catch(err){ console.error(err); showToast('Не удалось загрузить фото'); }
  }
  e.target.value = '';
  showToast('Фото добавлено');
  const r = store.recipes.find(x=>x.id===rid);
  if(r && document.getElementById('detailOverlay').classList.contains('open')) renderDetail(r);
});

// ---------- Открытие/закрытие детального просмотра ----------
function scaledQty(q, base, target){
  if(q===null || q===undefined || !base) return null;
  return q * (target/base);
}

export function openDetail(id){
  const r = store.recipes.find(x=>x.id===id);
  if(!r) return;
  store.currentServings = r.servings || null;
  store.checkedIngredients = new Set();
  document.getElementById('referenceOverlay').classList.remove('open');
  document.getElementById('shopOverlay').classList.remove('open');
  document.getElementById('galleryOverlay').classList.remove('open');
  document.getElementById('reviewsFeedOverlay').classList.remove('open');
  setBottomTab('recipes');
  renderDetail(r);
  document.getElementById('detailOverlay').classList.add('open');
}

export function closeDetail(){ document.getElementById('detailOverlay').classList.remove('open'); }
document.getElementById('detailOverlay').addEventListener('click', (e)=>{ if(e.target.id === 'detailOverlay') closeDetail(); });

export function renderDetail(r){
  const modal = document.getElementById('detailModal');
  const base = r.servings || null;
  const target = store.currentServings || base;
  const ingredientsHtml = (r.ingredients||[]).map((i,idx)=>{
    const hasQty = i.qty !== undefined;
    const qty = (hasQty && i.qty!==null && base) ? scaledQty(i.qty, base, target) : (hasQty ? i.qty : null);
    const amtStr = (qty!==null && qty!==undefined) ? `${fmtQty(qty)} ${i.unit||''}`.trim() : (i.unit || i.amount || '');
    return `<li data-idx="${idx}" class="${store.checkedIngredients.has(idx)?'checked':''}">
      <span>${escapeHtml(i.name)}</span><span class="amt">${escapeHtml(amtStr)}</span></li>`;
  }).join('');

  const stepsHtml = (r.steps||[]).map(s=>{
    const text = typeof s === 'string' ? s : s.text;
    const tm = typeof s === 'object' ? s.timerMinutes : null;
    return `<li>${escapeHtml(text)}${tm?`<span class="step-timer-tag">⏱ ${tm} мин</span>`:''}</li>`;
  }).join('');

  modal.innerHTML = `
    <button class="modal-close" id="detailCloseBtn">&times;</button>
    <div class="detail-cat">
      <span>${CATEGORY_EMOJI[r.category]||'🍽️'} ${escapeHtml(r.category || 'Без категории')}</span>
      ${r.difficulty ? `<span class="badge ${r.difficulty}">${r.difficulty}</span>` : ''}
    </div>
    <h2 class="detail-title">${escapeHtml(r.title)}</h2>
    <div class="detail-meta-row">
      ${r.cookTime ? `<span class="meta-pill">⏱ ${r.cookTime} мин</span>` : (r.meta ? `<span class="meta-pill">${escapeHtml(r.meta)}</span>` : '')}
      ${base ? `<div class="servings-adjust">
        <button id="servMinus" ${target<=1?'disabled':''}>−</button>
        <span>👥 ${target} порц.</span>
        <button id="servPlus" ${target>=50?'disabled':''}>+</button>
      </div>` : ''}
      <span class="avg-rating-pill" id="avgRatingPill" style="display:none;"></span>
    </div>
    <div class="photo-gallery" id="photoGallery"></div>
    <div class="detail-actions-top">
      <button class="btn btn-cook" id="startCookBtn">👨‍🍳 Режим готовки</button>
      <button class="btn" id="shopAddBtn">${store.selectedForShop.has(r.id)?'✓ В списке покупок':'🛒 В список покупок'}</button>
      <button class="btn" id="shareBtn">📋 Скопировать</button>
      <button class="btn" id="favDetailBtn">${r.favorite?'★ В избранном':'☆ В избранное'}</button>
      <button class="btn" id="queueDetailBtn">${r.willCook?'📌 В планах':'🗓️ Буду готовить'}</button>
      <button class="btn" id="editBtn">Изменить</button>
      <button class="btn btn-danger" id="deleteBtn">Удалить</button>
    </div>
    <div class="detail-section"><h4>Ингредиенты</h4><ul class="ing-list" id="detailIngList">${ingredientsHtml}</ul></div>
    <div class="detail-section"><h4>Приготовление</h4><ol class="steps-list">${stepsHtml}</ol></div>
    ${r.notes ? `<div class="detail-notes">💡 ${escapeHtml(r.notes)}</div>` : ''}
    <div class="detail-section" style="margin-top:22px;">
      <h4>Отзывы</h4>
      <div id="reviewsContainer"><p style="font-size:13px; color:var(--ink-soft);">Загрузка отзывов…</p></div>
      <div style="margin-top:16px; padding-top:14px; border-top:1px dashed var(--line);">
        <label style="display:block; font-size:11.5px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--ink-soft); margin-bottom:8px;">Оставить отзыв</label>
        <div class="stars" id="reviewStars">
          ${[1,2,3,4,5].map(n=>`<button type="button" class="star-btn" data-star="${n}">★</button>`).join('')}
        </div>
        <textarea id="reviewText" rows="2" placeholder="Как получилось? Что бы изменили?" style="width:100%; margin-top:10px; padding:9px 11px; border:1.5px solid var(--line); border-radius:5px; font-size:13.5px; font-family:'Inter',sans-serif;"></textarea>
        <button class="btn btn-primary" id="reviewSubmitBtn" style="margin-top:10px;">Опубликовать отзыв</button>
      </div>
    </div>
  `;

  document.getElementById('detailCloseBtn').addEventListener('click', closeDetail);
  document.getElementById('editBtn').addEventListener('click', ()=>{ closeDetail(); openForm(r); });
  document.getElementById('deleteBtn').addEventListener('click', async ()=>{
    const ok = await showConfirm('Удалить рецепт «'+r.title+'»? Это нельзя отменить.');
    if(ok){ await deleteDoc(doc(db,'recipes',r.id)); closeDetail(); showToast('Рецепт удалён'); }
  });
  document.getElementById('startCookBtn').addEventListener('click', ()=> startCookMode(r));
  document.getElementById('favDetailBtn').addEventListener('click', async ()=>{
    r.favorite = !r.favorite;
    renderDetail(r);
    try { await updateDoc(doc(db,'recipes',r.id), { favorite: r.favorite }); }
    catch(e){ r.favorite = !r.favorite; renderDetail(r); }
  });
  document.getElementById('queueDetailBtn').addEventListener('click', async ()=>{
    r.willCook = !r.willCook;
    renderDetail(r);
    showToast(r.willCook ? 'Добавлено в «Буду готовить»' : 'Убрано из «Буду готовить»');
    try { await updateDoc(doc(db,'recipes',r.id), { willCook: r.willCook }); }
    catch(e){ r.willCook = !r.willCook; renderDetail(r); }
  });
  document.getElementById('shareBtn').addEventListener('click', ()=> copyRecipeText(r));
  document.getElementById('shopAddBtn').addEventListener('click', (e)=>{
    if(store.selectedForShop.has(r.id)) store.selectedForShop.delete(r.id); else store.selectedForShop.add(r.id);
    persistShopCart();
    e.target.textContent = store.selectedForShop.has(r.id) ? '✓ В списке покупок' : '🛒 В список покупок';
    showToast(store.selectedForShop.has(r.id) ? 'Добавлено в список покупок' : 'Убрано из списка покупок');
  });

  renderPhotoGallery(r);
  wireReviewForm(r);
  loadReviews(r);

  const sPlus = document.getElementById('servPlus');
  const sMinus = document.getElementById('servMinus');
  if(sPlus) sPlus.addEventListener('click', ()=>{ store.currentServings = (store.currentServings||base)+1; renderDetail(r); });
  if(sMinus) sMinus.addEventListener('click', ()=>{ store.currentServings = Math.max(1,(store.currentServings||base)-1); renderDetail(r); });

  document.querySelectorAll('#detailIngList li').forEach(li=>{
    li.addEventListener('click', ()=>{
      const idx = parseInt(li.dataset.idx);
      if(store.checkedIngredients.has(idx)) store.checkedIngredients.delete(idx); else store.checkedIngredients.add(idx);
      li.classList.toggle('checked');
    });
  });
}

export function copyRecipeText(r){
  let text = `${r.title}\n${r.category||''} · ${r.servings?r.servings+' порц.':''} ${r.cookTime?'· '+r.cookTime+' мин':''}\n\nИнгредиенты:\n`;
  (r.ingredients||[]).forEach(i=>{ text += `- ${i.name}${i.qty?` — ${fmtQty(i.qty)} ${i.unit||''}`:''}\n`; });
  text += `\nПриготовление:\n`;
  (r.steps||[]).forEach((s,idx)=>{ const t = typeof s==='string'?s:s.text; text += `${idx+1}. ${t}\n`; });
  if(r.notes) text += `\nЗаметка: ${r.notes}`;
  navigator.clipboard?.writeText(text).then(()=>{
    showToast('Рецепт скопирован в буфер обмена');
  }).catch(()=>{ showToast('Не удалось скопировать'); });
}

// ---------- Фотогалерея рецепта ----------
function renderPhotoGallery(r){
  const gallery = document.getElementById('photoGallery');
  const photos = r.photos || [];
  gallery.innerHTML = photos.map((url,idx)=>`<img class="photo-thumb" src="${url}" data-idx="${idx}" loading="lazy">`).join('')
    + `<button class="photo-add-btn" id="photoAddBtn"><span style="font-size:20px;">📷</span>Добавить</button>`;
  gallery.querySelectorAll('.photo-thumb').forEach(img=>{
    img.addEventListener('click', ()=> openLightbox(photos, parseInt(img.dataset.idx)));
  });
  document.getElementById('photoAddBtn').addEventListener('click', ()=>{
    if(!storage){ showToast('Нужно настроить Firebase Storage'); return; }
    store.currentPhotoUploadRecipeId = r.id;
    document.getElementById('photoInput').click();
  });
}

// ---------- Отзывы ----------
function wireReviewForm(r){
  store.selectedReviewStars = 0;
  const starsWrap = document.getElementById('reviewStars');
  starsWrap.querySelectorAll('.star-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      store.selectedReviewStars = parseInt(btn.dataset.star);
      starsWrap.querySelectorAll('.star-btn').forEach(b=> b.classList.toggle('filled', parseInt(b.dataset.star) <= store.selectedReviewStars));
    });
  });
  document.getElementById('reviewSubmitBtn').addEventListener('click', async ()=>{
    const text = document.getElementById('reviewText').value.trim();
    if(store.selectedReviewStars===0){ showToast('Поставь оценку от 1 до 5 звёзд'); return; }
    try{
      await addDoc(collection(db,'recipes',r.id,'reviews'), {
        rating: store.selectedReviewStars, text, createdAt: new Date().toISOString()
      });
      document.getElementById('reviewText').value = '';
      store.selectedReviewStars = 0;
      starsWrap.querySelectorAll('.star-btn').forEach(b=> b.classList.remove('filled'));
      showToast('Отзыв опубликован');
      loadReviews(r);
    }catch(e){ console.error(e); showToast('Не удалось сохранить отзыв'); }
  });
}

async function loadReviews(r){
  const container = document.getElementById('reviewsContainer');
  if(!container) return;
  try{
    const snap = await getDocs(query(collection(db,'recipes',r.id,'reviews'), orderBy('createdAt','desc')));
    const reviews = snap.docs.map(d=>d.data());
    const pill = document.getElementById('avgRatingPill');
    if(reviews.length>0){
      const avg = reviews.reduce((s,x)=>s+x.rating,0)/reviews.length;
      if(pill){ pill.style.display='flex'; pill.textContent = `★ ${avg.toFixed(1)} (${reviews.length})`; }
    }
    if(!container) return;
    container.innerHTML = reviews.length ? reviews.map(rv=>`
      <div class="review-item">
        <div class="review-stars">${'★'.repeat(rv.rating)}${'☆'.repeat(5-rv.rating)}<span class="review-date">${new Date(rv.createdAt).toLocaleDateString('ru-RU')}</span></div>
        ${rv.text ? `<div class="review-text">${escapeHtml(rv.text)}</div>` : ''}
      </div>`).join('') : `<p style="font-size:13px; color:var(--ink-soft);">Пока нет отзывов — будь первым!</p>`;
  }catch(e){
    console.error(e);
    if(container) container.innerHTML = `<p style="font-size:13px; color:var(--ink-soft);">Не удалось загрузить отзывы</p>`;
  }
}
