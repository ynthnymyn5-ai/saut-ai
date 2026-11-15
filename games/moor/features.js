/* =====================================================================
   «مور» — ميزات إضافية: تحدي اليوم، لقطة التكويش، ارمِ عليه، رحلة الخليج،
   ذاكرة الشخصيات، دوري الربع، زينة المواسم، أبو شنب يعلّمك، المستوى التلقائي
   (يندمج داخل www/index.html عن طريق build-features.py)
   ===================================================================== */
const FX_DAY=()=>{const d=new Date(Date.now()+3*3600e3);return d.toISOString().slice(0,10)};   // يوم الكويت
const FX_MONTHS=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const fxDayLabel=k=>{const [y,m,d]=k.split('-').map(Number);return d+' '+FX_MONTHS[m-1]};
function fxHash(str){let h=2166136261;for(const ch of str){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
function fxRng(seed){let a=seed>>>0;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function fxShareImage(canvas,text,name){return(async()=>{try{const data=canvas.toDataURL('image/png');
  if(CAP&&NP.Filesystem&&NP.Share){const f=await NP.Filesystem.writeFile({path:name||'moor.png',data:data.split(',')[1],directory:'CACHE'});await NP.Share.share({title:'MOOR',text,files:[f.uri],dialogTitle:'شارك'});return}
  const blob=await(await fetch(data)).blob(),file=new File([blob],name||'moor.png',{type:'image/png'});
  if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],text});return}
  if(navigator.share){await navigator.share({text});return}
  try{await navigator.clipboard.writeText(text);toast('انسخ النص وشاركه ✓')}catch(e){toast('المشاركة مو متوفرة هنا')}}catch(e){}})()}
function fxShareText(text){try{if(CAP&&NP.Share){NP.Share.share({title:'MOOR',text,dialogTitle:'شارك'}).catch(()=>{});return}if(navigator.share){navigator.share({text}).catch(()=>{});return}
  navigator.clipboard.writeText(text).then(()=>toast('انسخ ✓ والصقه وين ما تبي')).catch(()=>toast(text))}catch(e){}}
const fxLink='moor-game.vercel.app';
const fxMe=()=>(typeof AUTH!=='undefined'&&AUTH&&AUTH.pno)||P.pno||'';

/* ---------- 1) تحدي المجلس اليومي ---------- */
const DAILY_GOALS=[
  {ev:'sweep',n:2,t:'كوّش مرتين في مباراة وحدة',e:'🧹'},
  {ev:'meld',n:4,t:'نزّل ٤ مرات في مباراة وحدة',e:'🃏'},
  {ev:'project',n:1,t:'نزّل مشروع (١٠٠ أو أكثر)',e:'💎'},
  {ev:'win',n:1,t:'افز بمباراة التحدي',e:'🏆'},
  {ev:'sweep',n:1,t:'كوّش الأرض قبل الجولة الثالثة',e:'⚡',maxRound:2},
  {ev:'round',n:2,t:'افز بجولتين',e:'🔥'},
];
function dailyToday(){const k=FX_DAY(),g=DAILY_GOALS[fxHash('moor-'+k)%DAILY_GOALS.length];P.dch=P.dch&&P.dch.k===k?P.dch:{k,tries:0,done:false,best:0};return{k,g,st:P.dch}}
function openDailyChallenge(){const {k,g,st}=dailyToday();
  openModal(`<div class="dchead"><div class="dce">${g.e}</div><h2 class="goldtxt" style="margin:4px 0 0">تحدي المجلس اليومي</h2><div class="small">${fxDayLabel(k)} • نفس التوزيعة لكل اللاعبين</div></div>
  <div class="dcgoal">${g.t}</div>
  <div class="dcstat">${st.done?'✅ أنجزته اليوم! رجع بكرة لتحدي جديد':`محاولاتك اليوم: ${st.tries} • أفضل تقدّم: ${st.best}/${g.n}`}</div>
  ${st.done?`<button class="btn-gold close" onclick="shareDaily()">📤 شارك نتيجتك</button>`:`<button class="btn-gold close" onclick="closeModal(true);startDaily()">🎯 ابدأ التحدي</button>`}
  <p class="small" style="text-align:center">الجائزة: 🪙 ${arNum(800)} أول ما تنجزه</p>
  <button class="ab close" onclick="closeModal()">إغلاق</button>`)}
function startDaily(){const {k,g}=dailyToday();P.dch.tries++;save();FX.pendingDaily={k,g};P.game='moor';startMoor()}
function shareDaily(){const {k,g,st}=dailyToday();fxShareText(`🎴 مور — تحدي ${fxDayLabel(k)}\n${g.e} ${g.t}\n${st.done?'✅ أنجزته من المحاولة رقم '+st.tries:'⏳ '+st.best+'/'+g.n}\n${fxMe()?'👤 '+fxMe()+'\n':''}تحدّاني: ${fxLink}`)}
function dailyProgress(ev,n){if(!S||!S.daily||S.daily.won)return;const g=S.daily.g;if(ev!==g.ev)return;if(g.maxRound&&S.round>g.maxRound)return;
  S.daily.p+=n||1;const st=P.dch;if(S.daily.p>st.best){st.best=Math.min(S.daily.p,g.n);save()}
  if(S.daily.p>=g.n){S.daily.won=true;if(!st.done){st.done=true;earn(800);save();setTimeout(()=>{banner('🎯 أنجزت تحدي اليوم!');sfx('win');confetti();toast('+'+arNum(800)+' 🪙 — شارك نتيجتك من «تحدي اليوم»')},900)}}
  else toast(`🎯 التحدي: ${arNum(Math.min(S.daily.p,g.n))}/${arNum(g.n)}`)}

/* ---------- 2) لقطة التكويش (صورة تشاركها) ---------- */
async function sweepCard(i,n){const W=1080,H=1350,c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');
  const g=x.createRadialGradient(W/2,H*.38,80,W/2,H/2,H*.8);g.addColorStop(0,'#5c1428');g.addColorStop(.6,'#2e0814');g.addColorStop(1,'#120406');x.fillStyle=g;x.fillRect(0,0,W,H);
  const img=s=>new Promise(r=>{const m=new Image();m.onload=()=>r(m);m.onerror=()=>r(null);m.src=s});
  const ch=S.players[i].ch,face=await img(A[ch.id]),logo=await img(A.logo);
  x.textAlign='center';x.fillStyle='#f6dc93';x.font='900 120px Cairo, sans-serif';x.fillText('تكويش!',W/2,190);
  x.font='800 54px Cairo, sans-serif';x.fillStyle='#fff3c4';x.fillText(`${arNum(n)} ورقة دفعة وحدة 👋💥`,W/2,280);
  if(face){x.save();x.beginPath();x.arc(W/2,640,250,0,6.283);x.closePath();x.clip();const r=Math.max(500/face.width,500/face.height);x.drawImage(face,W/2-face.width*r/2,640-250-30,face.width*r,face.height*r);x.restore();
    x.lineWidth=14;x.strokeStyle='#e3b75b';x.beginPath();x.arc(W/2,640,250,0,6.283);x.stroke()}
  x.font='900 72px Cairo, sans-serif';x.fillStyle='#f6dc93';x.fillText(i===0?(P.nick||'أنا'):ch.name,W/2,980);
  if(logo)x.drawImage(logo,W/2-110,1040,220,220);
  x.font='700 34px Cairo, sans-serif';x.fillStyle='#d9ac4f';x.fillText(fxLink,W/2,1305);return c}
function offerSweepShare(i,n){if(i!==0||n<4)return;FX.lastSweep={i,n};setTimeout(()=>{const t=$('#toast');if(!t)return;
  t.innerHTML=`تكويش ${arNum(n)} أوراق! <button class="fxsharebtn" onclick="shareSweep()">📸 شارك اللقطة</button>`;t.classList.add('show');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),5000)},1600)}
async function shareSweep(){const s=FX.lastSweep;if(!s||!S)return;const c=await sweepCard(s.i,s.n);fxShareImage(c,`👋💥 كوّشت ${s.n} أوراق في مور! تحدّاني: ${fxLink}`,'moor-sweep.png')}

/* ---------- 3) ارمِ عليه ---------- */
const THROWS=[['🍅','طماطة','angry',['مين رماني؟! 😤','الطماطة حقتك يا ذيب؟ 😠','شكلك خسران ومقهور 😂']],
  ['🌹','وردة','happy',['يا هلا بالورد 🌹','الله يسلمك، ذوق 😌','وردة؟! صرنا أحباب 😂']],
  ['🩴','نعال','shock',['النعاااال لا 😂','وش سويت أنا؟! 😳','هذي ما تنسى 😤']],
  ['☕','فنجال','happy',['مشكور على الفنجال ☕','القهوة تعدّل المزاج 😌','صبّ لي ثاني 😂']],
  ['💐','بوكيه','happy',['بوكيه كامل؟! تستاهل 💐','ههه خجلتني 😳']],
  ['🧂','ملح','angry',['ملح؟! يعني ثقيل دم؟ 😂','الحين صار الكلام مالح 😤']]];
let FX_THROW_T=0;
function openThrow(){if(!S||$('#game').classList.contains('hidden')){toast('ابدأ مباراة أول');return}
  openModal(`<h2 class="goldtxt">ارمِ على لاعب 🎯</h2><div class="thgrid">${THROWS.map(([e,n],k)=>`<button onclick="pickThrow(${k})"><span>${e}</span>${n}</button>`).join('')}</div><button class="ab close" onclick="openEmoji()">رجوع</button>`)}
function pickThrow(k){openModal(`<h2 class="goldtxt">على مين ترمي ${THROWS[k][0]}؟</h2><div class="thwho">${[1,2,3].filter(i=>S.players[i]).map(i=>`<button onclick="closeModal(true);throwAt(${i},${k})"><img src="${A[S.players[i].ch.id]}" alt=""><b>${escH(S.players[i].name)}</b><small>${i===2?'شريكك':'خصم'}</small></button>`).join('')}</div><button class="ab close" onclick="openThrow()">رجوع</button>`)}
function throwAt(i,k){const now=Date.now();if(now-FX_THROW_T<2500){toast('على هونك 😅');return}FX_THROW_T=now;
  const [e,,kind,lines]=THROWS[k],from=$('#me'),to=SEATEL(i);if(!from||!to)return;const a=from.getBoundingClientRect(),b=to.getBoundingClientRect();
  const el=document.createElement('span');el.className='fxthrow';el.textContent=e;document.body.appendChild(el);
  const ax=a.left+a.width/2,ay=a.top+a.height/2,bx=b.left+b.width/2,by=b.top+b.height/2-10,mx=(ax+bx)/2,my=Math.min(ay,by)-120;
  try{sfx('tick')}catch(x){}
  el.animate([{transform:`translate(${ax}px,${ay}px) translate(-50%,-50%) rotate(0) scale(.6)`},{transform:`translate(${mx}px,${my}px) translate(-50%,-50%) rotate(380deg) scale(1.3)`,offset:.5},{transform:`translate(${bx}px,${by}px) translate(-50%,-50%) rotate(720deg) scale(1)`}],{duration:650,easing:'cubic-bezier(.3,.6,.4,1)'}).onfinish=()=>{
    el.remove();const sp=document.createElement('span');sp.className='fxsplat';sp.textContent=e;sp.style.left=bx+'px';sp.style.top=by+'px';document.body.appendChild(sp);
    sp.animate([{transform:'translate(-50%,-50%) scale(.6)',opacity:1},{transform:'translate(-50%,-50%) scale(1.8)',opacity:.9,offset:.3},{transform:'translate(-50%,-30%) scale(1.6)',opacity:0}],{duration:1100,easing:'ease-out'}).onfinish=()=>sp.remove();
    try{haptic('medium')}catch(x){}try{fxParticles(to,[e],5)}catch(x){}
    react(i,kind,pick(lines));const o=[1,2,3].filter(x=>x!==i&&S.players[x]);if(o.length)setTimeout(()=>react(pick(o),'laugh',pick(['ههههه 😂','يستاهل 😂','حلوة هذي 😂'])),1300)}}

/* ---------- 4) رحلة الخليج ---------- */
const CITIES=[
  {id:'kw',n:'الكويت',f:'🇰🇼',boss:'abushanab',felt:'emerald',diff:'easy',rw:1000,line:'هلا بك في ديوانيتي… خلنا نشوف ذوقك 😌'},
  {id:'ry',n:'الرياض',f:'🇸🇦',boss:'saqr',felt:'crimson',diff:'medium',rw:1500,line:'عيني على ورقك من أول ورقة 🦅'},
  {id:'dh',n:'الدوحة',f:'🇶🇦',boss:'saud',felt:'amethyst',diff:'medium',rw:1500,line:'جاهز للمشهد الأخير؟ 🎬'},
  {id:'mn',n:'المنامة',f:'🇧🇭',boss:'lulu',felt:'sapphire',diff:'medium',rw:2000,line:'الحظ يحبني… بس خلنا نشوف 😊'},
  {id:'ms',n:'مسقط',f:'🇴🇲',boss:'mubarak',felt:'turquoise',diff:'hard',rw:2500,line:'الخبرة ما تنشرى يا وليدي 🗡️'},
  {id:'db',n:'دبي',f:'🇦🇪',boss:'moudi',felt:'onyx',diff:'hard',rw:5000,line:'آخر محطة… وجدتك ما ترحم 👓'},
];
function jr(){P.jr=P.jr||{next:0,done:[]};return P.jr}
function openJourney(){const J=jr();
  openModal(`<h2 class="goldtxt" style="text-align:center">🗺️ رحلة الخليج</h2><p class="small" style="text-align:center">اغلب زعيم كل مدينة وافتح اللي بعدها. آخر محطة لقبها «سيد المجالس» 👑</p>
  <div class="jmap">${CITIES.map((c,k)=>{const done=J.done.includes(c.id),open=k<=J.next,cur=k===J.next&&!done,ch=CHARS.find(x=>x.id===c.boss);
    return `<div class="jcity ${done?'done':''} ${open?'':'lock'} ${cur?'cur':''}"><div class="jflag">${c.f}</div><div class="jinfo"><b>${c.n}</b><small>الزعيم: ${ch?ch.name:''} • ${({easy:'سهل',medium:'متوسط',hard:'صعب'})[c.diff]} • 🪙 ${arNum(c.rw)}</small></div>
    ${done?'<span class="jok">✓</span>':open?`<button class="btn-gold" onclick="closeModal(true);startJourney(${k})">العب</button>`:'<span class="jlock">🔒</span>'}</div>`}).join('')}</div>
  ${J.done.length>=CITIES.length?'<p style="text-align:center;font-weight:900">👑 أنت سيد المجالس!</p>':''}
  <button class="ab close" onclick="closeModal()">إغلاق</button>`)}
function startJourney(k){const c=CITIES[k];if(!c)return;FX.pendingJourney={k,c};P.game='moor';startMoor()}
function journeyWin(k){const J=jr(),c=CITIES[k];if(!J.done.includes(c.id)){J.done.push(c.id);J.next=Math.max(J.next,k+1);earn(c.rw);save();
    setTimeout(()=>{banner(`${c.f} فتحت ${CITIES[k+1]?CITIES[k+1].n:'لقب سيد المجالس 👑'}!`);toast(`+${arNum(c.rw)} 🪙 من رحلة الخليج`)},1500);
    if(J.done.length>=CITIES.length){P.title='سيد المجالس';save()}}}

/* ---------- 5) ذاكرة الشخصيات ---------- */
function memOf(id){P.mem=P.mem||{};return P.mem[id]=P.mem[id]||{g:0,w:0,l:0}}
function memGreet(){if(!S||S.mode!=='moor')return;const opp=[1,3].filter(i=>S.players[i]&&!S.players[i].remote);const i=pick(opp);if(i==null)return;const m=memOf(S.players[i].ch.id);
  let line=null;if(m.g>=1&&m.l>m.w)line=pick([`آخر مرة غلبتك 😏 بنعيدها؟`,'غلبتك قبل… ونعيدها اليوم 😂','تتذكر آخر مباراة بيننا؟ 😂']);
  else if(m.g>=1&&m.w>m.l)line=pick(['اليوم يوم الثأر! 😤','غلبتني قبل… بس اليوم غير 😤','جيت أرد اعتباري 😤']);
  else if(m.g>=5)line=`رجعت يا بطل؟ ${arNum(m.g)} مباريات بيننا 🤝`;
  if(line)setTimeout(()=>{if(S&&!S.over)say(i,line,true)},4200)}
function memRecord(won){if(!S||S.mode!=='moor'||S.net)return;[1,3].forEach(i=>{const p=S.players[i];if(!p)return;const m=memOf(p.ch.id);m.g++;won?m.w++:m.l++});
  const pt=S.players[2];if(pt){const m=memOf(pt.ch.id);m.g++}save()}
const memText=id=>{const m=P.mem&&P.mem[id];return m&&m.g?`بينكم: فزت ${arNum(m.w)} – خسرت ${arNum(m.l)}`:''};

/* ---------- 6) دوري الربع ---------- */
async function openFriendsLeague(){try{openLeaders('fr')}catch(e){}
  try{const fr=Object.keys(P.friends||{});if(!fr.length)return;const ids=fr.concat(myId()).map(x=>'"'+String(x).replace(/"/g,'')+'"').join(',');
    const w=isoWeek(new Date(Date.now()-7*864e5));if(P.lgSeen===w)return;
    const rows=await sbGet(`lb_week?select=uid,name,points&week=eq.${w}&uid=in.(${ids})&order=points.desc&limit=1`);P.lgSeen=w;save();
    if(rows&&rows[0]){const top=rows[0];FX.lastChamp=top.name;if(top.uid===myId()){earn(2000);P.title=P.title||'بطل دوري الربع';save();setTimeout(()=>{banner('👑 أنت بطل دوري الربع!');confetti();toast('+'+arNum(2000)+' 🪙 جائزة بطل الأسبوع الماضي')},600)}
      else setTimeout(()=>toast(`👑 بطل الربع الأسبوع الماضي: ${top.name}`),600)}}catch(e){}}

/* ---------- 7) زينة المواسم ---------- */
function seasonDeco(){try{const e=currentEvent();document.body.classList.toggle('season',!!e);const old=document.getElementById('seasonDeco');if(old)old.remove();if(!e)return;
  const icons=e.id.startsWith('ramadan')?['🏮','🌙','🏮','⭐','🏮']:e.id.startsWith('eid')?['🎈','🎉','🎈','✨','🎈']:[e.e,'🎉',e.e,'✨',e.e];
  const d=document.createElement('div');d.id='seasonDeco';d.className='seasondeco';d.innerHTML=icons.map((x,k)=>`<i style="left:${8+k*21}%;animation-delay:-${k*.7}s">${x}</i>`).join('');
  const hero=document.getElementById('hero');if(hero)hero.appendChild(d)}catch(e){}}

/* ---------- 8) أبو شنب يعلّمك ---------- */
const COACH_TIPS=['المشروع ١٠٠ أو أكثر يقرّبك من الختم 💎','لا تحتفظ بالجوكر كثير… استخدمه في مشروع كبير 🃏','قبل لا ترمي، شوف وش نزّل الخصم وتجنّب الورقة اللي تكمّل مشروعه 👀','الأرض لا صارت كبيرة، فكّر تكوّشها قبل غيرك 🧹','اللي يخلص أوراقه أول ياخذ المور 🎴'];
function coachTip(){if(P.coach===false||!S||S.mode!=='moor'||S.net||S.tut)return;FX.coachN=(FX.coachN||0)+1;if(FX.coachN%2)return;
  const h=S.players[0].hand||[];let t=null;
  try{if(S.phase==='play'){const b=bestMelds(h);if(b&&b.pts>0&&b.list&&b.list.length)t='عندك نزول جاهز! اختار الأوراق واضغط «نزّل» 😌'}}catch(e){}
  if(!t&&S.phase==='draw'&&S.discard&&S.discard.length>=4)t=`الأرض فيها ${arNum(S.discard.length)} ورق… فكّر تكوّشها 🧹`;
  if(!t&&Math.random()<.35)t=pick(COACH_TIPS);if(!t)return;
  const old=document.getElementById('fxCoach');if(old)old.remove();const c=document.createElement('div');c.id='fxCoach';c.className='fxcoach';
  c.innerHTML=`<img src="${A.abushanab}" alt=""><div><b>أبو شنب يعلّمك</b><span>${t}</span></div><button aria-label="إغلاق" onclick="this.parentElement.remove()">✕</button>`;
  document.body.appendChild(c);setTimeout(()=>{c.classList.add('out');setTimeout(()=>c.remove(),400)},5200)}

/* ---------- 9) المستوى التلقائي ---------- */
function autoDiff(){const r=(P.recent||[]).slice(-6);if(r.length<3)return P.diff==='auto'?'medium':(P.diff||'medium');const w=r.filter(Boolean).length/r.length;return w>=.67?'hard':w<=.34?'easy':'medium'}
function recentAdd(won){P.recent=(P.recent||[]).concat([won?1:0]).slice(-6);if(P.diffAuto){const before=P.diff,now=autoDiff();P.diff=now;if(now!==before)setTimeout(()=>toast('🧠 المستوى صار: '+({easy:'سهل',medium:'متوسط',hard:'صعب'})[now]),2400)}save()}

/* ---------- ربط بالمباراة ---------- */
const FX={};
function fxPreMatch(others){const J=FX.pendingJourney,D=FX.pendingDaily;FX.pendingJourney=FX.pendingDaily=null;FX.active={};
  if(J){const k=others.findIndex(c=>c.id===J.c.boss);if(k>0){const [b]=others.splice(k,1);others.unshift(b)}else if(k<0){const b=CHARS.find(c=>c.id===J.c.boss);if(b&&b.id!==P.char)others.unshift(b)}
    FX.active.journey=J;FX.keep={diff:P.diff,felt:P.felt};P.diff=J.c.diff;P.felt=J.c.felt}
  if(D)FX.active.daily=D}
function fxStarted(){if(!S||S.mode!=='moor')return;const a=FX.active||{};
  if(a.daily){S.daily={g:a.daily.g,p:0,won:false};S.seed=fxHash('deal-'+a.daily.k);setTimeout(()=>banner('🎯 '+a.daily.g.t),900)}
  if(a.journey){const c=a.journey.c;S.journey=a.journey.k;if(S.players[1])S.players[1].name=S.players[1].ch.name+' 👑';setTimeout(()=>{banner(`${c.f} ${c.n}`);say(1,c.line,true)},1100)}
  else memGreet()}
function fxRestore(){if(FX.keep){P.diff=P.diffAuto?autoDiff():FX.keep.diff;P.felt=FX.keep.felt;FX.keep=null;FX.active={};save();try{applyFelt()}catch(e){}}}
function fxMatchEnd(won){try{memRecord(won);recentAdd(won);if(S&&S.journey!=null&&won)journeyWin(S.journey);if(S&&S.daily&&S.daily.g.ev==='win'&&won)dailyProgress('win',1)}catch(e){}fxRestore()}
function seededDeck(seed){const r=Math.random;Math.random=fxRng(seed);try{return makeDeck()}finally{Math.random=r}}
(function(){const ow=window.owns;window.owns=function(k,id){return ow(k,id)||(k==='felt'&&!!FX.keep&&FX.active&&FX.active.journey&&id===FX.active.journey.c.felt)};
  const tr0=window.track;if(typeof tr0==='function')window.track=function(ev,n){tr0(ev,n);try{if(ev!=='win')dailyProgress(ev,n)}catch(e){}};
  const gh=window.goHome;if(typeof gh==='function')window.goHome=function(){fxRestore();return gh.apply(this,arguments)};
  seasonDeco();try{const ni=window.newsItems;if(typeof ni==='function')window.newsItems=function(rows){let h=ni(rows);const e=currentEvent(),{g}=dailyToday();
    h=`<span class="nb-it">🎯 تحدي اليوم: ${g.t}</span><span class="nb-sep">◆</span>`+h;if(FX.lastChamp)h=`<span class="nb-it">👑 بطل دوري الربع: <b>${escH(FX.lastChamp)}</b></span><span class="nb-sep">◆</span>`+h;
    if(e)h=`<span class="nb-it">${e.e} ${e.n}: هدية بانتظارك</span><span class="nb-sep">◆</span>`+h;return h}}catch(e){}})();
