# Merges features.js into www/index.html and adds the hooks it needs.
# Safe to run again: it replaces the previous copy between the markers.
import re
p = 'www/index.html'
s = open(p, encoding='utf-8').read()
js = open('features.js', encoding='utf-8').read() + '\n' + open('stickers.js', encoding='utf-8').read()

M1, M2 = '/*FX-BEGIN*/', '/*FX-END*/'
if M1 in s:
    s = s[:s.index(M1)] + s[s.index(M2) + len(M2):]
i = s.rfind('</script>')
s = s[:i] + M1 + '\n' + js + '\n' + M2 + '\n' + s[i:]

def rep(a, b, once=True):
    global s
    if b in s or s.count(a) == 0:
        return  # already applied (a later hook may have extended it)
    assert s.count(a) == 1, ('missing/dup', a[:70])
    s = s.replace(a, b)

# match flow
rep("const others=CHARS.filter(c=>c.id!==P.char);shuffle(others);",
    "const others=CHARS.filter(c=>c.id!==P.char);shuffle(others);try{fxPreMatch(others)}catch(e){}")
rep("  applyFelt();\n  newRound();\n}",
    "  applyFelt();try{fxStarted()}catch(e){}\n  newRound();\n}")
rep("S.token=Math.random();S.round++;S.lastRes=null;sfx('shuffle');\n  const deck=makeDeck();",
    "S.token=Math.random();S.round++;S.lastRes=null;sfx('shuffle');\n  const deck=S.seed?seededDeck(S.seed+S.round):makeDeck();")
rep("const rkx=rankResult('moor',won);", "const rkx=rankResult('moor',won);try{fxMatchEnd(won)}catch(e){}")
rep("if(i===0){P.stats.tk++;track('sweep')}", "if(i===0){P.stats.tk++;track('sweep');try{offerSweepShare(i,cs.length)}catch(e){}}")
rep("if(first)toast('أنت تبدأ: معك ١٢ ورقة، ارمِ ورقة بدون سحب');\n  }else",
    "if(first)toast('أنت تبدأ: معك ١٢ ورقة، ارمِ ورقة بدون سحب');else setTimeout(()=>{try{if(S&&S.turn===0&&!S.over)coachTip()}catch(e){}},700);\n  }else")

# home buttons
rep('<button class="xbtn" onclick="openInvite()">🎟️ ادعُ ربعك<small>واكسب</small></button></div>',
    '<button class="xbtn" onclick="openInvite()">🎟️ ادعُ ربعك<small>واكسب</small></button></div>\n'
    '    <div class="xrow fxrow"><button class="xbtn" onclick="openDailyChallenge()">🎯 تحدي<small>اليوم</small></button>'
    '<button class="xbtn" onclick="openJourney()">🗺️ رحلة<small>الخليج</small></button>'
    '<button class="xbtn" onclick="openFriendsLeague()">🤝 دوري<small>الربع</small></button></div>')

# auto difficulty
rep('<button data-d="hard">صعب</button>\n    </div>', '<button data-d="hard">صعب</button><button data-d="auto">تلقائي 🧠</button>\n    </div>')
rep("diffSeg button').forEach(b=>{b.classList.toggle('on',b.dataset.d===P.diff);b.onclick=()=>{P.diff=b.dataset.d;save();renderHome()}});",
    "diffSeg button').forEach(b=>{b.classList.toggle('on',b.dataset.d==='auto'?!!P.diffAuto:(!P.diffAuto&&b.dataset.d===P.diff));b.onclick=()=>{if(b.dataset.d==='auto'){P.diffAuto=true;P.diff=autoDiff();toast('🧠 المستوى يتعدّل حسب أدائك')}else{P.diffAuto=false;P.diff=b.dataset.d}save();renderHome()}});")

# throw button in the emoji panel
rep('<h2 class="goldtxt">الإيموجي</h2><div class="emogrid">',
    '<h2 class="goldtxt">الإيموجي</h2><button class="btn-gold fxthrowbtn" onclick="openThrow()">🍅 ارمِ على لاعب 🌹</button><div class="emogrid">')

# rivalry in the character list
rep('<div><b>${c.name}</b><div class="small">${c.tag}</div></div><span>${S&&S.players',
    '<div><b>${c.name}</b><div class="small">${c.tag}</div>${memText(c.id)?`<div class="small fxriv">⚔️ ${memText(c.id)}</div>`:\'\'}</div><span>${S&&S.players')

# coach switch in settings
rep('<div class="row"><span>الموسيقى 🎶</span>',
    '<div class="row"><span>أبو شنب يعلّمك (نصائح) 🎓</span><input type="checkbox" ${P.coach!==false?\'checked\':\'\'} onchange="P.coach=this.checked;save()"></div>\n  <div class="row"><span>الموسيقى 🎶</span>')

# animated stickers: shop tab + emoji panel
rep("['chars','الشخصيات 🧔🏻'],['backs'", "['chars','الشخصيات 🧔🏻'],['anim','تعبيرات 🎭'],['backs'")
rep("  openModal(`<div class=\"shophead\">", "  if(shopTab==='anim')body=animShopHTML();\n  openModal(`<div class=\"shophead\">")
rep('onclick="openThrow()">🍅 ارمِ على لاعب 🌹</button><div class="emogrid">',
    'onclick="openThrow()">🍅 ارمِ على لاعب 🌹</button><h4 class="sh">تعبيرات متحركة 🎭</h4>${animGridHTML(true)}<button class="ab" style="width:100%;margin:4px 0 8px" onclick="openShop(\'anim\')">🛒 تعبيرات أكثر في المتجر</button><h4 class="sh">ملصقات</h4><div class="emogrid">')

css = r'''
/*FXCSS*/
.fxrow{margin-top:8px}
.dchead{text-align:center}.dce{font-size:54px;line-height:1}
.dcgoal{margin:14px 0 8px;padding:14px;border-radius:14px;background:linear-gradient(135deg,rgba(227,183,91,.22),rgba(227,183,91,.06));border:1px solid rgba(227,183,91,.5);text-align:center;font-weight:900;font-size:18px}
.dcstat{text-align:center;margin-bottom:12px;opacity:.9}
.jmap{display:flex;flex-direction:column;gap:8px;margin:12px 0;position:relative}
.jcity{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12)}
.jcity.cur{border-color:#e3b75b;box-shadow:0 0 18px rgba(227,183,91,.35)}
.jcity.done{background:rgba(80,200,120,.12)}.jcity.lock{opacity:.5}
.jflag{font-size:30px}.jinfo{flex:1;display:flex;flex-direction:column}.jinfo small{opacity:.8}
.jcity .btn-gold{padding:6px 16px;height:auto;font-size:15px}.jok{color:#6fdc8c;font-size:24px;font-weight:900}.jlock{font-size:20px}
.thgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:12px 0}
.thgrid button{display:flex;flex-direction:column;align-items:center;gap:4px;padding:12px 4px;border-radius:14px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);color:inherit;font:inherit;font-weight:800}
.thgrid button span{font-size:38px}
.thwho{display:flex;gap:10px;justify-content:center;margin:14px 0}
.thwho button{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 4px;border-radius:14px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);color:inherit;font:inherit}
.thwho img{width:62px;height:62px;border-radius:50%;object-fit:cover;border:2px solid #e3b75b}.thwho small{opacity:.75}
.fxthrowbtn{width:100%;height:44px;font-size:17px;margin:6px 0 10px}
.fxthrow{position:fixed;left:0;top:0;font-size:44px;z-index:9999;pointer-events:none;filter:drop-shadow(0 6px 8px rgba(0,0,0,.5))}
.fxsplat{position:fixed;font-size:56px;z-index:9999;pointer-events:none}
.fxsharebtn{margin-inline-start:8px;padding:4px 10px;border-radius:10px;border:0;background:#e3b75b;color:#2a1405;font:inherit;font-weight:900;pointer-events:auto}
#toast:has(.fxsharebtn){pointer-events:auto}
.fxriv{color:#f6dc93}
.fxcoach{position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 210px);transform:translateX(-50%);z-index:9500;display:flex;align-items:center;gap:10px;width:min(90vw,380px);padding:8px 10px;border-radius:16px;background:rgba(30,12,4,.92);border:1px solid #e3b75b;box-shadow:0 8px 24px rgba(0,0,0,.45);animation:fxcoachIn .35s ease-out;transition:opacity .4s,transform .4s}
.fxcoach.out{opacity:0;transform:translate(-50%,12px)}
.fxcoach img{width:44px;height:44px;border-radius:50%;object-fit:cover;border:2px solid #e3b75b;flex:none}
.fxcoach div{display:flex;flex-direction:column;font-size:14px;line-height:1.4}.coach b{color:#f6dc93;font-size:12px}
.fxcoach button{background:none;border:0;color:#fff;opacity:.7;font-size:16px;padding:4px}
@keyframes fxcoachIn{from{opacity:0;transform:translate(-50%,14px)}to{opacity:1;transform:translate(-50%,0)}}
.seasondeco{position:absolute;inset:0 0 auto 0;height:0;pointer-events:none;z-index:3}
.seasondeco i{position:absolute;top:0;font-style:normal;font-size:24px;transform-origin:50% -30px;animation:swing 3.2s ease-in-out infinite}
.seasondeco i::before{content:'';position:absolute;left:50%;top:-30px;width:1px;height:30px;background:rgba(246,220,147,.6)}
@keyframes swing{0%,100%{transform:translateY(26px) rotate(-8deg)}50%{transform:translateY(26px) rotate(8deg)}}
#diffSeg button[data-d="auto"]{white-space:nowrap}

.astgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:8px 0}
.astcell{display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 2px;border-radius:14px;background:linear-gradient(180deg,rgba(255,255,255,.1),rgba(255,255,255,.03));border:1px solid rgba(227,183,91,.35);color:inherit;font:inherit;font-size:12px;font-weight:800}
.astcell.alock .astpic{filter:saturate(.75)}.astcell .aprice{color:#f6dc93}.astcell .aown{color:#6fdc8c}
.astpic{width:64px;height:66px;border-radius:12px;background:#fff8e6;overflow:hidden}
.ast{width:100%;height:100%;overflow:visible;display:block}
.astk{width:104px!important;height:108px!important;background:#fff8e6;border-radius:20px;border:3px solid #e3b75b;box-shadow:0 10px 24px rgba(0,0,0,.45);padding:2px;animation:astPop .35s cubic-bezier(.3,1.6,.5,1)}
.astk img:not(.astv){display:none}
.astv{width:100%;height:100%;object-fit:cover;border-radius:12px;display:block}
.astk .astv{border-radius:16px}
.astwow{width:150px;height:155px;margin:6px auto;background:#fff8e6;border-radius:24px;border:3px solid #e3b75b}
@keyframes astPop{from{transform:scale(.2) rotate(-12deg)}to{transform:none}}
.ast-body,.ast text,.ast g,.ast rect,.ast path,.ast circle{transform-box:fill-box;transform-origin:center}
.ast .ast-body{transform-box:view-box;transform-origin:60px 112px}
.a-bounce .ast-body{animation:aBounce .5s ease-in-out infinite}
.a-shake .ast-body{animation:aShake .14s linear infinite}
.a-droop .ast-body{animation:aDroop 2.2s ease-in-out infinite}
.a-tremble .ast-body{animation:aShake .09s linear infinite}
.a-jump .ast-body{animation:aJump .7s cubic-bezier(.3,.7,.4,1) infinite}
.a-pulse .ast-body{animation:aPulse .8s ease-in-out infinite}
.a-lean .ast-body{animation:aLean 1.8s ease-in-out infinite}
.a-sway .ast-body{animation:aSway 2s ease-in-out infinite}
.a-wobble .ast-body{animation:aWob 1s ease-in-out infinite}
.a-nod .ast-body{animation:aNod .6s ease-in-out infinite}
@keyframes aBounce{0%,100%{transform:translateY(0) scale(1,1)}50%{transform:translateY(-6px) scale(1.03,.97)}}
@keyframes aShake{0%{transform:translate(-2px,0) rotate(-1.5deg)}50%{transform:translate(2px,-1px) rotate(1.5deg)}100%{transform:translate(-2px,0) rotate(-1.5deg)}}
@keyframes aDroop{0%,100%{transform:translateY(2px) rotate(-3deg)}50%{transform:translateY(6px) rotate(3deg)}}
@keyframes aJump{0%,100%{transform:translateY(0) scale(1.05,.94)}40%{transform:translateY(-12px) scale(.96,1.05)}}
@keyframes aPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}
@keyframes aLean{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(4deg)}}
@keyframes aSway{0%,100%{transform:rotate(-5deg)}50%{transform:rotate(5deg)}}
@keyframes aWob{0%{transform:rotate(-9deg) translateX(-2px)}50%{transform:rotate(9deg) translateX(2px)}100%{transform:rotate(-9deg) translateX(-2px)}}
@keyframes aNod{0%,100%{transform:rotate(0) translateY(0)}50%{transform:rotate(3deg) translateY(3px)}}
.ap-red{animation:apRed .9s ease-in-out infinite}@keyframes apRed{0%,100%{opacity:.08}50%{opacity:.38}}
.ap-steam{animation:apSteam 1s ease-out infinite}.ap-steam.d2{animation-delay:-.5s}@keyframes apSteam{from{transform:translateY(6px) scale(.6);opacity:.95}to{transform:translateY(-14px) scale(1.4);opacity:0}}
.ap-beat{animation:apBeat .6s ease-in-out infinite}@keyframes apBeat{0%,100%{transform:scale(.85)}50%{transform:scale(1.2)}}
.ap-drop{animation:apDrop 1.1s ease-in infinite}@keyframes apDrop{0%{transform:translateY(0);opacity:0}15%{opacity:1}100%{transform:translateY(26px);opacity:0}}
.ap-flow{animation:apFlow .5s linear infinite;transform-origin:top}@keyframes apFlow{0%,100%{transform:scaleY(.85) scaleX(1)}50%{transform:scaleY(1.05) scaleX(1.25)}}
.ap-rise{animation:apRise 1.6s ease-out infinite}@keyframes apRise{from{transform:translateY(8px) scale(.6);opacity:0}30%{opacity:1}to{transform:translateY(-18px) scale(1.15);opacity:0}}
.ap-hop{animation:apHop .7s ease-in-out infinite}@keyframes apHop{0%,100%{transform:translateY(0) rotate(-8deg)}50%{transform:translateY(-6px) rotate(8deg)}}
.ast .ap-orbit{transform-box:view-box;transform-origin:60px 18px;animation:apOrbit 1.4s linear infinite}@keyframes apOrbit{to{transform:rotate(360deg)}}
.ap-fall{animation:apFall 1.5s linear infinite}@keyframes apFall{from{transform:translateY(-10px) rotate(0)}to{transform:translateY(130px) rotate(540deg)}}
.ap-clap{animation:apClap .28s ease-in-out infinite}@keyframes apClap{0%,100%{transform:scale(1)}50%{transform:scale(.8,1.1)}}
.ap-wave{transform-origin:20% 90%!important;animation:apWave .5s ease-in-out infinite alternate}@keyframes apWave{from{transform:rotate(-20deg)}to{transform:rotate(20deg)}}
.ap-flexl{animation:apFlex .5s ease-in-out infinite alternate}.ap-flexr{animation:apFlex .5s ease-in-out infinite alternate-reverse}@keyframes apFlex{from{transform:scale(.85) rotate(-8deg)}to{transform:scale(1.15) rotate(8deg)}}
.ap-slap{animation:apSlap 1.4s ease-in-out infinite}@keyframes apSlap{0%,100%{transform:translateY(10px) scale(.9);opacity:.2}35%,80%{transform:translateY(-6px) scale(1);opacity:1}}
.ap-flick{animation:apFlick .35s ease-in-out infinite alternate}@keyframes apFlick{from{transform:scale(.9,1) translateY(1px)}to{transform:scale(1.1,1.2) translateY(-3px)}}
.ap-nodf{animation:apBeat 1s ease-in-out infinite}
.ap-talk{animation:apTalk .25s ease-in-out infinite alternate}@keyframes apTalk{from{transform:scaleY(.7)}to{transform:scaleY(1.1)}}
.ap-wag{animation:apTalk .3s ease-in-out infinite alternate}
.ap-look{animation:apLook 1.6s ease-in-out infinite}@keyframes apLook{0%,100%{transform:translate(0,0)}50%{transform:translate(3px,-1px)}}
.ap-jit{animation:apJit .12s linear infinite}@keyframes apJit{50%{transform:translate(.6px,-.6px)}}
.ap-shine{animation:apLean 2s ease-in-out infinite}
.ast .d2{animation-delay:-.4s}.ast .d3{animation-delay:-.8s}.ast .d0{animation-delay:-.1s}.ast .d1{animation-delay:-.4s}.ast .d4{animation-delay:-1.1s}
'''
if '/*FXCSS*/' not in s:
    j = s.find('</style>')
    s = s[:j] + css + s[j:]

# English labels for the new home buttons and settings rows
k = 'const I18N={'
add = '"ضحك": "Laugh", "معصّب": "Furious", "زعلان": "Upset", "يصيح": "Crying", "مصدوم": "Shocked", "مغرم": "In love", "كشخة": "Cool", "نعسان": "Sleepy", "يفكّر": "Thinking", "دايخ": "Dizzy", "متوتّر": "Nervous", "محتفل": "Party", "اسكت": "Shh", "يا ساتر": "Facepalm", "قوي": "Strong", "يا رب": "Praying", "كفو": "Bravo", "غني": "Rich", "مع السلامة": "Bye", "شمتان": "Gloating", "ولعانة": "On fire", "خايف": "Scared", "اشترِ التعبير مرة وحدة واستخدمه في كل مباراة من زر 😄": "Buy a sticker once and use it in every match from the 😄 button", "🛒 تعبيرات أكثر في المتجر": "🛒 More stickers in the shop", "ملصقات": "Stickers", "تعبيرات متحركة 🎭": "Animated stickers 🎭", "✓ عندك": "✓ Owned", "تحدي المجلس اليومي": "Daily Majlis Challenge", "🗺️ رحلة الخليج": "🗺️ Gulf Journey", ' + '"تعبيرات 🎭": "Stickers 🎭", "تعبيرات متحركة 🎭": "Animated stickers 🎭", "تحدي": "Daily", "اليوم": "Challenge", "رحلة": "Gulf", "الخليج": "Journey", "دوري": "Friends", "الربع": "League", "تلقائي 🧠": "Auto 🧠", "أبو شنب يعلّمك (نصائح) 🎓": "Coach tips 🎓", "🍅 ارمِ على لاعب 🌹": "🍅 Throw at a player 🌹", '
if add not in s:
    i = s.index(k) + len(k)
    s = s[:i] + add + s[i:]
open(p, 'w', encoding='utf-8').write(s)
print('ok', len(s))
