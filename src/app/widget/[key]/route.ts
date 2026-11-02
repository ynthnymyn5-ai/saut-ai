import { engineDb } from "@/lib/so/context";
import { loadWidget } from "@/lib/widget";
import { frameAncestors, hostAllowed } from "@/lib/widget-core";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * The chat window shown inside the business's website (iframe). Plain HTML + a small script —
 * no framework bundle, so it loads fast on phones. Only the configured domain may frame it.
 */
export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const url = new URL(req.url);
  const lang = url.searchParams.get("lang") === "en" ? "en" : "ar";
  let db;
  try { db = engineDb(); } catch { return new Response("Not available", { status: 503 }); }
  const w = await loadWidget(db, key);
  if (!w) return new Response("Widget not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });

  // First real load inside the business's own site → mark the integration verified/connected.
  const referer = req.headers.get("referer");
  if (req.headers.get("sec-fetch-dest") === "iframe" && hostAllowed(referer, w.domain) && (w.status !== "connected" || !w.verifiedAt)) {
    const { data: row } = await db.from("integrations").select("config").eq("organization_id", w.orgId).eq("provider", "web_widget").single();
    await db.from("integrations").update({ status: "connected", connected_at: new Date().toISOString(), last_error: null, config: { ...(row?.config as object), verified_at: new Date().toISOString() } })
      .eq("organization_id", w.orgId).eq("provider", "web_widget");
  }

  const ar = lang === "ar";
  const t = {
    greeting: ar ? w.greetingAr : w.greetingEn,
    placeholder: ar ? "اكتب رسالتك…" : "Type your message…",
    send: ar ? "إرسال" : "Send",
    close: ar ? "إغلاق" : "Close",
    ai: ar ? "مساعد ذكي — قد يخطئ أحياناً. يمكنك طلب التحدث مع موظف." : "AI assistant — it can make mistakes. You can ask for a person.",
    error: ar ? "تعذّر الإرسال. حاول مرة أخرى." : "Couldn't send. Please try again.",
    waiting: ar ? "تم استلام رسالتك، وسيرد عليك أحد أعضاء الفريق هنا." : "Got your message — a team member will reply here.",
    typing: ar ? "يكتب…" : "Typing…",
    rateQ: ar ? "هل كانت المحادثة مفيدة؟" : "Was this chat helpful?",
    rateThanks: ar ? "شكراً لتقييمك 🙏" : "Thanks for your feedback 🙏",
    rateWhy: ar ? "وش اللي ما عجبك؟ (اختياري)" : "What went wrong? (optional)",
    rateSend: ar ? "إرسال" : "Send",
  };
  const html = `<!doctype html><html lang="${lang}" dir="${ar ? "rtl" : "ltr"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(w.title)}</title>
<style>
:root{--c:${w.color};--bg:#0f0f1c;--panel:#16162a;--line:rgba(255,255,255,.09);--text:#f2f2f7;--muted:#a1a1b5}
*{box-sizing:border-box}html,body{height:100%;margin:0}
body{font:15px/1.5 system-ui,-apple-system,"Segoe UI","IBM Plex Sans Arabic",Tahoma,sans-serif;background:var(--bg);color:var(--text);display:flex;flex-direction:column}
header{display:flex;align-items:center;gap:10px;padding:14px 16px;background:var(--c);color:#fff}
header h1{font-size:16px;margin:0;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
header button{background:rgba(255,255,255,.18);border:0;color:#fff;border-radius:10px;width:34px;height:34px;font-size:18px;cursor:pointer}
.dot{width:9px;height:9px;border-radius:50%;background:#34d399;box-shadow:0 0 0 3px rgba(52,211,153,.25)}
#log{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:8px}
.m{max-width:85%;padding:9px 13px;border-radius:16px;white-space:pre-wrap;word-wrap:break-word}
.me{align-self:flex-end;background:var(--c);color:#fff;border-end-end-radius:4px}
.them{align-self:flex-start;background:var(--panel);border:1px solid var(--line);border-end-start-radius:4px}
.sys{align-self:center;color:var(--muted);font-size:12px;text-align:center}
.who{display:block;font-size:11px;color:var(--muted);margin-bottom:2px}
form{display:flex;gap:8px;padding:12px;border-top:1px solid var(--line);background:var(--bg)}
textarea{flex:1;resize:none;border:1px solid var(--line);background:var(--panel);color:var(--text);border-radius:12px;padding:10px 12px;font:inherit;max-height:120px}
textarea:focus{outline:2px solid var(--c);outline-offset:0}
form button{border:0;border-radius:12px;padding:0 16px;background:var(--c);color:#fff;font:inherit;font-weight:600;cursor:pointer}
form button:disabled{opacity:.5;cursor:default}
footer{padding:0 12px 10px;color:var(--muted);font-size:11px;text-align:center}
#rate{display:none;align-items:center;justify-content:center;gap:8px;padding:6px 12px;font-size:12px;color:var(--muted);border-top:1px solid var(--line)}
#rate button{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:4px 10px;font-size:15px;cursor:pointer}
#rate input{flex:1;min-width:0;border:1px solid var(--line);background:var(--panel);color:var(--text);border-radius:10px;padding:6px 8px;font:inherit;font-size:12px}
footer a{color:var(--muted)}
</style></head><body>
<header><span class="dot" aria-hidden="true"></span><h1>${esc(w.title)}</h1><button type="button" id="x" aria-label="${t.close}">×</button></header>
<div id="log" role="log" aria-live="polite"></div>
<div id="rate" role="group" aria-label="${t.rateQ}"></div>
<form id="f"><textarea id="t" rows="1" maxlength="2000" placeholder="${t.placeholder}" aria-label="${t.placeholder}" dir="auto"></textarea><button id="b" type="submit">${t.send}</button></form>
<footer>${t.ai} · <a href="/privacy" target="_blank" rel="noopener">Privacy</a> · Powered by SAUT AI</footer>
<script>
(function(){
var KEY=${JSON.stringify(key)},LANG=${JSON.stringify(lang)},T=${JSON.stringify(t)},API="/api/widget/"+encodeURIComponent(KEY);
var log=document.getElementById("log"),f=document.getElementById("f"),ta=document.getElementById("t"),b=document.getElementById("b");
var mem={};function get(k){try{return localStorage.getItem(k)}catch(e){return mem[k]||null}}function set(k,v){try{localStorage.setItem(k,v)}catch(e){mem[k]=v}}
var sk="saut_w_"+KEY,sid=get(sk);
if(!sid||!/^[A-Za-z0-9_-]{16,64}$/.test(sid)){var a=new Uint8Array(18);crypto.getRandomValues(a);sid=Array.from(a,function(x){return("0"+x.toString(16)).slice(-2)}).join("");set(sk,sid)}
var seen={},last=null,typing=null;
function add(cls,text,who,id){if(id){if(seen[id])return;seen[id]=1}var d=document.createElement("div");d.className="m "+cls;if(who){var s=document.createElement("span");s.className="who";s.textContent=who;d.appendChild(s)}d.appendChild(document.createTextNode(text));log.appendChild(d);log.scrollTop=log.scrollHeight;return d}
function sys(text){var d=document.createElement("div");d.className="sys";d.textContent=text;log.appendChild(d);log.scrollTop=log.scrollHeight}
function render(list){(list||[]).forEach(function(m){if(m.role==="customer")add("me",m.content,null,m.id);else if(m.role==="ai"){add("them",m.content,null,m.id);gotAnswer()}else if(m.role==="human"){add("them",m.content,LANG==="ar"?"فريق العمل":"Team",m.id);gotAnswer()}last=m.created_at})}
function gotAnswer(){if(!answered++)rateUi()}
function poll(){var q=API+"?session="+sid+(last?"&after="+encodeURIComponent(last):"");fetch(q,{cache:"no-store"}).then(function(r){return r.ok?r.json():null}).then(function(j){if(j)render(j.messages)}).catch(function(){})}
var rate=document.getElementById("rate"),rk="saut_r_"+KEY+"_"+sid;
function rateUi(){if(get(rk)){rate.style.display="flex";rate.textContent=T.rateThanks;return}
 rate.innerHTML="";var q=document.createElement("span");q.textContent=T.rateQ;rate.appendChild(q);
 [["👍",1],["👎",-1]].forEach(function(o){var b=document.createElement("button");b.type="button";b.textContent=o[0];b.setAttribute("aria-label",o[0]);b.onclick=function(){sendRate(o[1])};rate.appendChild(b)});rate.style.display="flex"}
function sendRate(v,comment){fetch(API+"/rate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({session:sid,rating:v,comment:comment||undefined})}).then(function(r){if(!r.ok)return;
 if(v===-1&&comment===undefined){rate.innerHTML="";var i=document.createElement("input");i.maxLength=500;i.placeholder=T.rateWhy;var b=document.createElement("button");b.type="button";b.textContent=T.rateSend;b.style.fontSize="12px";b.onclick=function(){sendRate(-1,i.value.trim());};rate.appendChild(i);rate.appendChild(b);i.focus();return}
 set(rk,"1");rateUi()}).catch(function(){})}
var answered=0;
add("them",T.greeting);poll();setInterval(function(){if(document.visibilityState==="visible")poll()},5000);
ta.addEventListener("keydown",function(e){if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();f.requestSubmit()}});
f.addEventListener("submit",function(e){e.preventDefault();var text=ta.value.trim();if(!text||b.disabled)return;b.disabled=true;ta.value="";
 var mine=add("me",text);typing=add("them",T.typing);
 fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({session:sid,text:text,lang:LANG})})
 .then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j}})})
 .then(function(x){typing&&typing.remove();typing=null;if(!x.ok){sys((x.j&&x.j.error&&x.j.error.code==="rate_limited")?T.error:T.error);ta.value=text;mine.remove();return}
   if(x.j.customerMessageId)seen[x.j.customerMessageId]=1;if(x.j.reply){add("them",x.j.reply,null,x.j.replyId);gotAnswer()}else if(x.j.queued){sys(T.waiting)}if(x.j.at)last=x.j.at})
 .catch(function(){typing&&typing.remove();typing=null;sys(T.error);ta.value=text;mine.remove()})
 .finally(function(){b.disabled=false;ta.focus()})});
document.getElementById("x").addEventListener("click",function(){parent.postMessage({type:"saut:close"},"*")});
})();
</script></body></html>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": `${frameAncestors(w.domain)} 'self'; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'`,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
  });
}
