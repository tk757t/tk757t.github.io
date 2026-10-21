import { describe, expect, it } from 'vitest';
import { LEVELS } from './campaign';
import { MAX_POINTS, PASS_QUEST_POINTS, PASS_RACE_POINTS, PASS_WIN_POINTS, SEASON_DAYS, seasonOf } from './pass';
import { newProfile } from './profile/profile';
import { awardRaceWithPass, claimQuestWithPass, racePassPoints } from './rewards';

const NOW = Date.UTC(2026, 9, 21, 10);
const fresh = () => newProfile(1);
const race = { rank: 2, retired: false, players: 4, now: NOW };

describe('pass points of a race', () => {
  it('10 for a finished race, 30 for a win, nothing when retired', () => {
    expect(racePassPoints({ rank: 3, retired: false })).toBe(PASS_RACE_POINTS);
    expect(racePassPoints({ rank: 1, retired: false })).toBe(PASS_WIN_POINTS);
    expect(racePassPoints({ rank: 1, retired: true })).toBe(0);
  });

  it('a free race against AIs only counts while it is paid', () => {
    expect(racePassPoints({ rank: 1, retired: false, soloVsAi: true, soloPaid: true })).toBe(PASS_WIN_POINTS);
    expect(racePassPoints({ rank: 1, retired: false, soloVsAi: true })).toBe(PASS_WIN_POINTS);
    expect(racePassPoints({ rank: 1, retired: false, soloVsAi: true, soloPaid: false })).toBe(0);
    // a campaign level always counts
    expect(racePassPoints({ rank: 1, retired: false, soloVsAi: true, soloPaid: false, campaign: { level: 0, stars: 1 } })).toBe(PASS_WIN_POINTS);
  });
});

describe('awardRaceWithPass', () => {
  it('adds the points to the season pass and reports them', () => {
    const r = awardRaceWithPass(fresh(), { ...race, rank: 1 });
    expect(r.rewards.pass).toBe(PASS_WIN_POINTS);
    expect(r.profile.pass).toEqual({ season: seasonOf(NOW), points: PASS_WIN_POINTS, claimed: [] });
    const second = awardRaceWithPass(r.profile, race);
    expect(second.profile.pass.points).toBe(PASS_WIN_POINTS + PASS_RACE_POINTS);
  });

  it('keeps every other reward as awardRace gives it', () => {
    const r = awardRaceWithPass(fresh(), { ...race, rank: 1 });
    expect(r.rewards).toMatchObject({ gold: 100, packs: 2 });
    expect(r.profile.races).toBe(1);
  });

  it('counts a campaign level, stops at the end of the pass, and starts the next season from zero', () => {
    const campaign = awardRaceWithPass(fresh(), { ...race, rank: 1, soloVsAi: true, soloPaid: false, campaign: { level: 0, stars: 1 } });
    expect(campaign.rewards.pass).toBe(PASS_WIN_POINTS);
    expect(LEVELS.length).toBeGreaterThan(0);
    const full = { ...fresh(), pass: { season: seasonOf(NOW), points: MAX_POINTS - 10, claimed: [] } };
    expect(awardRaceWithPass(full, { ...race, rank: 1 }).rewards.pass).toBe(10); // only what fits
    expect(awardRaceWithPass({ ...full, pass: { ...full.pass, points: MAX_POINTS } }, { ...race, rank: 1 }).rewards.pass).toBe(0);
    const next = awardRaceWithPass(full, { ...race, rank: 1, now: NOW + SEASON_DAYS * 86_400_000 });
    expect(next.profile.pass).toEqual({ season: seasonOf(NOW) + 1, points: PASS_WIN_POINTS, claimed: [] });
  });
});

describe('claimQuestWithPass', () => {
  it('a collected quest adds pass points, a refused one nothing', () => {
    const done = { ...fresh(), races: 1 };
    const r = claimQuestWithPass(done, 'races-1', NOW)!;
    expect(r.profile.pass.points).toBe(PASS_QUEST_POINTS);
    expect(r.profile.gold).toBe(done.gold + 50);
    expect(claimQuestWithPass(r.profile, 'races-1', NOW)).toBeNull();
    expect(claimQuestWithPass(fresh(), 'wins-1', NOW)).toBeNull();
  });
});
