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
  const fresh = () => ({ open: {}, view: "route", cont: "kal", have: {}, done: {}, day: "", mine: false, sort: "route", last: {} });
  const today = () => new Date().toLocaleDateString("fr-FR");

  function load() {
    S = Object.assign(fresh(), read(key) || {});
    if (S.day !== today()) { S.day = today(); S.done = {}; S.last = {}; } // une commission par jour et par type
  }
  const save = () => write(key, S);

  // dernier prix vu à l'hôtel des ventes (farm-prices.js)
  const PRICES = window.TIER_PRICES || {};
  const money = c => [[Math.floor(c / 10000), L("po", "g")], [Math.floor(c / 100) % 100, L("pa", "s")], [c % 100, L("pc", "c")]]
    .filter(x => x[0]).map(x => x[0] + " " + x[1]).join(" ");
  const day = iso => iso.split("-").reverse().join("/");
  const lastDay = () => Object.values(PRICES).reduce((m, p) => (p[1] > m ? p[1] : m), "");
  function price(w) {
    const p = PRICES[w.i];
    if (!p) return "";
    const date = p[1] ? L("Vu le ", "Seen on ") + (EN ? p[1] : day(p[1])) : "";
    const each = w.q > 1 ? L(" · pour ", " · for ") + w.q : "";
    return ` <span class="fw-price" title="${date}${each}">(${money(p[0] * w.q)})</span>`;
  }

  function writLine(w, withNpc, where) {
    const have = !!S.have[w.w], done = !!S.done[w.w];
    return `<li class="fw${done ? " done" : ""}">
      <label class="fw-have" title="${L("J'ai la commission et son objet", "I have the writ and its item")}"><input type="checkbox" data-have="${w.w}" ${have ? "checked" : ""}><span>${L("J'ai", "Have")}</span></label>
      <span class="fw-main"><b>${link(w.i, (w.q > 1 ? w.q + " × " : "") + w.n)}</b>${price(w)}
        <small>${esc(w.p)} · ${link(w.w, L("commission", "writ"))}${withNpc ? " · " + where : ""}</small></span>
      <span class="fw-rep">+${w.r}</span>
      <label class="fw-done" title="${L("Rendue aujourd'hui", "Handed in today")}"><input type="checkbox" data-done="${w.w}" ${done ? "checked" : ""}><span>${L("Rendue", "Done")}</span></label>
    </li>`;
  }

  const sortBar = () => `<div class="fseg">${[["route", L("Ordre de la tournée", "Route order")], ["asc", L("Prix : moins cher d'abord", "Price: cheapest first")], ["desc", L("Prix : plus cher d'abord", "Price: most expensive first")]]
    .map(([id, t]) => `<button type="button" data-sort="${id}" class="${S.sort === id ? "on" : ""}">${t}</button>`).join("")}</div>`;
  const cost = w => (PRICES[w.i] ? PRICES[w.i][0] * w.q : null);

  // les commissions du continent choisi, triées par prix
  function byPrice(R, cont, writs) {
    const where = {};
    R.routes.forEach(c => c.zones.forEach(z => z.npcs.forEach(n => { where[n.id] = `${esc(n.name)} (${esc(z.name)})`; })));
    const list = writs.slice().sort((a, b) => {
      const x = cost(a), y = cost(b);
      if (x === null || y === null) return (x === null) - (y === null); // sans prix : à la fin
      return S.sort === "desc" ? y - x : x - y;
    });
    if (!list.length) return `<div class="chk warn">${L("Aucune commission cochée ici.", "No ticked writ here.")}</div>`;
    const todo = list.filter(w => !S.done[w.w]);
    const total = todo.reduce((t, w) => t + (cost(w) || 0), 0), rep = todo.reduce((t, w) => t + w.r, 0);
    return `<p class="fsum">${list.length} ${L("commission", "writ")}${list.length > 1 ? "s" : ""} · ${L("reste à rendre : ", "left to hand in: ")}${rep.toLocaleString(L("fr-FR", "en-US"))} ${L("réputation pour", "reputation for")} ${money(total) || "0"}</p>
      <ul class="fwlist">${list.map(w => writLine(w, true, where[w.npc] || L("PNJ inconnu", "unknown NPC"))).join("")}</ul>`;
  }

  /* ---- tournée de rendu la plus courte (farm-travel.js : temps de trajet, monture et vols Horde) ---- */
  const FLIGHT_FR = { Everlook: "Long-guet", Moonglade: "Reflet-de-Lune", "Splintertree Post": "Poste de Bois-brisé", "Sun Rock Retreat": "Retraite de Roche-Soleil", "Marshal's Refuge": "Refuge des Marshal",
    "Freewind Post": "Poste de Librevent", "Brackenwall Village": "Mur-de-Fougères", "Cenarion Hold": "Fort cénarien", "Bloodvenom Post": "Poste de la Vénéneuse", "Shadowprey Village": "Proie-de-l'Ombre",
    Crossroads: "La Croisée", Ratchet: "Cabestan", "Thunder Bluff": "Les Pitons du Tonnerre", Undercity: "Fossoyeuse", "The Sepulcher": "Le Sépulcre", "Tarren Mill": "Moulin-de-Tarren", Hammerfall: "Trépas-d'Orgrim",
    "Revantusk Village": "Village des Vengebroches", "Light's Hope Chapel": "Chapelle de l'Espoir de Lumière", "Thorium Point": "Halte du Thorium", "Flame Crest": "Corniche des Flammes", Stonard: "Pierrêche", "Booty Bay": "Baie-du-Butin" };
  const flightName = n => (EN ? n : FLIGHT_FR[n] || n);
  const minutes = sec => Math.max(1, Math.round(sec / 60));
  const cache = {};

  // chemin ouvert le plus court : départ `from`, passe par tous les points de `stops`
  function shortest(T, from, stops) {
    const key = from + ":" + stops.join(",") + ":" + T.length;
    if (cache[key]) return cache[key];
    const cost = p => p.reduce((s, x, i) => s + T[i ? p[i - 1] : from][x], 0);
    let best = null, bestCost = Infinity;
    const firsts = stops.slice().sort((a, b) => T[from][a] - T[from][b]).slice(0, 8);
    for (const first of firsts) {
      let path = [first];
      const left = new Set(stops.filter(x => x !== first));
      while (left.size) {
        const cur = path[path.length - 1];
        let next = null;
        left.forEach(x => { if (next === null || T[cur][x] < T[cur][next]) next = x; });
        path.push(next); left.delete(next);
      }
      // améliorations : déplacer un bloc de 1 à 3 arrêts, ou inverser un tronçon
      let c = cost(path), better = true;
      while (better) {
        better = false;
        const attempt = p => { const v = cost(p); if (v < c) { path = p; c = v; better = true; } };
        for (let len = 1; len <= 3; len++) for (let i = 0; i + len <= path.length; i++) for (let j = 0; j <= path.length - len; j++) {
          if (i === j) continue;
          const p = path.slice(), block = p.splice(i, len);
          p.splice(j, 0, ...block);
          attempt(p);
        }
        for (let i = 0; i < path.length - 1; i++) for (let j = i + 1; j < path.length; j++)
          attempt(path.slice(0, i).concat(path.slice(i, j + 1).reverse(), path.slice(j + 1)));
      }
      if (c < bestCost) { best = path; bestCost = c; }
    }
    return (cache[key] = { path: best || [], total: best ? bestCost : 0 });
  }

  // les commissions cochées « J'ai » et pas encore rendues, dans l'ordre qui demande le moins de trajet
  function turnIn(R, C) {
    const V = (window.TIER_TRAVEL || {})[C.id];
    if (!V) return { html: "", used: new Set() };
    const info = {};
    C.zones.forEach(z => z.npcs.forEach(n => { info[n.id] = { n, zone: z.name }; }));
    const ready = R.writs.filter(w => info[w.npc] && S.have[w.w] && !S.done[w.w]);
    const used = new Set(ready.map(w => w.w));
    if (!ready.length) return { html: "", used };
    const lost = R.writs.filter(w => !w.npc && S.have[w.w] && !S.done[w.w]).length;
    const last = S.last && S.last[C.id];
    const resume = last && V.npcs.includes(last) && R.writs.some(w => w.npc === last && S.done[w.w]) ? V.npcs.indexOf(last) + 1 : 0;
    const city = C.id === "ek" ? L("Fossoyeuse", "Undercity") : "Orgrimmar";
    const stops = [...new Set(ready.map(w => V.npcs.indexOf(w.npc) + 1))].filter(i => i > 0).sort((a, b) => a - b);
    const { path, total } = shortest(V.t, resume, stops);
    const rep = ready.reduce((s, w) => s + w.r, 0);
    let prev = resume;
    const body = path.map((i, k) => {
      const id = V.npcs[i - 1], { n, zone } = info[id];
      const flights = (V.via[prev + "-" + i] || []).map(f => flightName(V.names[f[0]]) + " → " + flightName(V.names[f[1]]));
      const leg = (flights.length ? "✈ " + L("vol ", "fly ") + flights.join(L(", puis vol ", ", then fly ")) : "🐎 " + L("à cheval", "ride")) + " · ≈ " + minutes(V.t[prev][i]) + " min";
      prev = i;
      return `<div class="fnpc"><div class="fnpc-h"><span class="fstep">${k + 1}</span><b>${esc(n.name)}</b><span class="fxy">${esc(zone)} · ${EN ? n.x.toFixed(1) + ", " + n.y.toFixed(1) : n.x.toFixed(1).replace(".", ",") + " ; " + n.y.toFixed(1).replace(".", ",")}</span></div>
        <div class="fleg">${esc(leg)}</div><ul class="fwlist">${ready.filter(w => w.npc === id).map(w => writLine(w)).join("")}</ul></div>`;
    }).join("");
    const from = resume ? L("depuis ton dernier rendu (", "from your last hand-in (") + info[last].n.name + ")" : L(C.id === "ek" ? "départ de " : "départ d'", "starting from ") + city;
    return {
      used,
      html: `<div class="froute"><h4>🧭 ${L("Ta tournée de rendu", "Your hand-in route")}</h4>
        <p class="fsum">${ready.length} ${L("commission", "writ")}${ready.length > 1 ? "s" : ""} · ${path.length} ${L("arrêt", "stop")}${path.length > 1 ? "s" : ""} · ${rep.toLocaleString(L("fr-FR", "en-US"))} ${L("réputation", "reputation")} · ≈ ${minutes(total)} min ${L("de trajet", "of travel")} · ${esc(from)}</p>
        ${lost ? `<div class="chk warn">${lost} ${L("commission(s) cochée(s) ont un PNJ inconnu : voir « Lieu inconnu ».", "ticked writ(s) have an unknown NPC: see “Unknown location”.")}</div>` : ""}
        ${body}
        <p class="fnote">${L("Temps estimés : monture à 60 %, tous les points de vol Horde connus. Coche « Rendue » : la suite est recalculée depuis ce PNJ.", "Estimated times: 60% mount, every Horde flight point known. Tick “Done”: the rest is recalculated from that NPC.")}</p></div>`,
    };
  }

  function routeView(R) {
    const tabs = R.routes.map(c => ({ id: c.id, name: c.name })).concat({ id: "none", name: L("Lieu inconnu", "Unknown location") });
    let h = `<div class="fseg">${tabs.map(t => `<button type="button" data-cont="${t.id}" class="${S.cont === t.id ? "on" : ""}">${esc(t.name)}</button>`).join("")}</div>`;
    const show = w => !S.mine || S.have[w.w];
    h += `<label class="fmine"><input type="checkbox" data-mine ${S.mine ? "checked" : ""}> ${L("N'afficher que les commissions que j'ai (tournée du jour)", "Only show the writs I have (today's route)")}</label>`;

    h += sortBar();
    if (S.cont === "none") {
      const list = R.writs.filter(w => !w.npc && show(w));
      if (S.sort !== "route") return h + byPrice(R, "none", list);
      return h + `<div class="chk warn">${L("Le PNJ de remise de ces commissions n'est pas encore connu. La quête l'indique sur ta carte quand tu as l'objet dans tes sacs.", "The turn-in NPC for these writs is not known yet. The quest shows it on your map once you have the item in your bags.")}</div>
        <ul class="fwlist">${list.map(w => writLine(w)).join("") || `<li class="fempty">${L("Aucune commission cochée ici.", "No ticked writ here.")}</li>`}</ul>`;
    }

    const C = R.routes.find(c => c.id === S.cont) || R.routes[0];
    if (S.sort !== "route") {
      const ids = new Set(C.zones.flatMap(z => z.npcs.map(n => n.id)));
      const tour = turnIn(R, C);
      const rest = R.writs.filter(w => ids.has(w.npc) && show(w) && !tour.used.has(w.w));
      const hint = tour.used.size ? "" : `<div class="chk info">${L("Coche <b>J'ai</b> sur les commissions complètes (la commission et son objet) : la tournée de rendu la plus courte, vols compris, s'affiche ici.", "Tick <b>Have</b> on your complete writs (the writ and its item): the shortest hand-in route, flights included, appears here.")}</div>`;
      const title = tour.used.size && rest.length ? `<div class="froute-rest">${L("Les autres commissions, par prix", "Other writs, by price")}</div>` : "";
      return h + hint + tour.html + title + (tour.used.size && !rest.length ? "" : byPrice(R, C.id, rest));
    }
    // commissions complètes cochées : leur tournée au plus court d'abord, le reste zone par zone
    const tour = turnIn(R, C);
    if (tour.html) {
      if (S.mine) return h + tour.html;
      h += tour.html + `<div class="froute-rest">${L("Les autres commissions, zone par zone", "Other writs, zone by zone")}</div>`;
    }
    h += `<div class="chk info">${esc(C.start)}</div>`;
    let step = 0, total = 0, body = "";
    C.zones.forEach(z => {
      const npcs = z.npcs.map(n => ({ n, list: R.writs.filter(w => w.npc === n.id && show(w) && !tour.used.has(w.w)) })).filter(x => x.list.length);
      if (!npcs.length) return;
      body += `<div class="fzone"><h4>${esc(z.name)} <small>${esc(z.how)}</small></h4>${npcs.map(({ n, list }) => {
        step++;
        list.forEach(w => { if (!S.done[w.w]) total += w.r; });
        return `<div class="fnpc"><div class="fnpc-h"><span class="fstep">${step}</span><b>${esc(n.name)}</b><span class="fxy">${EN ? n.x.toFixed(1) + ", " + n.y.toFixed(1) : n.x.toFixed(1).replace(".", ",") + " ; " + n.y.toFixed(1).replace(".", ",")}</span></div>
          <ul class="fwlist">${list.map(w => writLine(w)).join("")}</ul></div>`;
      }).join("")}</div>`;
    });
    if (!body && tour.html) return h;
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
          <div class="chk info">${L("Les <b>commissions d'artisan</b> s'échangent à l'hôtel des ventes. Rends chacune avec l'objet demandé au PNJ indiqué : une fois par jour et par commission. Seules les commissions dont l'objet a été vu à l'hôtel des ventes sont listées", "<b>Craftsman's Writs</b> can be traded at the auction house. Hand each one in with the requested item to the listed NPC: once per day per writ. Only writs whose item has been seen at the auction house are listed")} (${R.writs.length}).${lastDay() ? L(" Entre parenthèses : dernier prix vu à l'hôtel des ventes (royaume PvE Horde, relevé du " + day(lastDay()) + "). Les prix changent.", " In brackets: last price seen at the auction house (PvE Horde realm, scanned " + lastDay() + "). Prices change.") : ""}</div>
          <div class="fseg"><button type="button" data-view="route" class="${S.view === "route" ? "on" : ""}">${L("Tournée par continent", "Route by continent")}</button><button type="button" data-view="list" class="${S.view === "list" ? "on" : ""}">${L("Toutes, par métier", "All, by profession")}</button></div>
          ${S.view === "list" ? listView(R) : routeView(R)}
        </div></details>`).join("")}</div>`;
  }

  function init(el, storageKey) {
    key = storageKey || "tier-farm";
    load();
    if (S.view === "price") S.view = "route";
    if (box !== el) {
      box = el;
      box.addEventListener("click", e => {
        const b = e.target.closest("button"); if (!b) return;
        if (b.dataset.view) S.view = b.dataset.view; else if (b.dataset.cont) S.cont = b.dataset.cont; else if (b.dataset.sort) S.sort = b.dataset.sort; else return;
        save(); render();
      });
      box.addEventListener("change", e => {
        const d = e.target.dataset;
        if (d.have) S.have[d.have] = e.target.checked;
        else if (d.done) {
          S.done[d.done] = e.target.checked;
          // on retient le dernier PNJ visité : la tournée repart de là
          (window.TIER_FARM || []).forEach(R => {
            const w = R.writs.find(x => String(x.w) === d.done);
            const c = w && R.routes.find(r => r.zones.some(z => z.npcs.some(n => n.id === w.npc)));
            if (c && e.target.checked) { S.last = S.last || {}; S.last[c.id] = w.npc; }
          });
        }
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
