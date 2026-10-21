// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { asCurrent, inRace, linearTrack, patchCar } from '../engine/testing';
import { COLORS } from '../ui/kit/tokens';
import { carSpriteSvg, carSpriteUrl, carSvg } from './carSvg';
import { GEAR_SIDES, attachDiceKeys, createDiceRow, createStartDie, dieLabel, polygonPoints } from './diceRow';
import { gearDice } from './messages';

const track = linearTrack(40, { grid: [0, 1] });
const race = (gear: number, over: Record<string, unknown> = {}) => patchCar(asCurrent(inRace(track, { weather: 'sun', laps: 2 }, 2), 'car1'), 'car1', { gear, started: true, ...over });
const dice = (gear: number, selected = gear, over: Record<string, unknown> = {}) => {
  const s = race(gear, over);
  return gearDice(s, s.cars[0], selected);
};

describe('dice of the gears', () => {
  it('gives each die its own shape (3 to 10 corners) and its own colour', () => {
    expect([...GEAR_SIDES]).toEqual([3, 4, 5, 6, 8, 10]);
    for (const n of GEAR_SIDES) expect(polygonPoints(n).split(' ')).toHaveLength(n);
    const row = createDiceRow(() => undefined);
    const polys = [...row.el.querySelectorAll('polygon')];
    expect(polys.map((p) => p.getAttribute('points')!.split(' ').length)).toEqual([...GEAR_SIDES]);
    const fills = [...row.el.querySelectorAll('.gdie__fill')].map((g) => g.getAttribute('fill'));
    expect(new Set(fills).size).toBe(6);
    // every colour the dice name exists in the palette
    for (const f of fills) expect(COLORS[f!.match(/--(dice\d)/)![1] as keyof typeof COLORS]).toMatch(/^#/);
  });

  it('shows the number of the gear on each die and the cells it gives under it', () => {
    const row = createDiceRow(() => undefined);
    row.update({ dice: dice(1, 1), locked: false });
    expect([...row.el.querySelectorAll('.gdie__n')].map((t) => t.textContent)).toEqual(['1', '2', '3', '4', '5', '6']);
    expect([...row.el.querySelectorAll('.gdie__range')].map((t) => t.textContent)).toEqual(['1-2', '2-4', '4-8', '7-12', '11-20', '21-30']);
  });

  it('only lets the car go up one gear, and down when it can pay', () => {
    const d = dice(3);
    expect(d.map((x) => x.allowed)).toEqual([true, true, true, true, false, false]);
    expect(d[4].note).toBe('On ne monte que d’un rapport à la fois.');
    expect(d[3].note).toBeNull();
    // down from 6: gear 4 costs the gearbox, gear 1 everything
    const down = dice(6);
    expect(down[3]).toMatchObject({ gear: 4, allowed: true, costly: true, note: 'Rétrograder de 2 rapports coûte : boîte −1.' });
    expect(down[0].note).toBe('Rétrograder de 5 rapports coûte : boîte −1, freins −1, moteur −1.');
    expect(down[4]).toMatchObject({ costly: false, note: null });
  });

  it('greys a gear the car cannot pay for', () => {
    const d = dice(6, 6, { wear: { tires: 6, brakes: 0, gearbox: 3, body: 3, engine: 3, handling: 2 } });
    expect(d[0]).toMatchObject({ allowed: false, note: 'Pas assez de points pour rétrograder jusque-là.' });
    expect(d[4].allowed).toBe(true);
  });

  it('marks the chosen die, and tells it in its label', () => {
    const row = createDiceRow(() => undefined);
    row.update({ dice: dice(3, 4), locked: false });
    const [b3, b4] = [row.el.querySelector('[data-gear-pick="3"]')!, row.el.querySelector('[data-gear-pick="4"]')!];
    expect(b4.getAttribute('aria-checked')).toBe('true');
    expect(b3.getAttribute('aria-checked')).toBe('false');
    expect(b4.classList.contains('is-selected')).toBe(true);
    expect(b4.getAttribute('aria-label')).toBe('Rapport 4 : 7 à 12 cases. Choisi : touchez encore pour lancer');
    expect(dieLabel(dice(3)[4])).toContain('On ne monte que d’un rapport');
  });

  it('calls back with the gear touched, and ignores a die that cannot be chosen or a locked row', () => {
    const picked: number[] = [];
    const row = createDiceRow((g) => picked.push(g));
    row.update({ dice: dice(3), locked: false });
    (row.el.querySelector('[data-gear-pick="4"]') as HTMLElement).click();
    (row.el.querySelector('[data-gear-pick="6"]') as HTMLElement).click(); // too high
    expect(picked).toEqual([4]);
    row.update({ dice: dice(3), locked: true });
    (row.el.querySelector('[data-gear-pick="2"]') as HTMLElement).click();
    expect(picked).toEqual([4]);
    expect(row.el.getAttribute('aria-disabled')).toBe('true');
  });

  it('moves between the dice that can be chosen with the arrow keys', () => {
    const row = createDiceRow(() => undefined);
    document.body.append(row.el);
    attachDiceKeys(row.el);
    row.update({ dice: dice(3), locked: false });
    const b = (g: number) => row.el.querySelector<HTMLElement>(`[data-gear-pick="${g}"]`)!;
    b(3).focus();
    b(3).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(b(4));
    b(4).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(b(1)); // 5 and 6 are off: it comes back round
    row.el.remove();
  });

  it('has a single round d20 for the start', () => {
    const onPick = vi.fn();
    const start = createStartDie(onPick);
    start.el.querySelector('button')!.click();
    expect(onPick).toHaveBeenCalledTimes(1);
    start.update(true);
    start.el.querySelector('button')!.click();
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(start.el.querySelector('circle')).not.toBeNull();
    expect(start.el.textContent).toContain('d20');
  });
});

describe('car skin on the board', () => {
  const look = { paint: 0x1357a6, number: 42, helmet: 0xf2f4f7 };
  it('lies the car down with its nose to the right, in its colour, with its number', () => {
    const svg = carSpriteSvg(look);
    expect(svg).toContain('viewBox="0 0 222 120"');
    expect(svg).toContain('width="222" height="120"');
    expect(svg).toContain('#1357a6');
    expect(svg).toContain('>42</text>');
    expect(carSvg(look)).toContain('viewBox="0 0 120 220"');
  });
  it('is a picture the renderer can load (a data URL, never a request)', () => {
    const url = carSpriteUrl(look);
    expect(url.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    expect(decodeURIComponent(url.split(',').slice(1).join(','))).toBe(carSpriteSvg(look));
  });
});
