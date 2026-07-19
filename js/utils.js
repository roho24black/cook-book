// Мелкие переиспользуемые функции без зависимостей от состояния приложения.

export function escapeHtml(s){
  return (String(s)||'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

export function fmtQty(q){
  if(q===null||q===undefined) return '';
  return (Math.round(q*10)/10).toString();
}

export function highlightMatch(text, q){
  if(!q) return escapeHtml(text);
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if(idx===-1) return escapeHtml(text);
  return escapeHtml(text.slice(0,idx)) + '<mark>' + escapeHtml(text.slice(idx,idx+q.length)) + '</mark>' + escapeHtml(text.slice(idx+q.length));
}

export function showToast(msg){
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  c.appendChild(t);
  requestAnimationFrame(()=> t.classList.add('show'));
  setTimeout(()=>{ t.classList.remove('show'); setTimeout(()=> t.remove(), 250); }, 2200);
}

export function showConfirm(message){
  return new Promise((resolve)=>{
    document.getElementById('confirmMessage').textContent = message;
    const overlay = document.getElementById('confirmOverlay');
    overlay.classList.add('open');
    const okBtn = document.getElementById('confirmOkBtn');
    const cancelBtn = document.getElementById('confirmCancelBtn');
    const cleanup = (result)=>{
      overlay.classList.remove('open');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      resolve(result);
    };
    const onOk = ()=> cleanup(true);
    const onCancel = ()=> cleanup(false);
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
  });
}
