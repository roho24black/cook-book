// Конструктор торта: каждый корж настраивается независимо (свой вид теста, вкус,
// диаметр, пропитка), крем выбирается отдельно для каждого "стыка" между коржами.
// Живой разрез перестраивается при любом изменении. При сохранении генерируется
// пошаговая инструкция приготовления, которая открывается в обычном Режиме готовки
// (см. cooking-mode.js) — конструктор не изобретает свой отдельный проигрыватель шагов.

import { store } from './store.js';
import { db, cakesCol, recipesCol } from './firebase-init.js';
import { addDoc, updateDoc, deleteDoc, doc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { escapeHtml, fmtQty, showToast, showConfirm } from './utils.js';
import { setBottomTab, goToRecipesTab } from './bottom-nav.js';
import { startCookMode } from './cooking-mode.js';
import { openDetail } from './detail.js';
import {
  CAKE_DIAMETERS, CAKE_PORTIONS, CAKE_KINDS, CAKE_SYRUPS, CAKE_CREAMS, CAKE_COATS, CAKE_DECORS, CAKE_STATUSES, CAKE_PRESETS,
  findKind, findVariant, findSyrup, findCream, findCoat, findDecor
} from './cake-constants.js';
import { buildCakeTemplate, parseCakeText } from './cake-text-format.js';

const MIN_LAYERS = 2, MAX_LAYERS = 15;

// Какие карточки коржей свёрнуты в компактную строку — чисто UI-состояние конструктора
// (не часть черновика, не сохраняется), сбрасывается при каждом открытии конструктора.
// Полезно при большом числе коржей (до 15), чтобы не листать длиннющую форму.
const collapsedLayers = new Set();

function todayISO(){ return new Date().toISOString().slice(0,10); }

function defaultDraft(){
  return {
    id: null,
    title: '',
    occasion: '',
    description: '',
    date: todayISO(),
    status: 'draft',
    layers: [
      { kind:'biscuit', variant:'choco', diameter:20, syrup:'berry' },
      { kind:'biscuit', variant:'choco', diameter:20, syrup:'berry' },
      { kind:'biscuit', variant:'choco', diameter:20, syrup:'berry' }
    ],
    creams: ['cheese', 'cheese'],
    coatSame: false,
    coat: 'glaze',
    decor: 'berries'
  };
}

// ---------- вкладка "Торты" (список) ----------
export function openCakesTab(){
  document.getElementById('referenceOverlay').classList.remove('open');
  document.getElementById('shopOverlay').classList.remove('open');
  document.getElementById('galleryOverlay').classList.remove('open');
  document.getElementById('reviewsFeedOverlay').classList.remove('open');
  document.getElementById('plannerOverlay')?.classList.remove('open');
  renderCakesList();
  document.getElementById('cakesOverlay').classList.add('open');
  setBottomTab('cakes');
}
export function closeCakesTab(){
  document.getElementById('cakesOverlay').classList.remove('open');
  setBottomTab('recipes');
}
document.getElementById('cakesCloseBtn').addEventListener('click', closeCakesTab);

export function renderCakesList(){
  const wrap = document.getElementById('cakesList');
  if(!wrap) return;
  // Ближайшие по дате торты — сверху (что готовить в первую очередь важнее, чем что
  // недавно создано); торты без даты или с прошедшей датой — ниже, среди них недавно
  // созданные впереди.
  const today = todayISO();
  const cakes = store.cakes.slice().sort((a,b)=>{
    const ad = a.date || '', bd = b.date || '';
    const aUp = ad >= today, bUp = bd >= today;
    if(aUp !== bUp) return aUp ? -1 : 1;
    if(aUp) return ad.localeCompare(bd);
    return (b.dateAdded||'').localeCompare(a.dateAdded||'');
  });
  const cardsHtml = cakes.map(c=>{
    const widest = Math.max(...c.layers.map(l=>l.diameter));
    const portions = estimatePortions(c);
    const badge = CAKE_STATUSES[c.status] || 'черновик';
    const badgeBg = c.status==='cooked' ? 'rgba(198,138,46,.16)' : c.status==='planned' ? 'rgba(122,46,46,.1)' : 'rgba(51,38,31,.08)';
    const badgeColor = c.status==='cooked' ? 'var(--mustard)' : c.status==='planned' ? 'var(--burgundy)' : 'var(--ink-soft)';
    return `<div class="cake-card" data-id="${c.id}">
      <div class="cake-card-thumb">${buildCutSectionHtml(c, 0.34)}</div>
      <div class="cake-card-body">
        <div class="cake-card-title">${escapeHtml(summaryTitle(c))}</div>
        <div class="cake-card-sub">Ø${widest} см · ${escapeHtml(findCream(c.creams[0]||'cheese').label.toLowerCase())} · ${escapeHtml(findDecor(c.decor).label.toLowerCase())}</div>
        <div class="cake-card-tags">
          <span class="cake-tag" style="background:${badgeBg};color:${badgeColor}">${c.date ? escapeHtml(fmtDate(c.date))+' · ' : ''}${badge}</span>
          <span class="cake-tag" style="background:rgba(88,107,77,.14);color:var(--sage)">≈${portions}</span>
        </div>
        <div class="cake-card-actions">
          <button type="button" class="cake-card-action-btn" data-role="clone-cake" data-id="${c.id}">⧉ Похожий</button>
          ${c.recipeId ? `<button type="button" class="cake-card-action-btn" data-role="open-recipe" data-recipe-id="${c.recipeId}">📖 Рецепт</button>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');

  wrap.innerHTML = `
    <div class="planner-actions" style="margin-bottom:16px;">
      <button class="btn btn-primary" id="cakeNewBtnInline">🎂 Собрать новый торт</button>
      <button class="btn" id="cakeImportOpenBtn" style="background:var(--sage); border-color:var(--sage); color:#F5EEDD;">📋 Импорт от Клода</button>
    </div>
    ${cakes.length ? `<div class="cake-grid">${cardsHtml}</div>` : `<div class="empty-state"><h3>Пока нет тортов</h3><p>Собери первый торт из коржей, крема и декора — увидишь разрез сразу.</p></div>`}
  `;
  wrap.querySelector('#cakeNewBtnInline')?.addEventListener('click', ()=> openCakeBuilder(null));
  wrap.querySelector('#cakeImportOpenBtn')?.addEventListener('click', openCakeImportOverlay);
  wrap.querySelectorAll('.cake-card').forEach(el=>{
    el.addEventListener('click', ()=>{
      const cake = store.cakes.find(c=>c.id===el.dataset.id);
      if(cake) openCakeBuilder(cake);
    });
  });
  // Кнопки внутри карточки — не должны открывать редактирование самой карточки
  wrap.querySelectorAll('[data-role="clone-cake"]').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      const cake = store.cakes.find(c=>c.id===btn.dataset.id);
      if(!cake) return;
      openCakeBuilderFromFields({
        title: '', occasion: '', description: '',
        layers: cake.layers, creams: cake.creams, coatSame: cake.coatSame, coat: cake.coat, decor: cake.decor
      });
      showToast('Собрал копию — поменяй дату и повод под новый случай');
    });
  });
  wrap.querySelectorAll('[data-role="open-recipe"]').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      goToRecipesTab();
      openDetail(btn.dataset.recipeId);
    });
  });
}

function fmtDate(iso){
  if(!iso) return '';
  const [y,m,d] = iso.split('-');
  return `${d}.${m}`;
}

function summaryTitle(draft){
  const n = draft.layers.length;
  const kinds = Array.from(new Set(draft.layers.map(l=> findKind(l.kind).label)));
  const noun = n===1?'корж':(n>=2&&n<=4?'коржа':'коржей');
  return `${draft.title || kinds.join(' + ')}, ${n} ${noun}`;
}

// ---------- конструктор (форма + разрез) ----------
export function openCakeBuilder(existing){
  store.cakeDraft = existing
    ? JSON.parse(JSON.stringify({
        id: existing.id, title: existing.title||'', occasion: existing.occasion||'',
        description: existing.description||'', recipeId: existing.recipeId||null,
        date: existing.date || todayISO(), status: existing.status || 'draft',
        layers: existing.layers, creams: existing.creams, coatSame: existing.coatSame,
        coat: existing.coat, decor: existing.decor
      }))
    : defaultDraft();
  document.getElementById('cakesOverlay').classList.remove('open');
  document.getElementById('cakeBuilderOverlay').classList.add('open');
  document.getElementById('cakeDeleteBtn').style.display = existing ? 'inline-flex' : 'none';
  collapsedLayers.clear();
  renderCakeBuilder();
}

// Открыть конструктор сразу с готовым набором полей — пресет или разбор импорта от Клода.
// Всегда как НОВЫЙ торт (черновик без id), даже если пришло из формы редактирования кнопкой "Импорт".
export function openCakeBuilderFromFields(fields){
  store.cakeDraft = { ...defaultDraft(), ...JSON.parse(JSON.stringify(fields)), id: null, recipeId: null };
  document.getElementById('cakesOverlay').classList.remove('open');
  document.getElementById('cakeBuilderOverlay').classList.add('open');
  document.getElementById('cakeDeleteBtn').style.display = 'none';
  collapsedLayers.clear();
  renderCakeBuilder();
}
export function closeCakeBuilder(){
  document.getElementById('cakeBuilderOverlay').classList.remove('open');
  openCakesTab();
}
document.getElementById('cakeBuilderCloseBtn').addEventListener('click', closeCakeBuilder);

function update(mutator){
  mutator(store.cakeDraft);
  renderCakeBuilder();
}

function chip({active, label, role, idx, value, dot, dim}){
  const idxAttr = idx!==undefined ? ` data-idx="${idx}"` : '';
  const dotHtml = dot ? `<span class="cake-dot" style="background:${dot}"></span>` : '';
  const dimAttr = dim ? ' style="opacity:.45"' : '';
  return `<button type="button" class="cake-chip ${active?'active':''}" data-role="${role}"${idxAttr} data-value="${escapeHtml(String(value))}"${dimAttr}>${dotHtml}${escapeHtml(label)}</button>`;
}

function renderCakeBuilder(){
  const d = store.cakeDraft;
  if(!d) return;

  document.getElementById('cakePreview').innerHTML = buildCutSectionHtml(d, 1);
  document.getElementById('cakeWidthLabel').textContent = 'Ø ' + Math.max(...d.layers.map(l=>l.diameter)) + ' см';
  document.getElementById('cakeSummaryTitle').textContent = summaryTitle(d);
  document.getElementById('cakePortions').textContent = '≈ ' + estimatePortions(d) + ' порций';
  document.getElementById('cakeSummarySub').textContent = summarySub(d);
  const warning = stabilityWarning(d);
  const warnEl = document.getElementById('cakeStabilityTip');
  if(warnEl){ warnEl.textContent = warning ? '⚠️ ' + warning : ''; warnEl.style.display = warning ? 'block' : 'none'; }

  // ---- быстрый старт (только для нового торта, не при редактировании) ----
  document.getElementById('cakePresetsRow').innerHTML = !d.id ? `
    <div class="cake-section-title" style="margin-bottom:8px;">Быстрый старт</div>
    <div class="cake-chip-row" style="margin-bottom:18px;">
      ${CAKE_PRESETS.map(p=> `<button type="button" class="cake-chip" data-role="preset" data-value="${p.id}">${p.emoji} ${escapeHtml(p.label)}</button>`).join('')}
    </div>` : '';

  // ---- коржи ----
  const layersHtml = d.layers.map((layer, i)=>{
    const kind = findKind(layer.kind);
    const variant = findVariant(kind, layer.variant);
    const isFirst = i===0, isLast = i===d.layers.length-1;
    const gapHtml = (i < d.layers.length - 1) ? `
      <div class="cake-gap-row">
        <div class="cake-gap-label">Крем между ${i+1} и ${i+2} коржом${kind.shape==='tartlet' ? ' · заодно начинка тарталетки' : ''}</div>
        <div class="cake-chip-row">
          ${CAKE_CREAMS.map(c=> chip({active: (d.creams[i]||CAKE_CREAMS[0].id)===c.id, label:c.label, role:'gap-cream', idx:i, value:c.id, dot:c.c})).join('')}
        </div>
        ${d.creams.length>=2 ? `<button type="button" class="shop-link-btn" data-role="apply-cream-all" data-idx="${i}" style="margin-top:7px;">↧ Такой же крем на все стыки</button>` : ''}
      </div>` : '';
    const isCollapsed = collapsedLayers.has(i);
    const syrupLabel = findSyrup(layer.syrup);
    const summaryLine = `Ø${layer.diameter} см · ${kind.label} — ${variant.label}${syrupLabel.id!=='none' ? ' · пропитка: '+syrupLabel.label.toLowerCase() : ''}`;
    const detailHtml = isCollapsed ? `<div class="cake-layer-collapsed-summary" data-role="toggle-layer" data-idx="${i}">${escapeHtml(summaryLine)}</div>` : `
      <div class="cake-field-label">Диаметр, см</div>
      <div class="cake-chip-row">
        ${CAKE_DIAMETERS.map(dm=> chip({active: layer.diameter===dm, label:String(dm), role:'layer-diameter', idx:i, value:dm})).join('')}
      </div>
      <div class="cake-field-label">Основа</div>
      <div class="cake-chip-row">
        ${CAKE_KINDS.map(k=> chip({active: layer.kind===k.id, label:k.label, role:'layer-kind', idx:i, value:k.id})).join('')}
      </div>
      <div class="cake-field-label">Вкус · ${escapeHtml(kind.label)}</div>
      <div class="cake-chip-row">
        ${kind.vars.map(v=> chip({active: layer.variant===v.id, label:v.label, role:'layer-variant', idx:i, value:v.id, dot:v.c})).join('')}
      </div>
      ${d.layers.length>=3 ? `<button type="button" class="shop-link-btn" data-role="apply-kind-all" data-idx="${i}" style="margin:2px 0 4px;">↧ Такое же тесто и вкус на все коржи (диаметр и пропитка не тронутся)</button>` : ''}
      <div class="cake-field-label">Пропитка этого коржа</div>
      <div class="cake-chip-row">
        ${CAKE_SYRUPS.map(s=> chip({active: layer.syrup===s.id, label:s.label, role:'layer-syrup', idx:i, value:s.id, dot:s.c})).join('')}
      </div>
      ${d.layers.length>=3 ? `<button type="button" class="shop-link-btn" data-role="apply-syrup-all" data-idx="${i}" style="margin-top:6px;">↧ Такая же пропитка на все коржи</button>` : ''}`;
    return `<div class="cake-layer-card">
      <div class="cake-layer-head">
        <span class="cake-layer-num" data-role="toggle-layer" data-idx="${i}" style="cursor:pointer;">
          <span style="display:inline-block; transition:transform .15s; transform:rotate(${isCollapsed?-90:0}deg);">▾</span>
          Корж ${i+1}${isFirst?' · нижний':(isLast?' · верхний':'')}
        </span>
        <div style="display:flex; gap:4px; align-items:center;">
          ${!isFirst ? `<button type="button" class="cake-move-btn" data-role="move-layer" data-idx="${i}" data-dir="up" title="Поднять выше">↑</button>` : ''}
          ${!isLast ? `<button type="button" class="cake-move-btn" data-role="move-layer" data-idx="${i}" data-dir="down" title="Опустить ниже">↓</button>` : ''}
          ${d.layers.length < MAX_LAYERS ? `<button type="button" class="cake-move-btn" data-role="duplicate-layer" data-idx="${i}" title="Продублировать этот корж">⧉</button>` : ''}
          ${d.layers.length > MIN_LAYERS ? `<button type="button" class="row-remove" data-role="remove-layer" data-idx="${i}">×</button>` : ''}
        </div>
      </div>
      ${detailHtml}
      ${gapHtml}
    </div>`;
  }).join('');
  document.getElementById('cakeLayersList').innerHTML = layersHtml;
  document.getElementById('cakeAddLayerBtn').style.display = d.layers.length >= MAX_LAYERS ? 'none' : 'block';
  document.getElementById('cakeLayerCountLabel').textContent = `${d.layers.length} из ${MAX_LAYERS}`;
  const collapseAllBtn = document.getElementById('cakeCollapseAllBtn');
  if(collapseAllBtn){
    collapseAllBtn.style.display = d.layers.length >= 4 ? 'inline' : 'none';
    collapseAllBtn.textContent = collapsedLayers.size >= d.layers.length ? '▾ Развернуть все' : '▸ Свернуть все';
  }

  // ---- покрытие ----
  const outerCream = findCream(d.creams[d.creams.length-1] || 'cheese');
  document.getElementById('cakeCoatSameRow').innerHTML = `
    <div class="cake-same-box ${d.coatSame?'active':''}">${d.coatSame?'✓':''}</div>
    <div style="flex:1;font-size:13px;color:var(--ink)">Снаружи — тот же крем, что в верхнем стыке</div>
    <div style="font:600 10.5px 'IBM Plex Mono',monospace;color:var(--ink-soft)">${escapeHtml(outerCream.label)}</div>`;
  document.getElementById('cakeCoatChips').innerHTML = CAKE_COATS.map(c=>
    chip({active: !d.coatSame && d.coat===c.id, label:c.label, role:'coat', value:c.id, dot:c.c, dim:d.coatSame})
  ).join('');

  // ---- декор ----
  document.getElementById('cakeDecorChips').innerHTML = CAKE_DECORS.map(x=> chip({active: d.decor===x.id, label:x.label, role:'decor', value:x.id})).join('');

  document.getElementById('cakeDateInput').value = d.date;
  document.getElementById('cakeOccasionInput').value = d.occasion;
  document.getElementById('cakeDescriptionInput').value = d.description || '';

  const ingredients = computeCakeIngredients(d);
  document.getElementById('cakeBuyCount').textContent = ingredients.length + ' позиций';
  document.getElementById('cakeBuyPreview').textContent = ingredients.slice(0,4).map(i=>i.name.toLowerCase()).join(', ') + (ingredients.length>4 ? ` и ещё ${ingredients.length-4}` : '');
}

// делегирование кликов — один слушатель на всю форму конструктора, элементы перерисовываются целиком
document.getElementById('cakeBuilderOverlay').addEventListener('click', (e)=>{
  const el = e.target.closest('[data-role]');
  if(!el) return;
  const role = el.dataset.role;
  const idx = el.dataset.idx!==undefined ? parseInt(el.dataset.idx) : undefined;
  const value = el.dataset.value;
  const d = store.cakeDraft;
  if(!d) return;

  if(role==='layer-diameter') update(dr=> dr.layers[idx].diameter = parseInt(value));
  else if(role==='layer-kind') update(dr=>{
    dr.layers[idx].kind = value;
    dr.layers[idx].variant = findKind(value).vars[0].id;
    // Песочное тесто на срезе не пропитывают (это тарталетка, а не бисквит) — сбрасываем
    // пропитку в "без пропитки" по умолчанию, чтобы не удивлял сироп на песочной корзинке.
    // Пользователь всё ещё может выбрать пропитку вручную, если она правда нужна.
    if(value==='short') dr.layers[idx].syrup = 'none';
  });
  else if(role==='layer-variant') update(dr=> dr.layers[idx].variant = value);
  else if(role==='layer-syrup') update(dr=> dr.layers[idx].syrup = value);
  else if(role==='gap-cream') update(dr=> dr.creams[idx] = value);
  else if(role==='remove-layer') update(dr=>{
    dr.layers.splice(idx,1);
    dr.creams.splice(Math.min(idx, dr.creams.length-1),1);
    collapsedLayers.clear(); // индексы свёрнутых карточек всё равно съедут — проще сбросить
  });
  else if(role==='duplicate-layer') update(dr=>{
    if(dr.layers.length >= MAX_LAYERS) return;
    dr.layers.splice(idx+1, 0, { ...dr.layers[idx] });
    dr.creams.splice(idx, 0, dr.creams[idx] ?? dr.creams[dr.creams.length-1] ?? 'cheese');
    collapsedLayers.clear();
  });
  else if(role==='toggle-layer'){
    if(collapsedLayers.has(idx)) collapsedLayers.delete(idx); else collapsedLayers.add(idx);
    renderCakeBuilder();
  }
  else if(role==='apply-cream-all'){
    update(dr=>{ const val = dr.creams[idx]; dr.creams = dr.creams.map(()=> val); });
    showToast(`Крем «${findCream(store.cakeDraft.creams[0]).label}» применён ко всем стыкам`);
  }
  else if(role==='apply-syrup-all'){
    update(dr=>{ const syrup = dr.layers[idx].syrup; dr.layers.forEach(l=> l.syrup = syrup); });
    showToast(`Пропитка «${findSyrup(store.cakeDraft.layers[0].syrup).label}» применена ко всем коржам`);
  }
  else if(role==='apply-kind-all'){
    update(dr=>{ const { kind, variant } = dr.layers[idx]; dr.layers.forEach(l=>{ l.kind = kind; l.variant = variant; }); });
    const k = findKind(store.cakeDraft.layers[0].kind), v = findVariant(k, store.cakeDraft.layers[0].variant);
    showToast(`«${k.label} — ${v.label}» применено ко всем коржам`);
  }
  else if(role==='coat') update(dr=>{ dr.coat = value; dr.coatSame = false; });
  else if(role==='decor') update(dr=> dr.decor = value);
  else if(role==='move-layer') update(dr=>{
    const dir = el.dataset.dir;
    const j = dir==='up' ? idx-1 : idx+1;
    if(j<0 || j>=dr.layers.length) return;
    [dr.layers[idx], dr.layers[j]] = [dr.layers[j], dr.layers[idx]];
    if(collapsedLayers.has(idx) !== collapsedLayers.has(j)) collapsedLayers.clear();
  });
  else if(role==='preset') update(dr=>{
    const preset = CAKE_PRESETS.find(p=>p.id===value);
    if(!preset) return;
    dr.layers = JSON.parse(JSON.stringify(preset.layers));
    dr.creams = JSON.parse(JSON.stringify(preset.creams));
    dr.coatSame = preset.coatSame; dr.coat = preset.coat; dr.decor = preset.decor;
    collapsedLayers.clear();
  });
});

document.getElementById('cakeAddLayerBtn').addEventListener('click', ()=> update(dr=>{
  if(dr.layers.length >= MAX_LAYERS) return;
  const last = dr.layers[dr.layers.length-1];
  dr.layers.push({ kind:last.kind, variant:last.variant, diameter:last.diameter, syrup:last.syrup });
  dr.creams.push(dr.creams[dr.creams.length-1] || 'cheese');
}));
document.getElementById('cakeCollapseAllBtn')?.addEventListener('click', ()=>{
  const d = store.cakeDraft;
  if(!d) return;
  if(collapsedLayers.size >= d.layers.length){ collapsedLayers.clear(); }
  else { d.layers.forEach((_,i)=> collapsedLayers.add(i)); }
  renderCakeBuilder();
});
document.getElementById('cakeCoatSameRow').addEventListener('click', ()=> update(dr=> dr.coatSame = !dr.coatSame));
document.getElementById('cakeDateInput').addEventListener('change', (e)=>{ store.cakeDraft.date = e.target.value; });
document.getElementById('cakeOccasionInput').addEventListener('input', (e)=>{ store.cakeDraft.occasion = e.target.value; });
document.getElementById('cakeDescriptionInput').addEventListener('input', (e)=>{ store.cakeDraft.description = e.target.value; });

document.getElementById('cakeBuyCopyBtn').addEventListener('click', ()=>{
  const items = computeCakeIngredients(store.cakeDraft);
  const text = items.map(i=> `- ${i.name}${i.qty!==null?` — ${fmtQty(i.qty)} ${i.unit}`:` — ${i.unit}`}`).join('\n');
  navigator.clipboard?.writeText('Список покупок на торт:\n'+text)
    .then(()=> showToast(`Скопировано: ${items.length} позиций`))
    .catch(()=> showToast('Не удалось скопировать'));
});

document.getElementById('cakeCookBtn').addEventListener('click', ()=>{
  const recipe = buildVirtualRecipe(store.cakeDraft);
  document.getElementById('cakeBuilderOverlay').classList.remove('open');
  startCookMode(recipe);
});

document.getElementById('cakeDeleteBtn').addEventListener('click', async ()=>{
  if(!store.cakeDraft?.id) return;
  const ok = await showConfirm('Удалить этот торт из «Моих тортов»?');
  if(!ok) return;
  await deleteDoc(doc(db, 'cakes', store.cakeDraft.id));
  showToast('Торт удалён');
  closeCakeBuilder();
});

document.getElementById('cakeSaveBtn').addEventListener('click', async ()=>{
  if(!store.isAdmin){ showToast('Войди как автор, чтобы сохранить торт'); return; }
  const d = store.cakeDraft;
  const data = {
    title: d.title || summaryTitle(d),
    occasion: d.occasion, description: d.description||'', date: d.date, status: d.status || 'planned',
    layers: d.layers, creams: d.creams, coatSame: d.coatSame, coat: d.coat, decor: d.decor
  };
  if(d.id){
    await updateDoc(doc(db, 'cakes', d.id), data);
    showToast('Торт обновлён');
  } else {
    await addDoc(cakesCol, { ...data, dateAdded: new Date().toISOString() });
    showToast('Торт сохранён');
  }
  closeCakeBuilder();
});

// ---------- импорт торта от Клода (по образцу import-recipe.js) ----------
// Кнопка-триггер #cakeImportOpenBtn перерисовывается вместе со списком тортов (renderCakesList),
// поэтому слушатель на неё вешается там же при каждом рендере, а не один раз здесь.
function openCakeImportOverlay(){
  document.getElementById('cakeImportTextInput').value = '';
  document.getElementById('cakeImportStatus').textContent = '';
  document.getElementById('cakeImportOverlay').classList.add('open');
}
document.getElementById('cakeImportCloseBtn')?.addEventListener('click', ()=>{
  document.getElementById('cakeImportOverlay').classList.remove('open');
});
document.getElementById('cakeImportOverlay')?.addEventListener('click', (e)=>{
  if(e.target.id==='cakeImportOverlay') document.getElementById('cakeImportCloseBtn').click();
});
document.getElementById('cakeImportTemplateBtn')?.addEventListener('click', ()=>{
  navigator.clipboard?.writeText(buildCakeTemplate())
    .then(()=> showToast('Шаблон скопирован — вставь его в другой чат с Клодом'))
    .catch(()=> showToast('Не удалось скопировать — выдели текст шаблона вручную'));
});
document.getElementById('cakeImportParseBtn')?.addEventListener('click', ()=>{
  const text = document.getElementById('cakeImportTextInput').value.trim();
  const statusEl = document.getElementById('cakeImportStatus');
  if(!text){ statusEl.textContent = 'Вставь текст, который прислал Клод.'; return; }
  const parsed = parseCakeText(text);
  if(!parsed){
    statusEl.textContent = 'Не получилось разобрать — нужно минимум 2 строки КОРЖ в точном формате из шаблона.';
    return;
  }
  document.getElementById('cakeImportOverlay').classList.remove('open');
  openCakeBuilderFromFields(parsed);
  showToast(`Разобрано: ${parsed.layers.length} ${parsed.layers.length===1?'корж':'коржей'} — проверь и сохрани`);
});

// ---------- разрез (иллюстрация) ----------
// Разрез рисуется как единый SVG (а не стопка div'ов с разной шириной) — так покрытие
// честно облегает силуэт коржей, даже когда диаметры разных коржей отличаются (ярусный
// торт), без рассинхрона между "оболочкой" и внутренними блоками, который выглядел криво.
function decorShapes(decorId, cx, topY, width){
  const shapes = [];
  if(decorId==='berries'){
    const cs=['#8E2B2B','#5E2340','#A93B54','#7A2E2E','#3F5730'];
    const n = Math.max(3, Math.round(width/26));
    for(let i=0;i<n;i++){
      const x = cx - width/2 + (width/(n-1||1))*i;
      const r = 4.5 + (i%3);
      const y = topY - r - (i%2? -2:2);
      shapes.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${cs[i%5]}"/>`);
    }
  } else if(decorId==='shavings'){
    const n = Math.max(5, Math.round(width/14));
    for(let i=0;i<n;i++){
      const x = cx - width/2 + (width/(n-1||1))*i;
      const h = 9+(i%4)*4;
      const rot = i%2? 16:-14;
      shapes.push(`<rect x="${(x-2).toFixed(1)}" y="${(topY-h).toFixed(1)}" width="4" height="${h}" rx="2" fill="${i%2?'#3E2418':'#5A3520'}" transform="rotate(${rot} ${x.toFixed(1)} ${(topY-h/2).toFixed(1)})"/>`);
    }
  } else if(decorId==='sprinkles'){
    const cs=['#C68A2E','#7A2E2E','#586B4D','#E5A2AC','#F2DFA6'];
    const n = Math.max(7, Math.round(width/10));
    for(let i=0;i<n;i++){
      const x = cx - width/2 + (width/(n-1||1))*i;
      const y = topY - 5 - (i%3)*3;
      const rot = (i*37)%80-40;
      shapes.push(`<rect x="${(x-1.7).toFixed(1)}" y="${(y-4).toFixed(1)}" width="3.4" height="8" rx="1.5" fill="${cs[i%5]}" transform="rotate(${rot} ${x.toFixed(1)} ${y.toFixed(1)})"/>`);
    }
  } else if(decorId==='caramel'){
    const n = Math.max(4, Math.round(width/20));
    for(let i=0;i<n;i++){
      const x = cx - width/2 + (width/(n-1||1))*i;
      const h = 12+(i%3)*7;
      shapes.push(`<rect x="${(x-2.5).toFixed(1)}" y="${(topY-h).toFixed(1)}" width="5" height="${h}" rx="2.5" fill="#C7862C"/>`);
    }
  }
  return shapes.join('');
}

// Ориентиры для этого разреза взяты из настоящих иллюстраций тортов (свадебные диаграммы
// "cross-section", схемы кондитеров): у них всегда мягкий купол на самом верхнем ярусе
// (а не плоский прямоугольник), тонкая "подложка" видна на стыке разных диаметров, крем
// слегка "выпирает" в шве между коржами, и по корпусу торта — мягкий блик слева, придающий
// объём вместо плоской заливки.
let svgIdSeq = 0;

export function buildCutSectionHtml(draft, scale){
  const layers = draft.layers;
  const n = layers.length;
  const naked = !draft.coatSame && draft.coat === 'naked';
  const coat = draft.coatSame ? findCream(draft.creams[draft.creams.length-1]||'cheese') : findCoat(draft.coat);
  const coatPad = naked ? 1.5 : Math.max(4, 6*scale);
  const domeH = naked ? 0 : Math.max(4, 7*scale);
  const uid = ++svgIdSeq;

  const widths = layers.map(l=> Math.round((92 + (l.diameter-16)*7.2) * scale));
  const heights = layers.map(l=> Math.max(4, Math.round(findKind(l.kind).heightPx * scale)));
  const gapH = Math.max(3, Math.round((11 - Math.min(6,n)) * scale));

  // y считаем снизу вверх (0 = основание торта на тарелке), потом переводим в координаты SVG
  let y = 0;
  const slabBands = []; // {i, y0, y1, width}
  const gapBands = [];  // {y0, y1, width}
  for(let i=0;i<n;i++){
    slabBands.push({ i, y0:y, y1:y+heights[i], width:widths[i] });
    y += heights[i];
    if(i < n-1){ gapBands.push({ y0:y, y1:y+gapH, width:Math.min(widths[i], widths[i+1]) }); y += gapH; }
  }
  const stackH = y;
  const maxWidth = Math.max(...widths);
  const svgW = maxWidth + coatPad*2 + 24;
  const decorH = 24*scale;
  const plateH = 7*scale;
  const topPad = 10*scale + domeH;
  const svgH = decorH + topPad + stackH + coatPad*2 + plateH + 6;
  const cx = svgW/2;
  const flip = (yUp)=> svgH - plateH - (yUp); // низ стопки стоит чуть выше тарелки

  let svg = `<defs><linearGradient id="sheen${uid}" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".38" stop-color="#fff" stop-opacity="0"/>
    <stop offset="1" stop-color="#000" stop-opacity=".07"/></linearGradient></defs>`;

  // покрытие/обводка — по одному прямоугольнику на корж, растянутому до середины
  // соседних кремовых зазоров, поэтому у одинаковых по ширине соседей шов не виден,
  // а на смене диаметра получается аккуратная "ступенька", как у настоящего ярусного торта.
  // У самого верхнего яруса — купол (эллипс той же заливки поверх плоского края).
  let topHaloY = null, topHaloW = 0;
  if(!naked){
    slabBands.forEach((b, idx)=>{
      const kind = findKind(layers[b.i].kind);
      if(kind.shape === 'tartlet') return;
      const below = idx>0 ? gapBands[idx-1] : null;
      const above = idx<slabBands.length-1 ? gapBands[idx] : null;
      const isTop = !above;
      const y0 = below ? (below.y0+below.y1)/2 : 0;
      const y1 = above ? (above.y0+above.y1)/2 : b.y1 + coatPad*1.6;
      const w = b.width + coatPad*2;
      const h = y1 - y0;
      svg += `<rect x="${(cx-w/2).toFixed(1)}" y="${flip(y1).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${coat.c || '#F1E2C6'}"/>`;
      if(isTop){ topHaloY = flip(y1); topHaloW = w; }
    });
    if(topHaloY!==null && domeH>0){
      svg += `<ellipse cx="${cx.toFixed(1)}" cy="${topHaloY.toFixed(1)}" rx="${(topHaloW/2).toFixed(1)}" ry="${domeH.toFixed(1)}" fill="${coat.c || '#F1E2C6'}"/>`;
    }
  }

  // тонкая подложка ("каше") на стыке коржей РАЗНОГО диаметра — как у настоящего
  // многоярусного торта, где между ярусами видна картонная подложка
  gapBands.forEach((g,i)=>{
    if(widths[i]===widths[i+1]) return;
    const kindBelow = findKind(layers[i].kind), kindAbove = findKind(layers[i+1].kind);
    if(kindBelow.shape==='tartlet' || kindAbove.shape==='tartlet') return;
    const boardW = Math.max(widths[i],widths[i+1]) + coatPad*2 + 5;
    const midY = (g.y0+g.y1)/2;
    svg += `<rect x="${(cx-boardW/2).toFixed(1)}" y="${(flip(midY)-1).toFixed(1)}" width="${boardW.toFixed(1)}" height="2.2" rx="1.1" fill="#E3D4B8"/>`;
  });

  // кремовые прослойки — чуть шире самого коржа ("выпирают" в шве, как у настоящего торта),
  // но не шире внешней обводки
  gapBands.forEach((g,i)=>{
    const cream = findCream(draft.creams[i] || draft.creams[draft.creams.length-1] || 'cheese');
    const kindBelow = findKind(layers[i].kind);
    if(kindBelow.shape === 'tartlet') return; // у тарталетки крем уже показан как начинка внутри чаши
    const bulge = naked ? 0 : Math.min(3*scale, coatPad*0.8);
    const w = g.width + bulge*2;
    svg += `<rect x="${(cx-w/2).toFixed(1)}" y="${flip(g.y1).toFixed(1)}" width="${w.toFixed(1)}" height="${(g.y1-g.y0).toFixed(1)}" fill="${cream.c}"/>`;
  });

  // сами коржи
  slabBands.forEach((b, idx)=>{
    const layer = layers[b.i];
    const kind = findKind(layer.kind);
    const variant = findVariant(kind, layer.variant);
    const syrup = findSyrup(layer.syrup);
    const w = b.width, h = b.y1-b.y0;
    const x = cx - w/2, yTop = flip(b.y1);
    const rx = Math.min(6, h/2.2, w/10);

    if(kind.shape === 'tartlet'){
      const fillCream = b.i < draft.creams.length ? findCream(draft.creams[b.i]) : (draft.coatSame ? findCream(draft.creams[draft.creams.length-1]||'cheese') : coat);
      const rim = w*0.14;
      const pts = [[x,yTop],[x+w,yTop],[x+w-rim,yTop+h],[x+rim,yTop+h]].map(p=>p.join(',')).join(' ');
      svg += `<polygon points="${pts}" fill="${variant.c}"/>`;
      svg += `<rect x="${(x+rim*1.15).toFixed(1)}" y="${(yTop+h*0.16).toFixed(1)}" width="${(w-rim*2.3).toFixed(1)}" height="${(h*0.8).toFixed(1)}" rx="2" fill="${fillCream.c||'#F1E2C6'}"/>`;
    } else {
      svg += `<rect x="${x.toFixed(1)}" y="${yTop.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${rx.toFixed(1)}" fill="${variant.c}"/>`;
      if(variant.speck){
        const dots = Math.max(3, Math.round(w/16));
        for(let k=0;k<dots;k++){
          const dx = x + (w/(dots+1))*(k+1) + (idx%2?2:-2);
          const dy = yTop + h*0.35 + (k%2)*h*0.3;
          svg += `<circle cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="1.2" fill="${variant.speck}"/>`;
        }
      }
      if(kind.thin){
        for(let ty=yTop+3; ty<yTop+h-1; ty+=4.5){
          svg += `<line x1="${x.toFixed(1)}" y1="${ty.toFixed(1)}" x2="${(x+w).toFixed(1)}" y2="${ty.toFixed(1)}" stroke="rgba(74,47,34,.16)" stroke-width="1"/>`;
        }
      }
      if(syrup.c){
        const soakH = Math.max(3, h*0.3);
        svg += `<rect x="${x.toFixed(1)}" y="${yTop.toFixed(1)}" width="${w.toFixed(1)}" height="${soakH.toFixed(1)}" rx="${rx.toFixed(1)}" fill="${syrup.c}" opacity=".72"/>`;
      }
    }
  });

  // мягкий блик слева направо поверх всего корпуса — даёт объём вместо плоской заливки,
  // как на настоящих иллюстрациях (не плоский цвет, а лёгкий цилиндрический "свет-тень")
  const sheenTop = topHaloY!==null ? topHaloY - domeH : flip(stackH);
  const sheenH = svgH - plateH - sheenTop;
  const sheenW = maxWidth + coatPad*2 + 4;
  svg += `<rect x="${(cx-sheenW/2).toFixed(1)}" y="${sheenTop.toFixed(1)}" width="${sheenW.toFixed(1)}" height="${sheenH.toFixed(1)}" rx="${Math.min(10,domeH+coatPad).toFixed(1)}" fill="url(#sheen${uid})"/>`;

  const topLayerWidth = widths[widths.length-1];
  const decorTopY = (topHaloY!==null ? topHaloY - domeH : flip(stackH)) - coatPad*0.6;
  svg += decorShapes(draft.decor, cx, decorTopY, topLayerWidth);

  const plateW = maxWidth + coatPad*2 + 26;
  svg += `<rect x="${(cx-plateW/2).toFixed(1)}" y="${(svgH-plateH).toFixed(1)}" width="${plateW.toFixed(1)}" height="${plateH.toFixed(1)}" rx="${(plateH/2).toFixed(1)}" fill="#E3D4B8"/>`;

  return `<svg class="cake-cutsection-svg" viewBox="0 0 ${svgW.toFixed(1)} ${svgH.toFixed(1)}" width="${svgW.toFixed(0)}" height="${svgH.toFixed(0)}" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`;
}

// ---------- расчёты ----------
// Таблица CAKE_PORTIONS откалибрована на "стандартный" торт из 4 коржей — если коржей
// заметно больше или меньше (или они многоярусные разной ширины), масштабируем линейно
// по количеству коржей, а не только по диаметру самого широкого. Раньше 2-коржовый и
// 6-коржовый торт одного диаметра показывали одинаковый выход, что неверно.
export function estimatePortions(draft){
  const widest = Math.max(...draft.layers.map(l=>l.diameter));
  const nearest = CAKE_DIAMETERS.reduce((a,b)=> Math.abs(b-widest)<Math.abs(a-widest)?b:a);
  const base = (CAKE_PORTIONS[nearest].match(/\d+/g)||[]).map(Number);
  if(base.length<2) return CAKE_PORTIONS[nearest];
  const factor = draft.layers.length / 4;
  const lo = Math.max(1, Math.round(base[0]*factor));
  const hi = Math.max(lo+1, Math.round(base[1]*factor));
  return `${lo}–${hi}`;
}

// Мягкая подсказка про устойчивость: если корж где-то шире того, что стоит под ним,
// торт на срезе честно так и нарисуется (ступенька наружу) — но в реальности такая
// конструкция норовит завалиться, стоит предупредить, а не молча позволить это собрать.
function stabilityWarning(draft){
  for(let i=0;i<draft.layers.length-1;i++){
    if(draft.layers[i+1].diameter > draft.layers[i].diameter){
      return `Корж ${i+2} (Ø${draft.layers[i+1].diameter} см) шире коржа ${i+1} (Ø${draft.layers[i].diameter} см) под ним — такой торт может быть неустойчивым. Обычно каждый следующий ярус делают уже или равным предыдущему.`;
    }
  }
  return null;
}

function summarySub(draft){
  const kinds = Array.from(new Set(draft.layers.map(l=> findKind(l.kind).label))).join(' + ');
  const uniqueCreams = Array.from(new Set(draft.creams.map(c=> findCream(c).label.toLowerCase())));
  const coat = draft.coatSame ? findCream(draft.creams[draft.creams.length-1]||'cheese') : findCoat(draft.coat);
  const decor = findDecor(draft.decor);
  return `${kinds} · ${uniqueCreams.join(', ')} · ${coat.label.toLowerCase()}${decor.id==='none'?'':' · '+decor.label.toLowerCase()}`;
}

function round(v, step){ step = step||10; return Math.max(step, Math.round(v/step)*step); }

// ---------- грубая оценка стоимости ----------
// Ориентировочные цены по продуктам средней полки (руб.), 2026 год — не привязаны к
// конкретному магазину, только чтобы прикинуть порядок цифр, не точная смета.
const PRICE_RULES = [
  { re:/сахарная пудра/i, rate:0.09 },
  { re:/мука/i, rate:0.06 },
  { re:/сахар/i, rate:0.07 },
  { re:/яйца|желток|белок/i, rate:9 },
  { re:/масло сливочное|сливочное масло/i, rate:1.1 },
  { re:/сливки/i, rate:0.35 },
  { re:/сливочный сыр|творожный сыр/i, rate:0.9 },
  { re:/шоколад/i, rate:1.2 },
  { re:/мёд/i, rate:0.6 },
  { re:/кефир/i, rate:0.12 },
  { re:/молоко/i, rate:0.09 },
  { re:/сода|крахмал|соль/i, rate:0.15 },
  { re:/ваниль/i, fixed:40 },
  { re:/какао/i, rate:1.0 },
  { re:/кофе/i, rate:1.5 },
  { re:/клубника|ягод|вишня|малина/i, rate:0.5 },
  { re:/морковь/i, rate:0.08 },
  { re:/лимон/i, fixed:40 },
  { re:/печенье/i, rate:0.5 },
  { re:/йогурт/i, rate:0.6 },
  { re:/желатин/i, rate:3 },
  { re:/краситель/i, fixed:150 },
  { re:/мастика/i, rate:0.8 },
  { re:/посыпк/i, rate:2 },
  { re:/карамель/i, rate:1 },
  { re:/\bром\b/i, rate:2 },
  { re:/вода/i, rate:0.01 },
];
function estimateIngredientCost(item){
  if(item.qty===null || item.qty===undefined) return 0;
  let amt = item.qty;
  if(item.unit==='кг' || item.unit==='л') amt *= 1000;
  const rule = PRICE_RULES.find(r=> r.re.test(item.name));
  if(!rule) return 0; // неизвестный ингредиент — лучше занизить оценку, чем выдумать цену
  return rule.fixed!==undefined ? rule.fixed : amt*rule.rate;
}
export function estimateCakeCost(draft){
  const total = computeCakeIngredients(draft).reduce((sum,i)=> sum + estimateIngredientCost(i), 0);
  return Math.round(total/50)*50; // округляем до полтинника — это прикидка, не смета
}

// Настоящий рецепт компонента из базы (см. cake-component-seed.js) — если автор его
// отредактировал или удалил, здесь просто не найдётся, и конструктор тихо откатится
// на приблизительный расчёт из cake-constants.js.
function findComponentRecipe(componentId){
  return store.recipes.find(r=> r.componentId === componentId);
}

// Плоский слитый список — для "Списка покупок" и сохранённого единого рецепта, где важен
// только итог. Для наглядного разбора "что на какой корж/крем" см. computeCakeIngredientsBreakdown.
export function computeCakeIngredients(draft){
  const acc = {}; // key "name|unit" -> {name, unit, qty}
  const add = (name, qty, unit)=>{
    const key = name+'|'+unit;
    if(!acc[key]) acc[key] = { name, unit, qty: 0 };
    acc[key].qty += qty;
  };

  const breakdown = computeCakeIngredientsBreakdown(draft);
  breakdown.layers.forEach(l=> l.ingredients.forEach(i=> add(i.name, i.qty, i.unit)));
  breakdown.creamGroups.forEach(c=> c.ingredients.forEach(i=> add(i.name, i.qty, i.unit)));
  if(breakdown.coat) breakdown.coat.ingredients.forEach(i=> add(i.name, i.qty, i.unit));
  if(breakdown.decor) breakdown.decor.ingredients.forEach(i=> add(i.name, i.qty, i.unit));

  return Object.values(acc)
    .map(i=> ({ name:i.name, unit:i.unit, qty: roundAmt(i.qty, i.unit) }))
    .sort((a,b)=> a.name.localeCompare(b.name,'ru'));
}

const COUNT_UNITS = new Set(['шт','фл.','стручок']);
function roundAmt(qty, unit){
  // Штучные единицы округляются до целого (минимум 1 — не бывает "0 яиц"), а не до
  // ближайших 5/10, иначе маленький корж Ø16 см округлял бы 0.6 яйца вверх аж до 5.
  return COUNT_UNITS.has(unit) ? Math.max(1,Math.round(qty)) : Math.round(round(qty, qty<30?5:10));
}

function doughIngredientsFor(kind, variant, k){
  const recipe = findComponentRecipe('dough:'+kind.id+':'+variant.id);
  if(recipe && recipe.ingredients?.length) return recipe.ingredients.map(i=> ({ name:i.name, unit:i.unit, qty: roundAmt((i.qty||0)*k, i.unit) }));
  const list = (kind.doughIngredients||[]).map(([name,amt,unit])=> ({ name, unit, qty: roundAmt(amt*k, unit) }));
  if(variant.extra) list.push({ name:variant.extra[0], unit:variant.extra[2], qty: roundAmt(variant.extra[1]*k, variant.extra[2]) });
  if(kind.onceIngredient) list.push({ name:kind.onceIngredient[0], unit:kind.onceIngredient[2], qty: roundAmt(kind.onceIngredient[1], kind.onceIngredient[2]) });
  return list;
}

function syrupIngredientsFor(syrup, k){
  const recipe = findComponentRecipe('syrup:'+syrup.id);
  if(recipe && recipe.ingredients?.length) return recipe.ingredients.map(i=> ({ name:i.name, unit:i.unit, qty: roundAmt((i.qty||0)*k, i.unit) }));
  if(!syrup.ingredient) return [];
  const amt = syrup.fixed ? syrup.ingredient[1] : syrup.ingredient[1]*k;
  return [{ name:syrup.ingredient[0], unit:syrup.ingredient[2], qty: roundAmt(amt, syrup.ingredient[2]) }];
}

function creamIngredientsFor(cream, k){
  const recipe = findComponentRecipe('cream:'+cream.id);
  if(recipe && recipe.ingredients?.length) return recipe.ingredients.map(i=> ({ name:i.name, unit:i.unit, qty: roundAmt((i.qty||0)*k, i.unit) }));
  if(!cream.ingredient) return [];
  return [{ name:cream.ingredient[0], unit:cream.ingredient[2], qty: roundAmt(cream.ingredient[1]*k, cream.ingredient[2]) }];
}

// Разбор по компонентам для техкарты: у каждого коржа — СВОЙ список ингредиентов, честно
// посчитанный под ЕГО диаметр (видно, что Ø16 и Ø26 требуют разного количества муки), а не
// один общий "слепок". Крем, повторяющийся в нескольких стыках, показан ОДНИМ блоком на
// суммарный объём — с пометкой, между какими коржами он идёт, чтобы было понятно, что месить
// его нужно один раз сразу на все стыки, а не отдельными порциями.
export function computeCakeIngredientsBreakdown(draft){
  const layers = draft.layers.map((layer, i)=>{
    const kind = findKind(layer.kind);
    const variant = findVariant(kind, layer.variant);
    const k = Math.pow(layer.diameter/20, 2);
    const syrup = findSyrup(layer.syrup);
    const ingredients = doughIngredientsFor(kind, variant, k).concat(syrup.id!=='none' ? syrupIngredientsFor(syrup, k) : []);
    return { index:i, kind, variant, diameter:layer.diameter, syrupLabel: syrup.id!=='none' ? syrup.label : null, ingredients };
  });

  const creamGaps = {}; // creamId -> [gapIndex,...]
  draft.creams.forEach((creamId, i)=>{ (creamGaps[creamId] = creamGaps[creamId]||[]).push(i); });
  const creamGroups = Object.entries(creamGaps).map(([creamId, gaps])=>{
    const cream = findCream(creamId);
    let k = 0;
    gaps.forEach(i=>{ const a=draft.layers[i], b=draft.layers[i+1]; k += Math.pow(((a.diameter+b.diameter)/2)/20, 2); });
    return { label: cream.label, gapsText: gaps.map(i=> `${i+1}→${i+2}`).join(', '), ingredients: creamIngredientsFor(cream, k) };
  });

  const maxD = Math.max(...draft.layers.map(l=>l.diameter));
  const coat = draft.coatSame ? null : findCoat(draft.coat);
  const coatIngredients = coat?.ingredient ? [{ name:coat.ingredient[0], unit:coat.ingredient[2], qty: roundAmt(coat.ingredient[1]*Math.pow(maxD/20,2), coat.ingredient[2]) }] : [];

  const topD = draft.layers[draft.layers.length-1].diameter;
  const decor = findDecor(draft.decor);
  const decorIngredients = decor.ingredient ? [{ name:decor.ingredient[0], unit:decor.ingredient[2], qty: roundAmt(decor.ingredient[1]*Math.pow(topD/20,2), decor.ingredient[2]) }] : [];

  return { layers, creamGroups, coat: coatIngredients.length ? {label:coat.label, ingredients:coatIngredients} : null, decor: decorIngredients.length ? {label:decor.label, ingredients:decorIngredients} : null };
}

// ---------- автогенерация инструкции ----------
// Приоритет — реальным рецептам компонентов из базы (findComponentRecipe): их шаги
// вставляются как есть, с пометкой какого коржа/стыка касаются. Если рецепта нет
// (автор удалил или это кастомный вкус) — используется краткий сгенерированный шаг.
export function buildVirtualRecipe(draft){
  const steps = [];

  draft.layers.forEach((layer, i)=>{
    const kind = findKind(layer.kind);
    const variant = findVariant(kind, layer.variant);
    const recipe = findComponentRecipe('dough:'+kind.id+':'+variant.id);
    const tag = `[Корж ${i+1} · ${kind.label.toLowerCase()} ${variant.label.toLowerCase()}, Ø${layer.diameter} см] `;
    if(recipe && recipe.steps?.length){
      recipe.steps.forEach(s=> steps.push({ text: tag + (typeof s==='string'?s:s.text), timerMinutes: typeof s==='object' ? s.timerMinutes : null }));
    } else {
      steps.push({ text: `Испечь корж ${i+1}: ${kind.label.toLowerCase()}, ${variant.label.toLowerCase()}, Ø${layer.diameter} см. Духовка ${kind.bakeTemp}°C.`, timerMinutes: kind.bakeMinutes });
    }
  });

  const seenCream = new Set();
  draft.creams.forEach(creamId=>{
    if(seenCream.has(creamId)) return;
    seenCream.add(creamId);
    const cream = findCream(creamId);
    const recipe = findComponentRecipe('cream:'+cream.id);
    const tag = `[Крем: ${cream.label.toLowerCase()}] `;
    if(recipe && recipe.steps?.length){
      recipe.steps.forEach(s=> steps.push({ text: tag + (typeof s==='string'?s:s.text), timerMinutes: typeof s==='object' ? s.timerMinutes : null }));
    } else {
      steps.push({ text: `Приготовить крем: ${cream.label.toLowerCase()}.`, timerMinutes: null });
    }
  });
  if(draft.coatSame===false){
    const coat = findCoat(draft.coat);
    if(coat.id!=='naked' && coat.id!=='cream' && !seenCream.has(draft.coat)){
      steps.push({ text: `Приготовить внешнее покрытие: ${coat.label.toLowerCase()}.`, timerMinutes: null });
    }
  }

  const seenSyrup = new Set();
  draft.layers.forEach(layer=>{
    if(layer.syrup==='none' || seenSyrup.has(layer.syrup)) return;
    seenSyrup.add(layer.syrup);
    const syrup = findSyrup(layer.syrup);
    const recipe = findComponentRecipe('syrup:'+syrup.id);
    const tag = `[Пропитка: ${syrup.label.toLowerCase()}] `;
    if(recipe && recipe.steps?.length){
      recipe.steps.forEach(s=> steps.push({ text: tag + (typeof s==='string'?s:s.text), timerMinutes: typeof s==='object' ? s.timerMinutes : null }));
    } else {
      steps.push({ text: `Приготовить пропитку: ${syrup.label.toLowerCase()} сироп.`, timerMinutes: null });
    }
  });

  draft.layers.forEach((layer, i)=>{
    const kind = findKind(layer.kind);
    const variant = findVariant(kind, layer.variant);
    const syrup = findSyrup(layer.syrup);
    const isLast = i === draft.layers.length-1;
    let text = `Выложить корж ${i+1} (Ø${layer.diameter} см, ${kind.label.toLowerCase()} — ${variant.label.toLowerCase()})`;
    if(syrup.id!=='none') text += `, пропитать: ${syrup.label.toLowerCase()}`;
    if(!isLast){
      const cream = findCream(draft.creams[i]);
      text += kind.shape==='tartlet' ? `, наполнить кремом: ${cream.label.toLowerCase()}` : `, промазать кремом: ${cream.label.toLowerCase()}`;
    }
    text += '.';
    steps.push({ text, timerMinutes: null });
  });

  const coat = draft.coatSame ? findCream(draft.creams[draft.creams.length-1]||'cheese') : findCoat(draft.coat);
  steps.push({ text: coat.id==='naked' ? 'Оставить бока открытыми — наппотель (naked cake), верх выровнять кремом.' : `Покрыть торт снаружи: ${coat.label.toLowerCase()}.`, timerMinutes: null });

  const decor = findDecor(draft.decor);
  if(decor.id!=='none') steps.push({ text: `Украсить: ${decor.label.toLowerCase()}.`, timerMinutes: null });

  steps.push({ text: 'Убрать торт в холодильник минимум на 3–4 часа перед подачей — так коржи и крем схватятся.', timerMinutes: null });

  const ingredients = computeCakeIngredients(draft).map(i=> ({ qty: i.qty, unit: i.unit, name: i.name }));
  const cookTime = steps.reduce((sum,s)=> sum + (s.timerMinutes||0), 0) + 30; // +30 мин на сборку/промазку
  const portionsNums = (estimatePortions(draft).match(/\d+/g)||[]).map(Number);
  const servings = portionsNums.length ? Math.round(portionsNums.reduce((a,b)=>a+b,0)/portionsNums.length) : null;

  return {
    id: 'cake-' + (draft.id || 'draft'),
    title: draft.title || summaryTitle(draft),
    category: 'Торты',
    servings,
    cookTime,
    difficulty: draft.layers.length >= 4 ? 'Сложно' : 'Средне',
    ingredients,
    steps,
    notes: draft.occasion ? `Повод: ${draft.occasion}` : '',
    tags: ['торт']
  };
}

// Если автор не написал своё описание торта — собираем короткое сами из состава.
function generateCakeDescription(draft){
  const kindsPart = draft.layers.map((l,i)=>{
    const kind = findKind(l.kind), variant = findVariant(kind, l.variant);
    return `${variant.label.toLowerCase()} (${kind.label.toLowerCase()}, Ø${l.diameter} см)`;
  }).join(', ');
  const creamsPart = Array.from(new Set(draft.creams.map(c=> findCream(c).label.toLowerCase()))).join(', ');
  const coat = draft.coatSame ? findCream(draft.creams[draft.creams.length-1]||'cheese') : findCoat(draft.coat);
  const decor = findDecor(draft.decor);
  const diamRange = Array.from(new Set(draft.layers.map(l=>l.diameter))).sort((a,b)=>a-b);
  const diamText = diamRange.length>1 ? `от Ø${diamRange[0]} до Ø${diamRange[diamRange.length-1]} см (ярусный)` : `Ø${diamRange[0]} см`;
  return `Торт из ${draft.layers.length} коржей — ${kindsPart}. Между коржами: ${creamsPart}. Снаружи: ${coat.label.toLowerCase()}${decor.id!=='none' ? ', декор — '+decor.label.toLowerCase() : ''}. Диаметр: ${diamText}. Ориентировочный выход — ${estimatePortions(draft)} порций.`;
}

// ---------- технологическая карта (рисунок + разбор по коржам/кремам + описание) ----------
// Печатается как A4 альбомная (см. @page и .cake-techcard в index.html): рисунок и сводка
// слева, разбор по каждому коржу/крему отдельными блоками справа — так на бумаге видно,
// что у Ø16 и Ø26 разный расход муки, а не один "слепок" на весь торт, и что повторяющийся
// крем нужно замесить одним блоком на все стыки сразу, а не отдельно на каждый.
function ingListHtml(items){
  return `<ul class="ing-list">${items.map(i=> `<li><span>${escapeHtml(i.name)}</span><span class="amt">${fmtQty(i.qty)} ${escapeHtml(i.unit)}</span></li>`).join('')}</ul>`;
}

export function renderTechCard(draft){
  const description = (draft.description && draft.description.trim()) || generateCakeDescription(draft);
  const breakdown = computeCakeIngredientsBreakdown(draft);
  const coat = draft.coatSame ? findCream(draft.creams[draft.creams.length-1]||'cheese') : findCoat(draft.coat);
  const decor = findDecor(draft.decor);

  const layerBlocks = breakdown.layers.map(l=> `
    <div class="tc-component tc-component-dough">
      <div class="tc-component-head">🍰 Корж ${l.index+1} · ${escapeHtml(l.kind.label)} — ${escapeHtml(l.variant.label)} · Ø${l.diameter} см${l.syrupLabel ? ' · пропитка: '+escapeHtml(l.syrupLabel) : ''}</div>
      ${ingListHtml(l.ingredients)}
    </div>`).join('');

  const creamBlocks = breakdown.creamGroups.map(c=> `
    <div class="tc-component tc-component-cream">
      <div class="tc-component-head">🥄 Крем «${escapeHtml(c.label)}» — на стыки ${escapeHtml(c.gapsText)} (один замес на все сразу)</div>
      ${ingListHtml(c.ingredients)}
    </div>`).join('');

  const extraBlocks = [
    breakdown.coat ? `<div class="tc-component tc-component-extra"><div class="tc-component-head">🧁 Внешнее покрытие: ${escapeHtml(breakdown.coat.label)}</div>${ingListHtml(breakdown.coat.ingredients)}</div>` : '',
    breakdown.decor ? `<div class="tc-component tc-component-extra"><div class="tc-component-head">✨ Декор: ${escapeHtml(breakdown.decor.label)}</div>${ingListHtml(breakdown.decor.ingredients)}</div>` : ''
  ].join('');

  const today = new Date().toLocaleDateString('ru-RU', { day:'2-digit', month:'long', year:'numeric' });

  document.getElementById('cakeTechCardBody').innerHTML = `
    <div class="tc-header">
      <div>
        <p class="tc-header-kicker">Технологическая карта</p>
        <h2 class="tc-header-title">${escapeHtml(draft.title || summaryTitle(draft))}</h2>
      </div>
      <div class="tc-header-date">${escapeHtml(today)}</div>
    </div>
    <div class="cake-techcard">
      <div class="tc-col-left">
        <div style="display:flex; justify-content:center; margin:6px 0 16px;">${buildCutSectionHtml(draft, 0.85)}</div>
        <p style="font-size:13px; line-height:1.6; color:var(--ink);">${escapeHtml(description)}</p>
        <div class="detail-meta-row">
          <div class="meta-pill">📏 ${escapeHtml(estimatePortions(draft))} порций</div>
          <div class="meta-pill">🧱 ${draft.layers.length} коржей</div>
          ${draft.occasion ? `<div class="meta-pill">🎉 ${escapeHtml(draft.occasion)}</div>` : ''}
        </div>
        <p class="ref-note">Снаружи: ${escapeHtml(coat.label)}${decor.id!=='none' ? ' · декор: '+escapeHtml(decor.label) : ''}</p>
        ${stabilityWarning(draft) ? `<div class="cake-stability-tip" style="margin-top:12px;">⚠️ ${escapeHtml(stabilityWarning(draft))}</div>` : ''}
      </div>
      <div class="tc-col-right">
        <h4 class="tc-col-heading">Разбор по коржам</h4>
        ${layerBlocks}
        <h4 class="tc-col-heading">Разбор по кремам</h4>
        ${creamBlocks}
        ${extraBlocks}
      </div>
    </div>
    <p class="tc-footer">🍰 Собрано в конструкторе «Книги рецептов»</p>
  `;
}

document.getElementById('cakeTechCardBtn')?.addEventListener('click', ()=>{
  renderTechCard(store.cakeDraft);
  document.getElementById('cakeTechCardOverlay').classList.add('open');
});
document.getElementById('cakeTechCardCloseBtn')?.addEventListener('click', ()=>{
  document.getElementById('cakeTechCardOverlay').classList.remove('open');
});
document.getElementById('cakeTechCardOverlay')?.addEventListener('click', (e)=>{
  if(e.target.id==='cakeTechCardOverlay') document.getElementById('cakeTechCardCloseBtn').click();
});
document.getElementById('cakeTechCardPrintBtn')?.addEventListener('click', ()=> window.print());

// ---------- поделиться техкартой ----------
// window.print() как единственный способ "поделиться" ненадёжен в PWA, установленном
// на домашний экран iPhone (standalone-режим) — там иногда просто ничего не происходит.
// Настоящий Web Share API работает и в standalone, поэтому это отдельная кнопка, а не
// то же самое действие, что печать.
function techCardText(draft){
  const breakdown = computeCakeIngredientsBreakdown(draft);
  const description = (draft.description && draft.description.trim()) || generateCakeDescription(draft);
  const lines = [`🎂 ${draft.title || summaryTitle(draft)}`, '', description, '',
    `Порций: ≈${estimatePortions(draft)} · Коржей: ${draft.layers.length}`, '', '— Коржи —'];
  breakdown.layers.forEach(l=>{
    lines.push(`${l.index+1}. ${l.kind.label} — ${l.variant.label}, Ø${l.diameter} см${l.syrupLabel ? ' · пропитка: '+l.syrupLabel : ''}`);
    l.ingredients.forEach(i=> lines.push(`   • ${i.name} — ${fmtQty(i.qty)} ${i.unit}`));
  });
  lines.push('', '— Крема —');
  breakdown.creamGroups.forEach(c=>{
    lines.push(`${c.label} (стыки ${c.gapsText}):`);
    c.ingredients.forEach(i=> lines.push(`   • ${i.name} — ${fmtQty(i.qty)} ${i.unit}`));
  });
  if(breakdown.coat){ lines.push('', `Покрытие: ${breakdown.coat.label}`); breakdown.coat.ingredients.forEach(i=> lines.push(`   • ${i.name} — ${fmtQty(i.qty)} ${i.unit}`)); }
  if(breakdown.decor){ lines.push('', `Декор: ${breakdown.decor.label}`); breakdown.decor.ingredients.forEach(i=> lines.push(`   • ${i.name} — ${fmtQty(i.qty)} ${i.unit}`)); }
  lines.push('', 'Собрано в «Книге рецептов»');
  return lines.join('\n');
}

function svgStringToPngBlob(svgString){
  return new Promise((resolve)=>{
    try{
      const svgBlob = new Blob([svgString], { type:'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);
      const img = new Image();
      img.onload = ()=>{
        const scale = 3;
        const w = (img.naturalWidth || 300) * scale, h = (img.naturalHeight || 300) * scale;
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#F0E7D4';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        canvas.toBlob(b=> resolve(b), 'image/png');
      };
      img.onerror = ()=>{ URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    } catch(e){ resolve(null); }
  });
}

async function shareTechCard(draft){
  const text = techCardText(draft);
  const title = draft.title || summaryTitle(draft);
  try{
    let files = null;
    if(navigator.canShare){
      const png = await svgStringToPngBlob(buildCutSectionHtml(draft, 1.4));
      if(png){
        const file = new File([png], 'tort.png', { type:'image/png' });
        if(navigator.canShare({ files:[file] })) files = [file];
      }
    }
    if(!navigator.share) throw new Error('no-share-api');
    await navigator.share(files ? { title, text, files } : { title, text });
  } catch(e){
    if(e && e.name==='AbortError') return; // пользователь сам закрыл окно шаринга — это не ошибка
    const copied = await navigator.clipboard?.writeText(text).then(()=>true).catch(()=>false);
    showToast(copied ? 'Поделиться напрямую нельзя в этом браузере — текст техкарты скопирован в буфер' : 'Не получилось ни поделиться, ни скопировать — попробуй кнопку печати');
  }
}
document.getElementById('cakeTechCardShareBtn')?.addEventListener('click', ()=> shareTechCard(store.cakeDraft));

document.getElementById('cakeSaveRecipeBtn')?.addEventListener('click', async ()=>{
  if(!store.isAdmin){ showToast('Войди как автор, чтобы сохранить рецепт'); return; }
  const recipe = buildVirtualRecipe(store.cakeDraft);
  const { id, ...data } = recipe;
  // Правила Firestore ограничивают ingredients/steps 60 позициями — у очень навороченного
  // торта (6 разных коржей + куча разных кремов/пропиток) сгенерированный рецепт теоретически
  // может это превысить. Обрезаем защитно и предупреждаем, а не даём записи молча упасть.
  let trimmed = false;
  if(data.ingredients.length > 60){ data.ingredients = data.ingredients.slice(0,60); trimmed = true; }
  if(data.steps.length > 60){ data.steps = data.steps.slice(0,60); trimmed = true; }
  const newRecipe = await addDoc(recipesCol, { ...data, favorite:false, dateAdded: new Date().toISOString() });
  // Если этот торт уже сохранён отдельной записью — привязываем к нему id рецепта,
  // чтобы на карточке в "Мои торты" появилась ссылка "📖 Рецепт" прямо на готовый рецепт.
  if(store.cakeDraft.id){
    store.cakeDraft.recipeId = newRecipe.id;
    await updateDoc(doc(db, 'cakes', store.cakeDraft.id), { recipeId: newRecipe.id }).catch(()=>{});
  }
  showToast(trimmed ? 'Рецепт сохранён, но список пришлось обрезать до 60 позиций — очень уж навороченный торт' : 'Единый рецепт торта сохранён в «Рецептах»');
});
