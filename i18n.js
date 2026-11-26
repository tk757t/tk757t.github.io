// Langue du site (FR / EN) : choix en haut de page, ?lang=en|fr dans l'adresse, mémorisé dans le navigateur.
// Le français reste la langue de base ; les clés de sauvegarde ne changent pas d'une langue à l'autre.
(function () {
  "use strict";
  const store = { get() { try { return localStorage.getItem("tier-lang"); } catch (_) { return null; } }, set(v) { try { localStorage.setItem("tier-lang", v); } catch (_) {} } };
  const asked = (/[?&]lang=(fr|en)\b/.exec(location.search) || [])[1];
  const lang = asked || (store.get() === "en" ? "en" : "fr");
  if (asked) store.set(asked);
  const EN = lang === "en";
  window.TIER_LANG = lang;
  window.L = (fr, en) => (EN ? en : fr);

  /* ---- menu de langue, en haut du site ---- */
  const wrap = document.querySelector(".wrap");
  if (wrap) {
    const bar = document.createElement("div");
    bar.className = "langbar";
    bar.setAttribute("role", "group");
    bar.setAttribute("aria-label", EN ? "Language" : "Langue");
    bar.innerHTML = [["fr", "FR", "Français"], ["en", "ENG", "English"]]
      .map(([k, t, name]) => `<button type="button" data-lang="${k}" lang="${k}" title="${name}" aria-pressed="${k === lang}" class="${k === lang ? "on" : ""}">${t}</button>`).join("");
    bar.addEventListener("click", e => {
      const b = e.target.closest("[data-lang]");
      if (!b || b.dataset.lang === lang) return;
      store.set(b.dataset.lang);
      const q = new URLSearchParams(location.search);
      q.set("lang", b.dataset.lang);
      location.replace(location.pathname + "?" + q.toString());
    });
    wrap.insertBefore(bar, wrap.firstChild);
  }

  if (!EN) return;

  /* ---- textes fixes de index.html ---- */
  document.documentElement.lang = "en";
  document.title = "TierTrack — T0 / T0.5 tracker · WoW Forever";
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.content = "Track your T0 and T0.5 sets on WoW Forever: checklist, BiS, raid attunements and player ranking.";

  const all = (sel, fn) => document.querySelectorAll(sel).forEach(fn);
  const html = (sel, v) => all(sel, el => { el.innerHTML = v; });
  const text = (sel, v) => all(sel, el => { el.textContent = v; });
  const attr = (sel, a, v) => all(sel, el => el.setAttribute(a, v));
  const list = (sel, values) => document.querySelectorAll(sel).forEach((el, i) => { if (values[i] !== undefined) el.innerHTML = values[i]; });

  attr("#newsBox", "aria-label", "What's new");

  // accueil
  html(".login .lead", 'Track your <b style="color:var(--gold)">T0</b> and <b style="color:var(--gold)">T0.5</b> set progress · WoW Forever EU<br>Enter your character name, then pick its class and faction.');
  list(".login .field label", ["Character name", "Class", "Faction"]);
  attr("#inName", "placeholder", "Name");
  text("#goBtn", "Track my progress");
  html("#ownedBox .chk", 'This character already exists. If it is yours from another browser, paste your <b>recovery code</b> (“Materials &amp; gold” tab → Backup). Otherwise, choose another name.');
  attr("#inCode", "placeholder", "Recovery code");
  text("#codeBtn", "Recover my character");
  text("#seeRank", "View the ranking");
  text("#seeGuest", "👀 Visit the site without a character");
  text("#cancelAdd", "← Back to my characters");
  text(".login p.center", "No personal data: only the character name, class, faction and progress are saved.");
  html("#screen-rank h2", 'T0 / T0.5 ranking <small><button class="linkbtn" id="backLogin">← Back</button></small>');

  // application
  html(".who .brand", '❮ TierTrack ❯ <span style="color:var(--dim);font-weight:500;font-size:13px">· T0 / T0.5 tracker</span>');
  text("#switchBtn", "My characters");
  list(".hero .big .l", ["T0", "T0.5", "Quest chain", "BiS"]);
  const tabs = { profile: "Profile", quest: "T0.5 quest chain", raids: "Raid attunements", mats: "Materials &amp; gold", farm: "Reputation farm", rank: "Ranking", maj: "WoW updates" };
  Object.keys(tabs).forEach(k => html(`#tabs [data-v="${k}"] .tl`, tabs[k]));
  all("#v-t0 .stack h2, #v-t05 .stack h2", el => { el.textContent = el.textContent === "Bonus de set" ? "Set bonuses" : "Info"; });
  list("#v-quest .stack h2", ["Components", "Required dungeons", "To check in game"]);
  text("#qall", "Check all");
  text("#qnone", "Uncheck all");

  // matériaux
  html("#v-mats .grid > .panel > h2", 'What you need to gather <small id="msum"></small>');
  html("#v-mats .grid > .panel > .chk", 'Items are sorted <b>by quest</b>, in chain order. For each one, type how many you already have in the box: the row turns green when you have enough. Click a row to mark it as ready.');
  list("#v-mats .stack h2", ["Gold needed <small>gold pieces (g)</small>", "Backup"]);
  text("#exp", "Export");
  text("#imp", "Import");
  text("#rst", "Reset everything");
  text("#showCode", "Show my recovery code");
  text("#delChar", "Delete my character");

  // BiS, profil, classement
  html("#v-bis h2", "Best in Slot <small>Pre Raid Forever lists · choose your specialization</small>");
  text("#v-bis .panel > .chk", "Click a row to check it off once you own the BiS for that slot. Names, icons and item levels: Wowhead Forever. BiS choices: Forever “Pre Raid” lists (wowtbc.gg), to be confirmed in game.");
  html("#v-profile h2", "My characters <small>specialization, switching character</small>");
  text("#v-profile .chk", "Add several characters and set their specialization: the BiS lists depend on it. Each character keeps its own progress.");
  html("#v-rank h2", "T0 / T0.5 ranking <small>most advanced on top</small>");

  // pied de page
  html(".sf-col p:not(.sf-ver)", "Personal project to track T0 / T0.5 sets on <b>WoW Forever</b>.");
  text("#openNews", "What's new");
  text(".legal summary", "Legal notice");
  list(".legal-body p", [
    '<b>Publisher:</b> Twiikz, private individual, personal, non-commercial and free project. Contact: <a target="_blank" rel="noopener" href="https://x.com/TierTrackWoW">@TierTrackWoW</a> on X.',
    "<b>Hosting:</b> GitHub Pages (GitHub, Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, United States). <b>Database:</b> Supabase, Europe region (Paris).",
    "<b>Personal data:</b> only the character name you type, its class, faction, specialization and your progress are saved, so you can find your tracking again and to feed the public ranking. No account, e-mail or password is required, and there is no advertising. Anonymous traffic statistics (page views, tabs opened, device type, referring site) are measured without cookies, without IP address and without any link to your character; your browser's “Do Not Track” setting is respected. A recovery code is kept in your browser (local storage) to protect your character. You can delete a character from the Profile tab: its data is then removed from the database. For any question or request (access, deletion), write on X.",
    "<b>Third-party services:</b> item and quest tooltips are loaded from Wowhead (wow.zamimg.com), which may receive your IP address for that purpose.",
    "<b>Intellectual property:</b> World of Warcraft, WoW Forever and the game names, images and data are the property of Blizzard Entertainment, Inc. TierTrack is an independent fan project, not affiliated with Blizzard Entertainment, Wowhead or the other third-party sites mentioned.",
    "<b>Liability:</b> the information comes from pre-release game data and may change. It is provided as is, with no guarantee of accuracy or availability. Always check in game.",
  ]);
})();
