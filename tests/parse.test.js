// Минимальные автотесты. Без фреймворков — просто node tests/parse.test.js.
// Проверяют самое хрупкое место в проекте: разбор текста рецепта.
// Запускаются вручную и автоматически в GitHub Actions при каждом push (см. .github/workflows/tests.yml).

import { parseIngredientStrict, parseStructuredRecipeText } from '../js/recipe-text-format.js';

let passed = 0, failed = 0;

function assertEqual(actual, expected, label){
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if(a === e){
    passed++;
    console.log(`✓ ${label}`);
  } else {
    failed++;
    console.log(`✗ ${label}`);
    console.log(`  ожидалось: ${e}`);
    console.log(`  получено:  ${a}`);
  }
}

function assertTrue(condition, label){
  if(condition){ passed++; console.log(`✓ ${label}`); }
  else { failed++; console.log(`✗ ${label}`); }
}

// ---------- parseIngredientStrict ----------
assertEqual(
  parseIngredientStrict('200 г мука'),
  { qty: 200, unit: 'г', name: 'мука' },
  'ингредиент: число, единица, название'
);

assertEqual(
  parseIngredientStrict('- 3 ст.л. сахар'),
  { qty: 3, unit: 'ст.л.', name: 'сахар' },
  'ингредиент: с дефисом впереди'
);

assertEqual(
  parseIngredientStrict('соль по вкусу'),
  { qty: null, unit: 'по вкусу', name: 'соль' },
  'ингредиент: без числа, "по вкусу"'
);

assertEqual(
  parseIngredientStrict('1.5 л молоко'),
  { qty: 1.5, unit: 'л', name: 'молоко' },
  'ингредиент: дробное число с точкой'
);

assertEqual(
  parseIngredientStrict(''),
  null,
  'ингредиент: пустая строка -> null'
);

// ---------- parseStructuredRecipeText ----------
const sample = `НАЗВАНИЕ: Сырники классические
КАТЕГОРИЯ: Завтраки
ПОРЦИИ: 4
ВРЕМЯ: 30
СЛОЖНОСТЬ: Легко

ИНГРЕДИЕНТЫ:
- 400 г творог
- 1 шт яйцо
- 3 ст.л. сахар

ШАГИ:
1. Творог размять вилкой, добавить яйцо и сахар, перемешать.
2. Обжарить на среднем огне по 3 минуты с каждой стороны.

ЗАМЕТКИ: Подавать со сметаной.`;

const parsed = parseStructuredRecipeText(sample);
assertTrue(parsed !== null, 'полный рецепт: результат не null');
assertEqual(parsed.title, 'Сырники классические', 'полный рецепт: название');
assertEqual(parsed.category, 'Завтраки', 'полный рецепт: категория');
assertEqual(parsed.servings, 4, 'полный рецепт: порции');
assertEqual(parsed.cookTime, 30, 'полный рецепт: время');
assertEqual(parsed.difficulty, 'Легко', 'полный рецепт: сложность');
assertEqual(parsed.ingredients.length, 3, 'полный рецепт: количество ингредиентов');
assertEqual(parsed.steps.length, 2, 'полный рецепт: количество шагов');
assertEqual(parsed.ingredients[0], { qty: 400, unit: 'г', name: 'творог' }, 'полный рецепт: первый ингредиент');
assertEqual(parsed.steps[0].text, 'Творог размять вилкой, добавить яйцо и сахар, перемешать.', 'полный рецепт: первый шаг без номера');

// Пустой/мусорный текст не должен приводить к ложному "успеху"
assertEqual(parseStructuredRecipeText('просто случайный текст без меток'), null, 'мусорный текст -> null');

// ---------- итог ----------
console.log(`\n${passed} прошло, ${failed} не прошло`);
if(failed > 0){ process.exit(1); }
