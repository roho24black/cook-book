import { store } from './store.js';
import { escapeHtml, fmtQty, showToast } from './utils.js';
import { setBottomTab, openShoppingTab } from './bottom-nav.js';
import { render } from './render-list.js';

export function updateShopBadge(){
  const badge = document.getElementById('bnShopBadge');
  if(store.selectedForShop.size>0){ badge.style.display='flex'; badge.textContent = store.selectedForShop.size; }
  else badge.style.display = 'none';
}

export function persistShopCart(){
  localStorage.setItem('shopCart', JSON.stringify(Array.from(store.selectedForShop)));
  updateShopBadge();
}
persistShopCart();

export function openShoppingList(){
  const chosen = store.recipes.filter(r => store.selectedForShop.has(r.id));
  const merged = {};
  chosen.forEach(r=>{
    (r.ingredients||[]).forEach(i=>{
      const key = (i.name||'').toLowerCase().trim() + '|' + (i.unit||'');
      if(!merged[key]) merged[key] = { name:i.name, unit:i.unit, qty: (i.qty!==null&&i.qty!==undefined)?i.qty:null };
      else if(merged[key].qty!==null && i.qty!==null && i.qty!==undefined) merged[key].qty += i.qty;
      else if(i.qty===null) merged[key].qty = null;
    });
  });
  const items = Object.values(merged).sort((a,b)=>{
    const ak = a.name.toLowerCase().trim()+'|'+(a.unit||''), bk = b.name.toLowerCase().trim()+'|'+(b.unit||'');
    const ac = store.shopCheckedItems.has(ak), bc = store.shopCheckedItems.has(bk);
    if(ac!==bc) return ac ? 1 : -1;
    return a.name.localeCompare(b.name,'ru');
  });
  const checkedCount = items.filter(i=> store.shopCheckedItems.has(i.name.toLowerCase().trim()+'|'+(i.unit||''))).length;
  document.getElementById('shopListSubtitle').textContent = `${chosen.length} ${chosen.length===1?'рецепт':'рецепта(ов)'} · ${checkedCount}/${items.length} взято`;
  document.getElementById('shopProgressFill').style.width = items.length ? `${Math.round(checkedCount/items.length*100)}%` : '0%';

  const shopList = document.getElementById('shopList');
  if(items.length===0){
    shopList.innerHTML = `<li class="shop-empty" style="list-style:none;"><div class="emoji">🧺</div>Список пуст — выбери рецепты во вкладке «Рецепты»</li>`;
  } else {
    shopList.innerHTML = items.map(i=>{
      const key = i.name.toLowerCase().trim()+'|'+(i.unit||'');
      const amt = (i.qty!==null && i.qty!==undefined) ? `${fmtQty(i.qty)} ${i.unit||''}`.trim() : (i.unit||'');
      return `<li class="shop-item ${store.shopCheckedItems.has(key)?'checked':''}" data-key="${escapeHtml(key)}">
        <span class="chk"></span><span class="shop-name">${escapeHtml(i.name)}</span><span class="shop-amt">${escapeHtml(amt)}</span>
      </li>`;
    }).join('');
    shopList.querySelectorAll('.shop-item').forEach(li=>{
      li.addEventListener('click', ()=>{
        const key = li.dataset.key;
        if(store.shopCheckedItems.has(key)) store.shopCheckedItems.delete(key); else store.shopCheckedItems.add(key);
        localStorage.setItem('shopChecked', JSON.stringify(Array.from(store.shopCheckedItems)));
        openShoppingList();
      });
    });
  }

  document.getElementById('shopCheckAllBtn').onclick = ()=>{
    items.forEach(i=> store.shopCheckedItems.add(i.name.toLowerCase().trim()+'|'+(i.unit||'')));
    localStorage.setItem('shopChecked', JSON.stringify(Array.from(store.shopCheckedItems)));
    openShoppingList();
  };
  document.getElementById('shopUncheckAllBtn').onclick = ()=>{
    items.forEach(i=> store.shopCheckedItems.delete(i.name.toLowerCase().trim()+'|'+(i.unit||'')));
    localStorage.setItem('shopChecked', JSON.stringify(Array.from(store.shopCheckedItems)));
    openShoppingList();
  };

  document.getElementById('shopOverlay').classList.add('open');
  document.getElementById('shopCopyBtn').onclick = ()=>{
    const text = items.map(i=>{
      const key = i.name.toLowerCase().trim()+'|'+(i.unit||'');
      const amt = (i.qty!==null && i.qty!==undefined) ? `${fmtQty(i.qty)} ${i.unit||''}`.trim() : (i.unit||'');
      return `${store.shopCheckedItems.has(key)?'[x]':'[ ]'} ${i.name}${amt?` — ${amt}`:''}`;
    }).join('\n');
    navigator.clipboard?.writeText('Список покупок:\n'+text).then(()=> showToast('Список скопирован — можно вставить в заметки телефона'));
  };
  document.getElementById('shopClearBtn').onclick = ()=>{
    store.selectedForShop.clear(); persistShopCart(); store.shopMode = false;
    store.shopCheckedItems.clear(); localStorage.removeItem('shopChecked');
    document.getElementById('shopOverlay').classList.remove('open');
    setBottomTab('recipes');
    render(); showToast('Список покупок очищен');
  };
}
document.getElementById('shopCloseBtn').addEventListener('click', ()=>{
  document.getElementById('shopOverlay').classList.remove('open');
  setBottomTab('recipes');
});
document.getElementById('shopOverlay').addEventListener('click', (e)=>{ if(e.target.id==='shopOverlay') document.getElementById('shopCloseBtn').click(); });

document.getElementById('shopModeBtn').addEventListener('click', ()=>{
  if(store.shopMode && store.selectedForShop.size > 0){ openShoppingTab(); return; }
  store.shopMode = !store.shopMode;
  showToast(store.shopMode ? 'Выбери рецепты, потом нажми ещё раз' : 'Режим выбора выключен');
  render();
});
