import { describe, expect, it } from 'vitest';
import { GIFT_FRAGMENTS, GIFT_GOLD, GIFT_STREAK_DAYS, WELCOME_GEMS, WELCOME_GOLD, WELCOME_MS, WELCOME_PAINT, claimGift, claimWelcome, giftStatus, prevDay, welcomeAvailable } from './gift';
import { newProfile, totalPacks } from './profile/profile';

const DAY = 86_400_000;
const NOON = Date.UTC(2026, 9, 21, 10); // 12:00 in Paris
const fresh = () => newProfile(1);

describe('daily gift', () => {
  it('gives gold and fragments once per Paris day', () => {
    const r = claimGift(fresh(), NOON)!;
    expect(r.reward).toEqual({ gold: GIFT_GOLD, fragments: GIFT_FRAGMENTS, chest: false, streak: 1, cycleDay: 1 });
    expect(r.profile).toMatchObject({ gold: fresh().gold + GIFT_GOLD, fragments: GIFT_FRAGMENTS, gift: { day: '2026-10-21', streak: 1 } });
    expect(giftStatus(r.profile, NOON + 3_600_000).available).toBe(false);
    expect(claimGift(r.profile, NOON + 3_600_000)).toBeNull();
  });

  it('is available again at Paris midnight, not before', () => {
    const r = claimGift(fresh(), NOON)!;
    expect(giftStatus(r.profile, Date.UTC(2026, 9, 21, 21, 59, 59)).available).toBe(false);
    expect(giftStatus(r.profile, Date.UTC(2026, 9, 21, 22, 0, 0)).available).toBe(true);
  });

  it('a streak of consecutive days ends with a common chest on day 7, then starts a new week', () => {
    let p = fresh();
    for (let d = 1; d <= GIFT_STREAK_DAYS; d++) {
      const r = claimGift(p, NOON + (d - 1) * DAY)!;
      expect(r.reward).toMatchObject({ streak: d, cycleDay: d, chest: d === GIFT_STREAK_DAYS });
      p = r.profile;
    }
    expect(totalPacks(p)).toBe(totalPacks(fresh()) + 1);
    expect(p.gold).toBe(fresh().gold + (GIFT_STREAK_DAYS - 1) * GIFT_GOLD); // the chest replaces the gold of day 7
    const next = claimGift(p, NOON + GIFT_STREAK_DAYS * DAY)!;
    expect(next.reward).toMatchObject({ streak: 8, cycleDay: 1, chest: false });
  });

  it('a missed day restarts the streak at 1 without penalty', () => {
    const first = claimGift(fresh(), NOON)!.profile;
    const second = claimGift(first, NOON + DAY)!.profile;
    expect(second.gift.streak).toBe(2);
    expect(giftStatus(second, NOON + 3 * DAY)).toMatchObject({ available: true, streak: 1, cycleDay: 1 });
    expect(claimGift(second, NOON + 3 * DAY)!.reward.streak).toBe(1);
  });

  it('counts days across the clock change (a 25-hour day)', () => {
    const sat = Date.UTC(2026, 9, 24, 10); // 24 October 12:00 Paris
    const p = claimGift(fresh(), sat)!.profile;
    expect(giftStatus(p, Date.UTC(2026, 9, 25, 10)).available).toBe(true);
    const sun = claimGift(p, Date.UTC(2026, 9, 25, 10))!.profile;
    expect(claimGift(sun, Date.UTC(2026, 9, 26, 11))!.reward.streak).toBe(3); // Monday 12:00 Paris (winter time)
  });

  it('prevDay handles month and year ends', () => {
    expect(prevDay('2026-03-01')).toBe('2026-02-28');
    expect(prevDay('2027-01-01')).toBe('2026-12-31');
    expect(prevDay('2028-03-01')).toBe('2028-02-29');
  });
});

describe('welcome pack', () => {
  const offered = () => ({ ...fresh(), welcomeUntil: NOON + WELCOME_MS });

  it('is not on offer for a local profile', () => {
    expect(welcomeAvailable(fresh(), NOON)).toBe(false);
    expect(claimWelcome(fresh(), NOON)).toBeNull();
  });

  it('gives 300 gems, 2000 gold and a rare paint, once', () => {
    const r = claimWelcome(offered(), NOON)!;
    expect(r.reward).toEqual({ gold: WELCOME_GOLD, gems: WELCOME_GEMS, itemId: WELCOME_PAINT, fragments: 0 });
    expect(r.profile).toMatchObject({ gold: fresh().gold + WELCOME_GOLD, gems: fresh().gems + WELCOME_GEMS, welcomeUntil: 0 });
    expect(r.profile.owned[WELCOME_PAINT]).toBe(1);
    expect(claimWelcome(r.profile, NOON + 1)).toBeNull();
  });

  it('a paint already owned becomes fragments', () => {
    const r = claimWelcome({ ...offered(), owned: { [WELCOME_PAINT]: 1 } }, NOON)!;
    expect(r.reward.itemId).toBeNull();
    expect(r.reward.fragments).toBeGreaterThan(0);
    expect(r.profile.fragments).toBe(r.reward.fragments);
  });

  it('is gone after 72 hours', () => {
    expect(welcomeAvailable(offered(), NOON + WELCOME_MS - 1)).toBe(true);
    expect(welcomeAvailable(offered(), NOON + WELCOME_MS)).toBe(false);
    expect(claimWelcome(offered(), NOON + WELCOME_MS)).toBeNull();
  });
});
