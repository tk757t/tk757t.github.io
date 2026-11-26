// Version anglaise des données affichées. Ne fait rien en français.
// À chaque ajout dans maj.js, news.js, raids.js ou farm-data.js : ajouter la traduction ici.
(function () {
  "use strict";
  window.TIER_D = {};
  window.D = s => window.TIER_D[s] || s; // dictionnaire : noms français utilisés comme clés de sauvegarde
  if (window.TIER_LANG !== "en") return;
  const N = window.TIER_EN_NAMES;

  /* ============ objets de la chaîne T0.5 ============ */
  Object.assign(window.TIER_D, {
    "Poignets T0 (étape 1)": "T0 Wrist (step 1)",
    "Distillateur ectoplasmique (étape 3)": "Ectoplasmic Distiller (step 3)",
    "Bâtonnet élémentaire de corruption (non confirmé)": "Fel Elemental Rod (unconfirmed)",
    "Echantillon de venin de Silithus": "Silithus Venom Sample",
    "Echantillon de sang de Berceau-de-l'Hiver": "Winterspring Blood Sample",
    "Ectoplasme brûlé (Silithus)": "Scorched Ectoplasm (Silithus)",
    "Ectoplasme glacé (Berceau-de-l'Hiver)": "Frozen Ectoplasm (Winterspring)",
    "Ectoplasme stable (Maleterres de l'est)": "Stable Ectoplasm (Eastern Plaguelands)",
    "Convertisseur d'arcanite délicat": "Delicate Arcanite Converter",
    "Essence éternelle supérieure": "Greater Eternal Essence",
    "Huile de pierre-écaille": "Stonescale Oil",
    "Cendre volcanique": "Volcanic Ash",
    "Coeur de magma (Bokk)": "Magma Core (Bokk)",
    "Barre de sombrefer": "Dark Iron Bar",
    "Cuir enchanté": "Enchanted Leather",
    "Etoffe lunaire": "Mooncloth",
    "Peau robuste traitée": "Cured Rugged Hide",
    "Perle de guerre ogre": "Ogre Warbeads",
    "Essence de spectre railleur": "Jeering Spectre's Essence",
    "Rune ténébreuse": "Dark Rune",
    "Grand éclat brillant": "Large Brilliant Shard",
    "Incendicite d'Incendius": "Incendicite of Incendius",
    "Braise du prophète ardent": "Ember of Emberseer",
    "Cendre d'Asharell": "Cinder of Cynders",
    "Brasero béni (Aube d'argent Honoré)": "Hallowed Brazier (Argent Dawn Honored)",
    "Relique de Brise-stellaire": "Starbreeze Village Relic",
    "Restes druidiques": "Druidical Remains",
    "Epée brillante de fanatisme": "Brilliant Sword of Zealotry",
    "Cendres d'âme de banni": "Soul Ashes of the Banished",
    "Varech de sang": "Bloodkelp",
    "Brassards blackrock": "Blackrock Bracers",
    "Flacon de pouvoir suprême": "Flask of Supreme Power",
  });

  /* ============ chaîne de quêtes T0.5 ============ */
  // {giver} = PNJ de départ, {venom} = échantillons, {c1}/{c2} = composants de classe, {w1}/{w2} = où, {s2}/{s1} = esprits
  window.TIER_EN_CHAIN = {
    phases: ["Start — {giver}", "Anthion Harmon — Stratholme / Dire Maul / BRD", "Bodley & the Lords of Flame — Blackrock Spire"],
    q1: ["An Earnest Proposition", "{npc}", "T0 Wrist + 20 g + 15 {venom}"],
    q2: ["A Supernatural Device", "Mux Manascrambler · Gadgetzan", "Pick up the sealed container"],
    q3: ["The Ectoplasmic Distiller", "Mux · Gadgetzan", "1 Delicate Arcanite Converter, 4 Greater Eternal Essence, 10 Stonescale Oil, 25 Volcanic Ash, 40 g"],
    q4: ["Hunting for Ectoplasm", "Silithus · Winterspring · Eastern Plaguelands", "12 Scorched Ectoplasm (Silithus) + 12 Frozen (Winterspring) + 12 Stable (Eastern Plaguelands)"],
    q5: ["A Portable Power Source", "Magma Lord Bokk · Burning Steppes", "Bring a Magma Core back to Mux"],
    q6: ["A Shifty Merchant", "Vi'el (imp) · entrance of Darkwhisper Gorge", "Get the Fel Elemental Rod (~40 g?)"],
    q7: ["Return to {npcName}", "{npc}", "Bring back the ghost revealer"],
    q8: ["Just Compensation", "{npc}", "T0 Waist + T0 Hands"],
    q9: ["In Search of Anthion", "Stratholme gate · Eastern Plaguelands", "Ghost revealer; find Anthion Harmon"],
    q10: ["Dead Man's Plea", "Stratholme", "Rescue Ysida Harmon from Baron Rivendare"],
    q11: ["Proof of Life", "Anthion · Eastern Plaguelands", "Take Ysida's Locket to Anthion"],
    q12: ["Anthion's Strange Request", "Anthion", "3 Dark Iron Bars, 20 Enchanted Leather, 3 Mooncloth, 4 Cured Rugged Hides"],
    q13: ["Anthion's Old Friend", "Falrin Treeshaper · Dire Maul library", "Deliver the Banner of Provocation"],
    q14: ["Falrin's Vendetta", "Dire Maul / Blackrock Spire", "25 Ogre Warbeads"],
    q15: ["The Instigator's Enchantment", "Falrin / Anthion", "1 Jeering Spectre's Essence, 4 Dark Runes, 8 Large Brilliant Shards"],
    q16: ["The Challenge", "Blackrock Depths · Ring of the Law", "Place the banner while High Justice Grimstone sentences you; kill Theldren and the gladiators; take the amulet to Anthion"],
    q17: ["Anthion's Parting Words", "Anthion", "T0 Feet + T0 Legs + T0 Shoulders", ],
    q18: ["Bodley's Unfortunate Fate", "Blackrock Spire entrance", "Ghost revealer → Bodley's ghost"],
    q19: ["Three Kings of Flame", "Blackrock Depths · Blackrock Spire · Duke of Cynders (Silithus)", "Incendicite of Incendius (BRD) + Ember of Emberseer (BRS) + Cinder of Cynders + Hallowed Brazier (Argent Dawn, Honored)"],
    q20: ["Components of Importance (1)", "{w1}", "{c1}"],
    q21: ["The Left Piece of Lord Valthalak's Amulet", "{s1}", "Brazier of Beckoning → summon the spirit and kill it"],
    q22: ["I See Alcaz Island In Your Future...", "Alcaz Island · Dustwallow Marsh", "20 Bloodkelp"],
    q23: ["More Components of Importance (2)", "{w2}", "{c2}"],
    q24: ["The Right Piece of Lord Valthalak's Amulet", "{s2}", "Brazier of Beckoning → summon the spirit and kill it"],
    q25: ["Final Preparations", "Bodley", "40 Blackrock Bracers + 1 Flask of Supreme Power"],
    q26: ["Mea Culpa, Lord Valthalak", "Upper Blackrock Spire · The Beast's lair", "Summon Valthalak, use the amulet on the corpse"],
    q27: ["Return to Bodley", "Bodley", "Hand in the brazier → Brazier of Beckoning"],
    q28: ["Back to the Beginning", "{npc}", "Return to where it all started"],
    q29: ["Saving the Best for Last", "{npc}", "T0 Head + T0 Chest"],
  };

  /* ============ sets T0 / T0.5 ============ */
  const SET_NAMES = {
    druid: ["Wildheart Raiment", "Feralheart Raiment"], hunter: ["Beaststalker Armor", "Beastmaster Armor"], mage: ["Magister's Regalia", "Sorcerer's Regalia"],
    paladin: ["Lightforge Armor", "Soulforge Armor"], priest: ["Vestments of the Devout", "Vestments of the Virtuous"], rogue: ["Shadowcraft Armor", "Darkmantle Armor"],
    shaman: ["The Elements", "The Five Thunders"], warlock: ["Dreadmist Raiment", "Deathmist Raiment"], warrior: ["Battlegear of Valor", "Battlegear of Heroism"],
  };
  const spellDmg = n => `Increases damage and healing done by magical spells and effects by up to ${n}.`;
  // les textes de bonus sont reconnus par leur début, les nombres sont repris du texte français
  const bonus = fr => {
    const t = fr.replace(/’/g, "'").replace(/\s+/g, " ");
    const n = (re, i) => (t.match(re) || [])[i || 1];
    if (/à toutes les résistances/.test(t)) return "+8 to all resistances.";
    if (/^Augmente les dégâts et les soins produits par les sorts/.test(t)) return spellDmg(n(/de (\d+) au maximum/));
    if (/à la puissance d'attaque/.test(t)) return `+${n(/\+(\d+)/)} Attack Power.`;
    if (/votre vitesse de déplacement/.test(t)) return "When struck in combat, 5% chance to increase your movement speed by 10% for 8 sec. Can only happen once every 60 sec.";
    if (/200 points de mana et les attaques en mêlée/.test(t)) return "Chance on spell cast to restore 200 mana, and on melee attack to restore 20 energy over 5 sec. Being attacked in melee also has a chance to generate 10 rage.";
    if (/^Rend 8 points de mana/.test(t)) return "Restores 8 mana every 5 sec.";
    if (/^Lorsque vous êtes touché en combat/.test(t)) return "When struck in combat, chance to gain 300 mana, 10 rage or 40 energy. (Proc chance: 2%)";
    if (/^\+200 à l'Armure/.test(t)) return "+200 Armor.";
    if (/effet d'immobilisation/.test(t)) return "When struck in combat, 8% chance to dispel an immobilizing effect on you. Can only happen once every 60 sec.";
    if (/attaques automatiques en mêlée et à distance/.test(t)) return "Your normal melee and ranged attacks have a 5% chance to give you 200 mana.";
    if (/attaques à distance normales/.test(t)) return "Your normal ranged attacks have a 4% chance to restore 200 mana.";
    if (/immobiliser le personnage assaillant/.test(t)) return "When struck in combat, 2% chance to immobilize the attacker for 3 sec. Can only happen once every 60 sec.";
    if (/^Vos incantations de sorts ont 5 %/.test(t)) return "Your spell casts have a 5% chance to give you 200 mana.";
    if (/réduire au silence/.test(t)) return "When struck by a harmful spell, 7% chance to silence the caster for 3 sec. Can only happen once every 60 sec.";
    if (/attaques automatiques de mêlée et des incantations/.test(t)) return "Chance on melee auto-attack and spell cast to increase your damage and healing done by magical spells and effects by up to 65 for 10 sec.";
    if (/^Chances lors des attaques de mêlée d'augmenter/.test(t)) return "Chance on melee attack to increase damage and healing done by magical spells and effects by up to 65 for 10 sec.";
    if (/bouclier protecteur/.test(t)) return "When struck in combat, 2% chance to gain a protective shield that absorbs 488 damage. Can only happen once every 60 sec.";
    if (/effet de ralentissement/.test(t)) return "When struck in combat, 5% chance to dispel a slowing effect on you. Can only happen once every 60 sec.";
    if (/récupérer 20 points d'énergie/.test(t)) return "Chance on melee attack to restore 20 energy.";
    if (/^Rend 15 points de vie/.test(t)) return "Restores 15 health every 5 sec.";
    if (/Désarmement au personnage/.test(t)) return "When struck in melee combat, 5% chance to disarm the attacker for 4 sec. Can only happen once every 60 sec.";
    if (/^Confère une chance lorsque vous lancez un sort/.test(t)) return "Chance on spell cast to increase your damage and healing by up to 65 for 10 sec. (Proc chance: 4%)";
    if (/sous l'effet de la peur/.test(t)) return "When struck in combat, 2% chance to make the attacker flee in fear for 2 sec. Can only happen once every 60 sec.";
    if (/270 à 330 points de vie/.test(t)) return "Your spell casts have a 5% chance to restore 270 to 330 health.";
    if (/en Force/.test(t)) return "+15 Strength.";
    if (/effet de désarmement/.test(t)) return "When struck in combat, 10% chance to dispel a disarm effect on you. Can only happen once every 60 sec.";
    if (/générer 10 points de rage/.test(t)) return "Chance on melee attack to restore 88 to 132 health and generate 10 rage.";
    if (/recevoir 88 à 132 points de vie/.test(t)) return "Chance on melee attack to gain 88 to 132 health.";
    return fr;
  };
  Object.entries(window.TIER_SETS.classes).forEach(([cls, set]) => {
    ["t0", "t05"].forEach((k, i) => {
      set[k].name = SET_NAMES[cls][i];
      set[k].bonuses = set[k].bonuses.map(b => [b[0], bonus(b[1])]);
      Object.values(set[k].items).forEach(it => { it.fr = it.en; });
    });
  });

  /* ============ BiS et sources ============ */
  const EXTRA = { 10020: "Stormcloth Vest", 10039: "Stormcloth Boots", 12970: "General's Ceremonial Plate", 14550: "Bladebane Armguards", 18023: "Blood Ruby Pendant", 18316: "Obsidian Bauble", 19989: "Tome of Devouring Shadows", 21135: "Assassin's Throwing Axe", 22230: "Frightmaw Hide", 22273: "Moonshadow Hood" };
  const BIS = window.TIER_BIS;
  Object.entries(BIS.items).forEach(([id, it]) => { it[0] = N.bis[id] || EXTRA[id] || it[0]; });
  Object.values(BIS.specs).forEach(specs => Object.entries(specs).forEach(([key, s]) => { s.fr = key; }));
  window.TIER_SOURCES = N.sources;

  /* ============ textes de quêtes (T0.5) ============ */
  const MANUAL_R = { "Cendre d’Asharell": "Cinder of Cynders", "Brassards rochenoires": "Blackrock Bracers" };
  const fixLine = x => x.replace(/^(.+?)( x \d+)?$/, (m, a, b) => (MANUAL_R[a] || a) + (b || ""));
  const walk = o => {
    if (!o || typeof o !== "object") return;
    if (o.id && o.d !== undefined) {
      const e = N.quests[o.id];
      if (e) { o.d = e.d; o.r = e.r.map(fixLine); }
      return;
    }
    Object.values(o).forEach(walk);
  };
  walk(window.TIER_QUESTS);

  /* ============ préparations de raid ============ */
  const PHASES = {
    "Burning Steppes — Helendis & Les véritables maîtres": "Burning Steppes — Helendis & The True Masters",
    "Maréchal Windsor — Profondeurs de Blackrock": "Marshal Windsor — Blackrock Depths",
    "Hurlevent — La grande mascarade": "Stormwind — The Great Masquerade",
    "Le dernier objectif — Drakkisath": "The final objective — Drakkisath",
    "Chef de guerre Goretooth & Orgrimmar": "Warlord Goretooth & Orgrimmar",
    "Rexxar & Myranda la Mégère": "Rexxar & Myranda the Hag",
    "Brandeguerre & l'épreuve des crânes": "Emberstrife & the Test of Skulls",
  };
  const outdoor = ["Outdoor elite: bring a group."];
  const RAID = { // id: [lieu, astuces]
    4182: ["Helendis Riverhorn · Morgan's Vigil (Burning Steppes)", ["Black broodlings, dragonspawn, wyrmkin and drakes are found in the Burning Steppes, around Blackrock Spire."]],
    4183: ["Magistrate Solomon · Lakeshire (Redridge)", []],
    4184: ["Highlord Bolvar Fordragon · Stormwind Keep", []],
    4185: ["Lady Katrana Prestor, then Bolvar · Stormwind Keep", []],
    4186: ["Magistrate Solomon · Lakeshire (Redridge)", []],
    4223: ["Marshal Maxwell · Morgan's Vigil (Burning Steppes)", []],
    4224: ["Ragged John (cave to the north), then Maxwell · Burning Steppes", []],
    4241: ["Blackrock Depths · prison (Windsor)", ["Dungeon: Blackrock Depths (BRD). Windsor is in the cells of the Detention Block."]],
    4242: ["Marshal Maxwell · Morgan's Vigil", ["There is no immediate follow-up: the chain resumes with an item that drops in Blackrock Depths."]],
    4264: ["Blackrock Depths · item from the monsters, then Windsor", ["The item that starts the quest is not guaranteed to drop from the first monster: expect a few fights."]],
    4282: ["Blackrock Depths · General Angerforge and Golem Lord Argelmach", ["Get the two pieces of information from Angerforge and Argelmach, then bring them to Windsor."]],
    4322: ["Blackrock Depths · Windsor escort, then Maxwell", ["Escort: clear the way before starting the event, stay close to Windsor and talk to him at the end before leaving."]],
    6402: ["Squire Rowe · Stormwind gates", []],
    6403: ["Stormwind · follow Reginald Windsor", ["Stay close to Windsor to get credit. If he is not there, talk to Squire Rowe again."]],
    6501: ["Bolvar Fordragon (Stormwind), then Haleh · Winterspring (location to be confirmed)", ["Sources disagree: check your quest log for where to find Haleh before travelling."]],
    6502: ["Upper Blackrock Spire · General Drakkisath, then Haleh", ["Dungeon: Upper Blackrock Spire (UBRS). The blood drops from Drakkisath; take it to Haleh to receive the Drakefire Amulet."]],
    4903: ["Warlord Goretooth · Kargath (Badlands)", ["Dungeon: Lower Blackrock Spire (LBRS). Blizzard's announcement calls the official start “Blood and Thunder”, but the database begins with “Warlord's Command”."]],
    4941: ["Eitrigg then Thrall · Orgrimmar (Thrall's chamber)", []],
    4974: ["Upper Blackrock Spire · Rend Blackhand, then Thrall", ["Rend Blackhand is in Upper Blackrock Spire (UBRS), despite the “lower” in the official announcement."]],
    6566: ["Thrall · Orgrimmar", ["Listen to all of Thrall's dialogue: the follow-up only opens afterwards."]],
    6567: ["Rexxar · Desolace roads (between Stonetalon and Feralas)", ["Rexxar patrols: look for him along the roads rather than at a fixed spot."]],
    6568: ["Myranda the Hag · Western Plaguelands", []],
    6569: ["Upper Blackrock Spire · black dragonspawn, then Myranda", ["Myranda then gives you the Amulet of Draconic Subversion, used to talk to Emberstrife (not the final Drakefire Amulet)."]],
    6570: ["Emberstrife · Wyrmbog (Dustwallow Marsh)", ["Wear the Amulet of Draconic Subversion before talking to him."]],
    6582: ["Scryer · Winterspring", outdoor],
    6583: ["Somnus · Swamp of Sorrows", outdoor],
    6584: ["Chronalis · Caverns of Time (Tanaris)", outdoor],
    6585: ["Axtroz · near Grim Batol (Wetlands)", outdoor],
    6601: ["Rexxar · Desolace", []],
    6602: ["Upper Blackrock Spire · General Drakkisath, then Rexxar", ["Dungeon: Upper Blackrock Spire (UBRS). Take the blood to Rexxar to receive the Drakefire Amulet."]],
  };
  (window.TIER_RAIDS || []).forEach(r => {
    if (r.id === "onyxia") {
      r.zone = "Dustwallow Marsh";
      r.reward = "Drakefire Amulet";
      r.intro = "To enter Onyxia's Lair, every raider must have their own Drakefire Amulet in their bags (no need to wear it). The chain is different for each faction.";
      r.checks = [
        "Forever raids open on December 9, 2026 (Blizzard announcement, to be confirmed). Finish the chain before the first raid night.",
        "Fire resistance is recommended for Onyxia, but it is not a second entry requirement.",
        "Pre-release: the exact order may differ in game. Always follow your quest log.",
      ];
    }
    Object.values(r.chains).forEach(chain => chain.forEach(ph => {
      ph[0] = PHASES[ph[0]] || ph[0];
      ph[1].forEach(s => {
        const e = N.quests[s.id], m = RAID[s.id];
        if (e) { s.n = e.n || s.n; s.d = e.d; s.r = e.r; }
        if (m) { s.loc = m[0]; s.tips = m[1]; }
      });
    }));
  });

  /* ============ farm réputation ============ */
  const PROF = { Alchimie: "Alchemy", Couture: "Tailoring", Forge: "Blacksmithing", "Ingénierie": "Engineering", "Travail du cuir": "Leatherworking" };
  const ZONES = {
    "Azshara": ["Azshara", "Flight: Valormok."],
    "Berceau-de-l'Hiver": ["Winterspring", "Flight: Everlook."],
    "Mont Hyjal": ["Mount Hyjal", "Flight to Mount Hyjal."],
    "Reflet-de-Lune": ["Moonglade", "Through the Timbermaw tunnel."],
    "Gangrebois": ["Felwood", "Flight: Bloodvenom Post."],
    "Orneval": ["Ashenvale", "Flight: Splintertree Post."],
    "Les Serres-Rocheuses": ["Stonetalon Mountains", "Flight: Sun Rock Retreat."],
    "Désolace": ["Desolace", "Flight: Shadowprey Village."],
    "Féralas": ["Feralas", "Flight: Camp Mojache."],
    "Silithus": ["Silithus", "Flight: Cenarion Hold."],
    "Cratère d'Un'Goro": ["Un'Goro Crater", "Flight: Marshal's Refuge."],
    "Tanaris": ["Tanaris", "Flight: Gadgetzan."],
    "Mille pointes": ["Thousand Needles", "Flight: Freewind Post."],
    "Marécage d'Âprefange": ["Dustwallow Marsh", "Flight: Brackenwall Village."],
    "Maleterres de l'ouest": ["Western Plaguelands", "On foot from Undercity."],
    "Maleterres de l'est": ["Eastern Plaguelands", "On foot, or fly to Light's Hope Chapel."],
    "Les Hinterlands": ["The Hinterlands", "Flight: Revantusk Village."],
    "Contreforts de Hautebrande": ["Hillsbrad Foothills", "Flight: Tarren Mill."],
    "Montagnes d'Alterac": ["Alterac Mountains", "On foot from Tarren Mill."],
    "Hautes-terres d'Arathi": ["Arathi Highlands", "Flight: Hammerfall."],
    "Les Paluns": ["Wetlands", "On foot from Arathi across the Thandol Span."],
    "Terres ingrates": ["Badlands", "Flight: Kargath."],
    "Gorge des Vents brûlants": ["Searing Gorge", "Flight: Thorium Point."],
    "Steppes Ardentes": ["Burning Steppes", "Flight: Flame Crest."],
    "Riverglades": ["Riverglades", "Flight: Rog'mar."],
    "Marais des Chagrins": ["Swamp of Sorrows", "Flight: Stonard."],
    "Terres foudroyées": ["Blasted Lands", "On foot from Stonard."],
    "Défilé de Deuillevent": ["Deadwind Pass", "On foot from the Swamp of Sorrows."],
    "Bois de la pénombre": ["Duskwood", "On foot through Deadwind Pass."],
    "Vallée de Strangleronce": ["Stranglethorn Vale", "On foot from Duskwood, or fly to Grom'gol."],
  };
  (window.TIER_FARM || []).forEach(R => {
    if (R.id === "dsl") R.name = "Durotar Supply and Logistics";
    R.writs.forEach(w => {
      w.n = N.farmItems[w.i] || w.n;
      w.p = w.p.split(" / ").map(p => PROF[p] || p).join(" / ");
    });
    R.writs.sort((a, b) => a.p.localeCompare(b.p, "en") || b.r - a.r || a.n.localeCompare(b.n, "en"));
    R.routes.forEach(c => {
      if (c.id === "kal") c.start = "Start in Orgrimmar. Loop: north-east, then north, then down the west side and back through the south-east. Finish with your hearthstone.";
      if (c.id === "ek") { c.name = "Eastern Kingdoms"; c.start = "Start in Undercity. Work your way from north to south; at the end, the Grom'gol zeppelin takes you back to Orgrimmar or Undercity."; }
      c.zones.forEach(z => {
        const t = ZONES[z.name];
        if (t) { z.name = t[0]; z.how = t[1]; }
        z.npcs.forEach(n => { n.name = N.farmNpcs[n.id] || n.name; });
      });
    });
  });
})();
