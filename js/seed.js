import { seedRecipes } from '../recipes-seed.js';
import { seedRecipesV2 } from '../recipes-seed-v2.js';
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

export async function seedIfNeeded(){
  await seedBatch(seedRecipes, 'seeded');
  await seedBatch(seedRecipesV2, 'seededV2');
}
