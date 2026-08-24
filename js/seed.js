import { seedRecipes } from '../recipes-seed.js';
import { seedRecipesV2 } from '../recipes-seed-v2.js';
import { cakeComponentSeed } from './cake-component-seed.js';
import { db, recipesCol } from './firebase-init.js';
import {
  doc, getDoc, setDoc, writeBatch
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

async function seedBatch(batchRecipes, flagField){
  try {
    const flagRef = doc(db, 'meta', 'status');
    const flagSnap = await getDoc(flagRef);
    const flagData = flagSnap.exists() ? flagSnap.data() : {};
    if (flagData[flagField]) return;
    let batch = writeBatch(db);
    let count = 0;
    for (const r of batchRecipes) {
      const newRef = doc(recipesCol);
      batch.set(newRef, { ...r, favorite:false, dateAdded: new Date(Date.now() - (batchRecipes.length-count)*1000).toISOString() });
      count++;
      if (count % 400 === 0) { await batch.commit(); batch = writeBatch(db); }
    }
    await batch.commit();
    await setDoc(flagRef, { ...flagData, [flagField]: true, [flagField+'At']: new Date().toISOString() }, { merge:true });
  } catch(e){ console.error('Seeding batch failed (non-fatal, recipe list will still load):', e); }
}

// Компоненты торта сеются НЕ по общему флагу "уже сидили один раз" (как обычные рецепты
// выше), а по факту наличия каждого componentId в базе. Раньше был один флаг на весь
// cakeComponentSeed — как только он один раз проставлялся true, ЛЮБОЕ новое добавление в
// этот файл (новый вкус крема и т.п.) молча переставало попадать в уже засеянные базы,
// потому что seedBatch() просто выходил на первой строке. Здесь же каждый рецепт компонента
// несёт свой стабильный componentId — сверяемся с базой и досеиваем только то, чего не хватает,
// поэтому дописать новый вкус в cakeComponentSeed достаточно, ничего вручную чистить не нужно.
async function seedCakeComponents(){
  try {
    const snap = await getDocs(recipesCol);
    const existingIds = new Set(snap.docs.map(d => d.data().componentId).filter(Boolean));
    const missing = cakeComponentSeed.filter(r => !existingIds.has(r.componentId));
    if (!missing.length) return;
    let batch = writeBatch(db);
    let count = 0;
    for (const r of missing) {
      const newRef = doc(recipesCol);
      batch.set(newRef, { ...r, favorite:false, dateAdded: new Date(Date.now() - (missing.length-count)*1000).toISOString() });
      count++;
      if (count % 400 === 0) { await batch.commit(); batch = writeBatch(db); }
    }
    await batch.commit();
  } catch(e){ console.error('Seeding cake components failed (non-fatal, recipe list will still load):', e); }
}

export async function seedIfNeeded(){
  await seedBatch(seedRecipes, 'seeded');
  await seedBatch(seedRecipesV2, 'seededV2');
  // Рецепты компонентов торта (коржи/крема/пропитки) — пишутся так же, как обычные рецепты,
  // поэтому проходят только когда сидит автор (правила Firestore разрешают create только isAdmin()).
  await seedCakeComponents();
}
