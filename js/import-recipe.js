// Импорт рецепта из внешнего источника — двумя способами:
// 1) по ссылке: пробуем скачать страницу через публичный CORS-прокси и найти
//    разметку schema.org/Recipe (JSON-LD), которую многие кулинарные сайты вставляют для Google.
//    Работает не на всех сайтах — это лучшее, что можно сделать без своего сервера.
// 2) вставленный текст: пользователь копирует текст рецепта вручную, мы разбираем его
//    эвристикой (по числам в начале строки, по номерам шагов и т.д.).
// В обоих случаях результат — это ЧЕРНОВИК, который открывается в обычной форме
// добавления рецепта для проверки и правки, а не сохраняется в базу напрямую.

import { openForm } from './form.js';
import { showToast } from './utils.js';

const FRACTIONS = { '½':0.5,'⅓':1/3,'⅔':2/3,'¼':0.25,'¾':0.75,'⅛':0.125 };

function parseFraction(raw){
  if(FRACTIONS[raw] !== undefined) return FRACTIONS[raw];
  if(raw.includes('/')){
    const [a,b] = raw.split('/').map(Number);
    if(b) return a/b;
  }
  const n = parseFloat(raw.replace(',', '.'));
  return isNaN(n) ? null : n;
}

function stripHtml(s){
  if(!s) return '';
  const d = document.createElement('div');
  d.innerHTML = s;
  return (d.textContent || d.innerText || '').replace(/\s+/g,' ').trim();
}

const UNIT_MAP = {
  'г':'г','гр':'г','грамм':'г','граммов':'г','граммы':'г','g':'г',
  'кг':'кг','килограмм':'кг','kg':'кг',
  'мл':'мл','ml':'мл',
  'л':'л','литр':'л','l':'л',
  'ст.л':'ст.л.','ст.л.':'ст.л.','столовая':'ст.л.','tbsp':'ст.л.','ст':'ст.л.',
  'ч.л':'ч.л.','ч.л.':'ч.л.','чайная':'ч.л.','tsp':'ч.л.',
  'шт':'шт','штук':'шт','штуки':'шт','pcs':'шт','piece':'шт','pieces':'шт',
  'щепотка':'щепотка','щепоть':'щепотка','pinch':'щепотка',
  'стакан':'шт','cup':'шт','cups':'шт',
};

function parseIngredientLine(raw){
  const line = stripHtml(raw).trim();
  const m = line.match(/^([\d]+(?:[.,]\d+)?(?:\s*\/\s*\d+)?|[½⅓⅔¼¾⅛])\s*([a-zA-Zа-яёА-ЯЁ.]+)?\.?\s+(.*)$/);
  if(m){
    const qty = parseFraction(m[1].replace(/\s/g,''));
    const unitWord = (m[2]||'').toLowerCase().replace(/\.$/,'');
    const mappedUnit = UNIT_MAP[unitWord];
    const name = (m[3]||'').trim();
    if(qty !== null && mappedUnit && name){
      return { qty, unit: mappedUnit, name };
    }
    if(qty !== null && name){
      // число нашли, а единицу измерения — нет; не теряем текст, кладём остаток как есть
      return { qty: null, unit: 'по вкусу', name: line };
    }
  }
  return { qty: null, unit: 'по вкусу', name: line };
}

function parseDurationToMinutes(iso){
  if(!iso || typeof iso !== 'string') return null;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/i);
  if(!m) return null;
  const total = (parseInt(m[1]||0)*60) + parseInt(m[2]||0);
  return total > 0 ? total : null;
}

function parseYield(y){
  if(!y) return null;
  const str = Array.isArray(y) ? y[0] : y;
  const m = String(str).match(/\d+/);
  return m ? parseInt(m[0]) : null;
}

function normalizeSchemaRecipe(item){
  const title = typeof item.name === 'string' ? item.name : (Array.isArray(item.name) ? item.name[0] : '');
  const ingredients = (item.recipeIngredient || item.ingredients || []).map(parseIngredientLine);

  let instructions = item.recipeInstructions || [];
  if(typeof instructions === 'string') instructions = instructions.split(/\n+/);
  const steps = instructions.flatMap(step=>{
    if(typeof step === 'string') return [{ text: stripHtml(step), timerMinutes: null }];
    if(step['@type'] === 'HowToSection' && Array.isArray(step.itemListElement)){
      return step.itemListElement.map(sub=>({ text: stripHtml(sub.text||sub.name||''), timerMinutes: null }));
    }
    return [{ text: stripHtml(step.text || step.name || ''), timerMinutes: null }];
  }).filter(s=>s.text);

  return {
    title: stripHtml(title),
    category: '',
    servings: parseYield(item.recipeYield),
    cookTime: parseDurationToMinutes(item.totalTime || item.cookTime),
    difficulty: 'Средне',
    ingredients,
    steps,
    notes: ''
  };
}

function extractRecipeFromHtml(html){
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  for(const script of scripts){
    try{
      const data = JSON.parse(script.textContent);
      const candidates = Array.isArray(data) ? data : (Array.isArray(data['@graph']) ? data['@graph'] : [data]);
      for(const item of candidates){
        const types = Array.isArray(item['@type']) ? item['@type'] : [item['@type']];
        if(types.some(t => (t||'').toLowerCase() === 'recipe')){
          return normalizeSchemaRecipe(item);
        }
      }
    }catch(e){ /* битый JSON на странице — пропускаем */ }
  }
  return null;
}

function fetchWithTimeout(url, ms){
  return Promise.race([
    fetch(url),
    new Promise((_,reject)=> setTimeout(()=> reject(new Error('Таймаут запроса')), ms))
  ]);
}

// ---------- Разбор вставленного текста (запасной способ) ----------
function parseTextBlock(text){
  const lines = text.split('\n').map(l=>l.trim()).filter(Boolean);
  const looksLikeIngredient = /^[\d½⅓⅔¼¾⅛]/;
  const looksLikeStepNumber = /^(\d+[\.\)]|шаг\s*\d+)/i;
  const ingredients = [];
  const steps = [];
  let title = '';

  lines.forEach((line, idx)=>{
    if(idx===0 && !looksLikeIngredient.test(line) && !looksLikeStepNumber.test(line) && line.length < 100){
      title = line;
      return;
    }
    if(looksLikeStepNumber.test(line)){
      steps.push({ text: line.replace(/^(\d+[\.\)]|шаг\s*\d+:?)\s*/i,''), timerMinutes: null });
      return;
    }
    if(looksLikeIngredient.test(line)){
      ingredients.push(parseIngredientLine(line));
      return;
    }
    if(line.length > 60 || /[.!?]\s*$/.test(line)){
      steps.push({ text: line, timerMinutes: null });
    } else {
      ingredients.push({ qty: null, unit: 'по вкусу', name: line });
    }
  });

  return { title, category:'', servings:null, cookTime:null, difficulty:'Средне', ingredients, steps, notes:'' };
}

// ---------- UI ----------
function resetImportUI(){
  document.getElementById('importUrlInput').value = '';
  document.getElementById('importTextInput').value = '';
  document.getElementById('importStatus').textContent = '';
}
function openImportModal(){ resetImportUI(); document.getElementById('importOverlay').classList.add('open'); }
function closeImportModal(){ document.getElementById('importOverlay').classList.remove('open'); }

document.getElementById('importBtn').addEventListener('click', openImportModal);
document.getElementById('importCloseBtn').addEventListener('click', closeImportModal);
document.getElementById('importOverlay').addEventListener('click', (e)=>{ if(e.target.id==='importOverlay') closeImportModal(); });

document.querySelectorAll('.import-tab').forEach(tab=>{
  tab.addEventListener('click', ()=>{
    document.querySelectorAll('.import-tab').forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('importUrlPane').style.display = tab.dataset.mode==='url' ? 'block' : 'none';
    document.getElementById('importTextPane').style.display = tab.dataset.mode==='text' ? 'block' : 'none';
    document.getElementById('importStatus').textContent = '';
  });
});

document.getElementById('importUrlBtn').addEventListener('click', async ()=>{
  const url = document.getElementById('importUrlInput').value.trim();
  const statusEl = document.getElementById('importStatus');
  if(!url){ statusEl.textContent = 'Вставь ссылку на рецепт.'; return; }
  statusEl.textContent = 'Загружаю страницу…';
  try{
    const res = await fetchWithTimeout('https://api.allorigins.win/raw?url=' + encodeURIComponent(url), 15000);
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const html = await res.text();
    const parsed = extractRecipeFromHtml(html);
    if(!parsed || (parsed.ingredients.length===0 && parsed.steps.length===0)){
      statusEl.textContent = 'Не нашёл на странице структурированный рецепт. Попробуй вкладку «Вставить текст» — скопируй рецепт вручную.';
      return;
    }
    closeImportModal();
    openForm(parsed);
    showToast('Рецепт распознан — проверь и сохрани');
  }catch(e){
    console.error(e);
    statusEl.textContent = 'Не получилось загрузить страницу (сайт мог заблокировать доступ или прокси сейчас недоступен). Попробуй вкладку «Вставить текст».';
  }
});

document.getElementById('importTextBtn').addEventListener('click', ()=>{
  const text = document.getElementById('importTextInput').value.trim();
  const statusEl = document.getElementById('importStatus');
  if(!text){ statusEl.textContent = 'Вставь текст рецепта.'; return; }
  const parsed = parseTextBlock(text);
  if(parsed.ingredients.length===0 && parsed.steps.length===0){
    statusEl.textContent = 'Не получилось ничего разобрать — добавь рецепт вручную кнопкой «+ Добавить рецепт».';
    return;
  }
  closeImportModal();
  openForm(parsed);
  showToast('Текст разобран — проверь поля перед сохранением');
});
