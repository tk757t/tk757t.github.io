import { fail } from './errors';

/** Strict readers of the parameters sent by the browser: every value is checked (type, bounds, known keys). */
export type Params = Record<string, unknown>;

const isRecord = (x: unknown): x is Params => typeof x === 'object' && x !== null && !Array.isArray(x);

/** The parameters object (absent = empty). Anything else than a plain object is refused. */
export function asParams(x: unknown): Params {
  if (x === undefined || x === null) return {};
  if (!isRecord(x)) fail('Paramètres invalides.', 'invalid');
  return x as Params;
}

/** Refuses any key that the action does not know (a client sending a whole profile, a price, a duration...). */
export function only(p: Params, keys: readonly string[]): void {
  for (const k of Object.keys(p)) if (!keys.includes(k)) fail('Paramètre inattendu.', 'invalid');
}

export function int(p: Params, key: string, min: number, max: number): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) fail('Paramètre invalide.', 'invalid');
  return v as number;
}

export function optInt(p: Params, key: string, min: number, max: number): number | undefined {
  return p[key] === undefined ? undefined : int(p, key, min, max);
}

export function bool(p: Params, key: string, fallback?: boolean): boolean {
  const v = p[key];
  if (v === undefined && fallback !== undefined) return fallback;
  if (typeof v !== 'boolean') fail('Paramètre invalide.', 'invalid');
  return v as boolean;
}

/** A short identifier: letters, digits, "-" and "_" only. */
export function id(p: Params, key: string, maxLength = 40): string {
  const v = p[key];
  if (typeof v !== 'string' || v.length === 0 || v.length > maxLength || !/^[A-Za-z0-9_-]+$/.test(v)) fail('Paramètre invalide.', 'invalid');
  return v as string;
}

export function record(p: Params, key: string): Params {
  const v = p[key];
  if (!isRecord(v)) fail('Paramètre invalide.', 'invalid');
  return v as Params;
}
