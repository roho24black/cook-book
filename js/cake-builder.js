// Конструктор торта: каждый корж настраивается независимо (свой вид теста, вкус,
// диаметр, пропитка), крем выбирается отдельно для каждого "стыка" между коржами.
// Живой разрез перестраивается при любом изменении. При сохранении генерируется
// пошаговая инструкция приготовления, которая открывается в обычном Режиме готовки
// (см. cooking-mode.js) — конструктор не изобретает свой отдельный проигрыватель шагов.

import { store } from './store.js';
import { db, cakesCol } from './firebase-init.js';
import { addDoc, updateDoc, deleteDoc, doc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { escapeHtml, fmtQty, showToast, showConfirm } from './utils.js';
import { setBottomTab } from './bottom-nav.js';
import { startCookMode } from './cooking-mode.js';
import {
  CAKE_DIAMETERS, CAKE_PORTIONS, CAKE_KINDS, CAKE_SYRUPS, CAKE_CREAMS, CAKE_COATS, CAKE_DECORS, CAKE_STATUSES, CAKE_PRESETS,
  findKind, findVariant, findSyrup, findCream, findCoat, findDecor
} from './cake-constants.js';
import { buildCakeTemplate, parseCakeText } from './cake-text-format.js';

const MIN_LAYERS = 2, MAX_LAYERS = 6;

function todayISO(){ return new Date().toISOString().slice(0,10); }

function defaultDraft(){
  return {
    id: null,
    title: '',
    occasion: '',
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

// ---------- цвет ----------
function hex2rgb(h){ return [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)]; }
function mix(a, b, t){
  if(!a) return b; if(!b) return a;
  const A=hex2rgb(a), B=hex2rgb(b);
  return 'rgb(' + A.map((v,i)=> Math.round(v+(B[i]-v)*t)).join(',') + ')';
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
  const cakes = store.cakes.slice().reverse(); // новые сверху
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
        date: existing.date || todayISO(), status: existing.status || 'draft',
        layers: existing.layers, creams: existing.creams, coatSame: existing.coatSame,
        coat: existing.coat, decor: existing.decor
      }))
    : defaultDraft();
  document.getElementById('cakesOverlay').classList.remove('open');
  document.getElementById('cakeBuilderOverlay').classList.add('open');
  document.getElementById('cakeDeleteBtn').style.display = existing ? 'inline-flex' : 'none';
  renderCakeBuilder();
}

// Открыть конструктор сразу с готовым набором полей — пресет или разбор импорта от Клода.
// Всегда как НОВЫЙ торт (черновик без id), даже если пришло из формы редактирования кнопкой "Импорт".
export function openCakeBuilderFromFields(fields){
  store.cakeDraft = { ...defaultDraft(), ...JSON.parse(JSON.stringify(fields)), id: null };
  document.getElementById('cakesOverlay').classList.remove('open');
  document.getElementById('cakeBuilderOverlay').classList.add('open');
  document.getElementById('cakeDeleteBtn').style.display = 'none';
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
      </div>` : '';
    return `<div class="cake-layer-card">
      <div class="cake-layer-head">
        <span class="cake-layer-num">Корж ${i+1}${isFirst?' · нижний':(isLast?' · верхний':'')}</span>
        <div style="display:flex; gap:4px; align-items:center;">
          ${!isFirst ? `<button type="button" class="cake-move-btn" data-role="move-layer" data-idx="${i}" data-dir="up" title="Поднять выше">↑</button>` : ''}
          ${!isLast ? `<button type="button" class="cake-move-btn" data-role="move-layer" data-idx="${i}" data-dir="down" title="Опустить ниже">↓</button>` : ''}
          ${d.layers.length > MIN_LAYERS ? `<button type="button" class="row-remove" data-role="remove-layer" data-idx="${i}">×</button>` : ''}
        </div>
      </div>
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
      <div class="cake-field-label">Пропитка этого коржа</div>
      <div class="cake-chip-row">
        ${CAKE_SYRUPS.map(s=> chip({active: layer.syrup===s.id, label:s.label, role:'layer-syrup', idx:i, value:s.id, dot:s.c})).join('')}
      </div>
      ${gapHtml}
    </div>`;
  }).join('');
  document.getElementById('cakeLayersList').innerHTML = layersHtml;
  document.getElementById('cakeAddLayerBtn').style.display = d.layers.length >= MAX_LAYERS ? 'none' : 'block';
  document.getElementById('cakeLayerCountLabel').textContent = `${d.layers.length} из ${MAX_LAYERS}`;

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
  else if(role==='layer-kind') update(dr=>{ dr.layers[idx].kind = value; dr.layers[idx].variant = findKind(value).vars[0].id; });
  else if(role==='layer-variant') update(dr=> dr.layers[idx].variant = value);
  else if(role==='layer-syrup') update(dr=> dr.layers[idx].syrup = value);
  else if(role==='gap-cream') update(dr=> dr.creams[idx] = value);
  else if(role==='remove-layer') update(dr=>{
    dr.layers.splice(idx,1);
    dr.creams.splice(Math.min(idx, dr.creams.length-1),1);
  });
  else if(role==='coat') update(dr=>{ dr.coat = value; dr.coatSame = false; });
  else if(role==='decor') update(dr=> dr.decor = value);
  else if(role==='move-layer') update(dr=>{
    const dir = el.dataset.dir;
    const j = dir==='up' ? idx-1 : idx+1;
    if(j<0 || j>=dr.layers.length) return;
    [dr.layers[idx], dr.layers[j]] = [dr.layers[j], dr.layers[idx]];
  });
  else if(role==='preset') update(dr=>{
    const preset = CAKE_PRESETS.find(p=>p.id===value);
    if(!preset) return;
    dr.layers = JSON.parse(JSON.stringify(preset.layers));
    dr.creams = JSON.parse(JSON.stringify(preset.creams));
    dr.coatSame = preset.coatSame; dr.coat = preset.coat; dr.decor = preset.decor;
  });
});

document.getElementById('cakeAddLayerBtn').addEventListener('click', ()=> update(dr=>{
  if(dr.layers.length >= MAX_LAYERS) return;
  const last = dr.layers[dr.layers.length-1];
  dr.layers.push({ kind:last.kind, variant:last.variant, diameter:last.diameter, syrup:last.syrup });
  dr.creams.push(dr.creams[dr.creams.length-1] || 'cheese');
}));
document.getElementById('cakeCoatSameRow').addEventListener('click', ()=> update(dr=> dr.coatSame = !dr.coatSame));
document.getElementById('cakeDateInput').addEventListener('change', (e)=>{ store.cakeDraft.date = e.target.value; });
document.getElementById('cakeOccasionInput').addEventListener('input', (e)=>{ store.cakeDraft.occasion = e.target.value; });

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
    occasion: d.occasion, date: d.date, status: d.status || 'planned',
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
function slabHtml(width, height, color, speckColor, thin){
  const speck = speckColor ? `background-image:radial-gradient(${speckColor} 1.1px, transparent 1.2px);background-size:8px 8px;` : '';
  const thinTexture = thin ? `background-image:repeating-linear-gradient(0deg, rgba(74,47,34,.14) 0, rgba(74,47,34,.14) 1.5px, transparent 1.5px, transparent 5px);` : '';
  return `<div class="cake-slab" style="width:${width}px;height:${height}px;background:${color};${speck}${thinTexture}"></div>`;
}
function tartletHtml(width, height, crustColor, fillColor){
  const rimIn = Math.round(width*0.16);
  return `<div class="cake-tartlet" style="width:${width}px;height:${height}px;background:${crustColor};
    clip-path:polygon(0% 0%,100% 0%,${100-Math.round(rimIn/width*100)}% 100%,${Math.round(rimIn/width*100)}% 100%)">
    <div class="cake-tartlet-fill" style="background:${fillColor}"></div>
  </div>`;
}
function decorRowHtml(decorId, width){
  const items = [];
  if(decorId==='berries'){
    const cs=['#8E2B2B','#5E2340','#A93B54','#7A2E2E','#3F5730'];
    const n = Math.max(3, Math.round(width/26));
    for(let i=0;i<n;i++) items.push(`<span style="width:${9+(i%3)}px;height:${9+(i%3)}px;border-radius:50%;background:${cs[i%5]};align-self:${i%2?'flex-end':'center'}"></span>`);
  } else if(decorId==='shavings'){
    const n = Math.max(4, Math.round(width/16));
    for(let i=0;i<n;i++) items.push(`<span style="width:4px;height:${10+(i%4)*4}px;border-radius:2px;background:${i%2?'#3E2418':'#5A3520'};transform:rotate(${i%2?18:-14}deg);margin-left:-1px"></span>`);
  } else if(decorId==='sprinkles'){
    const cs=['#C68A2E','#7A2E2E','#586B4D','#E5A2AC','#F2DFA6'];
    const n = Math.max(6, Math.round(width/11));
    for(let i=0;i<n;i++) items.push(`<span style="width:3.5px;height:8px;border-radius:2px;background:${cs[i%5]};transform:rotate(${(i*37)%80-40}deg);align-self:${i%3?'flex-end':'center'}"></span>`);
  } else if(decorId==='caramel'){
    const n = Math.max(4, Math.round(width/20));
    for(let i=0;i<n;i++) items.push(`<span style="width:5px;height:${12+(i%3)*7}px;border-radius:3px 3px 4px 4px;background:linear-gradient(180deg,#D9A03F,#B06E20);align-self:flex-end"></span>`);
  }
  if(!items.length) return '';
  return `<div class="cake-decor-row" style="width:${width}px">${items.join('')}</div>`;
}

export function buildCutSectionHtml(draft, scale){
  const layers = draft.layers;
  const n = layers.length;
  const widths = layers.map(l=> Math.round((92 + (l.diameter-16)*7.2) * scale));
  const maxWidth = Math.max(...widths);

  const pieces = []; // снизу вверх
  for(let i=0;i<n;i++){
    const layer = layers[i];
    const kind = findKind(layer.kind);
    const variant = findVariant(kind, layer.variant);
    const syrup = findSyrup(layer.syrup);
    const w = widths[i];
    const h = Math.max(4, Math.round(kind.heightPx * scale));
    let color = variant.c;
    if(syrup.c) color = mix(color, syrup.c, syrup.id==='sugar' ? 0.08 : 0.15);

    if(kind.shape === 'tartlet'){
      const fillCream = i < draft.creams.length ? findCream(draft.creams[i]) : (draft.coatSame ? findCream(draft.creams[draft.creams.length-1]||'cheese') : findCoat(draft.coat));
      pieces.push(tartletHtml(w, h, variant.c, fillCream.c || '#F1E2C6'));
    } else {
      pieces.push(slabHtml(w, h, color, variant.speck, kind.thin));
    }

    if(i < n-1 && kind.shape !== 'tartlet'){
      const cream = findCream(draft.creams[i] || draft.creams[draft.creams.length-1] || 'cheese');
      const creamH = Math.max(3, Math.round((11 - Math.min(6,n)) * scale));
      pieces.push(`<div style="width:${w}px;height:${creamH}px;background:${cream.c};box-shadow:inset 0 0 0 .5px rgba(51,38,31,.08)"></div>`);
    }
  }
  pieces.reverse(); // верхний корж — первым в DOM (flex-direction: column)

  const coat = draft.coatSame ? findCream(draft.creams[draft.creams.length-1]||'cheese') : findCoat(draft.coat);
  const naked = !draft.coatSame && draft.coat === 'naked';
  const pad = naked ? 0 : Math.round(6*scale);
  const shellStyle = naked ? '' : `padding:${pad}px;background:${coat.c||'#F1E2C6'};border-radius:${Math.round(16*scale)}px ${Math.round(16*scale)}px ${Math.round(7*scale)}px ${Math.round(7*scale)}px;box-shadow:0 ${Math.round(4*scale)}px ${Math.round(12*scale)}px rgba(51,38,31,.14);`;
  const innerBorder = naked ? `border:1px solid rgba(51,38,31,.18);border-radius:${Math.round(8*scale)}px;` : `border-radius:${Math.round(8*scale)}px;overflow:hidden;`;

  const decor = decorRowHtml(draft.decor, maxWidth);
  const plateW = maxWidth + Math.round(pad*2) + Math.round(30*scale);

  return `<div class="cake-cutsection" style="align-items:center;">
    ${decor}
    <div style="${shellStyle}">
      <div style="width:${maxWidth}px;display:flex;flex-direction:column;align-items:center;${innerBorder}">
        ${pieces.join('')}
      </div>
    </div>
    <div class="cake-plate" style="width:${plateW}px;height:${Math.round(6*scale)}px"></div>
  </div>`;
}

// ---------- расчёты ----------
export function estimatePortions(draft){
  const widest = Math.max(...draft.layers.map(l=>l.diameter));
  const nearest = CAKE_DIAMETERS.reduce((a,b)=> Math.abs(b-widest)<Math.abs(a-widest)?b:a);
  return CAKE_PORTIONS[nearest];
}

function summarySub(draft){
  const kinds = Array.from(new Set(draft.layers.map(l=> findKind(l.kind).label))).join(' + ');
  const uniqueCreams = Array.from(new Set(draft.creams.map(c=> findCream(c).label.toLowerCase())));
  const coat = draft.coatSame ? findCream(draft.creams[draft.creams.length-1]||'cheese') : findCoat(draft.coat);
  const decor = findDecor(draft.decor);
  return `${kinds} · ${uniqueCreams.join(', ')} · ${coat.label.toLowerCase()}${decor.id==='none'?'':' · '+decor.label.toLowerCase()}`;
}

function round(v, step){ step = step||10; return Math.max(step, Math.round(v/step)*step); }

export function computeCakeIngredients(draft){
  const acc = {}; // key "name|unit" -> {name, unit, qty}
  const add = (name, qty, unit)=>{
    const key = name+'|'+unit;
    if(!acc[key]) acc[key] = { name, unit, qty: 0 };
    acc[key].qty += qty;
  };
  const onceAdded = new Set();

  draft.layers.forEach(layer=>{
    const kind = findKind(layer.kind);
    const variant = findVariant(kind, layer.variant);
    const k = Math.pow(layer.diameter/20, 2);
    (kind.doughIngredients||[]).forEach(([name, amt, unit])=> add(name, amt*k, unit));
    if(variant.extra) add(variant.extra[0], variant.extra[1]*k, variant.extra[2]);
    if(kind.onceIngredient && !onceAdded.has(kind.id)){ onceAdded.add(kind.id); add(kind.onceIngredient[0], kind.onceIngredient[1], kind.onceIngredient[2]); }

    const syrup = findSyrup(layer.syrup);
    if(syrup.ingredient){
      if(syrup.fixed){ if(!onceAdded.has('syrup-'+syrup.id)){ onceAdded.add('syrup-'+syrup.id); add(syrup.ingredient[0], syrup.ingredient[1], syrup.ingredient[2]); } }
      else add(syrup.ingredient[0], syrup.ingredient[1]*k, syrup.ingredient[2]);
    }
  });

  draft.creams.forEach((creamId, i)=>{
    const cream = findCream(creamId);
    const a = draft.layers[i], b = draft.layers[i+1];
    const k = Math.pow(((a.diameter+b.diameter)/2)/20, 2);
    if(cream.ingredient) add(cream.ingredient[0], cream.ingredient[1]*k, cream.ingredient[2]);
  });

  const maxD = Math.max(...draft.layers.map(l=>l.diameter));
  const kOuter = Math.pow(maxD/20, 2);
  const coat = draft.coatSame ? null : findCoat(draft.coat);
  if(coat?.ingredient) add(coat.ingredient[0], coat.ingredient[1]*kOuter, coat.ingredient[2]);

  const topD = draft.layers[draft.layers.length-1].diameter;
  const kTop = Math.pow(topD/20, 2);
  const decor = findDecor(draft.decor);
  if(decor.ingredient) add(decor.ingredient[0], decor.ingredient[1]*kTop, decor.ingredient[2]);

  return Object.values(acc)
    .map(i=> ({ name:i.name, unit:i.unit, qty: i.unit==='фл.'||i.unit==='стручок' ? Math.max(1,Math.round(i.qty)) : Math.round(round(i.qty, i.qty<30?5:10)) }))
    .sort((a,b)=> a.name.localeCompare(b.name,'ru'));
}

// ---------- автогенерация инструкции ----------
export function buildVirtualRecipe(draft){
  const steps = [];
  const seenBake = new Set();

  draft.layers.forEach((layer, i)=>{
    const kind = findKind(layer.kind);
    const variant = findVariant(kind, layer.variant);
    steps.push({
      text: `Испечь корж ${i+1}: ${kind.label.toLowerCase()}, ${variant.label.toLowerCase()}, Ø${layer.diameter} см. Духовка ${kind.bakeTemp}°C.`,
      timerMinutes: kind.bakeMinutes
    });
  });

  const seenCream = new Set();
  draft.creams.forEach(creamId=>{
    if(seenCream.has(creamId)) return;
    seenCream.add(creamId);
    steps.push({ text: `Приготовить крем: ${findCream(creamId).label.toLowerCase()}.`, timerMinutes: null });
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
    steps.push({ text: `Приготовить пропитку: ${findSyrup(layer.syrup).label.toLowerCase()} сироп.`, timerMinutes: null });
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

  return {
    id: 'cake-' + (draft.id || 'draft'),
    title: draft.title || summaryTitle(draft),
    category: 'Торты',
    servings: null,
    cookTime: null,
    difficulty: 'Средне',
    ingredients,
    steps,
    notes: draft.occasion ? `Повод: ${draft.occasion}` : ''
  };
}
