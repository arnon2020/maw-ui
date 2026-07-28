(function () {
  var STORAGE_KEY = "maw-static-mode";
  var params = new URLSearchParams(location.search);
  var query = params.get("static");
  var stored = null;
  try { stored = localStorage.getItem(STORAGE_KEY); } catch {}
  var enabled = query === "1" ? true : query === "0" ? false : stored === null ? true : stored !== "0";

  function apply() {
    document.documentElement.classList.toggle("static-mode", enabled);
    document.documentElement.dataset.staticMode = enabled ? "on" : "off";
    window.dispatchEvent(new CustomEvent("maw:static-mode", { detail: enabled }));
  }

  window.mawStaticMode = {
    get: function () { return enabled; },
    set: function (next) {
      enabled = Boolean(next);
      try { localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0"); } catch {}
      apply();
    },
  };

  var style = document.createElement("style");
  style.textContent = [
    "html.static-mode *,html.static-mode *::before,html.static-mode *::after{",
    "animation:none!important;transition:none!important;scroll-behavior:auto!important;",
    "}",
    ".maw-static-toggle{position:fixed;right:10px;bottom:10px;z-index:2147483647;",
    "padding:5px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.18);",
    "background:rgba(2,2,8,.82);color:rgba(255,255,255,.72);font:10px ui-monospace,monospace;",
    "cursor:pointer;backdrop-filter:blur(8px)}",
  ].join("");
  document.head.appendChild(style);
  apply();

  function mountToggle() {
    if (document.querySelector(".maw-static-toggle")) return;
    var button = document.createElement("button");
    button.type = "button";
    button.className = "maw-static-toggle";
    button.title = "Toggle motion while preserving all views and controls";
    function render() {
      button.textContent = enabled ? "■ Static ON" : "▶ Motion ON";
      button.setAttribute("aria-pressed", String(enabled));
    }
    button.addEventListener("click", function () {
      window.mawStaticMode.set(!enabled);
      render();
    });
    render();
    document.body.appendChild(button);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountToggle);
  else mountToggle();
})();
