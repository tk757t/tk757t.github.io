// Version anglaise de « Nouveautés » (news.js) et « Maj WoW » (maj.js). Même ordre, mêmes versions et dates.
// Une entrée ajoutée dans news.js ou maj.js sans traduction ici s'affiche en français.
(function () {
  "use strict";
  if (window.TIER_LANG !== "en") return;

  const NEWS = {
    "1.14.0": ["The site is now available in English", [
      ["🌍 Language menu FR / ENG", "At the top of the page: switch the whole site between French and English. Your progress is the same in both languages."],
      ["👀 Visit without a character", "From the home screen, browse the whole site by just picking a class and a faction. Nothing is saved."],
    ]],
    "1.13.0": ["Reputation farm: Craftsman's Writs", [
      ["⭐ New “Reputation farm” tab", "For Durotar Supply and Logistics: every Craftsman's Writ, the item to buy at the auction house, the reputation gained and the NPC to hand it to."],
      ["🗺 Route by continent", "NPCs are sorted by continent and zone, in visiting order. Tick “I have it” on your writs to show only your stops for the day."],
    ]],
    "1.12.0": ["WoW update history", [["📰 New “WoW updates” tab", "Every WoW: Forever update and hotfix since launch (November 4), sorted by date in drop-down menus, with details by category (classes, dungeons, items, professions, quests…)."]]],
    "1.11.0": ["BroForever becomes TierTrack", [["🌍 Open to all players", "The site is now called TierTrack and is meant for every WoW Forever player, with no notion of guild. The ranking now compares all players of the site."]]],
    "1.10.0": ["Where to find every BiS item", [["🗺 How to get each item (BiS tab)", "Every BiS and every alternative now says how to get it: boss and dungeon with drop rate, quest, profession, reputation, PvP, world drop or tier set. Sources come from Forever game data."]]],
    "1.9.0": ["Profile as home page", [["🏠 Profile becomes the home page", "It is now at the top of the menu and opens first."]]],
    "1.8.0": ["Raid attunements: Onyxia", [
      ["🐉 New “Raid attunements” tab", "Follow your attunement chain to enter Onyxia's Lair: every quest up to the Drakefire Amulet, matched to your faction (Alliance or Horde)."],
      ["📖 Details for each quest", "Click a step to see the official text (Wowhead Forever), the location, the dungeon to plan and some tips. Check steps off as you go: they are saved with your character."],
      ["➕ More raids soon", "Attunements for the next raids will be added in the same place."],
    ]],
    "1.7.0": ["Detailed quest chain", [
      ["📖 Click a step to expand it", "Official quest text (Wowhead Forever) matched to your class and faction, items to bring, location, T0 → T0.5 exchange and tips."],
      ["☑ Separate checkbox", "The box on the left marks the step as done; clicking elsewhere on the step opens or closes its details."],
      ["✅ Third Lord of Flame confirmed", "The “Three Kings of Flame” step asks for the Cinder of Cynders: the contradiction between guides is settled."],
    ]],
    "1.6.0": ["Update alert", [
      ["🔔 New version available", "If you keep the site open, a small bubble tells you as soon as an update is online, with a button to reload (your progress is saved first)."],
      ["✨ What's new and version", "This window opens at each update. The version number and the “What's new” link are at the bottom of the page."],
    ]],
    "1.5.0": ["Profile, BiS and a new look", [
      ["👤 New Profile page", "Manage all your characters in one place: add some, switch between them and set each one's specialization (BiS depend on it)."],
      ["⚔ BiS page", "The best items for each slot for your specialization, with their alternatives. Check them off as you go."],
      ["🎭 Class portraits", "Your class icon is shown next to your name, in the ranking and on member sheets."],
      ["🧭 Left menu", "Column navigation with icons, and a clearer, more readable design."],
      ["🏆 Ranking sheets", "Click a name in the ranking to see that player's progress."],
    ]],
  };
  (window.TIER_NEWS || []).forEach(e => {
    const t = NEWS[e.v]; if (!t) return;
    e.title = t[0];
    e.items = t[1].map(([a, b]) => ({ t: a, d: b }));
  });

  const MAJ = {
    "25 novembre 2026": ["November 25, 2026", "Hotfixes", [
      ["Classes — Druid", [
        "Hurricane now deals its last hit.",
        "Balance: Improved Wrath becomes Starlight Wrath and also reduces Starfire's cast time by 0.1 to 0.5 sec.",
        "Improved Moonfire becomes Moon and Stars: Starfire also has a 50/100% chance not to lose casting time when you take damage.",
        "Improved Starfire is now a 2-point talent (instead of 5), with an 8/15% chance. If you had 3 points or more in it, all your talents are reset.",
        "Eclipse also permanently increases Wrath's critical strike chance by 7/13/20%.",
        "Moonfury is replaced by Dreamstate: you receive 20/40/60/80/100% of Innervate's effects when you cast it on someone else.",
        "Moonkin Form also increases Arcane and Nature damage by 10%.",
        "Genesis now increases Hurricane damage and Tranquility healing."]],
      ["Classes — others", [
        "Hunter: pets had no critical strike chance on their basic melee attacks; fixed.",
        "Beast Mastery Hunter: summoned Hawks attack their target even when the pet is on Passive, attack your current target when idle, are dismissed with Dismiss Pet or by right-clicking their icon, and no longer lose about 5% critical strike.",
        "Paladin: Judgements below 20 sec are now refreshed by your attacks; Exorcism can critically strike. Holy: the Holy oath of Light lasts 60 minutes.",
        "Rogue: all poisons and Blinding Powder are temporarily Bind on Pickup (while a bug is being fixed). Poised is now removed after Sap or Distract while stealthed.",
        "Shaman: Chain Lightning now consumes Clearcasting, even with 5 Maelstrom Weapon charges.",
        "Warlock: pets had no melee critical strike chance; fixed. Succubus and Incubus had 5% too much critical strike.",
        "Arms Warrior: the Weapon Master talent is reapplied after dying in a battleground."]],
      ["Dungeons", [
        "Blackfathom Deeps: the altar of the depths becomes usable again after 3 sec and now grants the Blessing of Blackfathom.",
        "Temple of Atal'Hakkar: the Avatar of Hakkar should no longer refuse to appear."]],
      ["Monsters & NPCs", [
        "Desolace: Magram village centaurs respawn faster.",
        "Duskwood: the Lost Knight no longer appears inside a tree.",
        "Riverglades: Clubtoe (Sunnyglade) no longer flags you for PvP."]],
      ["Items", [
        "Unerring Purpose sells for more than 2 copper.",
        "The Storm Totem is renamed Totem of the Maelstrom.",
        "Shahram's black blade now grants its haste bonus, to its wielder only.",
        "The Libram of Law now works on Judgement of Command.",
        "The Chained Essence of Eranikus no longer goes through immunities.",
        "The Blackhand's Breadth trinket can no longer be resisted.",
        "The Nightwatcher's Torch can again be used while mounted, casting, etc."]],
      ["Legacy system", [
        "PvP Legacy achievements are now credited after reaching Exalted.",
        "Completing “Lord Valthalak Laid to Rest” now grants Legacy credit.",
        "Reinforce now reduces durability loss by 8/16/24/32/40%.",
        "The Quick and the Dead now makes Shadowform, Moonkin Form, Travel Form and Trueshot Aura free."]],
      ["PvP — Alterac Valley", [
        "Blizzard's goal: encourage taking objectives instead of rushing the general.",
        "Killing the enemy general gives much less reputation and honor. Towers, graveyards and mines give more reputation and a bit more honor.",
        "More reputation from killing enemy NPCs, and much more from lieutenants.",
        "The “long game” bonus triggers at 20 minutes (instead of 60).",
        "All enemy creatures have more damage and health.",
        "Marshals and warmasters no longer leave their room and detect you from further away.",
        "Generals, marshals and warmasters have a 20-minute reinforcement buff with 4 charges; each objective taken removes a charge.",
        "Generals hit harder, detect stealth better, and some defend better as intended.",
        "Storm Crystals and other unlooted quest items are no longer sent by mail."]],
      ["Professions", ["Enchanting: Revelation no longer rolls its proc on each target of an area spell (once per wave) and no longer affects the whole duration of channeled spells."]],
      ["Reputations & mounts", [
        "Gnomes, humans, night elves and dwarves can no longer go to war with the Kirin Tor. Dwarves cannot with the Wildhammer Clan either.",
        "Paladins and warlocks receive Journeyman riding by completing “Justice and Retribution” (Forsaken paladins), “Judgment and Redemption” (dwarf and human paladins) or “Dreadsteed of Xoroth” (warlocks).",
        "Quest already done? Learn it for free from: Danitha Morr (Bandarion Keep, Forsaken paladins), Lord Grayson Shadowbreaker (Stormwind Cathedral), Zevrost (Cleft of Shadow, Orgrimmar) or Ursula Deline (The Slaughtered Lamb, Stormwind)."]],
      ["Quests", [
        "Mount Hyjal: the Explosive Runic Shard no longer inflates the Felguard's Mortal Strike in “Blind Vengeance”.",
        "Hunter (Horde): “Saving the Best for Last” can be completed.",
        "Silithus: Encrypted Twilight Texts drop again for “Secret Communication”, “True Believers” and “Still Believing”. The repeatable version (Cenarion Circle reputation) is intentionally still unavailable.",
        "Searing Gorge: no more missing Steamsmiths for the quest “STOLEN: Smithing Tuyere and Lookout's Spyglass”.",
        "Western Plaguelands: the Scarlet illusion from “Scarlet Subterfuge” lasts 1 hour (instead of 30 minutes)."]],
    ]],
    "23 novembre 2026": ["November 23, 2026", "Hotfixes", [
      ["Classes", [
        "Druid: the Feralheart 4-piece bonus now gives 4 energy every second for 5 seconds.",
        "Priest: Mind Vision no longer triggers effects. Shadow: Dark Inspiration grants the correct Spirit bonus through Mind Flay; Smite is usable in Shadowform.",
        "Destruction Warlock: Intensity works on Incinerate.",
        "Warrior: Mortal Strike can no longer be used without the talent (it stays in the spellbook but requires the talent point)."]],
      ["Dungeons", ["Uldaman: the Obsidian Sentinel drops its loot as intended."]],
      ["Items", ["The Rogue's hood no longer has a required level."]],
      ["Professions", [
        "Cooking: Boiled Clams, Clam Chowder, Goblin Deviled Clams, Giant Clam Scorcho, Undermine Clam Chowder and Clam Linguine give the correct “Well Fed” buffs and are listed under “Stamina food”. Murloc Fin Soup is upgraded by one tier.",
        "Engineering: the Goblin and Gnomish renewal gifts no longer show as question marks. Learning the Goblin Mortar also teaches “The Mortar: Reloaded”.",
        "Leatherworking: the Centaur hoof warmer pattern can be learned."]],
      ["Quests", [
        "Riverglades: Dunston Willis runs toward the end of “Dunston Checks Out” again.",
        "Wetlands: “For Further Study” now has rewards. “Uncovering the Past” and “Gleaning Our Future” grant Ironforge reputation."]],
      ["Races & spells", [
        "Wisp form: can no longer be applied to a living player.",
        "Some spells and abilities triggered too many weapon procs: fixed.",
        "World Buffs no longer disappear when changing zone (they still disappear when entering a raid).",
        "Fengus' Ferocity and Darkmoon Faire buffs gave double the power: fixed."]],
    ]],
    "20 novembre 2026": ["November 20, 2026", "Hotfixes", [
      ["Classes", [
        "Combat Rogue: Blade Flurry now hits an additional target with Backstab damage.",
        "Demonology Warlock: the demonic aegis could remain on Demon Armor / Demon Skin after removing the talent; it is now removed."]],
      ["Dungeons", ["Each dungeon can only be reset and entered 5 times per hour (10 before).", "Blackrock Spire: a stone pillar no longer traps adventurers."]],
      ["Items", ["Stormshroud Armor: 3-piece bonus — 3% chance (4% before) to restore 18 energy (30 before) on melee attack."]],
      ["Professions", ["Toron Rockhoof repaired his forge and anvil at the Summit of Eternity: usable for blacksmithing and smelting."]],
      ["Quests & interface", [
        "Hinterlands: Witch Doctor Ti'ik drops several heads for groups.",
        "Feralas: the Perfect Yeti Hide no longer drops a second time. Tanaris: Gor'marok respawns faster. Riverglades: Dunston Willis no longer runs away mid-quest.",
        "Interface: some players saw fewer groups than expected in group finder."]],
    ]],
    "19 novembre 2026": ["November 19, 2026", "Hotfixes", [
      ["Camping", ["The Seed Hybridizer is re-enabled, with adjusted values and a chance of failure when combining seeds. Rare herb seeds can no longer be used in it."]],
      ["Classes", ["Retribution Paladin: Two-Handed Weapon Specialization increases all Holy damage while a two-handed weapon is equipped."]],
      ["Dungeons", ["City of Dalaran: the Shade of the Archmage no longer despawns when entering combat.", "Shaper's Terrace: Vitrix's Poison Shock deals less damage."]],
      ["Items", ["Unstable magic motes are Soulbound. The Squall-breaker Potion can be destroyed."]],
      ["Quests", [
        "Booty Bay: Rix Xizzix no longer wrongly grants access to a strange tome after “Rift Away”.",
        "Alterac Mountains: a new enchanted scroll can be obtained if the old one is destroyed. “Hunting for Ectoplasm” uses the correct creature type."]],
      ["Races", [
        "Skyborne: the 10% gold discount (Honored reputation) on apprentice and journeyman mounts at Genn Fairweather now applies.",
        "Tauren: Cultivation succeeds more often on herbs you have mastered and works with Purple Lotus."]],
      ["World", ["A silithid hive drone stuck under the world near the Rustmaul dig site: fixed. Mosh'gra (Riverglades) drops its rare loot again."]],
    ]],
    "17 novembre 2026": ["November 17, 2026", "Weekly maintenance", [
      ["Camping", ["You can no longer sleep on the Cozy Sleeping Bag while mounted. It is placed at precise spots (like hunter traps) and grants the rested aura in its area."]],
      ["Classes", ["Might of Stormwind and Warchief's Blessing always disappear on death and no longer apply to non-players.", "Shaman: Flurry no longer loses its charges when Windfury Totem attacks hit."]],
      ["Dungeons", ["Upper Blackrock Spire: enemy health and damage were too low; fixed. Bring a full and careful group."]],
      ["Items", [
        "Shadow priests can hold the Nightwatcher's Torch.",
        "Escape plan: range and damage fixed. Blizzard Staff and crackling staff have the same stats (25 Stamina, 25 Intellect, 74 Spell Power).",
        "Paladin: Soulforge Armor (upgraded dungeon tank set) gives Spell Power (instead of Strength)."]],
      ["Legacy & PvP", ["Component Savings no longer stops randomly.", "You cannot mount in the Warsong Gulch starting rooms. Alterac battle quests require level 58."]],
      ["Professions", [
        "Abandoned crate conversions and obsolete turn-in items fixed.",
        "Blacksmithing: “The Old Ways” gives the Orcish War Leggings plans through an item (replacement from Sumi if lost). The Bronze Mace is Bind on Equip and can go into the transmog collection.",
        "Herbalism: Cultivation works on Mageroyal. Weapon master skills (swords, axes, maces): interface bug fixed. Skinning: a few normally unskinnable creatures can no longer be skinned."]],
      ["Quests", [
        "Many quest fixes, including Shen'dralar: pylon repairs shared with the group, Heart of Crystal dropped for the whole group, miners: spectral iron ore appears more often.",
        "“Agamaggan's Blood” is no longer a dungeon quest: it is done in the elite area in front of Razorfen Downs."]],
      ["Interface", ["Ignore lists persist after logging out."]],
    ]],
    "16 novembre 2026": ["November 16, 2026", "Weekly maintenance", [
      ["Camping", ["The Fishing Rack gives lures to everyone. Bloated fish drop more often."]],
      ["Classes", [
        "Druid: Wild Growth ranks now have a cooldown. Balance: Genesis increases the damage of the Pounce bleed.",
        "Priest: Dark Inspiration no longer stacks with several Shadow priests in the same group. Vampiric Embrace heals for 10% of the caster's Shadow damage (20% before); the caster receives +100% healing from this effect. No change for a solo priest.",
        "Rogue: poison ranks cannot exceed the maximum rank. Backstabbing a target without your combo points no longer removes those on other targets.",
        "Shaman: Windfury Totem attacks no longer ignore armor and have an internal cooldown; they generate rage. Mutilate and Execute no longer try to trigger the totem. Enhancement: Maelstrom Weapon no longer benefits two casts; thundering strikes give their critical bonus with no weapon equipped.",
        "Warrior: the revered champion offers the Legacy of Valor. Fury: Unbridled Wrath triggers with Cleave and Heroic Strike; Flurry charges are not consumed by them; Reckless blows neither."]],
      ["Dungeons", [
        "Drowned City: Captain Dreadrise is no longer immune to stuns; his abyssal bubble can no longer block/dodge/parry. The rare “Pyromancer” Braxton behaves better in combat.",
        "Temple of Atal'Hakkar: Atal'alarion's serpent statues in the Pit of Refuse become inactive even if activated in the wrong order."]],
      ["Items & PvP", [
        "Formula: Boots - Speed (reputation) is Bind on Pickup. The scouting gloves work. The purple Tragan no longer breaks crowd control.",
        "Dying at the Arathi Basin gold mine no longer sends you to the Riverglades graveyard."]],
      ["Quests", ["Blood-red Bandana drop rate increased. Witch Doctor Zum'rah appears correctly. Scout prisoners: credit for the whole group. “Water Pouch Bounty” (repeatable) no longer gives XP. “The Return of the King?” no longer gets stuck."]],
    ]],
    "13 novembre 2026": ["November 13, 2026", "Hotfixes", [
      ["Classes", [
        "All: creature stuns on players (and vice versa) had no diminishing returns; fixed.",
        "Restoration Druid: Wild Growth can no longer be cast while moving; its healing coefficient is now 6.6% (3.3% before).",
        "Mage: Frost Nova is broken by damage from procs and Blizzard.",
        "Paladin: Judgement of Command triggers “on hit” effects and counts as a melee attack. Other Judgements remain ranged (seals are considered ranged attacks in WoW: Forever).",
        "Priest: “The Quick and the Dead” reduces the mana cost of Divine Spirit.",
        "Shaman: Windfury Totem triggers on all melee attacks (not off-hand only ones; their main-hand swing does).",
        "Warlock: Siphon Life rank 1 can no longer be cast while silenced. Warrior: Berserker Rage removes Sap."]],
      ["Dungeons", [
        "Killing enemies in a dungeon no longer gives XP to anyone if the enemy is trivial for at least one group member.",
        "Deadmines: Sneed is ejected correctly if his Shredder is stunned at 0%. Drowned City: non-boss enemies respawn after 2 hours (1 hour before). Stratholme: defeating Balnazzar counts for the legendary challenge “Master Spelunker”."]],
      ["World", ["Gnomeregan, Badlands, Eastern Plaguelands (no more unexpected aggro on resurrection), Mulgore (fewer battleboars and Venture Co. at the start), Blasted Lands (Nethergarde guards with no loot), Stranglethorn (more tigers, panthers, raptors), Zephras Isle (Nyalah Brightfire sells more cooking supplies)."]],
      ["Items", [
        "Gloves of holy power fixed (only triggered by harmful spells). Icebreaker Taran becomes a two-handed mace. Several stat fixes (Abomination Eye, shabby hat, souvenir seashell, blessed ring of light, etc.).",
        "Channeler's Ring: Spell Power (Spirit before). You can exchange the Blessed Ring of Light for the Channeler's Ring from Pix Xizzix (irreversible)."]],
      ["Quests & others", [
        "Many quest fixes (loot shared with the group, Pix Xizzix weekly dungeon quests removed at reset, etc.).",
        "Stranglethorn fishing: the weekly contest lets many more players win.",
        "Interface: action bar settings no longer reset at every logout with secondary talents."]],
    ]],
    "11 novembre 2026": ["November 11, 2026", "Hotfixes", [
      ["Classes", [
        "Feral Druid: Rend and Tear works on the Pounce bleed.",
        "Hunter: Volley no longer triggers procs and stops when you move.",
        "Paladin: Judgement is now a ranged attack (no longer counts as melee for item procs, uses ranged hit chance). Retribution: Unsealed Fury no longer creates echoes with Windfury Totem.",
        "Priest: the gnome confounding flash and Twilight Focus work in Shadowform. Shaman: Flametongue Totem rank 2 works again."]],
      ["Support", ["Item restoration service disabled while a critical bug is investigated."]],
      ["NPCs", ["Riverglades: the Twilight Breaker deals much less damage with “Smash”; executioner Morg is weakened; the Twilight smith's flame mark: +50 damage (1000 before)."]],
      ["Items", [
        "Bloody attack claws now give +1 Unarmed skill. Earthen silk slippers no longer give too much spell power.",
        "Tailoring: bigger but more expensive bags — Red Mageweave Bag 5 bolts (14 slots), Green Silk Pack 5 bolts (12), Black Silk Pack 6 bolts (12), green and red woolen bags 5 bolts (10)."]],
      ["Quests & world", ["Fixes: Western Plaguelands (command tent), Arathi Highlands (Witherbark mallet), Feralas (cage door). Mounting in named areas of Shen'dralar works again."]],
    ]],
    "10 novembre 2026": ["November 10, 2026", "Class balance", [
      ["Druid", ["Omen of Clarity can trigger again after a spec change. Restoration: Nature's Swiftness also makes Wild Growth instant."]],
      ["Hunter", ["Pets had 150% health because of a bug; they now have 115%.", "Arcane Shot costs 11% of base mana at all ranks. Beast Mastery: Summon Hawk costs 11% of base mana; hawk melee damage about +80%."]],
      ["Paladin / Priest", ["Paladin: Redoubt can be tracked in the cooldown manager. Priest: the Revelation enchant no longer triggers on Vampiric Embrace heals; Holy Nova can be properly unlearned."]],
      ["Shaman", [
        "Weapon imbues and weapon totems can be used together (e.g. Windfury).",
        "Enhancement: Stormstrike deals 100% weapon damage (150% before), 8 sec cooldown (6 sec before). Mental Quickness: Intellect → AP ratio 33/66/100% (50/100/150% before). Maelstrom Weapon: −20% cast time and cost per charge at all ranks; proc chance depends on rank (6/7/8/9/10 times per minute) and on main-hand weapon speed.",
        "Intent: push Enhancement toward Windfury rather than Spell Power / Intellect. These changes actually went live on November 12."]],
      ["Warlock", [
        "Pets gain health (about +15% for Imp, Voidwalker, Incubus, Succubus); base damage of the Imp's Firebolt ranks 1 to 4 increased.",
        "Affliction: Soul Siphon increases Drain Life, Drain Soul and Smite-like drain by 4/8/12% per Corruption, Siphon Life and Agony on the target, up to 36%. Wrack: −30% damage, channeled 6 sec with Shadow damage every second; meanwhile Siphon Life, Corruption and Agony tick 100% faster.",
        "Destruction: Bane of Chaos triggers the global cooldown."]],
      ["Warrior", ["Arms: Sweeping Strikes no longer loses charges if no second target is hit."]],
      ["Items", [
        "All vendor racial mounts are Bind on Pickup. Spark-thrower wand: Arcane damage (Nature before). Rage of the Storm: 16 Strength (Intellect before), speed 3.6.",
        "Sell price reduced for some bound crafted armor (Leatherworking, Tailoring, Blacksmithing)."]],
      ["Professions", [
        "Alchemy: the minor arcane elixir sells for 5 copper (25 before); “Elixir of Greater Firepower” becomes “Elixir of Holy Power”.",
        "Blacksmithing: Rough Grinding Stone raises skill up to 90. Cooking: the journeyman campfire kit requires 90 Cooking (140 before).",
        "Enchanting: arcane flavor requires the Runed Golden Rod and applies to lower-level enchanters; Boots/Bracer - Minor Spirit give Spirit.",
        "Engineering: Iron Grenades 1 silver 25 copper (5 silver before). Fishing: the Fishing Rack gives lures to eligible players."]],
      ["Quests & world", ["Most level 48+ quests now also reward gold (except quests with valuable items, repeatable and trivial ones).", "Darkspear Trolls no longer give XP. Wrong graveyard on death fixed. Pyrewood villagers respawn at dawn and dusk."]],
    ]],
    "9 novembre 2026": ["November 9, 2026", "Hotfixes", [
      ["Classes", [
        "Druid: the cooldown manager no longer shows Enrage and now shows Lacerate. Feral: Feral Charge (cat) puts you in combat immediately; Natural Instinct applies to Lacerate and Pounce.",
        "Hunter: pets fixed (Vulgara, Shrieklings). Targeting a distant enemy no longer pulls its aggro.",
        "Mage: Flame Strike no longer consumes Clearcasting. Arcane Concentration is distributed correctly.",
        "Paladin: Consecration no longer loses its increased damage. Priest: Shadowform no longer breaks with Fear Ward; Power Infusion persists on allies.",
        "Shaman: Lightning Mastery visuals; Lightning Overload deals the right damage; Improved Ghost Wolf holds the Nightwatcher's Torch.",
        "Warlock: the corrupted thoroughbred summon now grants the riding skill; Incinerate is no longer available outside Destruction. Warrior: Thunder Clap no longer tracks its duration in the manager."]],
      ["Dungeons", [
        "Dungeon enemy XP +50% (live since November 8).",
        "Drowned City: creatures dealt about 30% too much damage; fixed. Lifeless Marrow encounter: creature health −25%, Fireball −25%, Charge −50%, Shield Slam half as frequent.",
        "Blackrock Depths: throne room doors open after a wipe on Emperor Thaurissan; the Heart of the Mountain can be looted several times. Shaper's Terrace: Vitrix, Snowtalon and Cinder drop loot; Stratholme: mounting fixed. Blackfathom Deeps: inability to release spirit fixed."]],
      ["Items", ["Purple powder pouch: +1 h of camp benefits. Abandoned Crates and Craftsman's orders drop in dungeons.", "Berdun's trusty rifle: no more random stats, no longer Bind on Equip. Clever chronometer: no more shared cooldown with Dash, Blink, Sprint, etc."]],
      ["PvP / World", ["Invisible wall removed on the roof of the Alliance base in Warsong Gulch. Fewer players in congested zones. Tauren: Cultivation goes on cooldown after the cast."]],
      ["Quests", ["A very large number of quest fixes (quest items shared with the group, escorts, doors, Bingles in Loch Modan, Hyjal owls for players below level 60…)."]],
    ]],
    "8 novembre 2026": ["November 8, 2026", "Experience", [["Dungeons", ["All dungeon enemies give 50% more experience."]]]],
    "6 novembre 2026": ["November 6, 2026", "Hotfixes", [
      ["Classes", [
        "General: “The Quick and the Dead” sometimes misbehaved; the cooldown manager always shows crowd control duration.",
        "Druid: the bloom heals the target; tooltips fixed. Mage: “Research” is no longer learned (only Study); Arcane Blast lasts 18 sec. Rogue: Backstab tooltip (ranks 1/2, combo points with Boot Knife).",
        "Warlock: Voidwalker base health about +40 at all levels; Soul Siphon no longer increases Wrack damage with itself. Warrior: Reckless blows tooltip."]],
      ["Dungeons", ["Maraudon: the Spirit of Zaetar appears after Princess Theradras. Blackhammer pocket and Drowned City: disengages fixed; the portal now leads to the Drowned City."]],
      ["Items & professions", ["Burning dagger: only triggers with damaging spells. Leatherworking: the hide drying rack requires 125 (140 before)."]],
      ["Quests & world", ["Many quest fixes (Vorsha the Lasher, Kerlonian Evershade, Horn of Awakening given to everyone, etc.). Better visibility of other players and their targets at long range. Thunder Bluff barber shop brightened."]],
      ["Races", ["Night elf: Shadowmeld no longer lets a druid use Ravage and Pounce. Orc: Command no longer over-boosts warlock pet abilities."]],
    ]],
    "5 novembre 2026": ["November 5, 2026", "First post-launch hotfix", [
      ["NPCs & world", ["Durotar: Yarrog Baneshadow respawn fixed. Zephras Isle: Lotheluum Starbreeze offers druid training. Dustwallow Marsh: Pelluk always appears. Marsh murlocs were respawning too fast."]],
      ["Items", ["Zephras profession supply vendors now sell apprentice bags. Mild Spices sell for 1 copper (2 before)."]],
      ["PvP", ["Running in the plains no longer stacks in battlegrounds and is removed when carrying a flag."]],
      ["Quests", ["“The Sisterhood of Elune” text fixed. Deathstalker Erland respawns much faster for “Escorting Erland”."]],
    ]],
    "4 novembre 2026": ["November 4, 2026", "Launch", [
      ["Worldwide release", ["WoW: Forever releases worldwide at 3 PM PST (00:00 CET on November 5 in Europe).", "No patch notes published for that day: hotfixes begin on November 5."]],
    ]],
  };
  (window.WOW_UPDATES || []).forEach(u => {
    const t = MAJ[u.date]; if (!t) return;
    u.date = t[0]; u.tag = t[1]; u.s = t[2];
  });
})();
