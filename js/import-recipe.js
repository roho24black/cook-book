// Импорт рецепта из внешнего источника — двумя способами:
// 1) по ссылке: пробуем скачать страницу (через несколько запасных CORS-прокси по очереди)
//    и найти разметку рецепта — сперва JSON-LD (schema.org/Recipe), потом microdata (itemprop=...),
//    а если и её нет — хотя бы заголовок страницы, чтобы не начинать совсем с нуля.
// 2) вставленный текст: пользователь копирует текст рецепта вручную, мы разбираем его эвристикой.
// В обоих случаях результат — ЧЕРНОВИК, который открывается в обычной форме добавления рецепта
// для проверки и правки, а не сохраняется в базу напрямую.

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
  'ст.л':'ст.л.','ст.л.':'ст.л.','столовая':'ст.л.','tbsp':'ст.л.','tablespoon':'ст.л.','ст':'ст.л.',
  'ч.л':'ч.л.','ч.л.':'ч.л.','чайная':'ч.л.','tsp':'ч.л.','teaspoon':'ч.л.',
  'шт':'шт','штук':'шт','штуки':'шт','pcs':'шт','piece':'шт','pieces':'шт',
  'щепотка':'щепотка','щепоть':'щепотка','pinch':'щепотка',
  'стакан':'шт','cup':'шт','cups':'шт',
};

function parseIngredientLine(raw){
  let line = stripHtml(raw).trim();
  if(!line) return { qty:null, unit:'по вкусу', name:'' };

  // "Соль по вкусу" / "Salt to taste" — единица без числа в начале строки
  if(!/^[\d½⅓⅔¼¾⅛]/.test(line) && /(по вкусу|to taste)/i.test(line)){
    const name = line.replace(/,?\s*(по вкусу|to taste)/i,'').trim();
    return { qty: null, unit: 'по вкусу', name: name || line };
  }

  // Диапазон "2-3 шт" → берём меньшее значение диапазона
  line = line.replace(/^(\d+)\s*[-–]\s*\d+/, '$1');
  // Слитная дробь "1½" → "1.5"
  line = line.replace(/^(\d+)([½⅓⅔¼¾⅛])/, (m, whole, frac)=> (parseInt(whole) + FRACTIONS[frac]).toString());

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

// ---------- Угадывание категории и сложности ----------
const CATEGORY_KEYWORDS = {
  'Десерты': ['торт','пирог','десерт','крем','мусс','чизкейк','печень','кекс','пирожн','мороженое','выпечк','cake','dessert','cookie','pie'],
  'Выпечка': ['хлеб','булочк','пицца','тесто','багет','bread','pizza','dough'],
  'Супы': ['суп','бульон','борщ','щи','soup','broth'],
  'Салаты': ['салат','salad'],
  'Напитки': ['коктейль','смузи','сок','лимонад','какао','кофе','чай','напиток','drink','smoothie','cocktail'],
  'Завтраки': ['завтрак','омлет','яичниц','каша','breakfast','pancake','oatmeal'],
  'Закуски': ['закуска','брускетта','снек','snack','appetizer'],
  'Соусы': ['соус','заправка','маринад','sauce','dressing','marinade'],
};
function guessCategory(title, schemaCategory){
  if(schemaCategory){
    const sc = String(schemaCategory).toLowerCase();
    for(const [cat, words] of Object.entries(CATEGORY_KEYWORDS)){
      if(words.some(w => sc.includes(w))) return cat;
    }
  }
  const lower = (title||'').toLowerCase();
  for(const [cat, words] of Object.entries(CATEGORY_KEYWORDS)){
    if(words.some(w => lower.includes(w))) return cat;
  }
  return '';
}
function guessDifficulty(stepsCount, ingredientsCount){
  const score = stepsCount + ingredientsCount * 0.5;
  if(score <= 6) return 'Легко';
  if(score <= 14) return 'Средне';
  return 'Сложно';
}

// ---------- JSON-LD (schema.org/Recipe) ----------
function normalizeSchemaRecipe(item){
  const title = typeof item.name === 'string' ? item.name : (Array.isArray(item.name) ? item.name[0] : '');
  const ingredients = (item.recipeIngredient || item.ingredients || []).map(parseIngredientLine).filter(i=>i.name);

  let instructions = item.recipeInstructions || [];
  if(typeof instructions === 'string') instructions = instructions.split(/\n+/);
  const steps = (Array.isArray(instructions) ? instructions : []).flatMap(step=>{
    if(typeof step === 'string') return [{ text: stripHtml(step), timerMinutes: null }];
    if(step['@type'] === 'HowToSection' && Array.isArray(step.itemListElement)){
      return step.itemListElement.map(sub=>({ text: stripHtml(sub.text||sub.name||''), timerMinutes: null }));
    }
    return [{ text: stripHtml(step.text || step.name || ''), timerMinutes: null }];
  }).filter(s=>s.text);

  const cleanTitle = stripHtml(title);
  const category = guessCategory(cleanTitle, item.recipeCategory);
  const notes = item.description ? stripHtml(item.description).slice(0,500) : '';

  return {
    title: cleanTitle,
    category,
    servings: parseYield(item.recipeYield),
    cookTime: parseDurationToMinutes(item.totalTime || item.cookTime),
    difficulty: guessDifficulty(steps.length, ingredients.length),
    ingredients,
    steps,
    notes
  };
}

function extractFromJsonLd(doc){
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
    }catch(e){ /* битый JSON на странице — пропускаем и идём дальше */ }
  }
  return null;
}

// ---------- Microdata (itemprop=...) — запасной вариант для сайтов постарше ----------
function extractFromMicrodata(doc){
  const scope = doc.querySelector('[itemscope][itemtype*="Recipe" i]');
  if(!scope) return null;
  const propEls = (name) => Array.from(scope.querySelectorAll(`[itemprop="${name}"]`));
  const propText = (el) => el ? stripHtml(el.getAttribute('content') || el.textContent || '') : '';

  const title = propText(propEls('name')[0]);
  const ingredients = propEls('recipeIngredient').map(el=> parseIngredientLine(propText(el))).filter(i=>i.name);

  let steps = propEls('recipeInstructions').map(el=> ({ text: propText(el), timerMinutes:null })).filter(s=>s.text);
  if(steps.length===0){
    // некоторые сайты вкладывают шаги ещё на уровень глубже
    scope.querySelectorAll('[itemprop="recipeInstructions"] [itemprop="text"]').forEach(el=>{
      const t = propText(el);
      if(t) steps.push({ text:t, timerMinutes:null });
    });
  }

  if(ingredients.length===0 && steps.length===0 && !title) return null;

  const servings = parseYield(propText(propEls('recipeYield')[0]));
  const timeEl = propEls('totalTime')[0] || propEls('cookTime')[0];
  const cookTime = timeEl ? parseDurationToMinutes(timeEl.getAttribute('datetime') || propText(timeEl)) : null;
  const notes = propText(propEls('description')[0]).slice(0,500);
  const category = guessCategory(title, propText(propEls('recipeCategory')[0]));

  return {
    title, category, servings, cookTime,
    difficulty: guessDifficulty(steps.length, ingredients.length),
    ingredients, steps, notes
  };
}

// ---------- Open Graph / <title> — последний рубеж, если структуры рецепта нет вообще ----------
function extractTitleOnly(doc){
  const og = doc.querySelector('meta[property="og:title"]');
  const title = (og && og.getAttribute('content')) || doc.querySelector('title')?.textContent || '';
  const clean = stripHtml(title);
  if(!clean) return null;
  return { title: clean, category: guessCategory(clean), servings:null, cookTime:null, difficulty:'Средне', ingredients:[], steps:[], notes:'', titleOnly:true };
}

function extractRecipeFromHtml(html){
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return extractFromJsonLd(doc) || extractFromMicrodata(doc) || extractTitleOnly(doc);
}

// ---------- Загрузка страницы: несколько способов подряд, от точного к грубому ----------
// Этап 1 — пробуем несколько разных прокси, скачиваем HTML и ищем разметку рецепта (точнее всего).
// Этап 2 — если разметки нет ни на одном, пробуем сервис Jina Reader: он умеет вытаскивать
//          из любой страницы чистый читаемый текст (без меню, рекламы и вёрстки) — на нём
//          запускаем тот же эвристический разбор текста, что и в режиме "Вставить текст",
//          только автоматически, без ручного копирования.

function normalizeUrl(raw){
  let u = raw.trim();
  if(!/^https?:\/\//i.test(u)) u = 'https://' + u;
  return u;
}

const HTML_FETCHERS = [
  async (url, ms)=>{
    const res = await fetchWithTimeout('https://api.allorigins.win/raw?url=' + encodeURIComponent(url), ms);
    if(!res.ok) throw new Error('HTTP ' + res.status);
    return await res.text();
  },
  async (url, ms)=>{
    const res = await fetchWithTimeout('https://corsproxy.io/?url=' + encodeURIComponent(url), ms);
    if(!res.ok) throw new Error('HTTP ' + res.status);
    return await res.text();
  },
  async (url, ms)=>{
    const res = await fetchWithTimeout('https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(url), ms);
    if(!res.ok) throw new Error('HTTP ' + res.status);
    return await res.text();
  },
  async (url, ms)=>{
    const res = await fetchWithTimeout('https://api.allorigins.win/get?url=' + encodeURIComponent(url), ms);
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    return json.contents || '';
  },
];

function fetchWithTimeout(url, ms){
  return Promise.race([
    fetch(url),
    new Promise((_,reject)=> setTimeout(()=> reject(new Error('Таймаут запроса')), ms))
  ]);
}

async function fetchReadableText(url, ms){
  // Jina Reader — не URL-кодируем адрес, он ожидается "как есть" сразу после префикса.
  const res = await fetchWithTimeout('https://r.jina.ai/' + url, ms);
  if(!res.ok) throw new Error('HTTP ' + res.status);
  return await res.text();
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

  return {
    title, category: guessCategory(title), servings:null, cookTime:null,
    difficulty: guessDifficulty(steps.length, ingredients.length),
    ingredients, steps, notes:''
  };
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
  const rawUrl = document.getElementById('importUrlInput').value.trim();
  const statusEl = document.getElementById('importStatus');
  if(!rawUrl){ statusEl.textContent = 'Вставь ссылку на рецепт.'; return; }
  const url = normalizeUrl(rawUrl);

  let structuredResult = null;   // нашли точную разметку рецепта — лучший результат
  let titleOnlyResult = null;    // нашли хотя бы заголовок страницы
  let textHeuristicResult = null; // разобрали текст эвристикой (менее точно)

  // Этап 1: несколько разных способов скачать HTML и найти разметку рецепта
  for(let i=0; i<HTML_FETCHERS.length && !structuredResult; i++){
    try{
      statusEl.textContent = `Ищу разметку рецепта… (способ ${i+1} из ${HTML_FETCHERS.length})`;
      const html = await HTML_FETCHERS[i](url, 8000);
      if(!html || html.length < 200) continue;
      const parsed = extractRecipeFromHtml(html);
      if(parsed && !parsed.titleOnly && (parsed.ingredients.length>0 || parsed.steps.length>0)){
        structuredResult = parsed;
      } else if(parsed && parsed.titleOnly && !titleOnlyResult){
        titleOnlyResult = parsed;
      }
    }catch(e){ /* пробуем следующий способ */ }
  }

  // Этап 2: если разметки не нашли — вытаскиваем чистый текст страницы и разбираем эвристикой
  if(!structuredResult){
    try{
      statusEl.textContent = 'Разметки не нашёл — читаю текст страницы…';
      const text = await fetchReadableText(url, 15000);
      if(text && text.length > 100){
        const parsed = parseTextBlock(text);
        if(parsed.ingredients.length>0 || parsed.steps.length>0){
          textHeuristicResult = parsed;
        }
      }
    }catch(e){ console.error(e); }
  }

  const result = structuredResult || textHeuristicResult || titleOnlyResult;
  if(!result){
    statusEl.textContent = 'Не получилось распознать рецепт вообще ничем — сайт закрыт для чтения. Попробуй вкладку «Вставить текст», скопировав рецепт вручную.';
    return;
  }

  closeImportModal();
  openForm(result);
  if(result === structuredResult){
    showToast(`Распознано по разметке страницы: ${result.ingredients.length} ингредиентов, ${result.steps.length} шагов`);
  } else if(result === textHeuristicResult){
    showToast(`Распознано из текста страницы: ${result.ingredients.length} ингредиентов, ${result.steps.length} шагов — проверь внимательнее`);
  } else {
    showToast('Нашёл только название страницы — остальное добавь сам');
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
  showToast(`Разобрано: ${parsed.ingredients.length} ингредиентов, ${parsed.steps.length} шагов — проверь поля перед сохранением`);
});
