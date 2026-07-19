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

// Рецепт в JSON-LD не всегда лежит на верхнем уровне — многие сайты оборачивают его
// в WebPage/Article с рецептом внутри mainEntity/about и т.п. Ищем рекурсивно.
function findRecipeInJsonLd(node, depth){
  depth = depth || 0;
  if(!node || typeof node !== 'object' || depth > 5) return null;
  if(Array.isArray(node)){
    for(const item of node){
      const found = findRecipeInJsonLd(item, depth+1);
      if(found) return found;
    }
    return null;
  }
  const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
  if(types.some(t => (t||'').toLowerCase() === 'recipe')) return node;
  const nestKeys = ['@graph','mainEntity','mainEntityOfPage','about','hasPart'];
  for(const key of nestKeys){
    if(node[key]){
      const found = findRecipeInJsonLd(node[key], depth+1);
      if(found) return found;
    }
  }
  return null;
}

// Мягкая починка типичных проблем в "почти валидном" JSON (висячие запятые и т.п.) —
// на некоторых сайтах разметка генерируется с мелкими ошибками, из-за которых
// строгий JSON.parse отказывается работать, хотя данные там вполне читаемые.
function repairJsonLoose(text){
  return text
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/[\u0000-\u001F]+/g, ' ');
}

function extractFromJsonLd(doc){
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  for(const script of scripts){
    const raw = script.textContent;
    let data = null;
    try{ data = JSON.parse(raw); }
    catch(e){
      try{ data = JSON.parse(repairJsonLoose(raw)); }
      catch(e2){ continue; }
    }
    const recipe = findRecipeInJsonLd(data);
    if(recipe) return normalizeSchemaRecipe(recipe);
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

// ---------- Известные плагины рецептов (WordPress и т.п.) — очень частый случай ----------
// Даже когда структурированной разметки нет или она не распозналась, огромная доля кулинарных
// блогов собрана на одном из нескольких популярных плагинов с предсказуемыми CSS-классами.
const PLUGIN_SELECTORS = [
  { title:'.wprm-recipe-name', ingredients:'.wprm-recipe-ingredient', steps:'.wprm-recipe-instruction-text' },
  { title:'.tasty-recipes-title', ingredients:'.tasty-recipes-ingredients li', steps:'.tasty-recipes-instructions li' },
  { title:'.tasty-recipe-title', ingredients:'.tasty-recipe-ingredients li', steps:'.tasty-recipe-instructions li' },
  { title:'.simple-recipe-pro-title', ingredients:'.simple-recipe-pro-ingredient', steps:'.simple-recipe-pro-instruction' },
  { title:'.recipe-summary__h1, .recipe-title', ingredients:'.zlrecipe-ingredient, .recipe-ingredients li', steps:'.zlrecipe-instruction, .recipe-directions li, .recipe-instructions li' },
];

function extractFromKnownPlugins(doc){
  for(const sel of PLUGIN_SELECTORS){
    const ingEls = Array.from(doc.querySelectorAll(sel.ingredients));
    const stepEls = Array.from(doc.querySelectorAll(sel.steps));
    if(ingEls.length===0 && stepEls.length===0) continue;
    const ingredients = ingEls.map(el=> parseIngredientLine(el.textContent)).filter(i=>i.name);
    const steps = stepEls.map(el=> ({ text: stripHtml(el.textContent), timerMinutes:null })).filter(s=>s.text);
    if(ingredients.length===0 && steps.length===0) continue;
    const titleEl = doc.querySelector(sel.title);
    const title = titleEl ? stripHtml(titleEl.textContent) : (doc.querySelector('h1') ? stripHtml(doc.querySelector('h1').textContent) : '');
    return {
      title, category: guessCategory(title), servings:null, cookTime:null,
      difficulty: guessDifficulty(steps.length, ingredients.length),
      ingredients, steps, notes:''
    };
  }
  return null;
}

// ---------- Совсем общая эвристика: ищем список сразу после заголовка вроде "Ингредиенты" ----------
// Это последний рубеж перед полной сдачей — грубее остальных способов, но результат всё равно
// открывается для проверки в форме, так что ложные срабатывания не страшны.
function findListNearHeading(doc, headingPattern){
  const headings = Array.from(doc.querySelectorAll('h1,h2,h3,h4,h5,strong,b'));
  for(const h of headings){
    if(!headingPattern.test(h.textContent||'')) continue;
    let el = h.nextElementSibling;
    let hops = 0;
    while(el && hops < 6){
      if(el.tagName==='UL' || el.tagName==='OL'){
        const items = Array.from(el.querySelectorAll('li')).map(li=>stripHtml(li.textContent)).filter(Boolean);
        if(items.length) return items;
      }
      const nested = el.querySelector && el.querySelector('ul,ol');
      if(nested){
        const items = Array.from(nested.querySelectorAll('li')).map(li=>stripHtml(li.textContent)).filter(Boolean);
        if(items.length) return items;
      }
      // Многие современные сайты вообще не используют <ul>/<li> для ингредиентов —
      // вместо этого несколько одинаковых по структуре <div>/<p> подряд. Проверяем и такой случай:
      // если у контейнера есть 3+ прямых потомка с одинаковым тегом и коротким текстом каждый,
      // это, скорее всего, и есть список ингредиентов/шагов.
      if(el.children && el.children.length >= 3){
        const childTag = el.children[0].tagName;
        const sameTag = Array.from(el.children).every(c=>c.tagName===childTag);
        if(sameTag){
          const items = Array.from(el.children).map(c=>stripHtml(c.textContent)).filter(t=> t && t.length < 200);
          if(items.length >= 3) return items;
        }
      }
      el = el.nextElementSibling;
      hops++;
    }
  }
  return [];
}

function extractGenericHeuristic(doc){
  const h1 = doc.querySelector('h1');
  const title = h1 ? stripHtml(h1.textContent) : '';
  const ingredientLines = findListNearHeading(doc, /ингредиент|ingredient/i);
  const stepLines = findListNearHeading(doc, /приготовлен|инструкц|способ\s*приготовления|шаги|instruction|direction|method|steps?\b/i);
  if(ingredientLines.length===0 && stepLines.length===0) return null;
  const ingredients = ingredientLines.map(t=> parseIngredientLine(t)).filter(i=>i.name);
  const steps = stepLines.map(t=> ({ text:t, timerMinutes:null }));
  if(ingredients.length===0 && steps.length===0) return null;
  return {
    title, category: guessCategory(title), servings:null, cookTime:null,
    difficulty: guessDifficulty(steps.length, ingredients.length),
    ingredients, steps, notes:''
  };
}

// ---------- Open Graph / <title> — самый последний рубеж, если вообще ничего не нашли ----------
function extractTitleOnly(doc){
  const h1 = doc.querySelector('h1');
  const og = doc.querySelector('meta[property="og:title"]');
  const title = (h1 && h1.textContent) || (og && og.getAttribute('content')) || doc.querySelector('title')?.textContent || '';
  const clean = stripHtml(title);
  if(!clean) return null;
  return { title: clean, category: guessCategory(clean), servings:null, cookTime:null, difficulty:'Средне', ingredients:[], steps:[], notes:'', titleOnly:true };
}

function extractRecipeFromHtml(html){
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return extractFromJsonLd(doc)
    || extractFromMicrodata(doc)
    || extractFromKnownPlugins(doc)
    || extractGenericHeuristic(doc)
    || extractTitleOnly(doc);
}

// ---------- Загрузка страницы: несколько способов ОДНОВРЕМЕННО, берём первый удачный ----------
// Раньше пробовали по очереди (жди отказа одного, потом пробуй следующий — очень медленно).
// Теперь запускаем все способы сразу параллельно и используем первый, который вернул
// действительно структурированный рецепт; если ни один не смог — берём лучшее из того,
// что вообще удалось получить (текст похуже разметки, а хоть заголовок — лучше, чем ничего).
//
// Также один из прежних прокси (corsproxy.io) недавно стал блокировать HTML-страницы на своей
// стороне (оставил только JSON/XML/CSV из-за фишинговых атак) — он гарантированно не срабатывал
// ни разу, поэтому убран и заменён на cors.lol.

function normalizeUrl(raw){
  let u = raw.trim();
  if(!/^https?:\/\//i.test(u)) u = 'https://' + u;
  return u;
}

function fetchWithTimeout(url, ms, options){
  return Promise.race([
    fetch(url, options),
    new Promise((_,reject)=> setTimeout(()=> reject(new Error('Таймаут запроса')), ms))
  ]);
}

// ВАЖНО: браузерный fetch().text() ВСЕГДА декодирует тело ответа как UTF-8, игнорируя
// заявленную в заголовке кодировку страницы (это особенность спецификации Fetch API).
// Многие старые русскоязычные сайты (в том числе кулинарные) до сих пор отдают страницы
// в кодировке Windows-1251 — без этой функции вся кириллица на таких сайтах превращалась
// в нечитаемую кашу, и наш разбор рецепта просто не находил ни одного слова "ингредиенты"
// или "по вкусу", потому что их там как будто не было.
async function decodeResponseText(res){
  const buffer = await res.arrayBuffer();
  let charset = null;

  const ct = res.headers.get('content-type') || '';
  const headerMatch = ct.match(/charset=([\w-]+)/i);
  if(headerMatch) charset = headerMatch[1].toLowerCase();

  if(!charset){
    // ASCII-часть HTML (включая тег с указанием кодировки) читается верно в любом случае,
    // даже если весь остальной текст на странице на самом деле не в UTF-8 — этим и пользуемся,
    // чтобы подсмотреть реальную кодировку прямо из содержимого страницы.
    const peek = new TextDecoder('utf-8').decode(buffer.slice(0, 3000));
    const metaMatch = peek.match(/<meta[^>]+charset=["']?([\w-]+)/i);
    if(metaMatch) charset = metaMatch[1].toLowerCase();
  }

  if(!charset || charset === 'utf-8' || charset === 'utf8'){
    return new TextDecoder('utf-8').decode(buffer);
  }
  const aliases = { 'win-1251':'windows-1251', 'cp1251':'windows-1251', 'cp-1251':'windows-1251', 'win1251':'windows-1251' };
  const normalized = aliases[charset] || charset;
  try{ return new TextDecoder(normalized).decode(buffer); }
  catch(e){ return new TextDecoder('utf-8').decode(buffer); }
}

const HTML_FETCHERS = [
  { name:'direct', run: async (url, ms)=>{
      // Иногда сайт сам разрешает запросы с любого источника — тогда это самый быстрый путь.
      // Для большинства сайтов браузер это заблокирует, и мы просто перейдём к прокси ниже.
      const res = await fetchWithTimeout(url, ms);
      if(!res.ok) throw new Error('HTTP ' + res.status);
      return await decodeResponseText(res);
  }},
  { name:'allorigins-raw', run: async (url, ms)=>{
      const res = await fetchWithTimeout('https://api.allorigins.win/raw?url=' + encodeURIComponent(url), ms);
      if(!res.ok) throw new Error('HTTP ' + res.status);
      return await decodeResponseText(res);
  }},
  { name:'codetabs', run: async (url, ms)=>{
      const res = await fetchWithTimeout('https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(url), ms);
      if(!res.ok) throw new Error('HTTP ' + res.status);
      return await decodeResponseText(res);
  }},
  { name:'cors.lol', run: async (url, ms)=>{
      const res = await fetchWithTimeout('https://api.cors.lol/url=' + url, ms);
      if(!res.ok) throw new Error('HTTP ' + res.status);
      return await decodeResponseText(res);
  }},
  { name:'allorigins-get', run: async (url, ms)=>{
      const res = await fetchWithTimeout('https://api.allorigins.win/get?url=' + encodeURIComponent(url), ms);
      if(!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      return json.contents || '';
  }},
];

async function fetchReadableText(url, ms){
  // Jina Reader — рендерит страницу как настоящий браузер (справляется даже с сайтами
  // на JS-фреймворках, включая виджеты выбора единиц измерения) и возвращает чистый
  // читаемый текст без вёрстки/рекламы/меню. Сервис сам приводит текст к UTF-8.
  // Адрес не кодируем — сервис ожидает его "как есть" сразу после префикса.
  const res = await fetchWithTimeout('https://r.jina.ai/' + url, ms);
  if(!res.ok) throw new Error('HTTP ' + res.status);
  return await res.text();
}

// Приводим результат разбора к единому виду с "качеством": 3 — нашли точную разметку рецепта,
// 2 — разобрали текст эвристикой (менее точно, но лучше, чем ничего),
// 1 — нашли хотя бы заголовок страницы.
function tagQuality(parsed, quality){
  if(!parsed) return null;
  if(parsed.titleOnly) return { ...parsed, quality: 1 };
  if(parsed.ingredients.length===0 && parsed.steps.length===0) return null;
  return { ...parsed, quality };
}

function raceForBestRecipe(url, statusEl){
  const diag = { networkFail:0, emptyResult:0 };
  const tasks = [
    ...HTML_FETCHERS.map(f=>
      f.run(url, 14000)
        .then(html => {
          if(!html || html.length < 200){ diag.networkFail++; return null; }
          const parsed = extractRecipeFromHtml(html);
          const tagged = tagQuality(parsed, 3);
          if(!tagged) diag.emptyResult++;
          return tagged;
        })
        .catch(()=>{ diag.networkFail++; return null; })
    ),
    fetchReadableText(url, 18000)
      .then(text => {
        if(!text || text.length < 100){ diag.networkFail++; return null; }
        const parsed = parseTextBlock(text);
        const tagged = tagQuality(parsed, 2);
        if(!tagged) diag.emptyResult++;
        return tagged;
      })
      .catch(()=>{ diag.networkFail++; return null; })
  ];
  const total = tasks.length;

  return new Promise((resolve)=>{
    let best = null;
    let doneCount = 0;
    let settled = false;
    const finish = ()=>{ if(!settled){ settled = true; resolve({ result: best, diag }); } };
    const globalTimer = setTimeout(finish, 20000);

    statusEl.textContent = `Пробую ${total} способов одновременно…`;

    tasks.forEach(t=>{
      t.then(result=>{
        doneCount++;
        if(!settled) statusEl.textContent = `Проверено ${doneCount} из ${total}…`;
        if(result && (!best || result.quality > best.quality)) best = result;
        if(result && result.quality === 3){ clearTimeout(globalTimer); finish(); return; }
        if(doneCount === total){ clearTimeout(globalTimer); finish(); }
      });
    });
  });
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

  const { result, diag } = await raceForBestRecipe(url, statusEl);

  if(!result){
    let reason;
    if(diag.networkFail >= 5){
      reason = 'сайт не пустил ни один способ (блокирует автоматический доступ)';
    } else if(diag.emptyResult > 0){
      reason = 'страницу открыть получилось, но данных рецепта на ней не нашлось';
    } else {
      reason = 'сайт закрыт для чтения';
    }
    statusEl.innerHTML = `Не получилось распознать рецепт — ${reason}. ` +
      `<a href="${url}" target="_blank" rel="noopener" style="color:var(--sage); text-decoration:underline;">Открыть страницу</a> ` +
      'и скопировать текст вручную во вкладке «Вставить текст».';
    return;
  }

  closeImportModal();
  openForm(result);
  if(result.quality === 3){
    showToast(`Распознано по разметке страницы: ${result.ingredients.length} ингредиентов, ${result.steps.length} шагов`);
  } else if(result.quality === 2){
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
