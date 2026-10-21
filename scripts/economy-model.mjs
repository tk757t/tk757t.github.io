// Expected-value model of the economy proposed in docs/gdd/05-economie.md (§5.8): no randomness, day by day.
// The player upgrades as soon as fragments and gold allow, cheapest upgrade first. Run: node scripts/economy-model.mjs
const CHEST = { bronze: { gold: 60, frag: 20 }, silver: { gold: 140, frag: 50 }, gold: { gold: 350, frag: 120 } };
const CYCLE = [...Array(8).fill('bronze'), ...Array(3).fill('silver'), 'gold'];
const avg = (key) => CYCLE.reduce((sum, c) => sum + CHEST[c][key], 0) / CYCLE.length;
const FREE_CHEST = { gold: 20, frag: 8 };
/** Fragments to go from level L to L + 1 = base x L. */
const UPGRADE_BASE = { common: 80, rare: 160, epic: 320, legendary: 640 };
const GOLD_PER_FRAGMENT = 4;
const SEASON_DAYS = 28;
const PASS_FREE = { gold: 1500, frag: 400, gems: 60 };
const PASS_PREMIUM = { gold: 4000, frag: 1200, gems: 250 };
const START = { gold: 200, gems: 25 };
const EQUIPPED = ['common', 'common', 'rare', 'rare', 'epic', 'legendary'];
const MAX_LEVEL = 5;

const PROFILES = {
  casual: { races: 5, goldPerRace: 20, chests: 1, free: 1, quests: 100, gemsPerDay: 4, premium: false, boughtGems: 0, skipGems: 0 },
  regular: { races: 12, goldPerRace: 20, chests: 3.5, free: 2, quests: 150, gemsPerDay: 6, premium: false, boughtGems: 0, skipGems: 0 },
  // Premium pass + 500 gems on day 1; skips one bronze timer a day (18 gems)
  payer: { races: 12, goldPerRace: 20, chests: 3.5, free: 2, quests: 150, gemsPerDay: 6, premium: true, boughtGems: 500, skipGems: 18 },
};

for (const [name, p] of Object.entries(PROFILES)) {
  const pass = (key) => (PASS_FREE[key] + (p.premium ? PASS_PREMIUM[key] : 0)) / SEASON_DAYS;
  let gold = START.gold;
  let gems = START.gems + p.boughtGems;
  let frag = 0;
  const total = { goldIn: 0, goldOut: 0, fragIn: 0, gemsIn: 0, gemsOut: 0, chests: 0 };
  const levels = EQUIPPED.map(() => 1);
  const rows = [];
  for (let day = 1; day <= 30; day++) {
    const chests = p.chests + (p.skipGems ? 1 : 0);
    const goldIn = p.races * p.goldPerRace + chests * avg('gold') + p.free * FREE_CHEST.gold + p.quests + pass('gold');
    const fragIn = chests * avg('frag') + p.free * FREE_CHEST.frag + pass('frag');
    const gemsIn = p.gemsPerDay + pass('gems');
    gold += goldIn;
    frag += fragIn;
    gems += gemsIn - p.skipGems;
    total.goldIn += goldIn;
    total.fragIn += fragIn;
    total.gemsIn += gemsIn;
    total.gemsOut += p.skipGems;
    total.chests += chests + p.free;
    for (;;) {
      let best = -1;
      let cost = Infinity;
      levels.forEach((level, i) => {
        const c = UPGRADE_BASE[EQUIPPED[i]] * level;
        if (level < MAX_LEVEL && c < cost) [best, cost] = [i, c];
      });
      if (best < 0 || frag < cost || gold < cost * GOLD_PER_FRAGMENT) break;
      frag -= cost;
      gold -= cost * GOLD_PER_FRAGMENT;
      total.goldOut += cost * GOLD_PER_FRAGMENT;
      levels[best]++;
    }
    if ([1, 7, 14, 30].includes(day)) {
      rows.push({
        day,
        goldIn: Math.round(total.goldIn),
        goldOut: total.goldOut,
        gold: Math.round(gold),
        fragIn: Math.round(total.fragIn),
        avgLevel: (levels.reduce((a, b) => a + b, 0) / levels.length).toFixed(1),
        levels: levels.join('/'),
        gemsIn: Math.round(total.gemsIn),
        gemsOut: total.gemsOut,
        gems: Math.round(gems),
        chests: Math.round(total.chests),
      });
    }
  }
  console.log(name);
  console.table(rows);
}
