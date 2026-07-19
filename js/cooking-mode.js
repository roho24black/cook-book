import { store } from './store.js';
import { escapeHtml, fmtQty } from './utils.js';

async function requestWakeLock(){
  try { if('wakeLock' in navigator) store.wakeLock = await navigator.wakeLock.request('screen'); } catch(e){}
}
function releaseWakeLock(){ if(store.wakeLock){ store.wakeLock.release().catch(()=>{}); store.wakeLock = null; } }

export function startCookMode(r){
  store.cookRecipe = r;
  store.cookStepIdx = 0;
  document.getElementById('cookTitle').textContent = r.title;
  document.getElementById('cookOverlay').classList.add('open');
  renderCookIngredients(r);
  renderCookStep();
  requestWakeLock();
}

export function stopCookMode(){
  document.getElementById('cookOverlay').classList.remove('open');
  document.getElementById('cookIngPanel').classList.remove('open');
  clearInterval(store.cookTimerInterval);
  store.cookTimerInterval = null;
  releaseWakeLock();
}

document.getElementById('cookCloseBtn').addEventListener('click', stopCookMode);
document.getElementById('cookIngToggle').addEventListener('click', ()=> document.getElementById('cookIngPanel').classList.toggle('open'));

function renderCookIngredients(r){
  const list = document.getElementById('cookIngList');
  list.innerHTML = (r.ingredients||[]).map(i=>{
    const amt = (i.qty!==null && i.qty!==undefined) ? `${fmtQty(i.qty)} ${i.unit||''}` : (i.unit || i.amount || '');
    return `<li><span>${escapeHtml(i.name)}</span><span class="amt">${escapeHtml(amt)}</span></li>`;
  }).join('');
  list.querySelectorAll('li').forEach(li=> li.addEventListener('click', ()=> li.classList.toggle('checked')));
}

function renderCookStep(){
  clearInterval(store.cookTimerInterval); store.cookTimerInterval = null; store.cookTimerRunning = false;
  const steps = store.cookRecipe.steps || [];
  const total = steps.length;
  const s = steps[store.cookStepIdx];

  document.getElementById('cookProgress').innerHTML = steps.map((_,i)=>
    `<div class="cook-dot ${i<store.cookStepIdx?'done':(i===store.cookStepIdx?'current':'')}"></div>`
  ).join('');
  document.getElementById('cookStepCounter').textContent = `${Math.min(store.cookStepIdx+1,total)} / ${total}`;

  const body = document.getElementById('cookBody');
  if(store.cookStepIdx >= total || total === 0){
    body.innerHTML = `<div class="cook-done-screen"><div class="emoji">🎉</div>
      <p class="cook-step-text">${total===0 ? 'В этом рецепте нет шагов' : 'Готово! Приятного аппетита'}</p></div>`;
    document.getElementById('cookNextBtn').textContent = 'Завершить';
    document.getElementById('cookPrevBtn').disabled = store.cookStepIdx <= 0;
    return;
  }
  const text = typeof s === 'string' ? s : s.text;
  const tm = typeof s === 'object' ? s.timerMinutes : null;
  store.cookTimerSeconds = tm ? tm*60 : 0;

  document.getElementById('cookNextBtn').textContent = store.cookStepIdx === total-1 ? 'Завершить' : 'Дальше →';
  document.getElementById('cookPrevBtn').disabled = store.cookStepIdx === 0;

  body.innerHTML = `<div class="cook-step">
    <div class="cook-step-num">Шаг ${store.cookStepIdx+1} из ${total}</div>
    <div class="cook-step-text">${escapeHtml(text)}</div>
    ${tm ? `<div class="cook-timer">
      <div class="cook-timer-display" id="timerDisplay">${formatTimer(store.cookTimerSeconds)}</div>
      <div class="cook-timer-btns">
        <button class="btn btn-primary" id="timerStartBtn">▶ Старт</button>
        <button class="btn" id="timerResetBtn">↺ Сброс</button>
      </div>
    </div>` : ''}
  </div>`;

  if(tm){
    document.getElementById('timerStartBtn').addEventListener('click', toggleTimer);
    document.getElementById('timerResetBtn').addEventListener('click', ()=>{
      clearInterval(store.cookTimerInterval); store.cookTimerInterval=null; store.cookTimerRunning=false;
      store.cookTimerSeconds = tm*60;
      document.getElementById('timerDisplay').textContent = formatTimer(store.cookTimerSeconds);
      document.getElementById('timerDisplay').classList.remove('ringing');
      document.getElementById('timerStartBtn').textContent = '▶ Старт';
    });
  }
}

function formatTimer(sec){
  const m = Math.floor(sec/60), s = sec%60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function toggleTimer(){
  const btn = document.getElementById('timerStartBtn');
  if(store.cookTimerRunning){
    clearInterval(store.cookTimerInterval); store.cookTimerInterval=null; store.cookTimerRunning=false;
    btn.textContent = '▶ Старт';
    return;
  }
  store.cookTimerRunning = true;
  btn.textContent = '⏸ Пауза';
  store.cookTimerInterval = setInterval(()=>{
    store.cookTimerSeconds--;
    const disp = document.getElementById('timerDisplay');
    if(!disp){ clearInterval(store.cookTimerInterval); return; }
    disp.textContent = formatTimer(Math.max(0,store.cookTimerSeconds));
    if(store.cookTimerSeconds <= 0){
      clearInterval(store.cookTimerInterval); store.cookTimerInterval=null; store.cookTimerRunning=false;
      disp.classList.add('ringing');
      if(navigator.vibrate) navigator.vibrate([300,100,300,100,300]);
      try{
        const ctx = new (window.AudioContext||window.webkitAudioContext)();
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination); o.frequency.value = 880;
        o.start(); g.gain.setValueAtTime(0.2, ctx.currentTime);
        setTimeout(()=>{ o.stop(); ctx.close(); }, 700);
      }catch(e){}
    }
  }, 1000);
}

document.getElementById('cookPrevBtn').addEventListener('click', ()=>{ if(store.cookStepIdx>0){ store.cookStepIdx--; renderCookStep(); } });
document.getElementById('cookNextBtn').addEventListener('click', ()=>{
  store.cookStepIdx++;
  if(store.cookStepIdx > (store.cookRecipe.steps||[]).length){ stopCookMode(); return; }
  renderCookStep();
});
