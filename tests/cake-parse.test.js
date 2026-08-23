// Автотесты разбора импорта торта. Запуск: node tests/cake-parse.test.js

import { parseCakeText, buildCakeTemplate } from '../js/cake-text-format.js';

let passed = 0, failed = 0;
function assertEqual(actual, expected, label){
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if(a === e){ passed++; console.log(`✓ ${label}`); }
  else { failed++; console.log(`✗ ${label}\n  ожидалось: ${e}\n  получено:  ${a}`); }
}
function assertTrue(cond, label){ if(cond){ passed++; console.log(`✓ ${label}`); } else { failed++; console.log(`✗ ${label}`); } }

const sample = `НАЗВАНИЕ: Шоколадный на юбилей
ПОВОД: Юбилей мамы

КОРЖ 1: вид=biscuit вкус=choco диаметр=20 пропитка=coffee
КОРЖ 2: вид=biscuit вкус=choco диаметр=20 пропитка=coffee
КОРЖ 3: вид=honey вкус=honey диаметр=18 пропитка=none

КРЕМ 1: ganache
КРЕМ 2: cheese

ПОКРЫТИЕ: glaze
ДЕКОР: shavings`;

const parsed = parseCakeText(sample);
assertTrue(parsed !== null, 'полный торт: результат не null');
assertEqual(parsed.title, 'Шоколадный на юбилей', 'полный торт: название');
assertEqual(parsed.occasion, 'Юбилей мамы', 'полный торт: повод');
assertEqual(parsed.layers.length, 3, 'полный торт: количество коржей');
assertEqual(parsed.layers[0], { kind:'biscuit', variant:'choco', diameter:20, syrup:'coffee' }, 'полный торт: первый корж');
assertEqual(parsed.layers[2], { kind:'honey', variant:'honey', diameter:18, syrup:'none' }, 'полный торт: третий корж (другой вид теста)');
assertEqual(parsed.creams, ['ganache','cheese'], 'полный торт: кремы между коржами (на 1 меньше, чем коржей)');
assertEqual(parsed.coat, 'glaze', 'полный торт: покрытие');
assertEqual(parsed.decor, 'shavings', 'полный торт: декор');

// Неизвестное значение вида/вкуса не должно ронять разбор — откатывается на первый доступный вариант
const tolerant = parseCakeText(`КОРЖ 1: вид=unknown вкус=unknown диаметр=999 пропитка=unknown
КОРЖ 2: вид=biscuit вкус=classic диаметр=20 пропитка=none`);
assertTrue(tolerant !== null, 'неизвестные значения: результат не null (устойчивый разбор)');
assertEqual(tolerant.layers[0].diameter, 20, 'неизвестный диаметр -> дефолт 20 см');

// Меньше 2 коржей — невалидный торт (конструктор требует минимум 2)
assertEqual(parseCakeText('КОРЖ 1: вид=biscuit вкус=choco диаметр=20 пропитка=none'), null, 'один корж -> null (минимум 2)');
assertEqual(parseCakeText('просто случайный текст без меток'), null, 'мусорный текст -> null');

assertTrue(buildCakeTemplate().includes('КОРЖ 1'), 'шаблон содержит образец строки КОРЖ');

console.log(`\n${passed} прошло, ${failed} не прошло`);
if(failed > 0){ process.exit(1); }
