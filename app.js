/* TierTrack — suivi T0 / T0.5 : accueil (nom + classe + faction), suivi, classement. Sauvegarde Supabase + navigateur. */
(function () {
"use strict";
const CFG = window.TIER_CONFIG, SETS = window.TIER_SETS, CHAIN = window.TIER_CHAIN;
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* ============ CONSTANTES ============ */
const CLASSES = {
  druid:   { fr: "Druide",    color: "#ff7d0a", armor: "Cuir" },
  hunter:  { fr: "Chasseur",  color: "#abd473", armor: "Mailles" },
  mage:    { fr: "Mage",      color: "#69ccf0", armor: "Tissu" },
  paladin: { fr: "Paladin",   color: "#f58cba", armor: "Plaques" },
  priest:  { fr: "Prêtre",    color: "#ffffff", armor: "Tissu" },
  rogue:   { fr: "Voleur",    color: "#fff569", armor: "Cuir" },
  shaman:  { fr: "Chaman",    color: "#2f8cff", armor: "Mailles" },
  warlock: { fr: "Démoniste", color: "#9482c9", armor: "Tissu" },
  warrior: { fr: "Guerrier",  color: "#c79c6e", armor: "Plaques" },
};
const FACTIONS = { horde: "Horde", alliance: "Alliance" };
const SLOT_FR = { head: "Tête", shoulder: "Épaules", chest: "Torse", wrist: "Poignets", hands: "Mains", waist: "Taille", legs: "Jambes", feet: "Pieds" };
const ORDER_T0 = ["head", "shoulder", "chest", "wrist", "hands", "waist", "legs", "feet"];
const ORDER_T05 = ["wrist", "hands", "waist", "feet", "legs", "shoulder", "head", "chest"];
const T0SRC = {
  head: "Scholomance — Sombre maître Gandling", shoulder: "Pic Blackrock — Gizrul le Asservisseur",
  chest: "Pic Blackrock — Général Drakkisath", wrist: "Scholomance / Stratholme — butin des mobs",
  hands: "Pic Blackrock (mobs) / Stratholme — Le Impardonné", waist: "Butin aléatoire — BRS, Scholomance",
  legs: "Stratholme — Baron Vivebise (Rivendare)", feet: "Pic Blackrock — Mère Fumetoile",
};
const T05STEP = { wrist: "q1", hands: "q8", waist: "q8", feet: "q17", legs: "q17", shoulder: "q17", head: "q29", chest: "q29" };
const T05QNAME = { q1: "Une proposition sérieuse", q8: "Une juste compensation", q17: "Les adieux d'Anthion", q29: "Garder le meilleur pour la fin" };
const MAX_POINTS = 8 + 8 + 29;
const BIS = window.TIER_BIS;
const BIS_ORDER = ["head", "neck", "shoulder", "back", "chest", "wrist", "hands", "waist", "legs", "feet", "finger1", "finger2", "trinket1", "trinket2", "weapon", "offhand", "ranged"];
const BIS_SLOT_FR = { head: "Tête", neck: "Cou", shoulder: "Épaules", back: "Dos", chest: "Torse", wrist: "Poignets", hands: "Mains", waist: "Taille", legs: "Jambes", feet: "Pieds", finger1: "Anneau 1", finger2: "Anneau 2", trinket1: "Bijou 1", trinket2: "Bijou 2", weapon: "Arme", offhand: "Main gauche / bouclier", ranged: "Distance" };
const QCOL = ["#9d9d9d", "#ffffff", "#1eff00", "#4a9dff", "#c27cff", "#ff8000"];
const ROLE_FR = { dps: "DPS", tank: "Tank", heal: "Soins" };
const portrait = (cls, px) => `<img class="cls-ico" src="https://wow.zamimg.com/images/wow/icons/large/classicon_${cls}.jpg" width="${px}" height="${px}" alt="" onerror="this.style.display='none'">`;
const specList = cls => (BIS && BIS.specs[cls]) || {};
const specFr = (cls, spec) => (spec && specList(cls)[spec] ? specList(cls)[spec].fr : spec || "");
const bisTotal = (cls, spec) => (specList(cls)[spec] ? Object.keys(specList(cls)[spec].slots).length : 0);

// Composants de classe de la chaîne (source : HardcoreHelper, à confirmer en jeu)
const COMP = {
  relic:   { loc: "Berceau-de-l'Hiver · géants Frostmaul", how: "géants Frostmaul, Berceau-de-l'Hiver" },
  remains: { loc: "Hive'Regal · silithides (SE de Silithus)", how: "silithides autour de Hive'Regal, SE de Silithus" },
  sword:   { loc: "Maleterres de l'est · Prétorien écarlate", how: "Prétorien écarlate, Maleterres de l'est (vers 76, 73)" },
  ashes:   { loc: "Île de la Purgation · fantômes", how: "fantômes de l'île de la Purgation (côte de Hillsbrad)" },
};
const SPIRIT = {
  isalien: { n: "Isalien", d: "Dire Maul Est", alt: "Hache-Tripes Est" },
  mor:     { n: "Mor Grayhoof", d: "Pic Blackrock inférieur" },
  kormok:  { n: "Kormok", d: "Scholomance" },
  jarien:  { n: "Jarien et Sothos", d: "Stratholme" },
};
const PLAN = {
  druid:   [["relic", "isalien"], ["remains", "mor"]],
  hunter:  [["sword", "jarien"], ["ashes", "kormok"]],
  mage:    [["remains", "mor"], ["sword", "jarien"]],
  paladin: [["ashes", "kormok"], ["remains", "mor"]],
  priest:  [["ashes", "kormok"], ["sword", "jarien"]],
  rogue:   [["sword", "jarien"], ["relic", "isalien"]],
  shaman:  [["ashes", "kormok"], ["remains", "mor"]],
  warlock: [["relic", "isalien"], ["ashes", "kormok"]],
  warrior: [["remains", "mor"], ["relic", "isalien"]],
};
const SLOTWORD = { Brassards: "Poignets", Ceinture: "Taille", Gants: "Mains", Bottes: "Pieds", Kilt: "Jambes", "Epaulières": "Épaules", Capuche: "Tête", Veste: "Torse" };
// quêtes dont l'identifiant dépend de la classe ou de la faction : lien de recherche au lieu d'un identifiant
const NO_ID = ["q1", "q2", "q9", "q17", "q21", "q24", "q28"];

/* ============ STOCKAGE ============ */
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
  del(k) { try { localStorage.removeItem(k); } catch (_) {} },
};
const normName = n => String(n || "").trim().replace(/\s+/g, " ");
const nameKey = n => normName(n).toLowerCase();
const validName = n => { n = normName(n); return n.length >= 2 && n.length <= 24 && !/[<>&"{}\\]/.test(n); };
function newToken() {
  const a = new Uint8Array(16);
  (window.crypto || window.msCrypto).getRandomValues(a);
  return Array.from(a, b => b.toString(16).padStart(2, "0")).join("");
}

/* ============ SUPABASE (RPC) ============ */
async function rpc(fn, args) {
  const r = await fetch(CFG.url + "/rest/v1/rpc/" + fn, {
    method: "POST",
    headers: { apikey: CFG.key, Authorization: "Bearer " + CFG.key, "Content-Type": "application/json" },
    body: JSON.stringify(args || {}),
  });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}

/* ============ ÉTAT ============ */
let profile = null;   // { name, cls, faction, spec }
function getChars() { try { const a = JSON.parse(ls.get("tier-chars") || "[]"); return Array.isArray(a) ? a : []; } catch (_) { return []; } }
function saveChars(a) { ls.set("tier-chars", JSON.stringify(a)); }
function upsertChar(c) {
  const a = getChars(), k = nameKey(c.name), i = a.findIndex(x => nameKey(x.name) === k);
  const entry = { name: c.name, cls: c.cls, faction: c.faction, spec: c.spec || null };
  if (i >= 0) a[i] = Object.assign(a[i], entry); else a.push(entry);
  saveChars(a);
}
let token = null;
let ctx = null;       // données adaptées à la classe / faction
let st = emptyState();
function emptyState() { return { t0: {}, t05: {}, q: {}, m: {}, c: {}, bis: {}, r: {} }; }
const stateKey = () => "tier-state:" + nameKey(profile.name);

/* ============ DONNÉES ADAPTÉES ============ */
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }

function adaptChain(p) {
  const Q = JSON.parse(JSON.stringify(CHAIN.Q)), M = JSON.parse(JSON.stringify(CHAIN.M));
  const comps = SETS.components, plan = PLAN[p.cls];
  const alliance = p.faction === "alliance";
  const bloodFr = comps.blood.fr;
  const fix = s => {
    if (typeof s !== "string") return s;
    s = s.replace(/(Brassards|Ceinture|Gants|Bottes|Kilt|Epaulières|Capuche|Veste) T0/g, (m, w) => SLOTWORD[w] + " T0");
    s = s.replace(/^Brassards \(étape 1\)/, "Poignets T0 (étape 1)");
    if (alliance) {
      s = s.replace("Début — Mokvar, Orgrimmar (près du Chef de guerre)", "Début — Deliana, Forgefer (Hauts-Sièges)")
           .replace(/Mokvar · Orgrimmar/g, "Deliana · Forgefer (Hauts-Sièges)")
           .replace("Retour à Mokvar", "Retour à Deliana")
           .replace(/Echantillons de venin de Silithus/g, bloodFr.replace("Echantillon", "Échantillons"))
           .replace(/Echantillon de venin de Silithus/g, bloodFr);
    }
    return s;
  };
  for (const ph of Q) {
    ph[0] = fix(ph[0]);
    for (const s of ph[1]) {
      s.n = fix(s.n); s.loc = fix(s.loc); s.req = fix(s.req);
      if (NO_ID.includes(s.id)) delete s.id2;
    }
  }
  const step = id => Q.flatMap(ph => ph[1]).find(s => s.id === id);
  const [c1, sp1] = plan[0], [c2, sp2] = plan[1];
  const spLoc = k => SPIRIT[k].d + " · esprit" + (k === "jarien" ? "s " : " ") + SPIRIT[k].n;
  step("q20").loc = COMP[c1].loc; step("q20").req = comps[c1].fr;
  step("q21").loc = spLoc(sp1);
  step("q23").loc = COMP[c2].loc; step("q23").req = comps[c2].fr;
  step("q24").loc = spLoc(sp2);
  step("q19").loc = "Profondeurs de Blackrock · Pic Blackrock · duc des Cendres (Silithus)";
  step("q19").req = "Incendicite d'Incendius (BRD) + Braise du prophète ardent (BRS) + Cendre d'Asharell + Brasero béni (Aube d'argent, Honoré)";
  step("q21").req = "Brasero de signal → invoquer l'esprit et le tuer";
  step("q24").req = "Brasero de signal → invoquer l'esprit et le tuer";
  for (const g of M) {
    if (g[0] === "Silithus & ectoplasmes" && alliance) g[1][0][0] = bloodFr;
    for (const row of g[1]) if (row[0] === "3e objet seigneur du feu") row[0] = "Cendre d'Asharell";
    for (const row of g[1]) {
      row[0] = fix(row[0]);
      if (row[3] === "q20") row[0] = comps[c1].fr;
      if (row[3] === "q23") row[0] = comps[c2].fr;
    }
  }
  return { Q, M, parts: [[c1, sp1], [c2, sp2]] };
}

function buildCtx(p) {
  const set = SETS.classes[p.cls];
  const T0 = ORDER_T0.map(s => { const it = set.t0.items[s]; return { id: s, s: SLOT_FR[s], n: it.fr, fr: it.en, i: it.ilvl, src: T0SRC[s], wh: it.id }; });
  const T05 = ORDER_T05.map(s => {
    const it = set.t05.items[s], step = T05STEP[s];
    return { id: s, s: SLOT_FR[s], n: it.fr, fr: it.en, i: it.ilvl, q: it.q >= 4 ? "epic" : "rare", step, wh: it.id,
      src: step === "q1" ? "Quête « " + T05QNAME[step] + " » (étape 1)" : "Quête « " + T05QNAME[step] + " » (rend " + SLOT_FR[s].toLowerCase() + " T0)" };
  });
  const chain = adaptChain(p);
  const WH0 = {}, WH5 = {};
  T0.forEach(x => WH0[x.id] = x.wh); T05.forEach(x => WH5[x.id] = x.wh);
  const range = (list, k) => { const v = list.map(x => x[k]); return Math.min(...v) + "–" + Math.max(...v); };
  return { set, T0, T05, WH0, WH5, Q: chain.Q, M: chain.M, parts: chain.parts,
    nQ: chain.Q.reduce((a, ph) => a + ph[1].length, 0),
    ilvl0: range(Object.values(set.t0.items), "ilvl"), req0: range(Object.values(set.t0.items), "req"),
    ilvl5: range(Object.values(set.t05.items), "ilvl") };
}

/* ============ LIENS WOWHEAD ============ */
const WHB = "https://www.wowhead.com/forever/fr/";
const aItem = (id, t) => `<a href="${WHB}item=${id}" target="_blank" rel="noopener">${t}</a>`;
const aQuest = (id, t) => `<a href="${WHB}quest=${id}" target="_blank" rel="noopener">${t}</a>`;
const aSearch = (q, t) => `<a class="srch" href="${WHB}search?q=${encodeURIComponent(q)}" target="_blank" rel="noopener" title="Rechercher sur Wowhead">${t}</a>`;
const ITEMS = [
  [/[ÉE]chantillons? de venin de Silithus/, 22381], [/[ÉE]chantillons? de sang de Berceau-de-l'Hiver/, 21928],
  [/Convertisseur d'arcanite délicat/, 16006], [/Essence éternelle supérieure/, 16203],
  [/Huile de pierre-écaille/, 13423], [/Cendre volcanique/, 22338], [/Ectoplasme brûlé/, 21937], [/Ectoplasme glacé/, 21936], [/Ectoplasme stable/, 21935],
  [/Coeur de magma/, 21938], [/Bâtonnet élémentaire de corruption/, 21939], [/Révélateur de fantômes/, 22115], [/Barres? de sombrefer/, 11371],
  [/Cuir enchanté/, 12810], [/Etoffe lunaire/, 14342], [/(Cuirs?|Peaux?) robustes? (traités?|traitées?)/, 15407], [/Perles? de guerre ogre/, 21982],
  [/Essence de spectre railleur/, 22224], [/Runes? (sombres?|ténébreuses?)/, 20520], [/Grands? éclats? brillants?/, 14344], [/Varech de sang/, 22094],
  [/Brassards blackrock/, 22138], [/Flacon de pouvoir suprême/, 13512], [/Relique de Brise-stellaire/, 22227], [/Restes druidiques/, 22226],
  [/Epée brillante de fanatisme/, 22228], [/Cendres d'âme de banni/, 22229],
  [/Incendicite d'Incendius/, 21987], [/Braise du prophète ardent/, 21988], [/Brasero béni/, 22014], [/Brasero d'invocation/, 22057],
  [/Bannière de provocation/, 21986], [/Médaillon d'Ysida/, 22139],
];
/* ============ COMMENT OBTENIR LES OBJETS DE QUÊTE T0.5 ============ */
// Sources : bases Polestar (monstres, taux de butin, positions) ; clé = id de l'objet
const ITEM_HOW = {
  22381: "En Silithus, tue et dépouille les scorpides Cinglepierre (Scorpide, Pinceur, Écorcheur) et les araignées (Glisseuse du sable, Traqueuse des rochers). Environ 30 % de butin.",
  21928: "Au Berceau-de-l'Hiver, tue et dépouille les sabres-de-givre au nord (vers 50, 12) ou les ours Crocs acérés (vers 48, 45). Environ 30 % de butin.",
  22338: "Pas de monstre à tuer : ramasse les tas de Cendre volcanique au sol dans les Steppes ardentes (vers 43, 44 et 78, 38).",
  16006: "Ingénierie (285) : 1 barre d'arcanite + 1 soie d'araignée toilacier. Le schéma se vend chez Xizzer Fizzbolt (Long-guet, Berceau-de-l'Hiver). Sinon hôtel des ventes.",
  16203: "Désenchantement d'objets inhabituels (verts) de niveau d'objet 51 à 56, surtout des armes. Sinon hôtel des ventes.",
  13423: "Alchimie (250) : 1 anguille pierre-écaille + 1 fiole plombée. Sinon hôtel des ventes.",
  21937: "Avec l'alambic ectoplasmique sur toi, tue les Sentinelles torturées (≈15 %) et les Druides torturés (≈13 %) en Silithus, vers 62, 54.",
  21936: "Avec l'alambic ectoplasmique sur toi, tue les Bien-nés souffrants (≈20 %) et les Bien-nées angoissées (≈17 %) au Berceau-de-l'Hiver, vers 52, 45.",
  21935: "Avec l'alambic ectoplasmique sur toi, tue les Hurleuses haineuses, Gardiens aveugles, Serviteurs invisibles (≈8 %) ou Chante-mort (≈6 %) dans les Maleterres de l'est.",
  21938: "Tue le Seigneur-magma Bokk dans les Steppes ardentes, vers 35, 58 (butin garanti).",
  11371: "Minage (230) : 8 minerais de sombrefer par barre, à la Forge noire des Profondeurs de Blackrock (la fonte s'apprend par la quête « Le calice spectral », auprès de Gloom'rel). Sinon hôtel des ventes.",
  12810: "Enchantement (250) : 1 cuir robuste + 1 essence éternelle inférieure. Sinon hôtel des ventes.",
  14342: "Couture (230) : 2 gangrétoffes, à purifier près d'un puits de lune (ceux de Gangrebois conviennent). Le patron se vend chez Qia (Long-guet). Sinon hôtel des ventes.",
  15407: "Travail du cuir (225) : 1 peau robuste + 1 sel de Fonderoc raffiné. Sinon hôtel des ventes.",
  21982: "Perles ramassées sur les ogres : à Hache-tripes Nord (Roi Gordok, Kreeg, les gardes… ≈50 % sur ces boss) ou au Pic Blackrock inférieur (Généralissime Omokk, ogres Pierre-du-pic ≈40 %).",
  22224: "Hache-tripes Ouest : tue les fantômes Eldreth. Meilleur : les Rongés Eldreth (≈20 %), puis Revanchion (≈10 %). Les Spectres, Esprits, Fantômes, Fantasmes et Sorciers Eldreth la lâchent aussi, rarement (≈1 %).",
  20520: "Scholomance : Nécromanciens (≈39 %) et Invocateurs des ténèbres (≈34 %), certains boss (≈11-13 %). Aussi sur des invocateurs des Maleterres de l'est. Sinon hôtel des ventes.",
  14344: "Désenchantement d'objets rares (bleus) de niveau d'objet 51 à 60. Sinon hôtel des ventes.",
  22094: "Île d'Alcaz (Marécage d'Âprefange, vers 75, 17) : ramasse les Paniers de varech de sang, ou tue les nagas Strashaz (≈20 %). Viens à plusieurs.",
  22138: "Tue les orcs du Pic Blackrock. Dans la base, les Grunts du Bouclier balafré (près de l'entrée, dans le mont Rochenoire) sont de loin les meilleurs (≈80 %, les autres orcs ≈5 %).",
  13512: "Alchimie (300) : 30 feuillerêves + 10 sauges-argent des montagnes + 1 lotus noir + 1 fiole de cristal. La recette tombe sur Ras Frostwhisper (Scholomance). Sinon hôtel des ventes.",
  22227: "Tue les Géants et Protecteurs Cognegivre au sud du Berceau-de-l'Hiver (vers 62, 69).",
  22226: "En Silithus, tue les silithides de la Ruche'Regal : Embusquées, Fouisseuses, Crache-feu, Esclavagistes, Seigneurs.",
  22228: "À la Main de Tyr (Maleterres de l'est, vers 76, 73), tue les Prétoriens écarlates.",
  22229: "Île de la Purgation, au sud des Contreforts de Hautebrande (vers 16, 80) : Acolytes, Moines et Clercs condamnés, Paladins et Justiciers maudits, Mages frémissants.",
  21987: "Butin du Seigneur Incendius, dans les Profondeurs de Blackrock.",
  21988: "Butin du Pyrogarde Prophète ardent, au Pic Blackrock supérieur.",
  22014: "Acheté (environ 120 po à Honoré, d'après les données Classic) avec la réputation Honoré auprès de l'Aube d'argent, chez un intendant : Hasana (Le Rempart, vers 83, 68), Lightspark (Maleterres de l'ouest, vers 43, 84) ou Miranda Breechlock (Chapelle de l'Espoir de Lumière, vers 72, 50).",
};
const ASHARELL_HOW = "Butin du duc des Cendres (Silithus), appelé « Cinder of Cynders » en anglais. Il faut l'invoquer à une pierre des vents : porte la tenue de sectateur du crépuscule (capuche, mantelet, robe, butin des sectateurs du Marteau du crépuscule en Silithus) et le Médaillon de statut (quêtes d'Aurel Goldleaf au Fort cénarien : 1 grand éclat brillant + 3 écussons abyssaux). La tenue est consommée à chaque invocation et le duc est un élite : viens en groupe.";
const itemHow = name => {
  if (/Asharell/.test(name)) return ASHARELL_HOW;
  const hit = ITEMS.find(([re, id]) => ITEM_HOW[id] && re.test(name));
  return hit ? ITEM_HOW[hit[1]] : "";
};
// Objets à réunir pour une étape (liste des matériaux), avec leur provenance
const stepHow = id => (ctx.M || []).flatMap(g => g[1]).filter(m => m[3] === id && m[2] !== "po")
  .map(m => [m[0], itemHow(m[0])]).filter(x => x[1]);

const SLOT_BY_LABEL = { Poignets: "wrist", Taille: "waist", Mains: "hands", Pieds: "feet", Jambes: "legs", "Épaules": "shoulder", "Tête": "head", Torse: "chest" };
function linkify(txt) {
  let out = txt;
  ITEMS.forEach(([re, id]) => { out = out.replace(re, m => `\u0001${id}\u0002${m}\u0003`); });
  out = out.replace(/(Poignets|Taille|Mains|Pieds|Jambes|Épaules|Tête|Torse) T0/g, (m, w) => aItem(ctx.WH0[SLOT_BY_LABEL[w]], m));
  return out.replace(/\u0001(\d+)\u0002(.*?)\u0003/g, (_, id, t) => aItem(id, t));
}
const bonusHTML = (list, n) => list.map(b => `<div class="bon ${n >= b[0] ? "act" : ""}"><b>(${b[0]})</b><span>${esc(b[1])}</span></div>`).join("");

/* ============ RENDU ============ */
function renderHeader() {
  const c = CLASSES[profile.cls], [r, g, b] = hexRgb(c.color);
  const root = document.documentElement.style;
  root.setProperty("--accent", c.color);
  root.setProperty("--accent-glow", `rgba(${r},${g},${b},.35)`);
  root.setProperty("--accent-soft", `rgba(${r},${g},${b},.16)`);
  $("heroName").textContent = profile.name;
  $("heroCrest").innerHTML = portrait(profile.cls, 80);
  $("heroSub").innerHTML = `<b>${c.fr}</b>${profile.spec ? " · " + esc(specFr(profile.cls, profile.spec)) : ""} · ${FACTIONS[profile.faction]} · WoW Forever EU`;
  $("heroSets").innerHTML = `Suivi de progression des sets <b style="color:var(--gold)">T0</b> (${esc(ctx.set.t0.name)}) et <b style="color:var(--gold)">T0.5</b> (${esc(ctx.set.t05.name)})`;
  $("tabT0").querySelector(".tl").innerHTML = 'T0<span class="tn">' + esc(ctx.set.t0.name) + "</span>";
  $("tabT05").querySelector(".tl").innerHTML = 'T0.5<span class="tn">' + esc(ctx.set.t05.name) + "</span>";
  $("t0title").textContent = "Set de donjon 1 — " + ctx.set.t0.name;
  $("t05title").textContent = "Set de donjon 2 — " + ctx.set.t05.name;
  $("qtitle").textContent = "Chaîne Dungeon Set 2 — " + FACTIONS[profile.faction];
  document.title = profile.name + " — Suivi T0 / T0.5";
  $("t0info").innerHTML = `<div class="chk info">${c.armor} · rare · niveau d'objet ${ctx.ilvl0} · niveau requis ${ctx.req0}.</div>
    <div class="chk info">Les pièces <b>T0</b> sont le prérequis de la quête T0.5 : elles sont rendues (échangées) contre les pièces <b>${esc(ctx.set.t05.name)}</b>.</div>
    <div class="chk warn">Les données Forever datent de datamining : les bonus de set peuvent être revus par rapport au Classic.</div>`;
  $("t05info").innerHTML = `<div class="chk info">Lié quand ramassé · niveau d'objet ${ctx.ilvl5} · niveau requis 58.</div>
    <div class="chk warn"><b>Quelle pièce T0 rendre ?</b> Un emplacement T0 = un emplacement T0.5. Coche d'abord la pièce T0 correspondante avant la quête qui la consomme (voir l'onglet quêtes).</div>
    <div class="chk warn">Des guides parlent de versions par rôle pour certaines classes ; vérifie en jeu la version proposée avant de valider la quête.</div>`;
  const comps = SETS.components;
  $("compTitle").textContent = "Composants " + c.fr;
  $("compBox").innerHTML = ctx.parts.map(([ck, sk], i) => `<div class="chk info"><b>${i + 1}${i ? "e" : "er"} composant :</b> ${linkify(comps[ck].fr)} — ${COMP[ck].how} → esprit <b>${SPIRIT[sk].n}</b> (${SPIRIT[sk].d}${SPIRIT[sk].alt ? " / " + SPIRIT[sk].alt : ""}).</div>`).join("");
  const dung = ["Stratholme", "Dire Maul", "Profondeurs de Blackrock", "Pic Blackrock (BRS, 10 joueurs en Forever)", "Haut du Pic (Valthalak)"];
  ctx.parts.forEach(([, sk]) => { const d = SPIRIT[sk].d.replace(" Est", "").replace(" inférieur", ""); if (!dung.some(x => x.startsWith(d.split(" ")[0]))) dung.push(d); });
  const kormok = ctx.parts.some(([, sk]) => sk === "kormok");
  $("dungBox").innerHTML = `<div class="chk info">${dung.join(" · ")}.</div>` + (kormok
    ? `<div class="chk info">Scholomance est <b>requise</b> pour ce personnage (esprit Kormok).</div>`
    : `<div class="chk info">Scholomance n'est <b>pas</b> requise pour ce personnage (esprit Kormok non utilisé), mais elle fait tomber des pièces T0.</div>`);
  const mokvar = profile.faction === "horde" ? "Mokvar (Orgrimmar)" : "Deliana (Forgefer)";
  $("checkBox").innerHTML = `<div class="chk warn">Niveau : 58 minimum, 60 conseillé. La chaîne démarre chez ${mokvar}.</div>
    <div class="chk warn">Or total : environ 100 po (20 + 40 + 40 pour le bâtonnet de Vi'el), plus le Brasero béni (environ 120 po à Honoré). Chiffres issus des données Classic.</div>
    <div class="chk info">3e seigneur du feu (Trois rois de flamme) : <b>duc des Cendres</b> en Silithus, qui lâche les « Cendres d'Asharell » (nom du texte de quête).</div>`;
  $("saveInfo").textContent = "Ta progression est enregistrée dans ce navigateur et synchronisée avec le classement des joueurs (seuls le nom, la classe, la faction et la progression sont envoyés).";
}

/* ============ DÉTAIL DES ÉTAPES DE QUÊTE (clic pour dérouler) ============ */
const openSteps = new Set();
const aForeverQuest = (id, t) => `<a href="https://www.wowhead.com/forever/fr/quest=${id}" target="_blank" rel="noopener">${t}</a>`;
// Texte officiel (Wowhead Forever, fr) de la variante qui correspond à la classe et à la faction du personnage
function questInfo(id) {
  const Qd = window.TIER_QUESTS;
  if (!Qd || !profile) return null;
  const f = profile.faction, c = profile.cls;
  if (Qd.generic[id]) return Qd.generic[id];
  if (Qd.faction[id]) return Qd.faction[id][f] || null;
  if (Qd.variant[id]) return (Qd.variant[id][f] || {})[c] || null;
  const parts = ctx && ctx.parts;
  if (!parts) return null;
  if (id === "q20") return Qd.comp[parts[0][0]] || null;
  if (id === "q21") return Qd.spiritL[parts[0][1]] || null;
  if (id === "q23") return Qd.compB[parts[1][0]] || null;
  if (id === "q24") return Qd.spiritR[parts[1][1]] || null;
  return null;
}
// Détails de chaque étape (PNJ, positions, déroulement)
const giver = p => p.faction === "alliance" ? "Deliana, à Forgefer (vers 43, 53)" : "Mokvar, à Orgrimmar (Vallée de la Sagesse, vers 35, 38)";
const MUX = "Mux Manascrambler est à Gadgetzan (Tanaris), vers 52, 27.";
const BODLEY = "Bodley est sur le balcon à l'entrée du Pic Blackrock supérieur, dans le mont Rochenoire. Il n'est visible qu'avec le Révélateur de fantômes.";
const ANTHION = "Anthion Harmon est devant Stratholme (Maleterres de l'est, vers 26, 11). Il n'est visible qu'avec le Révélateur de fantômes.";
const COMP_WHY = { relic: "Bodley l'utilise pour attirer l'esprit d'Isalien.", remains: "Bodley l'utilise pour attirer l'esprit de Mor Grayhoof.", sword: "Bodley l'utilise pour invoquer Jarien et Sothos.", ashes: "Bodley l'utilise pour attirer l'esprit de Kormok." };
const SPIRIT_WHERE = {
  isalien: "Entre dans Hache-tripes Est et utilise le brasero au sanctuaire d'Eldretharr pour invoquer Isalien.",
  mor: "Entre au Pic Blackrock inférieur et utilise le brasero pour invoquer Mor Grayhoof (il est mort près du Maître de guerre Voone, d'après Bodley).",
  kormok: "Entre à Scholomance et utilise le brasero dans la salle de Ras Frostwhisper pour invoquer Kormok.",
  jarien: "Entre à Stratholme, côté écarlate, et utilise le brasero au Bastion écarlate pour invoquer Jarien et Sothos.",
};
const spiritTips = i => [SPIRIT_WHERE[ctx.parts[i][1]], "Le brasero de signal t'est donné par la quête. Tue l'esprit, ramasse le morceau d'amulette, puis rapporte-le avec le brasero à Bodley.", BODLEY, "Viens en groupe : c'est un combat de donjon."];
const STEP_TIPS = {
  q1: p => [giver(p) + ".", "Niveau 58 minimum pour toute la chaîne. Prévois 20 po et tes poignets T0."],
  q2: p => ["Rien à farmer : le conteneur scellé t'est donné par " + giver(p) + ".", MUX],
  q3: () => [MUX, "Prévois 40 po en plus des objets."],
  q4: () => ["Mux te donne l'alambic ectoplasmique ; garde-le sur toi et rapporte-le avec les 36 ectoplasmes.", MUX],
  q5: () => [MUX],
  q6: () => ["Vi'el est un diablotin marchand dans une caverne de la gorge du Sombre murmure, au sud du Berceau-de-l'Hiver (vers 59, 78).", "Achète-lui le Bâtonnet élémentaire de corruption (40 po d'après les données Classic).", MUX],
  q7: p => ["Rien à farmer : Mux te donne le Révélateur de fantômes extradimensionnel.", "Rapporte-le à " + giver(p) + "."],
  q8: p => ["Apporte ta ceinture et tes gants T0 à " + giver(p) + ". Les enchantements posés dessus sont perdus."],
  q9: p => ["Quête donnée par " + giver(p) + ".", ANTHION],
  q10: () => ["Donjon : Stratholme, côté mort-vivant. C'est la « course du baron en 45 minutes » : il faut atteindre le baron Vivebise (Rivendare) avant la fin du minuteur pour libérer Ysida.", "Prépare un groupe solide et connais la route avant de lancer le chrono."],
  q11: () => ["Ysida Harmon te remet son médaillon : rien à farmer.", ANTHION],
  q12: () => ["Les quatre matériaux peuvent s'échanger : un artisan ou l'hôtel des ventes suffit.", ANTHION],
  q13: () => ["Anthion te donne la Bannière de provocation incomplète.", "Falrin Treeshaper est dans la bibliothèque (l'Athenaeum) de Hache-tripes Ouest."],
  q14: () => ["Falrin Treeshaper est dans la bibliothèque de Hache-tripes Ouest."],
  q15: () => ["Falrin Treeshaper est dans la bibliothèque de Hache-tripes Ouest."],
  q16: () => ["Donjon : Profondeurs de Blackrock, au Cercle de la loi (l'arène).", "Pendant que le Juge supérieur Grimstone te condamne, place la bannière au centre. Tue Theldren et ses gladiateurs : ils se battent comme un groupe JcJ.", "Ramasse le morceau supérieur de l'amulette puis retourne voir Anthion.", ANTHION],
  q17: p => ["Apporte tes bottes, jambières et spallières T0 à " + giver(p) + "."],
  q18: p => ["Quête donnée par " + giver(p) + ".", BODLEY],
  q19: () => [BODLEY, "Les trois objets de feu viennent de trois lieux différents (Profondeurs de Blackrock, Pic Blackrock, Silithus) : commence tôt la réputation Aube d'argent pour le brasero."],
  q20: () => [COMP_WHY[ctx.parts[0][0]], BODLEY],
  q21: () => spiritTips(0),
  q22: () => ["Bodley garde ton morceau gauche et demande 20 varechs de sang.", BODLEY],
  q23: () => [COMP_WHY[ctx.parts[1][0]], BODLEY],
  q24: () => spiritTips(1),
  q25: () => [BODLEY],
  q26: () => ["Haut du Pic Blackrock, dans la salle de La Bête : tue d'abord La Bête, puis utilise le Brasero de signal pour invoquer Valthalak.", "Tue-le, utilise l'amulette sur son cadavre, puis rends l'amulette à l'Esprit du seigneur Valthalak. Prévois un groupe complet."],
  q27: () => ["Rapporte le Brasero de signal à Bodley : il te donne en échange le Brasero d'invocation.", BODLEY],
  q28: p => ["Rien à farmer : retourne voir " + giver(p) + "."],
  q29: p => ["Apporte ton casque et ta cuirasse T0 à " + giver(p) + ".", p.faction === "horde" && p.cls === "hunter" ? "Chasseur Horde : cette quête était bloquée ; le correctif Blizzard du 25 novembre 2026 permet de la terminer." : "Dernière étape de la chaîne."],
};
const fixReq = x => x.replace(/^Argent\s*:\s*(\d+)\s*$/, "$1 po").replace(/^(.+?) x (\d+)$/, "$2 × $1");
function stepDetail(s, qi) {
  const cls = CLASSES[profile.cls].fr, fac = FACTIONS[profile.faction];
  let h = '<div class="step-detail">';
  h += `<div class="sdt">📖 Ce qu'il faut faire</div><p>${qi ? esc(qi.d.replace(/<([^<>\/]+)\/([^<>]+)>/g, "$1/$2")) : esc(s.req)}</p>`;
  if (!qi) h += `<div class="sdsmall">Le texte officiel n'est pas disponible pour ${cls} ${fac} : explication simplifiée.</div>`;
  if (qi && qi.r.length) h += `<div class="sdt">🎒 Objectifs et objets à apporter</div><ul>${qi.r.map(x => `<li>${linkify(esc(fixReq(x)))}</li>`).join("")}</ul>`;
  const how = stepHow(s.id);
  if (how.length) h += `<div class="sdt">🔎 Comment obtenir les objets</div><ul>${how.map(([n, t]) => `<li><b>${linkify(n)}</b> : ${esc(t)}</li>`).join("")}</ul>`;
  h += `<div class="sdt">📍 Où ?</div><p>${s.loc}</p>`;
  const reward = ctx.T05.filter(p => p.step === s.id);
  if (reward.length) {
    const give = (s.c || []).map(k => ctx.T0.find(p => p.id === k)).filter(Boolean);
    h += `<div class="sdt">🎁 Échange</div><p>Tu rends : ${give.map(p => aItem(p.wh, esc(p.n))).join(", ")}<br>Tu reçois : ${reward.map(p => aItem(p.wh, esc(p.n))).join(", ")}</p>`;
  }
  const tips = STEP_TIPS[s.id] ? STEP_TIPS[s.id](profile) : [];
  if (tips.length) h += `<div class="sdt">💡 Astuces</div><ul>${tips.map(t => `<li>${esc(t)}</li>`).join("")}</ul>`;
  if (qi) h += `<p class="sdlink"><a href="https://www.wowhead.com/forever/fr/quest=${qi.id}" target="_blank" rel="noopener">Voir la quête sur Wowhead Forever ↗</a></p>`;
  return h + "</div>";
}

function render() {
  const { T0, T05, Q, M } = ctx;
  const c0 = T0.filter(p => st.t0[p.id]).length;
  $("t0list").innerHTML = T0.map(p => `<div class="piece ${st.t0[p.id] ? "done" : ""}" data-k="t0" data-id="${p.id}" style="--q:#4a9dff">
    <div class="box">✓</div><div class="slot">${p.s}</div><div class="pi"><div class="pn">${aItem(p.wh, esc(p.n))}</div><div class="pm">${esc(p.fr)} · <b>${p.src}</b></div></div><div class="il">${p.i}</div></div>`).join("");
  $("t0sum").textContent = c0 + " / 8 pièces"; $("t0bon").innerHTML = bonusHTML(ctx.set.t0.bonuses, c0); $("hT0").textContent = c0 + "/8";

  const c5 = T05.filter(p => st.t05[p.id]).length;
  const allSteps = Q.flatMap(x => x[1]);
  $("t05list").innerHTML = T05.map(p => `<div class="piece ${st.t05[p.id] ? "done" : ""}" data-k="t05" data-id="${p.id}" style="--q:${p.q === "epic" ? "#c27cff" : "#4a9dff"}">
    <div class="box">✓</div><div class="slot">${p.s}</div><div class="pi"><div class="pn">${aItem(p.wh, esc(p.n))}</div><div class="pm">${esc(p.fr)} · <b>${p.src.replace(/« ([^»]+) »/, (m, n) => { const q = allSteps.find(s => s.n === n.trim()); const qi = q && questInfo(q.id); return qi ? "« " + aForeverQuest(qi.id, n) + " »" : m; })}</b></div></div><div class="il">${p.i}</div></div>`).join("");
  $("t05sum").textContent = c5 + " / 8 pièces"; $("t05bon").innerHTML = bonusHTML(ctx.set.t05.bonuses, c5); $("hT05").textContent = c5 + "/8";

  const nQ = ctx.nQ, cq = Object.values(st.q).filter(Boolean).length;
  $("qsum").textContent = cq + " / " + nQ + " étapes"; $("hQ").textContent = Math.round(cq / nQ * 100) + "%";
  $("qlist").innerHTML = `<div class="bar ${cq === nQ ? "ok" : ""}" style="margin-bottom:6px"><i style="width:${cq / nQ * 100}%"></i></div><div class="qhint">Clique sur une étape pour voir le détail · coche la case à gauche quand elle est terminée.</div>` + Q.map(ph => {
    const d = ph[1].filter(s => st.q[s.id]).length;
    return `<div class="phase"><span>${ph[0]}</span><span>${d}/${ph[1].length}</span></div>` + ph[1].map(s => {
      const need = (s.c || []).filter(k => !st.t0[k]);
      const consume = (s.c || []).length ? `<div class="note">⚠ Consomme : ${s.c.map(k => T0.find(p => p.id === k).s).join(", ")}${need.length && !st.q[s.id] ? ` — T0 manquant : ${need.map(k => T0.find(p => p.id === k).s).join(", ")}` : ""}</div>` : "";
      const qi = questInfo(s.id), qid = qi ? qi.id : null, open = openSteps.has(s.id);
      return `<div class="step ${st.q[s.id] ? "done" : ""} ${open ? "open" : ""}" data-step="${s.id}"><div class="box" data-k="q" data-id="${s.id}" title="Cocher / décocher cette étape">✓</div><div class="step-main">
        <div class="sn">${qid ? aForeverQuest(qid, s.n) : aSearch(s.n + " quest", s.n)}<em>${qid ? "#" + qid + " · " : ""}${s.id.replace("q", "étape ")}</em></div>
        <div class="sd"><span class="loc">${s.loc}</span><br><span class="req">${linkify(s.req)}</span></div>${consume}${open ? stepDetail(s, qi) : ""}</div><div class="chev" title="${open ? "Replier" : "Voir le détail"}">${open ? "▴" : "▾"}</div></div>`;
    }).join("");
  }).join("");

  const comps = SETS.components;
  const HINT = {
    "Convertisseur d'arcanite délicat": "Fabriqué par ingénierie (ou Hôtel des ventes)", "Essence éternelle supérieure": "Enchantement (ou Hôtel des ventes)",
    "Huile de pierre-écaille": "Alchimie (ou Hôtel des ventes)", "Cendre volcanique": "Se ramasse dans les Steppes ardentes / Silithus (tas de cendre)",
    "Barre de sombrefer": "Forge (ou Hôtel des ventes)", "Cuir enchanté": "Travail du cuir (ou Hôtel des ventes)", "Etoffe lunaire": "Couture (ou Hôtel des ventes)",
    "Peau robuste traitée": "Travail du cuir (ou Hôtel des ventes)", "Perle de guerre ogre": "Ogres de Dire Maul ou du Pic Blackrock",
    "Essence de spectre railleur": "Butin des spectres à Stratholme / Maleterres", "Rune ténébreuse": "Butin des mobs humanoïdes / Hôtel des ventes",
    "Grand éclat brillant": "Désenchantement d'objets rares", "Varech de sang": "Île d'Alcaz (Marécage d'Âprefange)",
    "Brassards blackrock": "Butin du Pic Blackrock (orcs / ogres)", "Flacon de pouvoir suprême": "Alchimie (ou Hôtel des ventes)",
    "Coeur de magma (Bokk)": "Seigneur du magma Bokk, Steppes ardentes",
    "Echantillon de venin de Silithus": "Butin des mobs de Silithus (scorpions / guêpes)",
  };
  HINT[comps.blood.fr] = "Butin des ours et sabres-de-givre de Berceau-de-l'Hiver";
  ctx.parts.forEach(([ck]) => { HINT[comps[ck].fr] = COMP[ck].how; });
  const steps = Q.flatMap(p => p[1]), goldRows = [], byStep = {};
  M.forEach(g => g[1].forEach(m => { (byStep[m[3]] = byStep[m[3]] || []).push(m); }));
  let tot = 0, have = 0, goldLeft = 0;
  $("mlist").innerHTML = steps.filter(s => byStep[s.id]).map(s => {
    const done = !!st.q[s.id], rows = byStep[s.id];
    const items = rows.filter(m => m[2] !== "po"), golds = rows.filter(m => m[2] === "po");
    golds.forEach(m => { const pd = done || !!st.c[m[0]]; goldRows.push([m[0], m[1], s, pd, m[0].includes("non confirmé")]); if (!pd) goldLeft += m[1]; });
    items.forEach(m => { tot++; if (done || st.c[m[0]] || (st.m[m[0]] || 0) >= m[1]) have++; });
    return `<div class="mstep ${done ? "mdone" : ""}"><div class="mhead">${s.id2 ? aQuest(parseInt(s.id2), s.n) : aSearch(s.n + " quest", s.n)}<span>${done ? "✓ quête terminée" : s.loc}</span></div>` +
      items.map(m => {
        const key = m[0], h = st.m[key] || 0, ck = !!st.c[key], full = done || ck || h >= m[1];
        const nm = linkify(m[0]) !== m[0] ? linkify(m[0]) : aSearch(m[0], m[0]);
        return `<div class="mat ${full ? "full" : ""}" data-k="c" data-id="${esc(key)}"><div class="box">✓</div><div class="mn">${nm}<small>${esc(itemHow(key) || HINT[key] || "")}</small></div>
        <div class="have">${done ? "<b>✓</b>" : `J'en ai <input type="number" min="0" value="${h}" data-m="${esc(key)}">`}<span class="need">sur <b>${m[1]}</b></span></div></div>`;
      }).join("") +
      golds.map(m => `<div class="mat ${done || st.c[m[0]] ? "full" : ""}" data-k="c" data-id="${esc(m[0])}"><div class="box">✓</div><div class="mn">💰 ${m[0].replace(" (non confirmé)", "")}<small>Or à payer${m[0].includes("non confirmé") ? " — à confirmer en jeu" : ""}</small></div><div class="have">${done || st.c[m[0]] ? "<b>✓ payé</b>" : "<b class='gp'>" + m[1] + " po</b>"}</div></div>`).join("") + `</div>`;
  }).join("");
  $("msum").textContent = have + " / " + tot + " objets rassemblés";
  const sure = goldRows.filter(r => !r[4] && !r[3]).reduce((a, r) => a + r[1], 0), maybe = goldRows.filter(r => r[4] && !r[3]).reduce((a, r) => a + r[1], 0);
  $("gold").innerHTML = `<div class="chk info">Pour finir la chaîne, prévois <b>${sure} po</b> (sûr)${maybe ? ` + <b>${maybe} po</b> peut-être (baguette de Vi'el)` : ""}.</div>` +
    goldRows.map(r => `<div class="mat ${r[3] ? "full" : ""}"><div class="mn">${r[0].replace(" (non confirmé)", "")}<small>${r[2].n}</small></div><div class="have"><b class="gp">${r[3] ? "✓" : r[1] + " po"}</b></div></div>`).join("");

  renderRaids();
  scheduleSave();
  try { window.$WowheadPower && $WowheadPower.refreshLinks(); } catch (_) {}
}

/* ============ PRÉPARATIONS DE RAID (attunements) ============ */
const RAIDS = window.TIER_RAIDS || [];
let curRaid = RAIDS.length ? RAIDS[0].id : null;
const raidKey = (raid, sid) => raid.id + "-" + sid;
const raidTotal = faction => RAIDS.reduce((n, r) => n + (r.chains[faction] || []).reduce((m, ph) => m + ph[1].length, 0), 0);
const raidPct = (n, faction) => { const t = raidTotal(faction); return t ? Math.min(100, Math.round((n || 0) / t * 100)) : 0; };
function raidSteps(raid) { return (raid.chains[profile.faction] || []).flatMap(ph => ph[1]); }
function raidDetail(raid, s) {
  let h = '<div class="step-detail">';
  h += `<div class="sdt">📖 Ce qu'il faut faire</div><p>${esc(s.d.replace(/<([^<>\/]+)\/([^<>]+)>/g, "$1/$2"))}</p>`;
  if (s.r.length) h += `<div class="sdt">🎒 Objectifs</div><ul>${s.r.map(x => `<li>${esc(fixReq(x))}</li>`).join("")}</ul>`;
  h += `<div class="sdt">📍 Où ?</div><p>${esc(s.loc)}</p>`;
  if (s.dung) h += `<div class="sdt">⚔ Donjon</div><p>${esc(RAID_DUNG[s.dung])}</p>`;
  if (s.tips.length) h += `<div class="sdt">💡 Astuces</div><ul>${s.tips.map(t => `<li>${esc(t)}</li>`).join("")}</ul>`;
  return h + `<p class="sdlink"><a href="https://www.wowhead.com/forever/fr/quest=${s.id}" target="_blank" rel="noopener">Voir la quête sur Wowhead Forever ↗</a></p></div>`;
}
const RAID_DUNG = { BRD: "Profondeurs de Blackrock (BRD)", LBRS: "Pic Blackrock inférieur (LBRS)", UBRS: "Pic Blackrock supérieur (UBRS)" };
function renderRaids() {
  const box = $("raidBox");
  if (!box || !profile) return;
  const raid = RAIDS.find(r => r.id === curRaid);
  if (!raid) { box.innerHTML = '<div class="chk warn">Aucune préparation de raid disponible pour le moment.</div>'; return; }
  const chain = raid.chains[profile.faction] || [], steps = raidSteps(raid);
  const done = steps.filter(s => st.r[raidKey(raid, s.id)]).length, pct = steps.length ? done / steps.length * 100 : 0;
  const pills = `<div class="spec-pills">${RAIDS.map(r => `<button type="button" class="choice ${r.id === raid.id ? "on" : ""}" data-raid="${r.id}" style="--c:var(--gold)"><span class="dot"></span>${r.icon} ${esc(r.name)}</button>`).join("")}<span class="raid-soon">D'autres raids arrivent bientôt…</span></div>`;
  const dungs = [...new Set(steps.map(s => s.dung).filter(Boolean))];
  box.innerHTML = `<div class="grid"><div class="panel"><h2>${raid.icon} ${esc(raid.name)} — ${FACTIONS[profile.faction]} <small>${done} / ${steps.length} étapes</small></h2>${pills}
      <div class="bar ${done === steps.length ? "ok" : ""}" style="margin:12px 0 6px"><i style="width:${pct}%"></i></div>
      <div class="qhint">Clique sur une étape pour voir le détail · coche la case à gauche quand elle est terminée.</div>
      ${chain.map(ph => { const d = ph[1].filter(s => st.r[raidKey(raid, s.id)]).length;
        return `<div class="phase"><span>${esc(ph[0])}</span><span>${d}/${ph[1].length}</span></div>` + ph[1].map(s => {
          const sid = "r:" + raidKey(raid, s.id), open = openSteps.has(sid), ok = !!st.r[raidKey(raid, s.id)];
          return `<div class="step ${ok ? "done" : ""} ${open ? "open" : ""}" data-step="${sid}"><div class="box" data-k="r" data-id="${raidKey(raid, s.id)}" title="Cocher / décocher cette étape">✓</div><div class="step-main">
            <div class="sn">${aForeverQuest(s.id, esc(s.n))}<em>#${s.id}${s.l ? " · niv. " + s.l : ""}</em></div>
            <div class="sd"><span class="loc">${esc(s.loc)}</span>${s.dung ? ` <span class="dung-tag">${s.dung}</span>` : ""}</div>${open ? raidDetail(raid, s) : ""}</div><div class="chev" title="${open ? "Replier" : "Voir le détail"}">${open ? "▴" : "▾"}</div></div>`;
        }).join(""); }).join("")}
      <div class="btns" style="margin-top:12px"><button data-raidall="1">Tout cocher</button><button data-raidnone="1">Tout décocher</button></div></div>
    <div class="stack">
      <div class="panel"><h2>Infos</h2><div class="chk info">${esc(raid.intro)}</div>
        <div class="chk info">Raid de niveau <b>${raid.level}</b> · <b>${raid.size}</b> joueurs · ${esc(raid.zone)}.<br>Récompense de la chaîne : ${aItem(raid.rewardId, esc(raid.reward))}.</div></div>
      <div class="panel"><h2>Donjons nécessaires</h2>${dungs.length ? `<div class="chk info">${dungs.map(d => esc(RAID_DUNG[d])).join(" · ")}.</div>` : ""}
        <div class="chk info">Dans un donjon, vérifie que l'objectif de ta quête se met à jour avant de sortir : un donjon fini ne valide pas la quête tout seul.</div></div>
      <div class="panel"><h2>Points à vérifier en jeu</h2>${raid.checks.map(c => `<div class="chk warn">${esc(c)}</div>`).join("")}</div>
    </div></div>`;
}

/* ============ MAJ WOW (historique des correctifs) ============ */
function renderMaj() {
  const box = $("majBox"); if (!box) return;
  const U = window.WOW_UPDATES || [];
  box.innerHTML = `<div class="panel"><h2>Mises à jour de WoW: Forever <small>depuis le lancement du 4 novembre 2026</small></h2>
    <div class="chk info">Clique sur une date pour déplier le détail. Résumé en français des correctifs publiés par Blizzard — <a href="${window.WOW_SRC}" target="_blank" rel="noopener">journal officiel ↗</a>.</div>
    <div class="maj-btns"><button type="button" class="btn2 sm" id="majOpen">Tout déplier</button><button type="button" class="btn2 sm" id="majClose">Tout replier</button></div>
    ${U.map((u, i) => `<details class="maj" ${i === 0 ? "open" : ""}><summary><b>${esc(u.date)}</b><span class="maj-tag">${esc(u.tag || "")}</span></summary>
      <div class="maj-body">${u.s.map(sec => `<div class="sdt">${esc(sec[0])}</div><ul>${sec[1].map(t => `<li>${esc(t)}</li>`).join("")}</ul>`).join("")}</div></details>`).join("")}</div>`;
  $("majOpen").onclick = () => box.querySelectorAll("details.maj").forEach(d => d.open = true);
  $("majClose").onclick = () => box.querySelectorAll("details.maj").forEach(d => d.open = false);
}

/* ============ SYNCHRONISATION ============ */
let saveTimer = null, dirty = false, syncMsg = "";
function setSync(kind, msg) {
  const b = $("syncBadge");
  b.className = "sync " + (kind === "ok" ? "ok" : kind === "off" ? "off" : "");
  b.textContent = kind === "ok" ? "☁ synchronisé" : kind === "off" ? "⚠ " + (msg || "hors ligne") + " — sauvegarde locale" : "… envoi";
}
function scheduleSave() {
  if (!profile) return;
  ls.set(stateKey(), JSON.stringify(st));
  dirty = true; setSync("...");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 900);
}
async function flush() {
  if (!profile || !dirty) return;
  try {
    const r = await rpc("tier_save", { p_name: profile.name, p_class: profile.cls, p_faction: profile.faction, p_state: st, p_token: token, p_spec: profile.spec || null });
    if (r && r.ok) { dirty = false; setSync("ok"); }
    else if (r && r.error === "owned") setSync("off", "nom déjà utilisé par un autre appareil");
    else setSync("off", "refusé (" + (r && r.error) + ")");
  } catch (e) { setSync("off", "hors ligne"); }
}
setInterval(() => { if (dirty) flush(); }, 30000);
window.addEventListener("online", flush);
document.addEventListener("visibilitychange", () => { if (document.hidden && dirty) flush(); });

/* ============ FICHE D'UN MEMBRE (lecture seule) ============ */
function memberHTML(p, state) {
  const c = CLASSES[p.cls], x = buildCtx(p);
  const s = Object.assign(emptyState(), state || {});
  const c0 = x.T0.filter(t => s.t0[t.id]).length, c5 = x.T05.filter(t => s.t05[t.id]).length;
  const cq = x.Q.flatMap(ph => ph[1]).filter(t => s.q[t.id]).length;
  const pct = Math.round((c0 + c5 + cq) / MAX_POINTS * 100);
  const piece = (t, done, color) => `<div class="piece ${done ? "done" : ""}" style="--q:${color(t)}"><div class="box">✓</div><div class="slot">${t.s}</div>
    <div class="pi"><div class="pn">${aItem(t.wh, esc(t.n))}</div></div><div class="il">${t.i}</div></div>`;
  return `<h2><span>Fiche de ${esc(p.name)}</span> <button class="x" id="memberClose">Fermer ✕</button></h2>
    <div class="m-head">${portrait(p.cls, 64)}<div><h3 style="color:${c.color}">${esc(p.name)}</h3>
      <div class="sub"><b style="color:${c.color}">${c.fr}</b>${p.spec ? " · " + esc(specFr(p.cls, p.spec)) : ""} · ${FACTIONS[p.faction]}</div></div>
      <div class="stats"><div class="big"><div class="n">${c0}/8</div><div class="l">T0</div></div><div class="big"><div class="n">${c5}/8</div><div class="l">T0.5</div></div>
      <div class="big"><div class="n">${cq}/${x.nQ}</div><div class="l">Quêtes</div></div><div class="big"><div class="n">${raidPct(countTrue(s.r), p.faction)}%</div><div class="l">Raids</div></div><div class="big"><div class="n">${pct}%</div><div class="l">Avancement</div></div></div></div>
    <div class="bar ${pct === 100 ? "ok" : ""}" style="margin-bottom:16px"><i style="width:${pct}%"></i></div>
    <div class="m-cols"><div><div class="phase"><span>T0 — ${esc(x.set.t0.name)}</span><span>${c0}/8</span></div>${x.T0.map(t => piece(t, s.t0[t.id], () => "#4a9dff")).join("")}</div>
      <div><div class="phase"><span>T0.5 — ${esc(x.set.t05.name)}</span><span>${c5}/8</span></div>${x.T05.map(t => piece(t, s.t05[t.id], t2 => t2.q === "epic" ? "#c27cff" : "#4a9dff")).join("")}</div></div>
    ${p.spec ? bisReadonly(p.cls, p.spec, s) : ""}
    <div class="m-steps">${x.Q.map(ph => { const d = ph[1].filter(t => s.q[t.id]).length;
      return `<div class="phase"><span>${ph[0]}</span><span>${d}/${ph[1].length}</span></div>` + ph[1].map(t => `<div class="step ${s.q[t.id] ? "done" : ""}"><div class="box">✓</div><div class="sn">${esc(t.n)}</div></div>`).join(""); }).join("")}</div>`;
}
async function showMember(name) {
  const modal = $("memberModal"), box = $("memberBox");
  box.innerHTML = '<div class="chk info">Chargement de la fiche…</div>';
  modal.hidden = false;
  try {
    const info = await rpc("tier_load", { p_name: name, p_token: null });
    if (!info || !info.exists) { box.innerHTML = '<div class="chk warn">Personnage introuvable (supprimé ?).</div>'; return; }
    box.innerHTML = memberHTML({ name: info.name, cls: info.class, faction: info.faction, spec: info.spec }, info.state);
    try { window.$WowheadPower && $WowheadPower.refreshLinks(); } catch (_) {}
  } catch (e) { box.innerHTML = '<div class="chk warn">Fiche indisponible pour le moment (connexion).</div>'; }
  const close = $("memberClose"); if (close) close.onclick = () => { modal.hidden = true; };
}
$("memberModal").addEventListener("click", e => { if (e.target.id === "memberModal") e.currentTarget.hidden = true; });
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  if (!$("newsModal").hidden) closeNews(); else $("memberModal").hidden = true;
});

/* ============ CLASSEMENT ============ */
function ago(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return "à l'instant"; if (s < 3600) return Math.round(s / 60) + " min";
  if (s < 86400) return Math.round(s / 3600) + " h"; return Math.round(s / 86400) + " j";
}
async function loadRanking(box) {
  box.innerHTML = '<div class="chk info">Chargement du classement…</div>';
  let rows;
  try { rows = await rpc("tier_ranking", {}); } catch (e) { box.innerHTML = '<div class="chk warn">Classement indisponible pour le moment (connexion).</div>'; return; }
  const draw = () => {
    const fc = box.querySelector(".f-cls").value, ff = box.querySelector(".f-fac").value;
    const list = rows.filter(r => (!fc || r.class === fc) && (!ff || r.faction === ff));
    const me = profile ? nameKey(profile.name) : null;
    box.querySelector(".rk-body").innerHTML = list.length ? list.map((r, i) => {
      const c = CLASSES[r.class] || { fr: r.class, color: "#999" }, pct = Math.round(r.score / MAX_POINTS * 100);
      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1;
      return `<tr class="${me && nameKey(r.name) === me ? "me" : ""}"><td class="pos">${medal}</td><td class="nm" style="color:${c.color}">${portrait(r.class, 24)}<a class="mlink" data-name="${esc(r.name)}" title="Voir la progression de ${esc(r.name)}">${esc(r.name)}</a></td>
        <td class="hide-s">${c.fr}${r.spec ? `<div class="sub2">${esc(specFr(r.class, r.spec))}</div>` : ""}</td><td class="hide-s ${r.faction === "horde" ? "fac-h" : "fac-a"}">${FACTIONS[r.faction] || r.faction}</td>
        <td class="num">${r.t0}/8</td><td class="num">${r.t05}/8</td><td class="num hide-s">${r.quests}/29</td><td class="num hide-s" title="${r.raids || 0}/${raidTotal(r.faction)} étapes">${raidPct(r.raids, r.faction)}%</td><td class="num hide-s">${r.spec && bisTotal(r.class, r.spec) ? (r.bis || 0) + "/" + bisTotal(r.class, r.spec) : "—"}</td>
        <td class="pct"><b>${pct}%</b><div class="bar ${pct === 100 ? "ok" : ""}"><i style="width:${pct}%"></i></div></td></tr>`;
    }).join("") : `<tr><td colspan="10" style="color:var(--dim);padding:18px">Personne dans ce filtre pour l'instant.</td></tr>`;
  };
  box.innerHTML = `<div class="rank-tools">
      <select class="f-cls"><option value="">Toutes les classes</option>${Object.entries(CLASSES).map(([k, c]) => `<option value="${k}">${c.fr}</option>`).join("")}</select>
      <select class="f-fac"><option value="">Les deux factions</option><option value="horde">Horde</option><option value="alliance">Alliance</option></select>
      <button class="linkbtn rk-refresh">↻ Actualiser</button><span style="color:var(--dim);font-size:12px">${rows.length} personnage(s) · avancement = pièces T0 + pièces T0.5 + étapes de quête (sur ${MAX_POINTS})</span></div>
    <div style="overflow-x:auto"><table class="rank"><thead><tr><th>#</th><th>Personnage</th><th class="hide-s">Classe</th><th class="hide-s">Faction</th><th>T0</th><th>T0.5</th><th class="hide-s">Quêtes</th><th class="hide-s" title="Préparations de raids (attunements)">Raids</th><th class="hide-s">BiS</th><th>Avancement</th></tr></thead><tbody class="rk-body"></tbody></table></div>`;
  box.querySelector(".f-cls").onchange = draw; box.querySelector(".f-fac").onchange = draw;
  box.querySelector(".rk-refresh").onclick = () => loadRanking(box);
  box.querySelector(".rk-body").addEventListener("click", e => { const a = e.target.closest(".mlink"); if (a) showMember(a.dataset.name); });
  draw();
}

/* ============ BIS (Best in Slot par classe et spécialisation) ============ */
const bisKey = (spec, slot) => spec + "|" + slot;
const itemInfo = id => (BIS && BIS.items[id]) || ["#" + id, 1, "", 0];
const iconImg = (ic, px) => ic ? `<img class="it-ico" src="https://wow.zamimg.com/images/wow/icons/medium/${ic}.jpg" width="${px}" height="${px}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : "";
const aForever = (id, html) => `<a href="https://www.wowhead.com/forever/fr/item=${id}" target="_blank" rel="noopener">${html}</a>`;
function itemLine(id, big) {
  const it = itemInfo(id);
  return `${iconImg(it[2], big ? 34 : 22)}<span class="bn" style="color:${QCOL[it[1]] || "#fff"}">${aForever(id, esc(it[0]))}</span>${it[3] ? `<span class="il">${it[3]}</span>` : ""}`;
}
/* ---- comment obtenir un objet ---- */
const SRC = window.TIER_SOURCES || {};
const tierByName = () => { const m = {}; Object.entries(tierMap()).forEach(([id, t]) => { m[t.n] = Object.assign({ id: +id }, t); }); return m; };
function sourcesFor(id, slot) {
  const out = [];
  const it = getItem(id), tm = tierMap()[id] || tierByName()[it.n];
  if (tm) {
    out.push(tm.tier === "T0" ? { ic: "🛡", plain: "Set T0 — " + T0SRC[tm.slot], html: "<b>Set T0</b> · " + esc(T0SRC[tm.slot]) }
      : { ic: "🛡", plain: "Set T0.5 — quête « " + T05QNAME[T05STEP[tm.slot]] + " » (chaîne T0.5)", html: "<b>Set T0.5</b> · quête « " + esc(T05QNAME[T05STEP[tm.slot]]) + " » (chaîne de quêtes T0.5)" });
    return out;
  }
  if (slot && !(SRC[id] || []).length) {
    const lt = s => s.split(" ").pop(), k5 = lt(ctx.T05[0].n), k0 = lt(ctx.T0[0].n);
    if (it.n.endsWith(k5) || it.n.endsWith(k0)) {
      const tt = it.n.endsWith(k5) ? "T0.5" : "T0", ts = T05STEP[slot];
      return [tt === "T0" ? { ic: "🛡", plain: "Set T0 — " + (T0SRC[slot] || ""), html: "<b>Set T0</b> · " + esc(T0SRC[slot] || "") } : { ic: "🛡", plain: "Set T0.5 — chaîne de quêtes T0.5", html: "<b>Set T0.5</b> · quête « " + esc(T05QNAME[ts] || "") + " » (chaîne de quêtes T0.5)" }];
    }
  }
  (SRC[id] || []).forEach(r => {
    const k = r[0];
    if (k === "drop") out.push({ ic: "⚔", plain: r[2] + " — " + r[1] + (r[3] ? " (" + r[3] + " %)" : ""), html: "<b>" + esc(r[2]) + "</b> · " + esc(r[1]) + (r[3] ? " <em>" + r[3] + " %</em>" : "") });
    else if (k === "quest") out.push({ ic: "📜", plain: "Quête « " + r[1] + " »", html: "Quête « " + aForeverQuest(r[2], esc(r[1])) + " »" });
    else if (k === "craft") out.push({ ic: "🔨", plain: "Fabriqué : " + r[1] + " (compétence " + r[2] + ")", html: "Fabriqué : <b>" + esc(r[1]) + "</b> <em>compétence " + r[2] + "</em>" });
    else if (k === "boe") out.push({ ic: "💰", plain: "Drop aléatoire en monde / Hôtel des ventes (BoE)", html: "Drop aléatoire en monde ou <b>Hôtel des ventes</b> <em>(BoE)</em>" });
    else if (k === "rep") out.push({ ic: "🏳", plain: "Réputation " + r[1] + " — " + r[2], html: "Réputation <b>" + esc(r[1]) + "</b> · " + esc(r[2]) });
    else if (k === "pvp" && (!r[3] || r[3] === FACTIONS[profile.faction])) out.push({ ic: "🏴", plain: "JcJ — " + r[1] + ", " + r[2], html: "JcJ · <b>" + esc(r[1]) + "</b> · " + esc(r[2]) });
  });
  return out;
}
function srcBlock(id, slot) {
  const rows = sourcesFor(id, slot);
  return rows.length ? '<div class="bis-src">' + rows.map(r => '<div class="srow"><span class="si">' + r.ic + "</span><span>" + r.html + "</span></div>").join("") + "</div>"
    : '<div class="bis-src none"><span>Source non listée — ' + aForever(id, "voir la fiche Wowhead") + "</span></div>";
}
function bisSlots(cls, spec) {
  const d = specList(cls)[spec];
  return d ? BIS_ORDER.filter(s => d.slots[s]).map(s => [s, d.slots[s]]) : [];
}
function bisDone(state, spec, slots) { return slots.filter(([s]) => state.bis && state.bis[bisKey(spec, s)]).length; }
function updateBisStat() {
  const slots = profile && profile.spec ? bisSlots(profile.cls, profile.spec) : [];
  $("hBis").textContent = slots.length ? bisDone(st, profile.spec, slots) + "/" + slots.length : "—";
}
function setSpec(spec) {
  profile.spec = spec || null;
  ls.set("tier-profile", JSON.stringify(profile));
  upsertChar(profile);
  renderHeader(); updateBisStat(); renderBis();
  dirty = true; scheduleSave();
}
function renderBis() {
  const box = $("bisBox"), specs = specList(profile.cls);
  if (!BIS || !Object.keys(specs).length) { box.innerHTML = '<div class="chk warn">Pas de liste BiS disponible pour cette classe.</div>'; return; }
  const pills = `<div class="spec-pills">${Object.entries(specs).map(([k, d]) => `<button type="button" class="choice ${profile.spec === k ? "on" : ""}" data-spec="${esc(k)}" style="--c:${CLASSES[profile.cls].color}"><span class="dot"></span>${esc(d.fr)} <small>${ROLE_FR[d.role]}</small></button>`).join("")}</div>`;
  if (!profile.spec || !specs[profile.spec]) {
    box.innerHTML = `<div class="chk info"><b>Choisis ta spécialisation</b> : les BiS changent selon la spé. Tu pourras la modifier à tout moment (ici ou dans l'onglet Profil).</div>${pills}`;
    return;
  }
  const slots = bisSlots(profile.cls, profile.spec), done = bisDone(st, profile.spec, slots), pct = slots.length ? done / slots.length * 100 : 0;
  box.innerHTML = `${pills}
    <div class="phase" style="margin-top:14px"><span>BiS — ${esc(specs[profile.spec].fr)}</span><span>${done} / ${slots.length}</span></div>
    <div class="bar ${done === slots.length ? "ok" : ""}" style="margin-bottom:10px"><i style="width:${pct}%"></i></div>
    ${slots.map(([slot, d]) => { const k = bisKey(profile.spec, slot), ok = !!st.bis[k];
      return `<div class="bis-row ${ok ? "done" : ""}" data-bis="${esc(k)}"><div class="bis-top"><div class="box">✓</div><div class="slot">${BIS_SLOT_FR[slot] || slot}</div>
        <div class="bis-col"><div class="bis-main">${itemLine(d.p, true)}</div>${srcBlock(d.p, slot)}</div></div>
        ${d.a.length ? `<details class="bis-alt"><summary>${d.a.length} alternative${d.a.length > 1 ? "s" : ""} et comment les obtenir</summary>${d.a.map(id => `<div class="alt"><div class="alt-l">${itemLine(id, false)}</div>${srcBlock(id, slot)}</div>`).join("")}</details>` : ""}</div>`; }).join("")}`;
  try { window.$WowheadPower && $WowheadPower.refreshLinks(); } catch (_) {}
}
function bisReadonly(cls, spec, state) {
  const slots = bisSlots(cls, spec);
  if (!slots.length) return "";
  const done = bisDone(state, spec, slots);
  return `<div class="phase" style="margin-top:16px"><span>BiS — ${esc(specFr(cls, spec))}</span><span>${done}/${slots.length}</span></div>
    <div class="m-bis">${slots.map(([slot, d]) => { const ok = state.bis && state.bis[bisKey(spec, slot)];
      return `<div class="piece ${ok ? "done" : ""}"><div class="box">✓</div><div class="slot">${BIS_SLOT_FR[slot] || slot}</div><div class="pi bis-main">${itemLine(d.p, false)}</div></div>`; }).join("")}</div>`;
}

/* ============ PROFIL (personnages et spécialisations) ============ */
const countTrue = o => Object.values(o || {}).filter(Boolean).length;
function localState(name) { try { return Object.assign(emptyState(), JSON.parse(ls.get("tier-state:" + nameKey(name)) || "{}")); } catch (_) { return emptyState(); } }
/* ---- informations d'un objet (liste BiS, sinon pièce de set T0 / T0.5 de la classe) : sert aux sources de l'onglet BiS ---- */
let TIERMAP = null;
function tierMap() {
  if (TIERMAP && TIERMAP.cls === profile.cls) return TIERMAP.m;
  const m = {};
  [["T0", ctx.T0], ["T0.5", ctx.T05]].forEach(([tag, list]) => list.forEach(p => { m[p.wh] = { n: p.n, q: p.q === "epic" ? 4 : 3, il: p.i, tier: tag, slot: p.id }; }));
  TIERMAP = { cls: profile.cls, m };
  return m;
}
function getItem(id) {
  const t = tierMap()[id];
  if (t) return t;
  const b = BIS && BIS.items[id];
  return b ? { n: b[0], q: b[1], ic: b[2], il: b[3] } : { n: "#" + id, q: 1, ic: "", il: 0 };
}

function renderProfile() {
  const chars = getChars(), box = $("profileBox"), me = profile ? nameKey(profile.name) : "";
  box.innerHTML = chars.map(c => {
    const s = c.name === (profile && profile.name) ? st : localState(c.name), active = nameKey(c.name) === me, cl = CLASSES[c.cls] || CLASSES.druid;
    return `<div class="pcard ${active ? "active" : ""}">${portrait(c.cls, 56)}
      <div class="pinfo"><div class="pname" style="color:${cl.color}">${esc(c.name)}${active ? ' <span class="tag">actif</span>' : ""}</div>
        <div class="psub">${cl.fr} · ${FACTIONS[c.faction]} · T0 ${countTrue(s.t0)}/8 · T0.5 ${countTrue(s.t05)}/8 · quêtes ${countTrue(s.q)}/29</div>
        <div class="pspec"><label>Spécialisation</label><select data-spec-for="${esc(c.name)}"><option value="">— non définie —</option>${Object.entries(specList(c.cls)).map(([k, d]) => `<option value="${esc(k)}" ${c.spec === k ? "selected" : ""}>${esc(d.fr)} (${ROLE_FR[d.role]})</option>`).join("")}</select></div></div>
      <div class="pbtns">${active ? "" : `<button data-act="use" data-name="${esc(c.name)}">Utiliser</button>`}<button data-act="del" data-name="${esc(c.name)}">Supprimer</button></div></div>`;
  }).join("") + `<button class="cta" id="addChar" style="margin-top:6px">+ Ajouter un personnage</button>`;
}
async function setCharSpec(name, spec) {
  if (profile && nameKey(name) === nameKey(profile.name)) { setSpec(spec); renderProfile(); return; }
  const a = getChars(), c = a.find(x => nameKey(x.name) === nameKey(name)); if (!c) return;
  c.spec = spec || null; saveChars(a);
  try {
    await rpc("tier_save", { p_name: c.name, p_class: c.cls, p_faction: c.faction, p_state: localState(c.name), p_token: ls.get("tier-token:" + nameKey(c.name)), p_spec: c.spec });
  } catch (_) { /* la spé sera envoyée à la prochaine synchro de ce personnage */ }
}
function switchTo(c) {
  if (dirty) flush();
  profile = { name: c.name, cls: c.cls, faction: c.faction, spec: c.spec || null };
  token = ls.get("tier-token:" + nameKey(c.name));
  ls.set("tier-profile", JSON.stringify(profile));
  st = localState(c.name);
  enterApp();
  const b = document.querySelector('#tabs [data-v="profile"]'); if (b) b.click();
}
async function deleteChar(name) {
  if (!confirm("Supprimer " + name + " du classement et de ce navigateur ? Cette action est définitive.")) return;
  const key = nameKey(name), tk = ls.get("tier-token:" + key);
  try { await rpc("tier_delete", { p_name: name, p_token: tk }); } catch (_) { alert("Suppression impossible (connexion). Réessaie."); return; }
  ls.del("tier-state:" + key); ls.del("tier-token:" + key);
  const rest = getChars().filter(x => nameKey(x.name) !== key); saveChars(rest);
  if (profile && nameKey(profile.name) === key) {
    dirty = false;
    if (rest.length) switchTo(rest[0]); else { ls.del("tier-profile"); profile = null; show("login"); }
  } else renderProfile();
}
let addingChar = false;

/* ============ ÉCRANS ============ */
function show(which) {
  $("screen-login").hidden = which !== "login";
  $("screen-rank").hidden = which !== "rank";
  $("screen-app").hidden = which !== "app";
}

let pick = { cls: null, faction: null };
function buildLogin() {
  $("clsChoices").innerHTML = Object.entries(CLASSES).map(([k, c]) => `<button type="button" class="choice" data-cls="${k}" style="--c:${c.color}">${portrait(k, 24)}${c.fr}</button>`).join("");
  $("facChoices").innerHTML = Object.entries(FACTIONS).map(([k, f]) => `<button type="button" class="choice ${k}" data-fac="${k}"><span class="dot"></span>${f}</button>`).join("");
  const upd = () => {
    document.querySelectorAll("#clsChoices .choice").forEach(b => b.classList.toggle("on", b.dataset.cls === pick.cls));
    document.querySelectorAll("#facChoices .choice").forEach(b => b.classList.toggle("on", b.dataset.fac === pick.faction));
    $("goBtn").disabled = !(validName($("inName").value) && pick.cls && pick.faction);
  };
  $("clsChoices").onclick = e => { const b = e.target.closest("[data-cls]"); if (b) { pick.cls = b.dataset.cls; upd(); } };
  $("facChoices").onclick = e => { const b = e.target.closest("[data-fac]"); if (b) { pick.faction = b.dataset.fac; upd(); } };
  $("inName").addEventListener("input", () => { $("loginErr").textContent = ""; $("ownedBox").hidden = true; upd(); });
  $("inName").addEventListener("keydown", e => { if (e.key === "Enter" && !$("goBtn").disabled) $("goBtn").click(); });
  $("goBtn").onclick = () => startSession(normName($("inName").value), pick.cls, pick.faction);
  $("seeRank").onclick = () => { show("rank"); loadRanking($("rankBoxAlone")); };
  $("backLogin").onclick = () => show("login");
  $("cancelAdd").onclick = () => { addingChar = false; $("cancelAdd").hidden = true; show("app"); };
  $("codeBtn").onclick = async () => {
    const name = normName($("inName").value), code = $("inCode").value.trim();
    if (code.length < 16) { $("loginErr").textContent = "Code invalide."; return; }
    try {
      const info = await rpc("tier_load", { p_name: name, p_token: code });
      if (info && info.owned) { ls.set("tier-token:" + nameKey(name), code); ls.del("tier-state:" + nameKey(name)); $("ownedBox").hidden = true; startSession(name, pick.cls, pick.faction); }
      else $("loginErr").textContent = "Ce code ne correspond pas à ce personnage.";
    } catch (e) { $("loginErr").textContent = "Connexion impossible, réessaie."; }
  };
  upd();
}

async function startSession(name, cls, faction) {
  $("loginErr").textContent = ""; $("goBtn").disabled = true;
  const key = nameKey(name);
  let tk = ls.get("tier-token:" + key) || newToken();
  let info = null, offline = false;
  try { info = await rpc("tier_load", { p_name: name, p_token: tk }); } catch (e) { offline = true; }
  $("goBtn").disabled = false;
  if (info && info.exists && !info.owned) {
    $("loginErr").textContent = "Ce nom de personnage est déjà utilisé.";
    $("ownedBox").hidden = false;
    return;
  }
  ls.set("tier-token:" + key, tk);
  token = tk;
  profile = { name: info && info.exists ? info.name : name, cls, faction, spec: info && info.exists ? info.spec || null : null };
  addingChar = false; $("cancelAdd").hidden = true;
  ls.set("tier-profile", JSON.stringify(profile));
  upsertChar(profile);
  let local = null;
  try { local = JSON.parse(ls.get("tier-state:" + key) || "null"); } catch (_) {}
  st = Object.assign(emptyState(), local || (info && info.exists && info.state) || {});
  dirty = true;
  enterApp();
  if (offline) setSync("off", "hors ligne");
}

function enterApp() {
  openSteps.clear(); // les étapes déroulées ne suivent pas d'un personnage à l'autre
  ctx = buildCtx(profile);
  renderHeader();
  show("app");
  render();
  updateBisStat();
  flush();
  const home = document.querySelector('#tabs [data-v="profile"]'); if (home) home.click(); // le Profil est la page d'accueil
}

/* ============ ÉVÉNEMENTS ============ */
document.addEventListener("click", e => {
  if (!profile || $("screen-app").hidden) return;
  if (e.target.closest("a,input,button")) return;
  const stepEl = e.target.closest("[data-step]");
  if (stepEl && !e.target.closest("[data-k]") && !e.target.closest(".step-detail")) {
    const sid = stepEl.dataset.step;
    if (openSteps.has(sid)) openSteps.delete(sid); else openSteps.add(sid);
    render();
    return;
  }
  const el = e.target.closest("[data-k]"); if (!el) return;
  const k = el.dataset.k, id = el.dataset.id; if (!st[k]) st[k] = {}; st[k][id] = !st[k][id];
  if (k === "q") ctx.T05.filter(p => p.step === id).forEach(p => { st.t05[p.id] = st.q[id]; });
  render();
});
document.addEventListener("input", e => {
  if (e.target.dataset && e.target.dataset.m !== undefined) {
    st.m[e.target.dataset.m] = +e.target.value || 0; scheduleSave();
    const row = e.target.closest(".mat"), need = parseInt(row.querySelector(".need").textContent.replace(/[^0-9]/g, ""), 10);
    row.classList.toggle("full", (+e.target.value || 0) >= need);
  }
});
$("tabs").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  document.querySelectorAll(".tabs button").forEach(x => x.classList.toggle("on", x === b));
  document.querySelectorAll("#screen-app .view").forEach(v => v.classList.toggle("on", v.id === "v-" + b.dataset.v));
  ls.set("tier-tab", b.dataset.v);
  if (b.dataset.v === "rank") loadRanking($("rankBox"));
  if (b.dataset.v === "bis") renderBis();
  if (b.dataset.v === "maj") renderMaj();
  if (b.dataset.v === "profile") renderProfile();
});
document.addEventListener("click", e => {
  if (!profile || $("screen-app").hidden) return;
  const rp = e.target.closest("[data-raid]");
  if (rp && $("raidBox").contains(rp)) { curRaid = rp.dataset.raid; renderRaids(); return; }
  const ra = e.target.closest("[data-raidall],[data-raidnone]");
  if (ra && $("raidBox").contains(ra)) {
    const raid = RAIDS.find(r => r.id === curRaid);
    raidSteps(raid).forEach(s => { st.r[raidKey(raid, s.id)] = !!ra.dataset.raidall; });
    render(); return;
  }
  const pill = e.target.closest("[data-spec]");
  if (pill && $("bisBox").contains(pill)) { setSpec(pill.dataset.spec); return; }
  if (e.target.closest("a,input,button,summary,details")) return;
  const row = e.target.closest("[data-bis]");
  if (row && $("bisBox").contains(row)) { const k = row.dataset.bis; st.bis[k] = !st.bis[k]; renderBis(); updateBisStat(); scheduleSave(); }
});
$("profileBox").addEventListener("change", e => { const sel = e.target.closest("[data-spec-for]"); if (sel) setCharSpec(sel.dataset.specFor, sel.value); });
$("profileBox").addEventListener("click", e => {
  const add = e.target.closest("#addChar");
  if (add) { addingChar = true; $("cancelAdd").hidden = false; $("inName").value = ""; $("loginErr").textContent = ""; show("login"); return; }
  const b = e.target.closest("[data-act]"); if (!b) return;
  const c = getChars().find(x => x.name === b.dataset.name); if (!c) return;
  if (b.dataset.act === "use") switchTo(c); else deleteChar(c.name);
});
$("qall").onclick = () => { ctx.Q.flatMap(p => p[1]).forEach(s => { st.q[s.id] = true; ctx.T05.filter(p => p.step === s.id).forEach(p => st.t05[p.id] = true); }); render(); };
$("qnone").onclick = () => { st.q = {}; render(); };
$("rst").onclick = () => { if (confirm("Tout réinitialiser ?")) { st = emptyState(); render(); } };
$("exp").onclick = () => { prompt("Copie ce texte pour sauvegarder :", JSON.stringify(st)); };
$("imp").onclick = () => { const t = prompt("Colle ta sauvegarde :"); if (t) { try { st = Object.assign(emptyState(), JSON.parse(t)); render(); } catch (_) { alert("Sauvegarde invalide"); } } };
$("showCode").onclick = () => {
  const box = $("codeBox"); box.hidden = false;
  box.innerHTML = `Code de récupération (garde-le pour retrouver ton personnage sur un autre navigateur ; ne le partage pas) :<br><b style="user-select:all;word-break:break-all">${esc(token)}</b>`;
};
$("delChar").onclick = () => deleteChar(profile.name);
$("switchBtn").onclick = () => { const b = document.querySelector('#tabs [data-v="profile"]'); if (b) b.click(); };

/* ---- version en ligne et rechargement vers la dernière version ---- */
async function remoteVersion() {
  try {
    const r = await fetch("news.js?x=" + Date.now(), { cache: "no-store" });
    if (!r.ok) return null;
    const m = (await r.text()).match(/TIER_VERSION\s*=\s*"([^"]+)"/);
    return m ? m[1] : null;
  } catch (_) { return null; } // hors ligne
}
async function reloadLatest(btn) {
  if (btn) { btn.disabled = true; btn.textContent = "Actualisation…"; }
  try { if (dirty) await flush(); } catch (_) {} // la progression est sauvegardée avant
  location.replace(location.pathname + "?u=" + Date.now()); // adresse différente : on récupère la page à jour, pas celle en cache
}

/* ============ NOUVEAUTÉS (pop-up à chaque mise à jour) + VERSION ============ */
const VERSION = window.TIER_VERSION || "";
const NEWS = window.TIER_NEWS || [];
const newsList = e => `<ul class="news-list">${e.items.map(i => `<li><b>${esc(i.t)}</b><span>${esc(i.d)}</span></li>`).join("")}</ul>`;
// La nouveauté la plus récente est dépliée ; les versions précédentes sont repliées dans des menus déroulants.
function newsHTML(entries) {
  const [latest, ...older] = entries;
  return `<h2><span>✨ Nouveautés <small>v${esc(VERSION)}</small></span><span class="news-head-btns"><button class="btn2 sm" id="newsRefresh" title="Recharge le site pour utiliser la dernière version">🔄 Actualiser</button><button class="x" id="newsX" aria-label="Fermer">✕</button></span></h2>
    <div class="news-notice" id="newsNotice" hidden></div>
    <div class="news-entry"><div class="news-title">${esc(latest.title)} <small>v${esc(latest.v)} · ${esc(latest.date)}</small></div>${newsList(latest)}</div>` +
    (older.length ? `<div class="news-older-title">Versions précédentes</div>` + older.map(e => `<details class="news-old"><summary><b>${esc(e.title)}</b> <small>v${esc(e.v)} · ${esc(e.date)}</small></summary>${newsList(e)}</details>`).join("") : "") +
    `<button class="cta" id="newsOk">Compris !</button>`;
}
function closeNews() {
  $("newsModal").hidden = true;
  ls.set("tier-seen-version", VERSION);
}
function showNews(entries) {
  if (!entries.length) return;
  $("newsBox").innerHTML = newsHTML(entries);
  $("newsModal").hidden = false;
  $("newsX").onclick = closeNews; $("newsOk").onclick = closeNews;
  $("newsRefresh").onclick = () => { ls.set("tier-seen-version", VERSION); reloadLatest($("newsRefresh")); };
  $("newsOk").focus();
  remoteVersion().then(v => {
    if (v && cmpVer(v, VERSION) > 0 && !$("newsModal").hidden) {
      $("newsNotice").textContent = "Une version plus récente (v" + v + ") est disponible : clique sur « Actualiser » pour l'utiliser.";
      $("newsNotice").hidden = false;
      $("newsRefresh").classList.add("hot");
    }
  });
}
function maybeShowNews() {
  if (!NEWS.length) return;
  const seen = ls.get("tier-seen-version");
  // Seules les versions AVEC nouveautés (entrées de NEWS) ouvrent le pop-up. Les petites corrections (+0.0.1) restent silencieuses :
  // si l'utilisateur a déjà vu une version égale ou plus récente que la dernière entrée, rien ne s'ouvre.
  if (seen && cmpVer(seen, NEWS[0].v) >= 0) return;
  const fresh = seen ? NEWS.filter(e => cmpVer(e.v, seen) > 0).slice(0, 3) : NEWS.slice(0, 1);
  showNews(NEWS.slice(0, 5));
}
$("newsModal").addEventListener("click", e => { if (e.target.id === "newsModal") closeNews(); });
$("openNews").onclick = () => showNews(NEWS.slice(0, 6));
$("siteVer").textContent = "v" + VERSION;
setTimeout(maybeShowNews, 600);

/* ---- alerte « nouvelle version disponible » pendant que le site est ouvert ---- */
function cmpVer(a, b) {
  const x = String(a).split(".").map(Number), y = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; }
  return 0;
}
let updateDismissed = null;
function showUpdateToast(remote) {
  const t = $("updateToast");
  t.innerHTML = `<div class="toast-msg"><b>🔔 Nouvelle version disponible</b><span>v${esc(remote)} est en ligne (tu as la v${esc(VERSION)}). Ta progression est sauvegardée avant le rechargement.</span></div>
    <div class="toast-btns"><button class="cta" id="updNow">Recharger</button><button class="linkbtn" id="updLater">Plus tard</button></div>`;
  t.hidden = false;
  $("updLater").onclick = () => { updateDismissed = remote; t.hidden = true; };
  $("updNow").onclick = () => reloadLatest($("updNow"));
}
async function checkUpdate() {
  if (!VERSION) return;
  const v = await remoteVersion();
  // la bulle ne s'affiche que pour une version avec nouveautés (x.y) ; les petites corrections (+0.0.1) sont silencieuses
  if (v && cmpVer(v.split(".").slice(0, 2).join("."), VERSION.split(".").slice(0, 2).join(".")) > 0 && updateDismissed !== v) showUpdateToast(v);
}
setInterval(checkUpdate, 5 * 60 * 1000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) checkUpdate(); });
window.addEventListener("online", checkUpdate);
setTimeout(checkUpdate, 2 * 60 * 1000);

/* ============ DÉMARRAGE ============ */
buildLogin();
(function boot() {
  let p = null;
  try { p = JSON.parse(ls.get("tier-profile") || "null"); } catch (_) {}
  if (p && p.name && SETS.classes[p.cls] && FACTIONS[p.faction]) {
    profile = p; token = ls.get("tier-token:" + nameKey(p.name));
    if (profile.spec === undefined) profile.spec = null;
    upsertChar(profile);
    let local = null; try { local = JSON.parse(ls.get("tier-state:" + nameKey(p.name)) || "null"); } catch (_) {}
    st = Object.assign(emptyState(), local || {});
    if (token) { enterApp(); return; }
    profile = null;
  }
  show("login");
})();
})();
