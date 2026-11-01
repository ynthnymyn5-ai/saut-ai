/*! SAUT AI website chat widget — https://saut-ai-lons.vercel.app
 * <script src="https://YOUR-SAUT-APP/widget.js" data-key="wk_..." async></script>
 * Optional: data-lang="ar|en", data-position="left|right"
 */
(function () {
  "use strict";
  var me = document.currentScript || document.querySelector('script[src*="/widget.js"][data-key]');
  if (!me || window.__sautWidget) return;
  window.__sautWidget = true;
  var key = me.getAttribute("data-key") || "";
  if (!/^wk_[A-Za-z0-9_-]{20,40}$/.test(key)) { console.warn("SAUT AI widget: missing or invalid data-key"); return; }
  var base = new URL(me.src).origin;
  var lang = me.getAttribute("data-lang") || ((document.documentElement.lang || navigator.language || "ar").slice(0, 2) === "en" ? "en" : "ar");
  var side = me.getAttribute("data-position") === "left" ? "left" : (lang === "ar" ? "left" : "right");
  var color = /^#[0-9a-fA-F]{6}$/.test(me.getAttribute("data-color") || "") ? me.getAttribute("data-color") : "#8B5CF6";

  var btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute("aria-label", lang === "ar" ? "افتح المحادثة" : "Open chat");
  btn.style.cssText = "position:fixed;bottom:20px;" + side + ":20px;width:60px;height:60px;border-radius:50%;border:0;cursor:pointer;z-index:2147483646;box-shadow:0 8px 30px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;background:" + color + ";";
  btn.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

  var frame = null, open = false;
  function size() {
    if (!frame) return;
    var small = window.innerWidth < 480;
    frame.style.cssText = "position:fixed;z-index:2147483647;border:0;background:transparent;color-scheme:normal;box-shadow:0 12px 48px rgba(0,0,0,.4);" +
      (small ? "inset:0;width:100%;height:100%;border-radius:0;" : "bottom:92px;" + side + ":20px;width:380px;height:600px;max-height:calc(100vh - 112px);border-radius:18px;") +
      "display:" + (open ? "block" : "none") + ";";
  }
  function toggle(force) {
    open = typeof force === "boolean" ? force : !open;
    if (open && !frame) {
      frame = document.createElement("iframe");
      frame.title = "SAUT AI chat";
      frame.src = base + "/widget/" + encodeURIComponent(key) + "?lang=" + lang;
      frame.allow = "clipboard-write";
      document.body.appendChild(frame);
    }
    size();
    btn.setAttribute("aria-expanded", String(open));
  }
  btn.addEventListener("click", function () { toggle(); });
  window.addEventListener("resize", size);
  window.addEventListener("message", function (e) {
    if (e.origin !== base || !e.data || e.data.type !== "saut:close") return;
    toggle(false);
  });
  function mount() { document.body.appendChild(btn); }
  if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);
})();
