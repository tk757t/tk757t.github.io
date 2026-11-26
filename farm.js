// Onglet « Farm réputation » : un menu déroulant par réputation, commissions d'artisan et tournée quotidienne.
// Les cases cochées restent dans ce navigateur (rien n'est envoyé à la base).
(function () {
  "use strict";
  const L = window.L, EN = window.TIER_LANG === "en";
  const WH = "https://www.wowhead.com/forever/" + (EN ? "" : "fr/") + "item=";
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const link = (id, t) => `<a href="${WH}${id}" target="_blank" rel="noopener">${esc(t)}</a>`;
  const read = k => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (_) { return null; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };

  let box = null, key = "tier-farm", S = null;
  const fresh = () => ({ open: {}, view: "route", cont: "kal", have: {}, done: {}, day: "", mine: false });
  const today = () => new Date().toLocaleDateString("fr-FR");

  function load() {
    S = Object.assign(fresh(), read(key) || {});
    if (S.day !== today()) { S.day = today(); S.done = {}; } // une commission par jour et par type
  }
  const save = () => write(key, S);

  function writLine(w, withNpc, where) {
    const have = !!S.have[w.w], done = !!S.done[w.w];
    return `<li class="fw${done ? " done" : ""}">
      <label class="fw-have" title="${L("J'ai cette commission", "I have this writ")}"><input type="checkbox" data-have="${w.w}" ${have ? "checked" : ""}><span>${L("J'ai", "Have")}</span></label>
      <span class="fw-main"><b>${link(w.i, (w.q > 1 ? w.q + " × " : "") + w.n)}</b>
        <small>${esc(w.p)} · ${link(w.w, L("commission", "writ"))}${withNpc ? " · " + where : ""}</small></span>
      <span class="fw-rep">+${w.r}</span>
      <label class="fw-done" title="${L("Rendue aujourd'hui", "Handed in today")}"><input type="checkbox" data-done="${w.w}" ${done ? "checked" : ""}><span>${L("Rendue", "Done")}</span></label>
    </li>`;
  }

  function routeView(R) {
    const tabs = R.routes.map(c => ({ id: c.id, name: c.name })).concat({ id: "none", name: L("Lieu inconnu", "Unknown location") });
    let h = `<div class="fseg">${tabs.map(t => `<button type="button" data-cont="${t.id}" class="${S.cont === t.id ? "on" : ""}">${esc(t.name)}</button>`).join("")}</div>`;
    const show = w => !S.mine || S.have[w.w];
    h += `<label class="fmine"><input type="checkbox" data-mine ${S.mine ? "checked" : ""}> ${L("N'afficher que les commissions que j'ai (tournée du jour)", "Only show the writs I have (today's route)")}</label>`;

    if (S.cont === "none") {
      const list = R.writs.filter(w => !w.npc && show(w));
      return h + `<div class="chk warn">${L("Le PNJ de remise de ces commissions n'est pas encore connu. La quête l'indique sur ta carte quand tu as l'objet dans tes sacs.", "The turn-in NPC for these writs is not known yet. The quest shows it on your map once you have the item in your bags.")}</div>
        <ul class="fwlist">${list.map(w => writLine(w)).join("") || `<li class="fempty">${L("Aucune commission cochée ici.", "No ticked writ here.")}</li>`}</ul>`;
    }

    const C = R.routes.find(c => c.id === S.cont) || R.routes[0];
    h += `<div class="chk info">${esc(C.start)}</div>`;
    let step = 0, total = 0, body = "";
    C.zones.forEach(z => {
      const npcs = z.npcs.map(n => ({ n, list: R.writs.filter(w => w.npc === n.id && show(w)) })).filter(x => x.list.length);
      if (!npcs.length) return;
      body += `<div class="fzone"><h4>${esc(z.name)} <small>${esc(z.how)}</small></h4>${npcs.map(({ n, list }) => {
        step++;
        list.forEach(w => { if (!S.done[w.w]) total += w.r; });
        return `<div class="fnpc"><div class="fnpc-h"><span class="fstep">${step}</span><b>${esc(n.name)}</b><span class="fxy">${EN ? n.x.toFixed(1) + ", " + n.y.toFixed(1) : n.x.toFixed(1).replace(".", ",") + " ; " + n.y.toFixed(1).replace(".", ",")}</span></div>
          <ul class="fwlist">${list.map(w => writLine(w)).join("")}</ul></div>`;
      }).join("")}</div>`;
    });
    if (!body) return h + `<div class="chk warn">${L("Aucune commission cochée sur ce continent. Décoche le filtre pour voir toute la tournée, puis coche « J'ai » sur les commissions que tu possèdes.", "No ticked writ on this continent. Untick the filter to see the whole route, then tick “Have” on the writs you own.")}</div>`;
    return h + `<p class="fsum">${step} ${L("arrêt", "stop")}${step > 1 ? "s" : ""} · ${total.toLocaleString(L("fr-FR", "en-US"))} ${L("réputation à rendre", "reputation to hand in")}${S.mine ? "" : L(" (si tu avais toutes les commissions)", " (if you had every writ)")}</p>` + body;
  }

  function listView(R) {
    const where = {};
    R.routes.forEach(c => c.zones.forEach(z => z.npcs.forEach(n => { where[n.id] = `${esc(n.name)} (${esc(z.name)}, ${esc(c.name)})`; })));
    const profs = [...new Set(R.writs.map(w => w.p))];
    return profs.map(p => {
      const list = R.writs.filter(w => w.p === p);
      const id = R.id + ":" + p;
      return `<details class="maj" data-open="${esc(id)}" ${S.open[id] ? "open" : ""}><summary><b>${esc(p)}</b><span class="maj-tag">${list.length}</span></summary>
        <div class="maj-body"><ul class="fwlist">${list.map(w => writLine(w, true, where[w.npc] || L("PNJ inconnu", "unknown NPC"))).join("")}</ul></div></details>`;
    }).join("");
  }

  function render() {
    if (!box) return;
    const data = window.TIER_FARM || [];
    box.innerHTML = `<div class="panel"><h2>${L("Farm réputation", "Reputation farm")} <small>${L("choisis une réputation", "choose a reputation")}</small></h2>
      ${data.map(R => `<details class="maj frep" data-open="${R.id}" ${S.open[R.id] ? "open" : ""}>
        <summary><b>${esc(R.name)}</b><span class="maj-tag">${esc(R.faction)}</span></summary>
        <div class="maj-body">
          <div class="chk info">${L("Les <b>commissions d'artisan</b> s'échangent à l'hôtel des ventes. Rends chacune avec l'objet demandé au PNJ indiqué : une fois par jour et par commission. Seules les commissions dont l'objet a été vu à l'hôtel des ventes sont listées", "<b>Craftsman's Writs</b> can be traded at the auction house. Hand each one in with the requested item to the listed NPC: once per day per writ. Only writs whose item has been seen at the auction house are listed")} (${R.writs.length}).</div>
          <div class="fseg"><button type="button" data-view="route" class="${S.view === "route" ? "on" : ""}">${L("Tournée par continent", "Route by continent")}</button><button type="button" data-view="list" class="${S.view === "list" ? "on" : ""}">${L("Toutes, par métier", "All, by profession")}</button></div>
          ${S.view === "list" ? listView(R) : routeView(R)}
        </div></details>`).join("")}</div>`;
  }

  function init(el, storageKey) {
    key = storageKey || "tier-farm";
    load();
    if (box !== el) {
      box = el;
      box.addEventListener("click", e => {
        const b = e.target.closest("button"); if (!b) return;
        if (b.dataset.view) S.view = b.dataset.view; else if (b.dataset.cont) S.cont = b.dataset.cont; else return;
        save(); render();
      });
      box.addEventListener("change", e => {
        const d = e.target.dataset;
        if (d.have) S.have[d.have] = e.target.checked;
        else if (d.done) S.done[d.done] = e.target.checked;
        else if (d.mine !== undefined) S.mine = e.target.checked;
        else return;
        save(); render();
      });
      // « toggle » ne remonte pas : écoute en phase de capture
      box.addEventListener("toggle", e => { const id = e.target.dataset && e.target.dataset.open; if (id) { S.open[id] = e.target.open; save(); } }, true);
    }
    render();
  }

  window.TierFarm = { init };
})();
