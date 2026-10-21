import { describe, expect, it } from 'vitest';
import { PARTS } from '../parts/catalogue';
import { carStats } from '../parts/stats';
import { SLOTS, type Slot } from '../parts/types';
import { bestParts, equipBest, loadoutMods } from './ops';
import { newProfile, type Profile } from './profile';

const power = (p: Profile): number => carStats(loadoutMods(p)).power;

/** A profile that owns these parts (level 1 unless told), nothing equipped. */
function owning(ids: string[], levels: Record<string, number> = {}): Profile {
  const base = newProfile(1);
  return { ...base, owned: Object.fromEntries(ids.map((id) => [id, levels[id] ?? 1])), loadout: { parts: {} } };
}

const ofSlot = (slot: Slot) => PARTS.filter((p) => p.slot === slot);

describe('equip the best (Power of the car sheet)', () => {
  it('equips nothing it does not own, and leaves a slot without parts empty', () => {
    const engine = ofSlot('engine')[0];
    const p = owning([engine.id]);
    const best = bestParts(p);
    expect(best.engine).toBe(engine.id);
    for (const slot of SLOTS.filter((s) => s !== 'engine')) expect(best[slot]).toBeUndefined();
  });

  it('takes the part that gives the most Power when two are owned for a slot', () => {
    for (const slot of SLOTS) {
      const [a, b] = ofSlot(slot).slice(0, 2);
      const p = owning([a.id, b.id]);
      const best = bestParts(p);
      const chosen = { ...p, loadout: { parts: best } };
      const alone = (id: string) => power({ ...p, loadout: { parts: { [slot]: id } } });
      expect(power(chosen), slot).toBe(Math.max(alone(a.id), alone(b.id)));
    }
  });

  it('finds the same Power as trying every combination of what is owned', () => {
    // two parts of different families in each of three slots, with levels that make the choice non trivial
    const owned: string[] = [];
    const levels: Record<string, number> = {};
    for (const slot of ['engine', 'tires', 'wing'] as Slot[]) {
      const list = ofSlot(slot);
      const picked = [list[0], list.find((x) => x.family !== list[0].family) ?? list[1]];
      picked.forEach((x, i) => {
        owned.push(x.id);
        levels[x.id] = 1 + i * 2;
      });
    }
    const p = owning(owned, levels);
    const slots: Slot[] = ['engine', 'tires', 'wing'];
    const options = slots.map((s) => owned.filter((id) => PARTS.find((x) => x.id === id)!.slot === s));
    let top = 0;
    for (const e of options[0]) for (const t of options[1]) for (const w of options[2]) top = Math.max(top, power({ ...p, loadout: { parts: { engine: e, tires: t, wing: w } } }));
    expect(power({ ...p, loadout: { parts: bestParts(p) } })).toBe(top);
  });

  it('never lowers the Power of the equipment already worn', () => {
    const ids = SLOTS.flatMap((slot) => ofSlot(slot).slice(0, 3).map((x) => x.id));
    const worn = Object.fromEntries(SLOTS.map((slot) => [slot, ofSlot(slot)[0].id]));
    const p = { ...owning(ids), loadout: { parts: worn } };
    expect(power({ ...p, loadout: { parts: bestParts(p) } })).toBeGreaterThanOrEqual(power(p));
  });

  it('is done in one go: equipping again changes nothing', () => {
    const ids = SLOTS.flatMap((slot) => ofSlot(slot).slice(0, 3).map((x) => x.id));
    const first = equipBest(owning(ids));
    expect(first).not.toBeNull();
    expect(equipBest(first!)).toBeNull();
  });

  it('changes only the parts: the cosmetics and the rest of the profile stay', () => {
    const ids = ofSlot('engine').slice(0, 2).map((x) => x.id);
    const p = { ...owning(ids), gold: 123, loadout: { parts: {}, paint: 'paint-lime' } } as Profile;
    const after = equipBest(p)!;
    expect(after.loadout.paint).toBe('paint-lime');
    expect(after.gold).toBe(123);
    expect(after.owned).toEqual(p.owned);
  });
});
