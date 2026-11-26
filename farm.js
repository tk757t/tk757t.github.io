// Onglet « Farm réputation » : un menu déroulant par réputation, commissions d'artisan et tournée quotidienne.
// Les cases cochées restent dans ce navigateur (rien n'est envoyé à la base).
(function () {
  "use strict";
  const WH = "https://www.wowhead.com/forever/fr/item=";
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
      <label class="fw-have" title="J'ai cette commission"><input type="checkbox" data-have="${w.w}" ${have ? "checked" : ""}><span>J'ai</span></label>
      <span class="fw-main"><b>${link(w.i, (w.q > 1 ? w.q + " × " : "") + w.n)}</b>
        <small>${esc(w.p)} · ${link(w.w, "commission")}${withNpc ? " · " + where : ""}</small></span>
      <span class="fw-rep">+${w.r}</span>
      <label class="fw-done" title="Rendue aujourd'hui"><input type="checkbox" data-done="${w.w}" ${done ? "checked" : ""}><span>Rendue</span></label>
    </li>`;
  }

  function routeView(R) {
    const tabs = R.routes.map(c => ({ id: c.id, name: c.name })).concat({ id: "none", name: "Lieu inconnu" });
    let h = `<div class="fseg">${tabs.map(t => `<button type="button" data-cont="${t.id}" class="${S.cont === t.id ? "on" : ""}">${esc(t.name)}</button>`).join("")}</div>`;
    const show = w => !S.mine || S.have[w.w];
    h += `<label class="fmine"><input type="checkbox" data-mine ${S.mine ? "checked" : ""}> N'afficher que les commissions que j'ai (tournée du jour)</label>`;

    if (S.cont === "none") {
      const list = R.writs.filter(w => !w.npc && show(w));
      return h + `<div class="chk warn">Le PNJ de remise de ces commissions n'est pas encore connu. La quête l'indique sur ta carte quand tu as l'objet dans tes sacs.</div>
        <ul class="fwlist">${list.map(w => writLine(w)).join("") || `<li class="fempty">Aucune commission cochée ici.</li>`}</ul>`;
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
        return `<div class="fnpc"><div class="fnpc-h"><span class="fstep">${step}</span><b>${esc(n.name)}</b><span class="fxy">${n.x.toFixed(1).replace(".", ",")} ; ${n.y.toFixed(1).replace(".", ",")}</span></div>
          <ul class="fwlist">${list.map(w => writLine(w)).join("")}</ul></div>`;
      }).join("")}</div>`;
    });
    if (!body) return h + `<div class="chk warn">Aucune commission cochée sur ce continent. Décoche le filtre pour voir toute la tournée, puis coche « J'ai » sur les commissions que tu possèdes.</div>`;
    return h + `<p class="fsum">${step} arrêt${step > 1 ? "s" : ""} · ${total.toLocaleString("fr-FR")} réputation à rendre${S.mine ? "" : " (si tu avais toutes les commissions)"}</p>` + body;
  }

  function listView(R) {
    const where = {};
    R.routes.forEach(c => c.zones.forEach(z => z.npcs.forEach(n => { where[n.id] = `${esc(n.name)} (${esc(z.name)}, ${esc(c.name)})`; })));
    const profs = [...new Set(R.writs.map(w => w.p))];
    return profs.map(p => {
      const list = R.writs.filter(w => w.p === p);
      const id = R.id + ":" + p;
      return `<details class="maj" data-open="${esc(id)}" ${S.open[id] ? "open" : ""}><summary><b>${esc(p)}</b><span class="maj-tag">${list.length}</span></summary>
        <div class="maj-body"><ul class="fwlist">${list.map(w => writLine(w, true, where[w.npc] || "PNJ inconnu")).join("")}</ul></div></details>`;
    }).join("");
  }

  function render() {
    if (!box) return;
    const data = window.TIER_FARM || [];
    box.innerHTML = `<div class="panel"><h2>Farm réputation <small>choisis une réputation</small></h2>
      ${data.map(R => `<details class="maj frep" data-open="${R.id}" ${S.open[R.id] ? "open" : ""}>
        <summary><b>${esc(R.name)}</b><span class="maj-tag">${esc(R.faction)}</span></summary>
        <div class="maj-body">
          <div class="chk info">Les <b>commissions d'artisan</b> s'échangent à l'hôtel des ventes. Rends chacune avec l'objet demandé au PNJ indiqué : une fois par jour et par commission. Seules les commissions dont l'objet a été vu à l'hôtel des ventes sont listées (${R.writs.length}).</div>
          <div class="fseg"><button type="button" data-view="route" class="${S.view === "route" ? "on" : ""}">Tournée par continent</button><button type="button" data-view="list" class="${S.view === "list" ? "on" : ""}">Toutes, par métier</button></div>
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
