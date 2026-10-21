// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachTooltip, hideTooltip, tipPosition } from './tooltip';

const target = () => {
  const b = document.createElement('button');
  b.textContent = 'Pneus';
  document.body.append(b);
  return b;
};
const pointer = (type: string, pointerType: string) => {
  const e = new Event(type, { bubbles: true }) as Event & { pointerType: string };
  e.pointerType = pointerType;
  return e;
};
const tip = () => document.getElementById('kit-tooltip') as HTMLElement | null;
const content = () => ({ title: 'Pneus : 4/6', lines: ['Usure des gommes.'], extra: ['À 0 : arrêt.'] });

afterEach(() => {
  hideTooltip();
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('tooltip', () => {
  it('shows on mouse hover with the title and the lines, and hides when the mouse leaves', () => {
    const t = target();
    attachTooltip(t, content);
    t.dispatchEvent(pointer('pointerenter', 'mouse'));
    expect(tip()!.hidden).toBe(false);
    expect(tip()!.textContent).toContain('Pneus : 4/6');
    expect(tip()!.textContent).toContain('Usure des gommes.');
    expect(tip()!.textContent).toContain('À 0 : arrêt.');
    expect(tip()!.getAttribute('role')).toBe('tooltip');
    expect(t.getAttribute('aria-describedby')).toBe('kit-tooltip');
    t.dispatchEvent(pointer('pointerleave', 'mouse'));
    expect(tip()!.hidden).toBe(true);
    expect(t.hasAttribute('aria-describedby')).toBe(false);
  });

  it('shows on keyboard focus, hides on blur and on Escape, and the target can be reached with the keyboard', () => {
    const t = target();
    attachTooltip(t, content);
    expect(t.tabIndex).toBe(0);
    t.dispatchEvent(new Event('focus'));
    expect(tip()!.hidden).toBe(false);
    t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(tip()!.hidden).toBe(true);
    t.dispatchEvent(new Event('focus'));
    t.dispatchEvent(new Event('blur'));
    expect(tip()!.hidden).toBe(true);
  });

  it('shows on a tap with a finger for a few seconds, and a second tap closes it', () => {
    vi.useFakeTimers();
    const t = target();
    attachTooltip(t, content);
    t.dispatchEvent(pointer('pointerenter', 'touch')); // no hover on a touch screen
    expect(tip()).toBeNull();
    t.dispatchEvent(pointer('pointerdown', 'touch'));
    expect(tip()!.hidden).toBe(false);
    vi.advanceTimersByTime(5100);
    expect(tip()!.hidden).toBe(true);
    t.dispatchEvent(pointer('pointerdown', 'touch'));
    expect(tip()!.hidden).toBe(false);
    t.dispatchEvent(pointer('pointerdown', 'touch'));
    expect(tip()!.hidden).toBe(true);
  });

  it('a tap elsewhere closes it, and the content is read again each time it shows', () => {
    const t = target();
    let n = 4;
    attachTooltip(t, () => ({ title: `Pneus : ${n}/6`, lines: [] }));
    t.dispatchEvent(pointer('pointerenter', 'mouse'));
    expect(tip()!.textContent).toContain('4/6');
    document.body.dispatchEvent(pointer('pointerdown', 'touch'));
    expect(tip()!.hidden).toBe(true);
    n = 2;
    t.dispatchEvent(pointer('pointerenter', 'mouse'));
    expect(tip()!.textContent).toContain('2/6');
  });

  it('stops answering once removed', () => {
    const t = target();
    const off = attachTooltip(t, content);
    off();
    t.dispatchEvent(pointer('pointerenter', 'mouse'));
    expect(tip()?.hidden ?? true).toBe(true);
  });

  it('is put above the target, below when there is no room, and always inside the window', () => {
    const view = { width: 390, height: 844 };
    const tipSize = { width: 280, height: 90 };
    const mid = tipPosition({ top: 400, bottom: 430, left: 150, right: 250, width: 100, height: 30 } as DOMRect, tipSize, view);
    expect(mid.below).toBe(false);
    expect(mid.top).toBeLessThan(400);
    const top = tipPosition({ top: 20, bottom: 50, left: 150, right: 250, width: 100, height: 30 } as DOMRect, tipSize, view);
    expect(top.below).toBe(true);
    expect(top.top).toBeGreaterThan(50);
    const left = tipPosition({ top: 400, bottom: 430, left: 0, right: 30, width: 30, height: 30 } as DOMRect, tipSize, view);
    expect(left.left).toBe(8);
    const right = tipPosition({ top: 400, bottom: 430, left: 380, right: 410, width: 30, height: 30 } as DOMRect, tipSize, view);
    expect(right.left + tipSize.width).toBeLessThanOrEqual(view.width - 8);
  });
});
