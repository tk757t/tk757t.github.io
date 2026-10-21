/**
 * Campaign progress as it is saved: the best number of stars (0 to 3) earned on each level, in level order.
 * A level is open when the one before it has at least `UNLOCK_STARS` star. It lives inside the versioned save
 * (see src/data/profile/profile.ts, version 4), this module owns its shape, its cleaning and its updates.
 */

export const MAX_STARS = 3;
/** Stars needed on a level to open the next one (1 = finishing the race). */
export const UNLOCK_STARS = 1;

export interface CampaignProgress {
  /** Best stars per level; a missing entry is a level never finished. */
  stars: number[];
}

export const emptyProgress = (): CampaignProgress => ({ stars: [] });

const clampStars = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? Math.min(MAX_STARS, Math.max(0, Math.floor(x))) : 0);

/** Cleans what was read from a save: at most `levels` entries, each 0..3. */
export function sanitizeProgress(raw: unknown, levels: number): CampaignProgress {
  const src = typeof raw === 'object' && raw !== null && Array.isArray((raw as { stars?: unknown }).stars) ? ((raw as { stars: unknown[] }).stars as unknown[]) : [];
  return { stars: src.slice(0, levels).map(clampStars) };
}

/** Version 3 saves counted the stages won; each becomes a level finished with one star. */
export function progressFromStageCount(stages: unknown, levels: number): CampaignProgress {
  const won = typeof stages === 'number' && Number.isFinite(stages) ? Math.max(0, Math.floor(stages)) : 0;
  return { stars: Array.from({ length: Math.min(levels, won) }, () => 1) };
}

export const starsOf = (p: CampaignProgress, level: number): number => p.stars[level] ?? 0;
export const totalStars = (p: CampaignProgress): number => p.stars.reduce((a, b) => a + b, 0);

/** Levels finished at least once. */
export const clearedLevels = (p: CampaignProgress): number => p.stars.filter((s) => s >= UNLOCK_STARS).length;

export type LevelStatus = 'locked' | 'next' | 'cleared';

/** The first level is always open; the others once the previous one has enough stars. */
export function levelStatus(p: CampaignProgress, level: number): LevelStatus {
  if (starsOf(p, level) >= UNLOCK_STARS) return 'cleared';
  return level === 0 || starsOf(p, level - 1) >= UNLOCK_STARS ? 'next' : 'locked';
}

export interface Recorded {
  progress: CampaignProgress;
  /** Stars above the previous best (what pays gems). */
  newStars: number;
  /** First time the level was finished. */
  firstClear: boolean;
}

/** Records a result; only an improvement changes the progress. A locked level cannot be recorded. */
export function recordResult(p: CampaignProgress, level: number, stars: number): Recorded | null {
  if (levelStatus(p, level) === 'locked') return null;
  const before = starsOf(p, level);
  const now = Math.max(before, clampStars(stars));
  const list = [...p.stars];
  while (list.length <= level) list.push(0);
  list[level] = now;
  return { progress: { stars: list }, newStars: now - before, firstClear: before < UNLOCK_STARS && now >= UNLOCK_STARS };
}
