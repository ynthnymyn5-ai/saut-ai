/* ===== نسخة تجريبية للعرض على المشتري ===== */
(function(){
  var UNTIL=Date.parse('2026-11-15T00:00:00+03:00');
  var css=document.createElement('style');
  css.textContent='#demoWm{position:fixed;inset:0;pointer-events:none;z-index:99998;overflow:hidden}'+
    '#demoWm i{position:absolute;left:-50%;width:200%;text-align:center;transform:rotate(-28deg);font:900 34px Cairo,sans-serif;color:rgba(246,220,147,.07);white-space:nowrap;letter-spacing:6px}'+
    '#demoTag{position:fixed;left:50%;top:calc(2px + env(safe-area-inset-top,0px));white-space:nowrap;transform:translateX(-50%);z-index:99999;pointer-events:none;'+
    'background:rgba(20,8,10,.78);border:1px solid rgba(227,183,91,.6);color:#f6dc93;font:800 10px Cairo,sans-serif;padding:0 10px;border-radius:99px;opacity:.9}'+
    '#demoEnd{position:fixed;inset:0;z-index:100000;background:#160a0c;color:#f3e7cc;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;padding:24px;font:700 18px Cairo,sans-serif}'+
    '#demoEnd b{font-size:28px;color:#f6dc93}';
  document.head.appendChild(css);
  var wm=document.createElement('div');wm.id='demoWm';var h='';
  for(var k=0;k<14;k++)h+='<i style="top:'+(k*9-10)+'%">نسخة تجريبية • مور • نسخة تجريبية • مور • نسخة تجريبية</i>';
  wm.innerHTML=h;document.body.appendChild(wm);
  var tag=document.createElement('div');tag.id='demoTag';tag.textContent='نسخة تجريبية • تنتهي ١٥ نوفمبر';document.body.appendChild(tag);
  function ended(){var e=document.getElementById('demoEnd');if(e)return;e=document.createElement('div');e.id='demoEnd';
    e.innerHTML='<b>انتهت النسخة التجريبية</b><div>شكراً لتجربة لعبة «مور».<br>للنسخة الكاملة تواصل مع المالك.</div>';document.body.appendChild(e);
    try{speechSynthesis.cancel()}catch(x){}}
  if(Date.now()>UNTIL){ended();return}
  setInterval(function(){if(Date.now()>UNTIL)ended()},60000);
  /* الميزات الأونلاين والمشتريات مقفلة في التجربة */
  function locked(){try{closeModal(true)}catch(x){}try{toast('🔒 متاحة في النسخة الكاملة')}catch(x){}}
  ['openOnline','openPublicChat','openFriends','openClub','openLeaders','openInvite','quickMatch','openPublicRooms',
   'createRoom','joinRoom','joinPub','redeemRef','refCollect','shareInvite','sendGift','frAdd','frInvite','clubJoin','clubCreate',
   'buyIAP','restoreIAP','shareApp','openRoomChat','voiceBtn','shareRoom'].forEach(function(n){if(typeof window[n]==='function')window[n]=locked});
  /* لا اتصال بالسيرفر من النسخة التجريبية */
  var of=window.fetch;window.fetch=function(u,o){if(String(u).indexOf('supabase.co')>=0)return Promise.resolve(new Response('[]',{status:200,headers:{'Content-Type':'application/json'}}));return of.apply(this,arguments)};
  var OW=window.WebSocket;window.WebSocket=function(u){if(String(u).indexOf('supabase.co')>=0)throw new Error('demo');return new OW(u)};
  try{IAP.on=false}catch(x){}
  /* المتجر: العملات تكفي للتجربة */
  try{if(!P.demoSeed){P.demoSeed=1;P.coins=Math.max(P.coins||0,30000);save();renderHome()}}catch(x){}
})();
