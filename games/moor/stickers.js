/* =====================================================================
   «مور» — تعبيرات متحركة (رسم أصلي بالـ SVG) تنشرى من المتجر وتنرسل وقت اللعب
   ===================================================================== */
const AST=[ // id, name, model(m=رجل w=امرأة), brows, eyes, mouth, props, anim, price
  ['abushanab_angry','أبو شنب معصّب 🔥','m','','','',[],'none',5000],
  ['laugh','ضحك','m','up','happy','laugh',['joy'],'bounce',0],
  ['angry','معصّب','m','angry','angry','grit',['steam','vein','red'],'shake',0],
  ['sad','زعلان','w','sad','teary','frown',['tear'],'droop',0],
  ['cry','يصيح','m','sad','cry','wail',['stream'],'tremble',1500],
  ['shock','مصدوم','w','up','wide','bigO',['bang'],'jump',1500],
  ['love','مغرم','w','up','heart','smile',['hearts','blush'],'pulse',2000],
  ['cool','كشخة','m','flat','glasses','smirk',['spark'],'lean',2500],
  ['sleepy','نعسان','m','flat','closed','o',['zzz'],'sway',1500],
  ['think','يفكّر','w','one','side','flat',['q'],'sway',1500],
  ['dizzy','دايخ','m','up','x','wavy',['stars'],'wobble',2000],
  ['nervous','متوتّر','w','sad','wide','wavy',['sweat'],'tremble',1500],
  ['party','محتفل','m','up','happy','laugh',['confetti'],'jump',3000],
  ['shush','اسكت','m','flat','side','o',['finger'],'nod',2000],
  ['facepalm','يا ساتر','w','sad','closed','flat',['palm'],'droop',2000],
  ['flex','قوي','m','angry','open','grin',['muscle'],'bounce',2500],
  ['pray','يا رب','w','sad','closed','smile',['pray','spark'],'pulse',2000],
  ['clap','كفو','m','up','happy','smile',['clap'],'nod',2000],
  ['rich','غني','m','up','money','tongue',['cash'],'bounce',3500],
  ['wave','مع السلامة','w','up','happy','smile',['hand'],'sway',1500],
  ['gloat','شمتان','m','one','half','smirk',['heh'],'lean',2500],
  ['fire','ولعانة','m','angry','open','grin',['flame'],'pulse',3500],
  ['scared','خايف','w','sad','wide','wavy',['blue'],'tremble',1500],
];
const astOf=id=>AST.find(a=>a[0]===id);
const astOwned=id=>{const a=astOf(id);return !!a&&(!a[8]||!!P.vip||(P.owned.anim||[]).includes(id))};
const AST_IMG={"laugh": "e_laugh", "angry": "e_angry", "sad": "e_surrender", "cry": "e_shock", "shock": "salem", "love": "noura", "cool": "saud", "sleepy": "lulu", "think": "e_think", "dizzy": "bunduq", "nervous": "saqr", "party": "umsaleh", "shush": "muqrin", "facepalm": "mubarak", "flex": "abushanab", "pray": "moudi", "clap": "e_laugh", "rich": "e_happy", "wave": "e_wow", "gloat": "e_gloat", "fire": "nawaf", "scared": "hammoud"};
// تعبيرات فيديو حقيقية (WebP متحرك) داخل www/stickers
const AST_VID={abushanab_angry:'stickers/abushanab-angry.webp'};
// صوت التعبير (يشتغل مع ظهور الملصق إذا مؤثرات الصوت شغالة)
const AST_SND={abushanab_angry:'stickers/abushanab-angry.mp3'};
function astSound(id){try{if(!AST_SND[id]||!P.sfx)return;const a=new Audio(AST_SND[id]);a.volume=Math.min(1,sfxVol()*1.15);a.play().catch(()=>{})}catch(e){}}
function astSVG(id){const a=astOf(id);if(!a)return'';if(AST_VID[id])return `<img class="astv" src="${AST_VID[id]}" alt="${a[1]}" loading="lazy" decoding="async">`;const [,,mdl,br,ey,mo,props,anim]=a,L=42,R=78,EY=54,my=82;let s='';
  s+=`<clipPath id="ast-clip"><rect x="2" y="2" width="116" height="120" rx="18"/></clipPath><image href="${A[AST_IMG[id]]||''}" x="2" y="2" width="116" height="120" preserveAspectRatio="xMidYMid slice" clip-path="url(#ast-clip)"/>`;
  if(props.includes('red'))s+=`<rect class="ap-red" x="2" y="2" width="116" height="120" rx="18" fill="#ff1a0a" style="mix-blend-mode:multiply"/>`;
  if(props.includes('blue'))s+=`<rect class="ap-red" x="2" y="2" width="116" height="120" rx="18" fill="#3a6cff" style="mix-blend-mode:multiply"/>`;
  if(props.includes('blush'))s+=`<ellipse cx="38" cy="66" rx="9" ry="5" fill="#ff5a78" opacity=".35"/><ellipse cx="82" cy="66" rx="9" ry="5" fill="#ff5a78" opacity=".35"/>`;
  if(ey==='glasses')s+=`<text x="60" y="${EY+8}" text-anchor="middle" font-size="44" class="ap-shine">🕶️</text>`;
  // إضافات متحركة
  const T=(x,y,t,c,sz)=>`<text x="${x}" y="${y}" text-anchor="middle" font-size="${sz||18}" class="${c}">${t}</text>`;let o='';
  for(const p of props){switch(p){
    case'steam':o+=`<g class="ap-steam"><circle cx="20" cy="30" r="6" fill="#ddd"/><circle cx="14" cy="22" r="4.5" fill="#eee"/></g><g class="ap-steam d2"><circle cx="100" cy="30" r="6" fill="#ddd"/><circle cx="106" cy="22" r="4.5" fill="#eee"/></g>`;break;
    case'vein':o+=T(96,20,'💢','ap-beat',22);break;
    case'joy':o+=`<path class="ap-drop" d="M41 66q-3 6 0 8q3-2 0-8z" fill="#7cc4ff"/><path class="ap-drop d2" d="M79 66q-3 6 0 8q3-2 0-8z" fill="#7cc4ff"/>`;break;
    case'tear':o+=`<path class="ap-drop" d="M${L-2} 68q-4 8 0 11q4-3 0-11z" fill="#6bb8ff"/>`;break;
    case'stream':o+=`<rect class="ap-flow" x="${L-3}" y="66" width="6" height="40" rx="3" fill="#6bb8ff" opacity=".85"/><rect class="ap-flow d2" x="${R-3}" y="66" width="6" height="40" rx="3" fill="#6bb8ff" opacity=".85"/>`;break;
    case'bang':o+=T(98,30,'❗','ap-beat',22)+T(22,34,'❕','ap-beat d2',18);break;
    case'hearts':o+=T(20,50,'❤️','ap-rise',16)+T(100,46,'💕','ap-rise d2',16)+T(60,12,'❤️','ap-rise d3',14);break;
    case'spark':o+=T(100,26,'✨','ap-beat',18)+T(18,40,'✨','ap-beat d2',14);break;
    case'zzz':o+=T(90,34,'Z','ap-rise',16)+T(98,24,'Z','ap-rise d2',13)+T(104,14,'z','ap-rise d3',11);break;
    case'q':o+=T(98,30,'❓','ap-hop',22);break;
    case'stars':o+=`<g class="ap-orbit">${T(30,20,'⭐','',13)}${T(90,20,'⭐','',13)}${T(60,8,'💫','',13)}</g>`;break;
    case'sweat':o+=`<path class="ap-drop" d="M88 42q-5 9 0 12q5-3 0-12z" fill="#8fd0ff"/><path class="ap-drop d2" d="M32 46q-4 7 0 10q4-3 0-10z" fill="#8fd0ff"/>`;break;
    case'confetti':o+=['#e3b75b','#e8264b','#3cb371','#4a7fd6','#f08'].map((c,k)=>`<rect class="ap-fall d${k}" x="${12+k*24}" y="-6" width="5" height="9" rx="1" fill="${c}"/>`).join('')+T(102,28,'🎉','ap-beat',20);break;
    case'finger':o+=T(60,my+16,'☝️','ap-nodf',24);break;
    case'palm':o+=T(60,74,'🤚','ap-slap',38);break;
    case'muscle':o+=T(16,92,'💪','ap-flexl',26)+T(104,92,'💪','ap-flexr',26);break;
    case'pray':o+=T(60,118,'🤲','ap-beat',26);break;
    case'clap':o+=T(60,118,'👏','ap-clap',28);break;
    case'cash':o+=T(18,10,'💵','ap-fall d0',16)+T(60,4,'💵','ap-fall d2',16)+T(102,12,'💵','ap-fall d4',16);break;
    case'hand':o+=T(102,74,'👋','ap-wave',28);break;
    case'heh':o+=T(98,30,'هه','ap-hop',16);break;
    case'flame':o=T(20,40,'🔥','ap-flick',26)+T(100,40,'🔥','ap-flick d2',26)+T(60,10,'🔥','ap-flick d3',22)+o;break;
  }}
  return `<svg class="ast a-${anim}" viewBox="0 0 120 124" aria-label="${a[1]}"><g class="ast-body">${s}</g>${o}</svg>`}

function useAnim(id){if(!astOwned(id)){openAnimShop(id);return}useEmo('a:'+id)}
function animGridHTML(owned){return `<div class="astgrid">${AST.filter(a=>owned?astOwned(a[0]):true).map(a=>{const own=astOwned(a[0]);
  return `<button class="astcell ${own?'':'alock'}" onclick="${owned?`useAnim('${a[0]}')`:own?`useAnim('${a[0]}')`:`buyAnim('${a[0]}')`}"><div class="astpic">${astSVG(a[0])}</div><b>${a[1]}</b>${own?(owned?'':'<small class="aown">✓ عندك</small>'):`<small class="aprice">🪙 ${arNum(a[8])}</small>`}</button>`}).join('')}</div>`}
function animShopHTML(){return `<div class="fbanner"><span>تعبيرات متحركة 🎭</span></div><p class="small" style="text-align:center">اشترِ التعبير مرة وحدة واستخدمه في كل مباراة من زر 😄</p>${animGridHTML(false)}`}
function openAnimShop(){openShop('anim')}
function buyAnim(id){const a=astOf(id);if(!a||astOwned(id))return;if(P.coins<a[8]){toast('عملاتك ما تكفي 😅');try{if(IAP.on)setTimeout(()=>openShop('coins'),700)}catch(e){}return}
  P.coins-=a[8];P.owned.anim=(P.owned.anim||[]).concat(id);save();sfx('meld');setTimeout(()=>astSound(id),400);try{renderHome()}catch(e){}
  openModal(`<div class="astwow">${astSVG(id)}</div><h2 class="goldtxt" style="text-align:center">صار عندك «${a[1]}» 🎉</h2><p class="small" style="text-align:center">تلقاه في زر الإيموجي 😄 وقت اللعب</p><button class="btn-gold close" onclick="openShop('anim')">رجوع للمتجر</button>`)}
// ردود الكمبيوتر: أحياناً يرسل تعبير متحرك يناسب ردة فعله
const AST_MOOD={laugh:['laugh','gloat','clap','party'],angry:['angry','fire','facepalm'],happy:['love','party','clap','cool','rich'],shock:['shock','scared','dizzy','nervous'],sad:['sad','cry','facepalm','pray']};
let AST_T=0;
(function(){const st0=window.sticker;if(typeof st0==='function')window.sticker=function(i,key){
    if(typeof key==='string'&&key.startsWith('a:')){const id=key.slice(2);if(!astOf(id))return;
      const host=i===0?$('#me'):$('#seat'+i),tw=$('#tw');if(!host||!tw)return;const T=tw.getBoundingClientRect(),r=host.getBoundingClientRect();
      const s=document.createElement('div');s.className='sticker astk';s.innerHTML=astSVG(id);
      s.style.left=Math.max(4,Math.min(T.width-110,r.left-T.left+r.width/2-52))+'px';s.style.top=Math.max(4,(i===0?T.height-120:r.top-T.top+r.height/2-52))+'px';
      tw.appendChild(s);astSound(id);setTimeout(()=>s.remove(),3200);return}
    return st0(i,key)};
  const rc0=window.react;if(typeof rc0==='function')window.react=function(i,kind,line){const r=rc0.apply(this,arguments);
    try{if(i>0&&S&&!S.net&&AST_MOOD[kind]&&Date.now()-AST_T>6000&&Math.random()<.3){AST_T=Date.now();setTimeout(()=>{if(S&&!S.over)window.sticker(i,'a:'+pick(AST_MOOD[kind]))},500)}}catch(e){}return r};
})();
