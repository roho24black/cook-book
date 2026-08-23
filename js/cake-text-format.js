// Чистая логика импорта торта из текста — без обращений к DOM, по образцу recipe-text-format.js.
// Формат строгий и завязан на ID-словарь конструктора (а не на свободный текст), потому что
// вариантов теста/крема/пропитки конечное число — так разбор надёжнее, чем сопоставление по словам.

import {
  CAKE_DIAMETERS, CAKE_KINDS, CAKE_SYRUPS, CAKE_CREAMS, CAKE_COATS, CAKE_DECORS,
  findKind, findVariant, findSyrup, findCream, findCoat, findDecor
} from './cake-constants.js';

export function buildCakeTemplate(){
  const kindsList = CAKE_KINDS.map(k=> `  ${k.id} (${k.label}) — вкус=${k.vars.map(v=>v.id).join('|')}`).join('\n');
  return `Придумай торт: [ОПИШИ ИДЕЮ — повод, вкусы, из скольких коржей] строго в этом формате, без markdown и лишних пояснений до/после:

НАЗВАНИЕ: короткое название торта
ПОВОД: повод, необязательно

КОРЖ 1: вид=... вкус=... диаметр=... пропитка=...
КОРЖ 2: вид=... вкус=... диаметр=... пропитка=...
(от 2 до 6 строк КОРЖ, пронумерованных подряд, порядок снизу вверх)

КРЕМ 1: ... (крем между коржом 1 и 2)
КРЕМ 2: ... (крем между коржом 2 и 3 — крем-строк ровно на одну меньше, чем коржей)

ПОКРЫТИЕ: ...
ДЕКОР: ...

Разрешённые значения (используй только их, латиницей):
вид=
${kindsList}
диаметр= один из: ${CAKE_DIAMETERS.join(', ')}
пропитка= один из: ${CAKE_SYRUPS.map(s=>s.id).join(', ')}
КРЕМ = один из: ${CAKE_CREAMS.map(c=>c.id).join(', ')}
ПОКРЫТИЕ = один из: ${CAKE_COATS.map(c=>c.id).join(', ')}
ДЕКОР = один из: ${CAKE_DECORS.map(d=>d.id).join(', ')}`;
}

export function parseCakeText(text){
  const titleM = text.match(/НАЗВАНИЕ\s*:\s*(.+)/i);
  const occasionM = text.match(/ПОВОД\s*:\s*(.+)/i);
  const layerLines = Array.from(text.matchAll(/КОРЖ\s*\d+\s*:\s*(.+)/gi)).map(m=>m[1]);
  const creamLines = Array.from(text.matchAll(/КРЕМ\s*\d+\s*:\s*(.+)/gi)).map(m=>m[1].trim());
  const coatM = text.match(/ПОКРЫТИЕ\s*:\s*(.+)/i);
  const decorM = text.match(/ДЕКОР\s*:\s*(.+)/i);

  if(layerLines.length < 2) return null;

  const layers = layerLines.slice(0,6).map(line=>{
    const kindM = line.match(/вид\s*=\s*([a-zа-яё]+)/i);
    const varM = line.match(/вкус\s*=\s*([a-zа-яё]+)/i);
    const diamM = line.match(/диаметр\s*=\s*(\d+)/i);
    const syrM = line.match(/пропитка\s*=\s*([a-zа-яё]+)/i);
    const kind = findKind(kindM ? kindM[1].toLowerCase() : '');
    const variant = findVariant(kind, varM ? varM[1].toLowerCase() : '');
    const diameter = (diamM && CAKE_DIAMETERS.includes(parseInt(diamM[1]))) ? parseInt(diamM[1]) : 20;
    const syrup = findSyrup(syrM ? syrM[1].toLowerCase() : '');
    return { kind: kind.id, variant: variant.id, diameter, syrup: syrup.id };
  });

  const creams = layers.slice(0, layers.length-1).map((_, i)=> findCream((creamLines[i]||'').toLowerCase()).id);

  return {
    title: titleM ? titleM[1].trim() : '',
    occasion: occasionM ? occasionM[1].trim() : '',
    layers, creams,
    coatSame: false,
    coat: coatM ? findCoat(coatM[1].trim().toLowerCase()).id : 'cream',
    decor: decorM ? findDecor(decorM[1].trim().toLowerCase()).id : 'none'
  };
}
