import { store } from './store.js';
import { closeDetail, closeLightbox, showLightboxPhoto } from './detail.js';
import { openShoppingList } from './shopping-list.js';
import { renderGallery, loadReviewsFeed } from './gallery-reviews-feed.js';
import { stopCookMode } from './cooking-mode.js';

export function setBottomTab(tab){
  document.querySelectorAll('.bottom-nav button').forEach(b=> b.classList.toggle('active', b.dataset.tab===tab));
}

export function openReferenceTab(){
  document.getElementById('shopOverlay').classList.remove('open');
  document.getElementById('galleryOverlay').classList.remove('open');
  document.getElementById('reviewsFeedOverlay').classList.remove('open');
  document.getElementById('referenceOverlay').classList.add('open');
  setBottomTab('reference');
}
export function openShoppingTab(){
  document.getElementById('referenceOverlay').classList.remove('open');
  document.getElementById('galleryOverlay').classList.remove('open');
  document.getElementById('reviewsFeedOverlay').classList.remove('open');
  openShoppingList();
  setBottomTab('shopping');
}
export function openGalleryTab(){
  document.getElementById('referenceOverlay').classList.remove('open');
  document.getElementById('shopOverlay').classList.remove('open');
  document.getElementById('reviewsFeedOverlay').classList.remove('open');
  renderGallery();
  document.getElementById('galleryOverlay').classList.add('open');
  setBottomTab('gallery');
}
export function openReviewsFeedTab(){
  document.getElementById('referenceOverlay').classList.remove('open');
  document.getElementById('shopOverlay').classList.remove('open');
  document.getElementById('galleryOverlay').classList.remove('open');
  document.getElementById('reviewsFeedOverlay').classList.add('open');
  setBottomTab('reviews');
  loadReviewsFeed();
}
export function goToRecipesTab(){
  document.getElementById('referenceOverlay').classList.remove('open');
  document.getElementById('shopOverlay').classList.remove('open');
  document.getElementById('galleryOverlay').classList.remove('open');
  document.getElementById('reviewsFeedOverlay').classList.remove('open');
  closeDetail();
  setBottomTab('recipes');
}

document.querySelectorAll('.bottom-nav button').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const tab = btn.dataset.tab;
    if(tab==='recipes') goToRecipesTab();
    else if(tab==='reference') openReferenceTab();
    else if(tab==='shopping') openShoppingTab();
    else if(tab==='gallery') openGalleryTab();
    else if(tab==='reviews') openReviewsFeedTab();
  });
});
document.getElementById('referenceBtn').addEventListener('click', ()=> openReferenceTab());
document.getElementById('referenceCloseBtn').addEventListener('click', ()=>{ document.getElementById('referenceOverlay').classList.remove('open'); setBottomTab('recipes'); });
document.getElementById('galleryCloseBtn').addEventListener('click', ()=>{ document.getElementById('galleryOverlay').classList.remove('open'); setBottomTab('recipes'); });
document.getElementById('reviewsFeedCloseBtn').addEventListener('click', ()=>{ document.getElementById('reviewsFeedOverlay').classList.remove('open'); setBottomTab('recipes'); });

// ---------- Esc и стрелки ----------
document.addEventListener('keydown', (e)=>{
  if(e.key === 'Escape'){
    if(document.getElementById('lightboxOverlay').classList.contains('open')) closeLightbox();
    else if(document.getElementById('galleryOverlay').classList.contains('open')) document.getElementById('galleryCloseBtn').click();
    else if(document.getElementById('reviewsFeedOverlay').classList.contains('open')) document.getElementById('reviewsFeedCloseBtn').click();
    else if(document.getElementById('referenceOverlay').classList.contains('open')) document.getElementById('referenceCloseBtn').click();
    else if(document.getElementById('cookOverlay').classList.contains('open')) stopCookMode();
    else if(document.getElementById('confirmOverlay').classList.contains('open')) document.getElementById('confirmCancelBtn').click();
    else if(document.getElementById('shopOverlay').classList.contains('open')) document.getElementById('shopCloseBtn').click();
    else if(document.getElementById('formOverlay').classList.contains('open')) document.getElementById('formCloseBtn').click();
    else if(document.getElementById('detailOverlay').classList.contains('open')) closeDetail();
    return;
  }
  if(document.getElementById('lightboxOverlay').classList.contains('open')){
    if(e.key === 'ArrowRight') showLightboxPhoto(store.lightboxIndex+1);
    if(e.key === 'ArrowLeft') showLightboxPhoto(store.lightboxIndex-1);
    return;
  }
  if(document.getElementById('cookOverlay').classList.contains('open')){
    if(e.key === 'ArrowRight') document.getElementById('cookNextBtn').click();
    if(e.key === 'ArrowLeft') document.getElementById('cookPrevBtn').click();
  }
});

// ---------- Кнопка "наверх" ----------
const scrollTopBtn = document.getElementById('scrollTopBtn');
window.addEventListener('scroll', ()=>{
  scrollTopBtn.classList.toggle('show', window.scrollY > 400);
});
scrollTopBtn.addEventListener('click', ()=> window.scrollTo({top:0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'}));
