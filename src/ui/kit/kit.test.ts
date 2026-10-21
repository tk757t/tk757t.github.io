// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Badge, Button, Modal, Panel, ProgressBar, RarityFrame, setButtonText, setProgress } from './components';
import { setFeedbackHandler, type FeedbackKind } from './feedback';
import { COLORS, TEXT_PAIRS, applyTokens, contrast } from './tokens';

afterEach(() => {
  document.body.innerHTML = '';
  setFeedbackHandler(null);
});

describe('design tokens', () => {
  it('every text/surface pair of the palette reaches WCAG AA (4.5:1)', () => {
    const failing = TEXT_PAIRS.map(([t, s]) => ({ pair: `${t} on ${s}`, ratio: contrast(COLORS[t], COLORS[s]) })).filter((x) => x.ratio < 4.5);
    expect(failing).toEqual([]);
  });

  it('contrast is symmetric and spans 1 to 21', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrast('#336699', '#336699')).toBeCloseTo(1, 5);
    expect(contrast('#12307a', '#ffffff')).toBeCloseTo(contrast('#ffffff', '#12307a'), 8);
  });

  it('writes every colour as a CSS variable', () => {
    applyTokens();
    const root = document.documentElement;
    expect(root.style.getPropertyValue('--yellow-edge')).toBe(COLORS.yellowEdge);
    expect(root.style.getPropertyValue('--bg-deep')).toBe(COLORS.bgDeep);
    expect(root.style.getPropertyValue('--text-muted')).toBe(COLORS.textMuted);
  });
});

describe('Button', () => {
  it('has variant and size classes and a label', () => {
    const b = Button({ text: 'Jouer', variant: 'yellow', size: 'xl', block: true });
    expect(b.className).toContain('kit-btn--yellow');
    expect(b.className).toContain('kit-btn--xl');
    expect(b.className).toContain('kit-btn--block');
    expect(b.textContent).toBe('Jouer');
    expect(b.type).toBe('button');
  });

  it('calls onClick, plays the tap feedback and animates', () => {
    const seen: FeedbackKind[] = [];
    setFeedbackHandler((k) => seen.push(k));
    const fn = vi.fn();
    const b = Button({ text: 'x', onClick: fn });
    b.click();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(seen).toEqual(['tap']);
    expect(b.classList.contains('pop')).toBe(true);
    b.dispatchEvent(new Event('animationend'));
    expect(b.classList.contains('pop')).toBe(false);
  });

  it('a handler that returns a promise puts the button in a busy state, ignores taps, then frees it', async () => {
    let done!: () => void;
    const fn = vi.fn(() => new Promise<void>((resolve) => (done = resolve)));
    const b = Button({ text: 'x', onClick: fn });
    b.click();
    expect(b.getAttribute('aria-busy')).toBe('true');
    expect(b.classList.contains('is-busy')).toBe(true);
    b.click(); // a second tap while waiting for the server does nothing
    expect(fn).toHaveBeenCalledTimes(1);
    done();
    await Promise.resolve();
    await Promise.resolve();
    expect(b.hasAttribute('aria-busy')).toBe(false);
    expect(b.classList.contains('is-busy')).toBe(false);
    b.click();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('a synchronous handler never makes the button busy', () => {
    const b = Button({ text: 'x', onClick: () => 42 });
    b.click();
    expect(b.hasAttribute('aria-busy')).toBe(false);
  });

  it('does nothing when disabled, and can be silent', () => {
    const seen: FeedbackKind[] = [];
    setFeedbackHandler((k) => seen.push(k));
    const fn = vi.fn();
    const off = Button({ text: 'x', disabled: true, onClick: fn });
    off.click();
    expect(fn).not.toHaveBeenCalled();
    Button({ text: 'y', silent: true, onClick: fn }).click();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([]);
  });

  it('shows the pressed state while the pointer is down', () => {
    const b = Button({ text: 'x' });
    b.dispatchEvent(new Event('pointerdown'));
    expect(b.classList.contains('is-pressed')).toBe(true);
    b.dispatchEvent(new Event('pointerleave'));
    expect(b.classList.contains('is-pressed')).toBe(false);
  });

  it('a broken feedback handler never breaks the click', () => {
    setFeedbackHandler(() => {
      throw new Error('no audio');
    });
    const fn = vi.fn();
    Button({ text: 'x', onClick: fn }).click();
    expect(fn).toHaveBeenCalled();
  });

  it('setButtonText replaces the label', () => {
    const b = Button({ text: 'avant' });
    setButtonText(b, 'après');
    expect(b.textContent).toBe('après');
  });
});

describe('ProgressBar', () => {
  it('exposes its value to assistive tech and clamps the fill', () => {
    const p = ProgressBar({ value: 30, max: 120, label: 'Expérience', text: '30 / 120' });
    expect(p.getAttribute('role')).toBe('progressbar');
    expect(p.getAttribute('aria-label')).toBe('Expérience');
    expect(p.getAttribute('aria-valuenow')).toBe('30');
    expect(p.getAttribute('aria-valuemax')).toBe('120');
    expect((p.querySelector('.kit-progress__fill') as HTMLElement).style.width).toBe('25%');
    expect(p.textContent).toBe('30 / 120');
    setProgress(p, 500, 120);
    expect((p.querySelector('.kit-progress__fill') as HTMLElement).style.width).toBe('100%');
    setProgress(p, -5, 120);
    expect((p.querySelector('.kit-progress__fill') as HTMLElement).style.width).toBe('0%');
    setProgress(p, 5, 0);
    expect((p.querySelector('.kit-progress__fill') as HTMLElement).style.width).toBe('0%');
  });
});

describe('Panel, Badge, RarityFrame', () => {
  it('renders a titled panel with children', () => {
    const p = Panel({ title: 'Quêtes', tone: 'dark', children: [document.createElement('i')] });
    expect(p.querySelector('h2')?.textContent).toBe('Quêtes');
    expect(p.className).toContain('kit-panel--dark');
    expect(p.querySelector('i')).not.toBeNull();
  });

  it('renders a badge with an accessible label', () => {
    const b = Badge({ text: '3', tone: 'red', label: '3 paquets prêts', icon: '🎁' });
    expect(b.getAttribute('aria-label')).toBe('3 paquets prêts');
    expect(b.textContent).toContain('3');
  });

  it('frames content in the colour class of its rarity', () => {
    for (const r of ['common', 'rare', 'epic', 'legendary'] as const) {
      expect(RarityFrame(r, ['x']).className).toContain(`kit-frame--${r}`);
    }
    expect(RarityFrame('epic', [], { glow: true }).className).toContain('kit-frame--glow');
  });
});

describe('Modal', () => {
  const dialog = () => document.querySelector('[role="dialog"]');

  it('is an accessible dialog with title, body and actions', () => {
    Modal({ title: 'Réglages', children: ['corps'], actions: [Button({ text: 'OK' })], testid: 'm' });
    const d = dialog() as HTMLElement;
    expect(d.getAttribute('aria-modal')).toBe('true');
    expect(d.getAttribute('aria-label')).toBe('Réglages');
    expect(d.getAttribute('data-testid')).toBe('m');
    expect(d.textContent).toContain('corps');
    expect(d.querySelector('footer button')?.textContent).toBe('OK');
  });

  it('closes with the close button, calling onClose once', () => {
    const onClose = vi.fn();
    const m = Modal({ title: 'T', onClose });
    (document.querySelector('[aria-label="Fermer"]') as HTMLButtonElement).click();
    m.close();
    expect(dialog()).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape and on a backdrop press, only the topmost modal on Escape', () => {
    const a = Modal({ title: 'A' });
    const b = Modal({ title: 'B' });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(b.el.isConnected).toBe(false);
    expect(a.el.isConnected).toBe(true);
    a.el.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(a.el.isConnected).toBe(false);
  });

  it('a press inside the dialog does not close it', () => {
    const m = Modal({ title: 'A', children: [document.createElement('p')] });
    m.body.querySelector('p')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(m.el.isConnected).toBe(true);
  });

  it('can be made undismissible', () => {
    const m = Modal({ title: 'Course terminée', dismissible: false });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    m.el.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(m.el.isConnected).toBe(true);
    expect(document.querySelector('[aria-label="Fermer"]')).toBeNull();
    m.close();
    expect(m.el.isConnected).toBe(false);
  });

  it('gives the focus back to the element that opened it', () => {
    const opener = Button({ text: 'ouvrir' });
    document.body.append(opener);
    opener.focus();
    const m = Modal({ title: 'T' });
    expect(document.activeElement).not.toBe(opener);
    m.close();
    expect(document.activeElement).toBe(opener);
  });

  it('announces open and close through the feedback hook', () => {
    const seen: FeedbackKind[] = [];
    setFeedbackHandler((k) => seen.push(k));
    Modal({ title: 'T' }).close();
    expect(seen).toEqual(['open', 'close']);
  });
});
