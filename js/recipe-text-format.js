// Чистая логика разбора текста рецепта в строгом формате — без обращений к DOM/document,
// поэтому этот файл можно импортировать и тестировать напрямую в Node (см. tests/).

export const TEMPLATE = `Дай мне рецепт [НАЗВАНИЕ БЛЮДА — впиши сюда, что хочешь] строго в этом формате, без лишних пояснений до или после, и без markdown-разметки (никаких ** или ##):

НАЗВАНИЕ: точное название блюда
КАТЕГОРИЯ: одно из: Десерты, Основные блюда, Супы, Салаты, Выпечка, Напитки, Завтраки, Закуски, Соусы
ПОРЦИИ: число
ВРЕМЯ: число (минуты приготовления)
СЛОЖНОСТЬ: Легко, Средне или Сложно

ИНГРЕДИЕНТЫ:
- количество единица_измерения название
(единицы измерения только такие: г, кг, мл, л, ст.л., ч.л., шт, щепотка; если количество не указывается словом — напиши "по вкусу")

ШАГИ:
1. первый шаг
2. второй шаг
(каждый шаг — одно законченное действие, без нумерации внутри самого текста шага)

ЗАМЕТКИ: необязательный совет или примечание (можно пропустить)`;

const UNIT_MAP = {
  'г':'г','гр':'г','грамм':'г','граммов':'г','граммы':'г',
  'кг':'кг','килограмм':'кг',
  'мл':'мл','л':'л','литр':'л',
  'ст.л':'ст.л.','ст.л.':'ст.л.','столовая':'ст.л.',
  'ч.л':'ч.л.','ч.л.':'ч.л.','чайная':'ч.л.',
  'шт':'шт','штук':'шт','штуки':'шт',
  'щепотка':'щепотка','щепоть':'щепотка',
};

export function parseIngredientStrict(raw){
  const line = raw.replace(/^[-*•]\s*/, '').trim();
  if(!line) return null;
  if(/по вкусу/i.test(line) && !/^[\d]/.test(line)){
    const name = line.replace(/,?\s*по вкусу/i,'').trim();
    return { qty: null, unit: 'по вкусу', name: name || line };
  }
  const m = line.match(/^(\d+(?:[.,]\d+)?)\s+([а-яё.]+)\s+(.+)$/i);
  if(m){
    const qty = parseFloat(m[1].replace(',','.'));
    const unit = UNIT_MAP[m[2].toLowerCase().replace(/\.$/,'')] || m[2];
    return { qty, unit, name: m[3].trim() };
  }
  return { qty: null, unit: 'по вкусу', name: line };
}

export function getSection(text, label, nextLabels){
  const pattern = new RegExp(label + '\\s*:?\\s*([\\s\\S]*?)(?=' + nextLabels.join('|') + '|$)', 'i');
  const m = text.match(pattern);
  return m ? m[1].trim() : '';
}

export function parseStructuredRecipeText(text){
  const ALL_LABELS = ['НАЗВАНИЕ','КАТЕГОРИЯ','ПОРЦИИ','ВРЕМЯ','СЛОЖНОСТЬ','ИНГРЕДИЕНТЫ','ШАГИ','ЗАМЕТКИ'];
  const labelsForBoundary = ALL_LABELS.map(l=> l+'\\s*:');

  const title = getSection(text, 'НАЗВАНИЕ', labelsForBoundary);
  const category = getSection(text, 'КАТЕГОРИЯ', labelsForBoundary);
  const servingsRaw = getSection(text, 'ПОРЦИИ', labelsForBoundary);
  const cookTimeRaw = getSection(text, 'ВРЕМЯ', labelsForBoundary);
  const difficultyRaw = getSection(text, 'СЛОЖНОСТЬ', labelsForBoundary);
  const ingredientsBlock = getSection(text, 'ИНГРЕДИЕНТЫ', labelsForBoundary);
  const stepsBlock = getSection(text, 'ШАГИ', labelsForBoundary);
  const notes = getSection(text, 'ЗАМЕТКИ', labelsForBoundary);

  if(!title && !ingredientsBlock && !stepsBlock) return null;

  const ingredients = ingredientsBlock.split('\n').map(l=>l.trim()).filter(Boolean)
    .map(parseIngredientStrict).filter(Boolean);

  const steps = stepsBlock.split('\n').map(l=>l.trim()).filter(Boolean)
    .map(l=> l.replace(/^\d+[.\)]\s*/, '').replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean)
    .map(text=> ({ text, timerMinutes: null }));

  const servingsMatch = servingsRaw.match(/\d+/);
  const cookTimeMatch = cookTimeRaw.match(/\d+/);
  const difficulty = ['Легко','Средне','Сложно'].find(d=> difficultyRaw.toLowerCase().includes(d.toLowerCase())) || 'Средне';

  return {
    title: title || 'Без названия',
    category: category || '',
    servings: servingsMatch ? parseInt(servingsMatch[0]) : null,
    cookTime: cookTimeMatch ? parseInt(cookTimeMatch[0]) : null,
    difficulty,
    ingredients,
    steps,
    notes: notes || ''
  };
}
