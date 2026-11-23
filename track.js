/* Statistiques de fréquentation anonymes : pas de cookie, pas d'IP, pas de donnée personnelle. */
(function () {
  "use strict";
  var C = window.TIER_CONFIG; if (!C) return;
  var store = { get: function (k) { try { return localStorage.getItem(k); } catch (_) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (_) {} } };
  if (store.get("tt-notrack") === "1" || navigator.doNotTrack === "1") return;
  var sid = store.get("tt-sid");
  if (!sid) { sid = Math.random().toString(36).slice(2, 12) + Date.now().toString(36); store.set("tt-sid", sid); }
  var ref = "";
  try { var q = new URLSearchParams(location.search).get("ref"); var h = q || (document.referrer ? new URL(document.referrer).hostname : ""); ref = h.replace(/^www\./, ""); if (ref === location.hostname) ref = ""; } catch (_) {}
  var w = window.innerWidth, device = w < 700 ? "mobile" : w < 1100 ? "tablette" : "bureau";
  var base = { p_sid: sid, p_path: location.pathname, p_device: device, p_lang: (navigator.language || "").slice(0, 12), p_scr: screen.width + "x" + screen.height };
  var nativeFetch = window.fetch.bind(window);
  function send(type, label, withRef) {
    var b = Object.assign({}, base, { p_type: type, p_label: label || null, p_ref: withRef ? ref : null });
    try { nativeFetch(C.url + "/rest/v1/rpc/tier_track", { method: "POST", keepalive: true, headers: { apikey: C.key, Authorization: "Bearer " + C.key, "Content-Type": "application/json" }, body: JSON.stringify(b) }).catch(function () {}); } catch (_) {}
  }
  send("view", null, true);
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("#tabs button"); if (b && b.dataset.v) send("tab", b.dataset.v);
  });
  var names = { tier_save: "sauvegarde", tier_delete: "suppression_profil", tier_load: "chargement_profil" };
  window.fetch = function (u) {
    try { var m = /rpc\/(tier_\w+)/.exec(String(u)); if (m && names[m[1]] && !/tier_track/.test(m[1])) send("action", names[m[1]]); } catch (_) {}
    return nativeFetch.apply(window, arguments);
  };
  window.addEventListener("error", function (e) { send("error", String(e.message || "erreur").slice(0, 60)); });
})();
