/* =========================================================
   UNITY CAPITAL — app.js
   ⚠️ প্রথমে নিচের firebaseConfig টা আপনার Firebase Console
   (Project settings → General → Your apps → SDK setup) থেকে
   কপি করে বসিয়ে দিন। databaseURL/projectId আগে থেকেই বসানো আছে।
   ========================================================= */
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "unity-capital-2026.firebaseapp.com",
  databaseURL: "https://unity-capital-2026-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "unity-capital-2026",
  storageBucket: "unity-capital-2026.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const PINS = { "1234": "viewer", "9966": "editor" };
const DAY = 86400000;

let app, db, dbRef;
let cache = { members:{}, deposits:{}, investments:{}, recoveries:{}, expenses:{}, transfers:{}, trash:{} };
let role = sessionStorage.getItem('uc_role') || null;
let curPage = 'dashboard';
let invTab = 'list';
let memTab = 'profile';

/* ---------------- INIT FIREBASE ---------------- */
try{
  app = firebase.initializeApp(firebaseConfig);
  db = firebase.database();
  dbRef = db.ref('ucdata');
}catch(e){ console.error('Firebase init failed', e); }

/* ---------------- UTIL ---------------- */
function fmt(n){ n = Number(n)||0; return '৳' + Math.round(n).toLocaleString('en-IN'); }
function pct(n){ return (Number(n)||0).toFixed(1)+'%'; }
function todayStr(){ return new Date().toISOString().slice(0,10); }
function dateStr(ts){ if(!ts) return '-'; const d = typeof ts==='number'? new Date(ts) : new Date(ts); return d.toLocaleDateString('bn-BD',{day:'2-digit',month:'short',year:'numeric'}); }
function uid(prefix){ return prefix+'_'+Date.now()+Math.floor(Math.random()*1000); }
function toast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),1800); }
function isEditor(){ return role==='editor'; }
function guard(){ if(!isEditor()){ toast('শুধু Editor এই কাজ করতে পারবেন'); return false;} return true; }
function addDays(dateISO, days){ const d=new Date(dateISO); d.setDate(d.getDate()+days); return d.toISOString().slice(0,10); }
function addMonths(dateISO, months){ const d=new Date(dateISO); d.setMonth(d.getMonth()+months); return d.toISOString().slice(0,10); }

/* ---------------- LOGIN ---------------- */
let pinBuf = '';
function renderPinDots(){
  const dots = document.querySelectorAll('#pinDots span');
  dots.forEach((d,i)=> d.classList.toggle('filled', i < pinBuf.length));
}
document.getElementById('keypad').addEventListener('click', e=>{
  const btn = e.target.closest('button'); if(!btn) return;
  const k = btn.dataset.k;
  if(k==='clear'){ pinBuf=''; }
  else if(k==='back'){ pinBuf = pinBuf.slice(0,-1); }
  else { if(pinBuf.length<4) pinBuf += k; }
  renderPinDots();
  document.getElementById('login-error').textContent='';
  if(pinBuf.length===4){
    if(PINS[pinBuf]){
      role = PINS[pinBuf];
      sessionStorage.setItem('uc_role', role);
      enterApp();
    } else {
      document.getElementById('login-error').textContent = 'ভুল PIN, আবার চেষ্টা করুন';
      pinBuf=''; renderPinDots();
    }
  }
});
function enterApp(){
  document.getElementById('login-screen').style.display='none';
  document.getElementById('app').style.display='flex';
  document.getElementById('roleBadge').textContent = role==='editor' ? 'Editor' : 'Viewer';
  document.getElementById('fabBtn').style.display = isEditor() ? 'flex':'none';
  startSync();
}
document.getElementById('logoutBtn').addEventListener('click', ()=>{
  sessionStorage.removeItem('uc_role'); role=null; pinBuf='';
  document.getElementById('app').style.display='none';
  document.getElementById('login-screen').style.display='flex';
});
if(role){ enterApp(); }

/* ---------------- FIREBASE SYNC ---------------- */
function startSync(){
  const statusEl = document.getElementById('syncStatus');
  dbRef.on('value', snap=>{
    const val = snap.val() || {};
    cache = {
      members: val.members||{}, deposits: val.deposits||{}, investments: val.investments||{},
      recoveries: val.recoveries||{}, expenses: val.expenses||{}, transfers: val.transfers||{}, trash: val.trash||{}
    };
    if(statusEl) statusEl.textContent = 'সংযুক্ত • লাইভ সিঙ্ক চলছে';
    autoPurgeExpiredTrash();
    renderAll();
  }, err=>{
    if(statusEl) statusEl.textContent = 'সংযোগ ব্যর্থ — ইন্টারনেট / Firebase Config চেক করুন';
    console.error(err);
  });
}
function dbSet(path, val){ return db.ref('ucdata/'+path).set(val); }
function dbUpdate(path, obj){ return db.ref('ucdata/'+path).update(obj); }
function dbRemove(path){ return db.ref('ucdata/'+path).remove(); }

/* ---------------- SOFT DELETE / TRASH ---------------- */
function softDelete(type, id, label){
  if(!guard()) return;
  dbUpdate(type+'/'+id, {deleted:true});
  const tid = uid('trash');
  const now = Date.now();
  dbSet('trash/'+tid, {id:tid, type, itemId:id, label, deletedAt:now, expiresAt: now + 30*DAY});
  toast('মুছে ফেলা হয়েছে — Trash এ পাওয়া যাবে');
}
function restoreFromTrash(tid){
  if(!guard()) return;
  const t = cache.trash[tid]; if(!t) return;
  dbUpdate(t.type+'/'+t.itemId, {deleted:false});
  dbRemove('trash/'+tid);
  toast('Restore করা হয়েছে');
}
function purgeTrash(tid){
  if(!guard()) return;
  const t = cache.trash[tid]; if(!t) return;
  dbRemove(t.type+'/'+t.itemId);
  dbRemove('trash/'+tid);
  toast('স্থায়ীভাবে মুছে ফেলা হয়েছে');
}
function autoPurgeExpiredTrash(){
  if(!isEditor()) return;
  const now = Date.now();
  Object.values(cache.trash||{}).forEach(t=>{
    if(t.expiresAt && t.expiresAt < now){
      dbRemove(t.type+'/'+t.itemId);
      dbRemove('trash/'+t.id);
    }
  });
}

/* ---------------- CALCULATIONS ---------------- */
function activeDeposits(){ return Object.values(cache.deposits||{}).filter(d=>!d.deleted); }
function activeExpenses(){ return Object.values(cache.expenses||{}).filter(e=>!e.deleted); }
function activeInvestments(){ return Object.values(cache.investments||{}).filter(i=>!i.deleted); }
function activeRecoveries(){ return Object.values(cache.recoveries||{}).filter(r=>!r.deleted); }
function allMembers(){ return Object.values(cache.members||{}).filter(m=>!m.deleted); }
function activeMembers(){ return allMembers().filter(m=>m.status!=='Exited'); }
function exitedMembers(){ return allMembers().filter(m=>m.status==='Exited'); }

function memberPrincipal(id){ return activeDeposits().filter(d=>d.memberId===id).reduce((s,d)=>s+Number(d.principal||0),0); }
function memberPenalty(id){ return activeDeposits().filter(d=>d.memberId===id).reduce((s,d)=>s+Number(d.latePenalty||0)+Number(d.duePenalty||0),0); }

function investmentRecoveries(invId){ return activeRecoveries().filter(r=>r.invId===invId); }
function investmentRecoveredTotal(invId){ return investmentRecoveries(invId).reduce((s,r)=>s+Number(r.amount||0),0); }

function computeTotals(){
  const deposits = activeDeposits();
  const totalPrincipal = deposits.reduce((s,d)=>s+Number(d.principal||0),0);
  const totalPenalty = deposits.reduce((s,d)=>s+Number(d.latePenalty||0)+Number(d.duePenalty||0),0);
  const totalExpense = activeExpenses().reduce((s,e)=>s+Number(e.amount||0),0);
  const investments = activeInvestments();
  let totalProfit=0, totalLoss=0, totalInvested=0, totalRecovered=0;
  investments.forEach(inv=>{
    totalInvested += Number(inv.amount||0);
    const recs = investmentRecoveries(inv.id);
    const recSum = recs.reduce((s,r)=>s+Number(r.amount||0),0);
    totalRecovered += recSum;
    totalProfit += recs.reduce((s,r)=>s+Number(r.profit||0),0);
    if(inv.status==='Completed' && recSum < Number(inv.amount||0)){
      totalLoss += (Number(inv.amount||0) - recSum);
    }
  });
  const totalAssets = totalPrincipal + totalPenalty + totalProfit - totalLoss - totalExpense;
  const cashInHand = totalAssets - (totalInvested - totalRecovered);
  return {totalPrincipal, totalPenalty, totalExpense, totalProfit, totalLoss, totalInvested, totalRecovered, totalAssets, cashInHand,
    activeMemberCount: activeMembers().length, runningCount: investments.filter(i=>i.status!=='Completed').length};
}

function ownershipMap(){
  const members = activeMembers();
  const totalP = members.reduce((s,m)=>s+memberPrincipal(m.id),0) || 1;
  const map = {};
  members.forEach(m=>{
    const base = memberPrincipal(m.id)/totalP*100;
    const extra = Number(m.extraShares||0);
    map[m.id] = Math.max(0, base + extra);
  });
  return map;
}

function installmentStatusOf(inst){
  if(inst.status==='paid') return 'paid';
  const today = todayStr();
  if(inst.dueDate < today) return 'overdue';
  if(inst.dueDate <= addDays(today,7)) return 'upcoming';
  return 'future';
}

/* ---------------- RENDER: ROUTER ---------------- */
function renderAll(){
  renderDashboard();
  renderDeposits();
  renderInvestments();
  renderExpenses();
  renderMembers();
  renderBackup();
}

document.getElementById('bottomNav').addEventListener('click', e=>{
  const btn = e.target.closest('button'); if(!btn) return;
  goPage(btn.dataset.page);
});
function goPage(p){
  curPage = p;
  document.querySelectorAll('.page').forEach(s=>s.classList.remove('active'));
  document.getElementById('page-'+p).classList.add('active');
  document.querySelectorAll('#bottomNav button').forEach(b=>b.classList.toggle('active', b.dataset.page===p));
  window.scrollTo(0,0);
}

document.getElementById('fabBtn').addEventListener('click', ()=>{
  if(!guard()) return;
  if(curPage==='dashboard'||curPage==='deposits') openDepositForm();
  else if(curPage==='investments') invTab==='recover' ? openRecoveryForm() : openInvestmentForm();
  else if(curPage==='expenses') openExpenseForm();
  else if(curPage==='members') memTab==='new' ? openMemberForm() : (memTab==='transfer' ? openTransferForm() : openDepositForm());
  else if(curPage==='backup') {}
});

/* ================= DASHBOARD ================= */
function renderDashboard(){
  const t = computeTotals();
  const grid = document.getElementById('dashStats');
  grid.innerHTML = `
    <div class="stat wide"><div class="label">মোট সম্পদ</div><div class="value num">${fmt(t.totalAssets)}</div></div>
    <div class="stat green"><div class="label">হাতে নগদ</div><div class="value num">${fmt(t.cashInHand)}</div></div>
    <div class="stat gold"><div class="label">বিনিয়োগে আটকা</div><div class="value num">${fmt(t.totalInvested-t.totalRecovered)}</div></div>
    <div class="stat"><div class="label">মোট মূল জমা</div><div class="value num">${fmt(t.totalPrincipal)}</div></div>
    <div class="stat"><div class="label">জরিমানা</div><div class="value num">${fmt(t.totalPenalty)}</div></div>
    <div class="stat green"><div class="label">লাভ</div><div class="value num">${fmt(t.totalProfit)}</div></div>
    <div class="stat red"><div class="label">লোকসান+খরচ</div><div class="value num">${fmt(t.totalLoss+t.totalExpense)}</div></div>
    <div class="stat"><div class="label">সক্রিয় সদস্য</div><div class="value num">${t.activeMemberCount}</div></div>
    <div class="stat"><div class="label">চলমান বিনিয়োগ</div><div class="value num">${t.runningCount}</div></div>
  `;

  // ownership donut
  const map = ownershipMap();
  const members = activeMembers();
  const colors = ['#0F3D3E','#C89B3C','#2E7D4F','#B23A3A','#175651','#C9772B','#7a5b12','#4B615F'];
  let acc = 0; const stops = [];
  members.forEach((m,i)=>{
    const p = map[m.id]||0;
    stops.push(`${colors[i%colors.length]} ${acc}% ${acc+p}%`);
    acc += p;
  });
  const donut = document.getElementById('ownerDonut');
  donut.style.background = stops.length ? `conic-gradient(${stops.join(',')})` : '#eee';
  const legend = document.getElementById('ownerLegend');
  legend.innerHTML = members.length ? members.map((m,i)=>`
    <div class="legend-item"><span class="dot" style="background:${colors[i%colors.length]}"></span>${m.name}<span class="pct num">${pct(map[m.id])}</span></div>
  `).join('') : `<div class="empty">এখনো কোনো সক্রিয় সদস্য নেই</div>`;

  // due widget
  const upcoming = [];
  activeInvestments().filter(i=>i.status!=='Completed').forEach(inv=>{
    (inv.installments||[]).forEach(inst=>{
      const st = installmentStatusOf(inst);
      if(st==='overdue'||st==='upcoming') upcoming.push({inv, inst, st});
    });
  });
  upcoming.sort((a,b)=> a.inst.dueDate.localeCompare(b.inst.dueDate));
  const dueWidget = document.getElementById('dueWidget');
  dueWidget.innerHTML = upcoming.length ? upcoming.slice(0,6).map(u=>`
    <div class="list-item">
      <div><div class="main">${u.inv.name}</div><div class="sub">কিস্তি #${u.inst.no} • ${dateStr(u.inst.dueDate)}</div></div>
      <div class="right"><div class="num" style="font-weight:700;">${fmt(u.inst.amount)}</div><span class="tag ${u.st}">${u.st==='overdue'?'⚠️ বকেয়া':'🔔 আসন্ন'}</span></div>
    </div>`).join('') : `<div class="empty"><span class="emoji">✅</span>কোনো বকেয়া বা আসন্ন কিস্তি নেই</div>`;
}

/* ================= DEPOSITS ================= */
function renderDeposits(){
  document.getElementById('depositLockNote').style.display = isEditor() ? 'none' : 'block';
  const list = activeDeposits().sort((a,b)=> (b.depDate||'').localeCompare(a.depDate||''));
  const el = document.getElementById('depositList');
  el.innerHTML = list.length ? list.map(d=>{
    const m = cache.members[d.memberId];
    return `<div class="list-item">
      <div><div class="main">${m?m.name:'অজানা সদস্য'}</div><div class="sub">${d.month||''} • ${dateStr(d.depDate)}</div></div>
      <div class="right">
        <div class="num" style="font-weight:700;">${fmt(d.principal)}</div>
        ${d.latePenalty||d.duePenalty? `<div class="sub num" style="color:var(--red)">জরিমানা ${fmt((d.latePenalty||0)+(d.duePenalty||0))}</div>`:''}
        ${isEditor()?`<div class="row-actions" style="margin-top:4px;justify-content:flex-end;">
          <button class="icon-btn" onclick="editDeposit('${d.id}')">✏️</button>
          <button class="icon-btn danger" onclick="softDelete('deposits','${d.id}','${(m?m.name:'')} এর জমা ${d.month||''}')">🗑️</button>
        </div>`:''}
      </div>
    </div>`;
  }).join('') : `<div class="empty"><span class="emoji">💳</span>এখনো কোনো জমা নেই</div>`;
}
function openDepositForm(existing){
  if(!guard()) return;
  const members = activeMembers();
  if(!members.length){ toast('আগে একজন সদস্য যোগ করুন'); return; }
  const body = `
    <div class="form-group"><label>সদস্য</label><select name="memberId">${members.map(m=>`<option value="${m.id}" ${existing&&existing.memberId===m.id?'selected':''}>${m.name}</option>`).join('')}</select></div>
    <div class="form-group"><label>মাস</label><input name="month" type="text" placeholder="যেমনঃ জুলাই ২০২৬" value="${existing?existing.month||'':''}"></div>
    <div class="form-group"><label>তারিখ</label><input name="depDate" type="date" value="${existing?existing.depDate:todayStr()}"></div>
    <div class="two-col">
      <div class="form-group"><label>মূল জমা (সর্বোচ্চ ২০০০৳)</label><input name="principal" type="number" max="2000" value="${existing?existing.principal:2000}"></div>
      <div class="form-group"><label>জরিমানা</label><input name="latePenalty" type="number" value="${existing?existing.latePenalty||0:0}"></div>
    </div>
    <div class="form-hint">জরিমানা সম্পদে যোগ হয়, কিন্তু মালিকানা বাড়ায় না।</div>
  `;
  openModal(existing?'জমা এডিট করুন':'নতুন চাঁদা', body, fd=>{
    const principal = Math.min(2000, Number(fd.get('principal'))||0);
    const data = { id: existing?existing.id:uid('dep'), memberId: fd.get('memberId'), month: fd.get('month'),
      depDate: fd.get('depDate'), principal, latePenalty: Number(fd.get('latePenalty'))||0, duePenalty:0,
      total: principal+(Number(fd.get('latePenalty'))||0), deleted:false };
    dbSet('deposits/'+data.id, data);
    toast('জমা সংরক্ষণ হয়েছে');
    closeModal();
  });
}
function editDeposit(id){ openDepositForm(cache.deposits[id]); }

/* ================= INVESTMENTS ================= */
document.getElementById('invTabs').addEventListener('click', e=>{
  const b = e.target.closest('button'); if(!b) return;
  invTab = b.dataset.t;
  document.querySelectorAll('#invTabs button').forEach(x=>x.classList.toggle('active', x===b));
  document.getElementById('invTabList').style.display = invTab==='list'?'block':'none';
  document.getElementById('invTabRecover').style.display = invTab==='recover'?'block':'none';
  renderInvestments();
});
function renderInvestments(){
  const list = activeInvestments().sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const el = document.getElementById('investmentList');
  el.innerHTML = list.length ? list.map(inv=>{
    const recovered = investmentRecoveredTotal(inv.id);
    const target = Number(inv.target||0);
    const progress = target? Math.min(100, recovered/target*100) : 0;
    const overdue = (inv.installments||[]).some(i=>installmentStatusOf(i)==='overdue');
    const upcoming = !overdue && (inv.installments||[]).some(i=>installmentStatusOf(i)==='upcoming');
    const cls = overdue?'overdue':(upcoming?'upcoming':'');
    return `<div class="item-card ${cls}">
      <div class="top">
        <div><div class="main" style="font-weight:700;">${inv.name}</div><div class="sub">${dateStr(inv.date)} • ক্রয়মূল্য ${fmt(inv.amount)}</div></div>
        <span class="tag ${inv.status==='Completed'?'completed':'running'}">${inv.status==='Completed'?'সম্পন্ন':'চলমান'}</span>
      </div>
      <div class="progress-bar"><div class="fill" style="width:${progress}%"></div></div>
      <div class="sub">আদায় ${fmt(recovered)} / লক্ষ্য ${fmt(target)} (${progress.toFixed(0)}%)</div>
      ${isEditor()?`<div class="row-actions" style="margin-top:8px;">
        ${inv.status!=='Completed'?`<button class="icon-btn" onclick="markInvestmentComplete('${inv.id}')">✅ সম্পন্ন করুন</button>`:''}
        <button class="icon-btn danger" onclick="softDelete('investments','${inv.id}','${inv.name}')">🗑️</button>
      </div>`:''}
    </div>`;
  }).join('') : `<div class="empty"><span class="emoji">📈</span>এখনো কোনো বিনিয়োগ নেই</div>`;

  // recovery tab
  renderRecoveryTab();
}
function markInvestmentComplete(id){
  if(!guard()) return;
  dbUpdate('investments/'+id, {status:'Completed'});
  toast('বিনিয়োগ সম্পন্ন হিসেবে চিহ্নিত হয়েছে');
}
function openInvestmentForm(){
  if(!guard()) return;
  const body = `
    <div class="form-group"><label>বিনিয়োগের নাম</label><input name="name" type="text" placeholder="যেমনঃ গরু ক্রয়"></div>
    <div class="form-group"><label>তারিখ</label><input name="date" type="date" value="${todayStr()}"></div>
    <div class="two-col">
      <div class="form-group"><label>ক্রয়মূল্য (৳)</label><input name="amount" type="number" id="f_amount"></div>
      <div class="form-group"><label>বাজারমূল্য (৳)</label><input name="marketPrice" type="number" id="f_market"></div>
    </div>
    <div class="form-group"><label>লাভের %</label><input name="profitPct" type="number" id="f_profit" value="20"></div>
    <div class="form-group"><label>মোট আদায় লক্ষ্য (auto)</label><input type="text" id="f_target" disabled></div>
    <div class="form-group"><label>অগ্রিম জমা (৳)</label><input name="advance" type="number" id="f_advance" value="0"></div>
    <div class="two-col">
      <div class="form-group"><label>কিস্তি সংখ্যা</label><input name="instCount" type="number" id="f_count" value="4"></div>
      <div class="form-group"><label>কিস্তির ধরন</label><select name="instType" id="f_type"><option value="monthly">মাসিক</option><option value="weekly">সাপ্তাহিক</option></select></div>
    </div>
    <div class="form-group"><label>প্রতি কিস্তি (সাজেস্ট, এডিটযোগ্য)</label><input name="instAmt" type="number" id="f_instamt"></div>
    <div class="form-group"><label>প্রথম কিস্তির তারিখ</label><input name="firstInstDate" type="date" id="f_firstdate" value="${todayStr()}"></div>
    <div class="form-hint">শেষ কিস্তির পরিমাণ বাকি টাকা অনুযায়ী স্বয়ংক্রিয়ভাবে সমন্বয় হবে।</div>
  `;
  openModal('নতুন বিনিয়োগ', body, fd=>{
    const amount = Number(fd.get('amount'))||0;
    const marketPrice = Number(fd.get('marketPrice'))||0;
    const profitPct = Number(fd.get('profitPct'))||0;
    const target = marketPrice + marketPrice*profitPct/100;
    const advance = Math.min(Number(fd.get('advance'))||0, target);
    const instCount = Math.max(1, Number(fd.get('instCount'))||1);
    const instType = fd.get('instType');
    const firstInstDate = fd.get('firstInstDate');
    const remain = target - advance;
    const baseAmt = Math.round((remain/instCount)*100)/100;
    const installments = [];
    let allotted = 0;
    for(let i=1;i<=instCount;i++){
      const dueDate = instType==='weekly' ? addDays(firstInstDate,(i-1)*7) : addMonths(firstInstDate,i-1);
      const amt = i<instCount ? baseAmt : Math.round((remain-allotted)*100)/100;
      allotted += baseAmt;
      installments.push({no:i, dueDate, amount: amt, status:'pending', paidDate:null});
    }
    const id = uid('inv');
    const invData = { id, name: fd.get('name'), date: fd.get('date'), amount, marketPrice, profitPct, target,
      advance, instCount, instType, firstInstDate, installments, status:'Running', deleted:false };
    dbSet('investments/'+id, invData);
    if(advance>0){
      const rid = uid('rec');
      const principal = Math.min(advance, amount);
      dbSet('recoveries/'+rid, {id:rid, invId:id, instNo:0, date:fd.get('date'), amount:advance,
        principal, profit: advance-principal, isAdvance:true, deleted:false});
    }
    toast('বিনিয়োগ যোগ হয়েছে');
    closeModal();
  });
  setTimeout(()=>{
    const rec = ()=>{
      const market = Number(document.getElementById('f_market').value)||0;
      const pp = Number(document.getElementById('f_profit').value)||0;
      const target = market + market*pp/100;
      document.getElementById('f_target').value = fmt(target);
      const adv = Number(document.getElementById('f_advance').value)||0;
      const count = Math.max(1, Number(document.getElementById('f_count').value)||1);
      document.getElementById('f_instamt').value = Math.round(((target-adv)/count)*100)/100;
    };
    ['f_market','f_profit','f_advance','f_count'].forEach(id=>document.getElementById(id).addEventListener('input', rec));
    rec();
  },0);
}

function renderRecoveryTab(){
  const wrap = document.getElementById('invTabRecover');
  const running = activeInvestments().filter(i=>i.status!=='Completed');
  if(!running.length){ wrap.innerHTML = `<div class="card"><div class="empty"><span class="emoji">📈</span>চলমান কোনো বিনিয়োগ নেই</div></div>`; return; }
  wrap.innerHTML = `<div class="card">
    <div class="form-group"><label>বিনিয়োগ সিলেক্ট করুন</label>
      <select id="recInvSelect">${running.map(i=>`<option value="${i.id}">${i.name}</option>`).join('')}</select>
    </div>
    <div id="recInstList"></div>
  </div>`;
  const sel = document.getElementById('recInvSelect');
  const renderInsts = ()=>{
    const inv = cache.investments[sel.value];
    if(!inv) return;
    const grouped = { overdue:[], upcoming:[], future:[] };
    (inv.installments||[]).forEach(inst=>{
      if(inst.status==='paid') return;
      grouped[installmentStatusOf(inst)].push(inst);
    });
    const block = (arr, label, cls)=> arr.length? `<div class="sub" style="margin:10px 0 4px;font-weight:700;">${label}</div>` +
      arr.map(inst=>`<div class="list-item"><div><div class="main">কিস্তি #${inst.no}</div><div class="sub">${dateStr(inst.dueDate)}</div></div>
      <div class="right"><div class="num" style="font-weight:700;">${fmt(inst.amount)}</div>
      ${isEditor()?`<button class="icon-btn" onclick="openRecoveryForm('${inv.id}',${inst.no})">আদায় করুন</button>`:''}</div></div>`).join('') : '';
    document.getElementById('recInstList').innerHTML =
      block(grouped.overdue,'⚠️ বকেয়া','overdue') + block(grouped.upcoming,'🔔 আসন্ন','upcoming') + block(grouped.future,'⏳ ভবিষ্যৎ','future')
      || `<div class="empty">সব কিস্তি আদায় হয়ে গেছে ✅</div>`;
  };
  sel.addEventListener('change', renderInsts);
  renderInsts();
}
function openRecoveryForm(invId, instNo){
  if(!guard()) return;
  const inv = invId ? cache.investments[invId] : null;
  const running = activeInvestments().filter(i=>i.status!=='Completed');
  const body = `
    <div class="form-group"><label>বিনিয়োগ</label>
      <select name="invId" id="rf_inv">${running.map(i=>`<option value="${i.id}" ${inv&&i.id===inv.id?'selected':''}>${i.name}</option>`).join('')}</select>
    </div>
    <div class="form-group"><label>কিস্তি</label><select name="instNo" id="rf_inst"></select></div>
    <div class="form-group"><label>আদায়ের তারিখ</label><input name="date" type="date" value="${todayStr()}"></div>
    <div class="form-group"><label>আদায়ের পরিমাণ (৳)</label><input name="amount" type="number" id="rf_amount"></div>
    <div class="form-hint" id="rf_split"></div>
  `;
  openModal('কিস্তি আদায়', body, fd=>{
    const iid = fd.get('invId'); const investment = cache.investments[iid];
    const amount = Number(fd.get('amount'))||0;
    const recoveredSoFar = investmentRecoveredTotal(iid);
    const remainingPrincipal = Math.max(0, Number(investment.amount||0) - recoveredSoFar);
    const principal = Math.min(amount, remainingPrincipal);
    const profit = amount - principal;
    const rid = uid('rec');
    dbSet('recoveries/'+rid, {id:rid, invId:iid, instNo:Number(fd.get('instNo')), date:fd.get('date'), amount, principal, profit, isAdvance:false, deleted:false});
    const no = Number(fd.get('instNo'));
    const updatedInsts = (investment.installments||[]).map(i=> i.no===no ? {...i, status:'paid', paidDate: fd.get('date')} : i);
    dbUpdate('investments/'+iid, {installments: updatedInsts});
    const totalTarget = Number(investment.target||0);
    if(recoveredSoFar+amount >= totalTarget || updatedInsts.every(i=>i.status==='paid')){
      dbUpdate('investments/'+iid, {status:'Completed'});
    }
    toast('কিস্তি আদায় সংরক্ষণ হয়েছে');
    closeModal();
  });
  setTimeout(()=>{
    const invSel = document.getElementById('rf_inv');
    const instSel = document.getElementById('rf_inst');
    const amtInput = document.getElementById('rf_amount');
    const fillInsts = ()=>{
      const iv = cache.investments[invSel.value];
      const pending = (iv.installments||[]).filter(i=>i.status!=='paid');
      instSel.innerHTML = pending.map(i=>`<option value="${i.no}" data-amt="${i.amount}" ${instNo===i.no?'selected':''}>#${i.no} — ${dateStr(i.dueDate)} — ${fmt(i.amount)}</option>`).join('');
      const opt = instSel.selectedOptions[0];
      if(opt) amtInput.value = opt.dataset.amt;
      updateSplit();
    };
    const updateSplit = ()=>{
      const iv = cache.investments[invSel.value];
      const recoveredSoFar = investmentRecoveredTotal(iv.id);
      const remainingPrincipal = Math.max(0, Number(iv.amount||0)-recoveredSoFar);
      const amt = Number(amtInput.value)||0;
      const principal = Math.min(amt, remainingPrincipal);
      const profit = amt-principal;
      document.getElementById('rf_split').textContent = `মূল আদায়: ${fmt(principal)} • লাভ: ${fmt(profit)}`;
    };
    invSel.addEventListener('change', fillInsts);
    instSel.addEventListener('change', ()=>{ const opt=instSel.selectedOptions[0]; if(opt) amtInput.value=opt.dataset.amt; updateSplit(); });
    amtInput.addEventListener('input', updateSplit);
    fillInsts();
  },0);
}

/* ================= EXPENSES ================= */
function renderExpenses(){
  const list = activeExpenses().sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const el = document.getElementById('expenseList');
  el.innerHTML = list.length ? list.map(e=>`
    <div class="list-item">
      <div><div class="main">${e.category}</div><div class="sub">${e.note||''} • ${dateStr(e.date)}</div></div>
      <div class="right">
        <div class="num" style="font-weight:700;color:var(--red)">-${fmt(e.amount)}</div>
        ${isEditor()?`<div class="row-actions" style="margin-top:4px;justify-content:flex-end;">
          <button class="icon-btn" onclick="editExpense('${e.id}')">✏️</button>
          <button class="icon-btn danger" onclick="softDelete('expenses','${e.id}','${e.category}')">🗑️</button>
        </div>`:''}
      </div>
    </div>`).join('') : `<div class="empty"><span class="emoji">💸</span>এখনো কোনো খরচ নেই</div>`;
}
function openExpenseForm(existing){
  if(!guard()) return;
  const body = `
    <div class="form-group"><label>তারিখ</label><input name="date" type="date" value="${existing?existing.date:todayStr()}"></div>
    <div class="form-group"><label>ধরন</label><select name="category">
      ${['খাতা','মিটিং','ব্যাংক চার্জ','পরিবহন','অন্যান্য'].map(c=>`<option ${existing&&existing.category===c?'selected':''}>${c}</option>`).join('')}
    </select></div>
    <div class="form-group"><label>পরিমাণ (৳)</label><input name="amount" type="number" value="${existing?existing.amount:''}"></div>
    <div class="form-group"><label>নোট (ঐচ্ছিক)</label><input name="note" type="text" value="${existing?existing.note||'':''}"></div>
  `;
  openModal(existing?'খরচ এডিট করুন':'নতুন খরচ', body, fd=>{
    const data = {id: existing?existing.id:uid('exp'), date:fd.get('date'), category:fd.get('category'),
      amount:Number(fd.get('amount'))||0, note:fd.get('note'), deleted:false};
    dbSet('expenses/'+data.id, data);
    toast('খরচ সংরক্ষণ হয়েছে');
    closeModal();
  });
}
function editExpense(id){ openExpenseForm(cache.expenses[id]); }

/* ================= MEMBERS ================= */
document.getElementById('memberTabs').addEventListener('click', e=>{
  const b = e.target.closest('button'); if(!b) return;
  memTab = b.dataset.t;
  document.querySelectorAll('#memberTabs button').forEach(x=>x.classList.toggle('active', x===b));
  ['profile','transfer','new','exit'].forEach(t=>{
    document.getElementById('memTab'+t[0].toUpperCase()+t.slice(1)).style.display = (t===memTab)?'block':'none';
  });
  renderMembers();
});
function renderMembers(){
  renderMemberProfiles();
  renderTransferTab();
  renderNewMemberTab();
  renderExitTab();
}
function renderMemberProfiles(){
  const t = computeTotals();
  const map = ownershipMap();
  const el = document.getElementById('memberProfileList');
  const members = activeMembers();
  el.innerHTML = members.length ? members.map(m=>{
    const principal = memberPrincipal(m.id);
    const penalty = memberPenalty(m.id);
    const own = map[m.id]||0;
    const curValue = t.totalAssets * own/100;
    const canPay = t.cashInHand >= curValue;
    return `<div class="card">
      <div class="list-item" style="border:none;padding:0 0 8px;">
        <div><div class="main" style="font-size:15px;">${m.name}</div><div class="sub">UCM: ${m.ucCode||'-'} • যোগদান ${dateStr(m.joinDate)}</div></div>
        ${isEditor()?`<button class="icon-btn danger" onclick="softDelete('members','${m.id}','${m.name}')">🗑️</button>`:''}
      </div>
      <div class="two-col">
        <div class="stat"><div class="label">মূল জমা</div><div class="value num" style="font-size:15px;">${fmt(principal)}</div></div>
        <div class="stat"><div class="label">জরিমানা</div><div class="value num" style="font-size:15px;">${fmt(penalty)}</div></div>
        <div class="stat"><div class="label">মালিকানা</div><div class="value num" style="font-size:15px;">${pct(own)}</div></div>
        <div class="stat"><div class="label">বর্তমান মূল্য</div><div class="value num" style="font-size:15px;">${fmt(curValue)}</div></div>
      </div>
      <div class="form-hint" style="margin-top:8px;">Exit মূল্য: ${fmt(curValue)} — ${canPay?'✅ এখনই পরিশোধ সম্ভব':'⚠️ এই মুহূর্তে হাতে নগদ যথেষ্ট নয়'}</div>
    </div>`;
  }).join('') : `<div class="empty"><span class="emoji">👥</span>এখনো কোনো সদস্য নেই</div>`;
}
function renderNewMemberTab(){
  const el = document.getElementById('memTabNew');
  el.innerHTML = `<div class="card">
    <div class="locked-note">নতুন সদস্য যোগের আগে সব সদস্যের সর্বসম্মত অনুমোদন আবশ্যক (সংগঠনের নিয়ম)।</div>
    ${isEditor()?`<button class="btn btn-primary" onclick="openMemberForm()">+ নতুন সদস্য যোগ করুন</button>`:`<div class="empty">শুধু Editor সদস্য যোগ করতে পারবেন</div>`}
  </div>`;
}
function openMemberForm(){
  if(!guard()) return;
  const body = `
    <div class="form-group"><label>UCM কোড (ইউনিক)</label><input name="ucCode" type="text" placeholder="যেমনঃ UCM-01"></div>
    <div class="form-group"><label>নাম</label><input name="name" type="text"></div>
    <div class="form-group"><label>যোগদান তারিখ</label><input name="joinDate" type="date" value="${todayStr()}"></div>
  `;
  openModal('নতুন সদস্য', body, fd=>{
    const code = fd.get('ucCode').trim();
    if(Object.values(cache.members||{}).some(m=>!m.deleted && m.ucCode===code)){ toast('এই UCM কোড আগে থেকেই আছে'); return; }
    const id = uid('M');
    dbSet('members/'+id, {id, ucCode:code, name:fd.get('name'), joinDate:fd.get('joinDate'), status:'Active', extraShares:0, deleted:false});
    toast('সদস্য যোগ হয়েছে');
    closeModal();
  });
}
function renderTransferTab(){
  const el = document.getElementById('memTabTransfer');
  const members = activeMembers();
  const t = computeTotals(); const map = ownershipMap();
  el.innerHTML = `<div class="card">
    ${isEditor()?`<button class="btn btn-primary" onclick="openTransferForm()" style="margin-bottom:14px;">+ নতুন শেয়ার ট্রান্সফার</button>`:''}
    <h3>ট্রান্সফার ইতিহাস</h3>
    <div id="transferHistory"></div>
  </div>`;
  const hist = Object.values(cache.transfers||{}).filter(x=>!x.deleted).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  document.getElementById('transferHistory').innerHTML = hist.length ? hist.map(x=>`
    <div class="list-item">
      <div><div class="main">${x.fromName} → ${x.buyers.map(b=>b.name).join(', ')}</div><div class="sub">মোট ${x.totalPct}% • ${dateStr(x.date)}</div></div>
      ${isEditor()?`<button class="icon-btn danger" onclick="softDelete('transfers','${x.id}','শেয়ার ট্রান্সফার')">🗑️</button>`:''}
    </div>`).join('') : `<div class="empty">এখনো কোনো ট্রান্সফার হয়নি</div>`;
}
let transferBuyerCount = 1;
function openTransferForm(){
  if(!guard()) return;
  const members = activeMembers();
  if(members.length<2){ toast('ট্রান্সফারের জন্য কমপক্ষে ২ জন সদস্য দরকার'); return; }
  transferBuyerCount = 1;
  const body = `
    <div class="form-group"><label>বিক্রেতা</label><select name="fromId" id="tf_from">${members.map(m=>`<option value="${m.id}">${m.name}</option>`).join('')}</select></div>
    <div id="tf_buyers"></div>
    <button type="button" class="btn btn-secondary" id="tf_addBuyer" style="margin-bottom:14px;">+ আরেকজন ক্রেতা</button>
    <div class="form-group"><label>তারিখ</label><input name="date" type="date" value="${todayStr()}"></div>
    <div class="form-hint" id="tf_summary"></div>
  `;
  openModal('শেয়ার ট্রান্সফার', body, fd=>{
    const fromId = fd.get('fromId');
    const buyers = [];
    document.querySelectorAll('.tf_buyer_row').forEach(row=>{
      const bid = row.querySelector('.tf_buyer_id').value;
      const bp = Number(row.querySelector('.tf_buyer_pct').value)||0;
      if(bid && bp>0) buyers.push({id:bid, name:cache.members[bid]?cache.members[bid].name:'', pct:bp});
    });
    if(!buyers.length){ toast('কমপক্ষে একজন ক্রেতা ও % দিন'); return; }
    const totalPct = buyers.reduce((s,b)=>s+b.pct,0);
    const id = uid('tr');
    dbSet('transfers/'+id, {id, fromId, fromName: cache.members[fromId]?cache.members[fromId].name:'', buyers, totalPct, date:fd.get('date'), deleted:false});
    // adjust extraShares
    const seller = cache.members[fromId];
    dbUpdate('members/'+fromId, {extraShares: Number(seller.extraShares||0) - totalPct});
    buyers.forEach(b=>{
      const buyer = cache.members[b.id];
      dbUpdate('members/'+b.id, {extraShares: Number(buyer.extraShares||0) + b.pct});
    });
    toast('শেয়ার ট্রান্সফার সম্পন্ন হয়েছে');
    closeModal();
  });
  setTimeout(()=>{
    const buyersWrap = document.getElementById('tf_buyers');
    const addRow = ()=>{
      const rowId = 'row'+Date.now()+Math.random();
      const div = document.createElement('div');
      div.className = 'tf_buyer_row two-col';
      div.style.marginBottom='8px';
      div.innerHTML = `
        <div class="form-group"><label>ক্রেতা</label><select class="tf_buyer_id">${members.map(m=>`<option value="${m.id}">${m.name}</option>`).join('')}</select></div>
        <div class="form-group"><label>%</label><input class="tf_buyer_pct" type="number" step="0.1"></div>`;
      buyersWrap.appendChild(div);
    };
    addRow();
    document.getElementById('tf_addBuyer').addEventListener('click', addRow);
  },0);
}
function renderExitTab(){
  const t = computeTotals(); const map = ownershipMap();
  const el = document.getElementById('memTabExit');
  const list = exitedMembers();
  el.innerHTML = `<div class="card"><h3>Exit করা সদস্যরা</h3>
    <div id="exitList"></div>
  </div>
  <div class="card"><h3>Exit করান</h3><div id="exitCandidates"></div></div>`;
  document.getElementById('exitList').innerHTML = list.length ? list.map(m=>`
    <div class="list-item">
      <div><div class="main">${m.name}</div><div class="sub">UCM: ${m.ucCode||'-'}</div></div>
      ${isEditor()?`<button class="icon-btn" onclick="restoreMember('${m.id}')">↩️ ফিরিয়ে আনুন</button>`:''}
    </div>`).join('') : `<div class="empty">কেউ Exit করেননি</div>`;
  const candidates = activeMembers();
  document.getElementById('exitCandidates').innerHTML = candidates.length ? candidates.map(m=>{
    const own = map[m.id]||0; const val = t.totalAssets*own/100;
    return `<div class="list-item">
      <div><div class="main">${m.name}</div><div class="sub">Exit মূল্য: ${fmt(val)}</div></div>
      ${isEditor()?`<button class="icon-btn danger" onclick="exitMember('${m.id}')">Exit করান</button>`:''}
    </div>`;
  }).join('') : `<div class="empty">কোনো সক্রিয় সদস্য নেই</div>`;
}
function exitMember(id){
  if(!guard()) return;
  if(!confirm('নিশ্চিত করুন — এই সদস্যকে Exit করাতে চান? (লিখিত রেকর্ড আবশ্যক অনুযায়ী নিশ্চিত হয়ে নিন)')) return;
  dbUpdate('members/'+id, {status:'Exited'});
  toast('সদস্য Exit করানো হয়েছে');
}
function restoreMember(id){
  if(!guard()) return;
  dbUpdate('members/'+id, {status:'Active'});
  toast('সদস্য ফিরিয়ে আনা হয়েছে');
}

/* ================= BACKUP ================= */
function renderBackup(){
  const trash = Object.values(cache.trash||{}).sort((a,b)=>b.deletedAt-a.deletedAt);
  const el = document.getElementById('trashList');
  el.innerHTML = trash.length ? trash.map(t=>{
    const daysLeft = Math.max(0, Math.ceil((t.expiresAt-Date.now())/DAY));
    return `<div class="list-item">
      <div><div class="main">${t.label||t.type}</div><div class="sub">${daysLeft} দিন বাকি • মুছেছে ${dateStr(t.deletedAt)}</div></div>
      ${isEditor()?`<div class="row-actions">
        <button class="icon-btn" onclick="restoreFromTrash('${t.id}')">↩️</button>
        <button class="icon-btn danger" onclick="purgeTrash('${t.id}')">❌</button>
      </div>`:''}
    </div>`;
  }).join('') : `<div class="empty"><span class="emoji">🗑️</span>Trash খালি আছে</div>`;
}
document.getElementById('downloadBackupBtn').addEventListener('click', ()=>{
  const blob = new Blob([JSON.stringify(cache,null,2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `unity-capital-backup-${todayStr()}.json`;
  a.click();
  toast('ব্যাকআপ ডাউনলোড হয়েছে');
});
document.getElementById('restoreFile').addEventListener('change', e=>{
  if(!guard()) return;
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    try{
      const data = JSON.parse(reader.result);
      if(!confirm('বর্তমান সব ডেটা প্রতিস্থাপিত হবে। নিশ্চিত?')) return;
      dbSet('', data);
      toast('Restore সম্পন্ন হয়েছে');
    }catch(err){ toast('ফাইল পড়তে সমস্যা হয়েছে'); }
  };
  reader.readAsText(file);
});

/* ================= MODAL ================= */
function openModal(title, bodyHtml, onSubmit){
  const overlay = document.getElementById('modal-overlay');
  const modal = document.getElementById('modal');
  modal.innerHTML = `
    <div class="modal-head"><h3>${title}</h3><button onclick="closeModal()">✕</button></div>
    <form id="modalForm">${bodyHtml}<button type="submit" class="btn btn-primary" style="margin-top:8px;">সংরক্ষণ করুন</button></form>
  `;
  overlay.classList.add('show');
  document.getElementById('modalForm').addEventListener('submit', e=>{
    e.preventDefault();
    onSubmit(new FormData(e.target));
  });
}
function closeModal(){ document.getElementById('modal-overlay').classList.remove('show'); }
document.getElementById('modal-overlay').addEventListener('click', e=>{ if(e.target.id==='modal-overlay') closeModal(); });

/* ================= SERVICE WORKER ================= */
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=> navigator.serviceWorker.register('sw.js').catch(()=>{}));
}
