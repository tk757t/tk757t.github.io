import { expect, type Page } from '@playwright/test';

export const sizes = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
];

/** The four widths of the design review: small phone, phone, tablet, desktop. */
export const widths = [
  { name: '375', width: 375, height: 812 },
  { name: '390', width: 390, height: 844 },
  { name: '768', width: 768, height: 1024 },
  { name: '1440', width: 1440, height: 900 },
];

/** Every visible, interactive button/select must be a comfortable touch target and no text may be clipped. */
export async function expectUsableLayout(page: Page, where: string) {
  const problems = await page.evaluate(() => {
    const out: string[] = [];
    const visible = (e: Element) => {
      if (e.closest('[inert], [hidden]')) return false;
      const r = e.getBoundingClientRect();
      const s = getComputedStyle(e);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && r.right > 0 && r.left < innerWidth;
    };
    for (const e of document.querySelectorAll('button, select')) {
      if (!visible(e)) continue;
      const r = e.getBoundingClientRect();
      if (r.width < 44 || r.height < 44) out.push(`touch target ${e.textContent?.trim() || e.getAttribute('aria-label')} is ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    const textual =
      'button, .chip, .gauge .label span, .msg, .gear, h1, h2, h3, .status, .who, .counter, .info b, .loot__row .name, .loot__row .tag, dt, dd, .kit-badge, .slot-card__time, .slot-tier, .chest-info__line, .offer p, .stage p, .quest__reward, .arena__name';
    for (const e of document.querySelectorAll(textual)) {
      if (!visible(e)) continue;
      const h = e as HTMLElement;
      if (h.scrollWidth > h.clientWidth + 1) out.push(`clipped text: "${h.textContent?.trim()}" (${h.scrollWidth}>${h.clientWidth})`);
    }
    if (document.documentElement.scrollWidth > innerWidth) out.push('horizontal overflow');
    return out;
  });
  expect(problems, where).toEqual([]);
}

/**
 * Nothing may stick out sideways: the document, the visible page/modal and every element inside it
 * must stay within the viewport and within their scroll container.
 */
export async function expectNoHorizontalOverflow(page: Page, where: string) {
  const problems = await page.evaluate(() => {
    const out: string[] = [];
    const root = document.documentElement;
    if (root.scrollWidth > innerWidth) out.push(`document scrollWidth ${root.scrollWidth} > ${innerWidth}`);
    if (document.body.scrollWidth > innerWidth) out.push(`body scrollWidth ${document.body.scrollWidth} > ${innerWidth}`);
    const containers = [...document.querySelectorAll<HTMLElement>('.page:not([inert]), .kit-modal, .hud, .topbar, .topbar-ui, .tabbar')].filter((c) => c.getBoundingClientRect().width > 0);
    for (const c of containers) {
      const box = c.getBoundingClientRect();
      if (c.scrollWidth > c.clientWidth + 1) out.push(`${c.className}: scrollWidth ${c.scrollWidth} > clientWidth ${c.clientWidth}`);
      for (const child of c.querySelectorAll<HTMLElement>('*')) {
        if (child.closest('[inert], [hidden]')) continue;
        const r = child.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const cs = getComputedStyle(child);
        if (cs.position === 'absolute' && child.classList.contains('kit-progress__fill')) continue;
        if (r.left < box.left - 1.5 || r.right > box.right + 1.5) {
          out.push(`${child.tagName.toLowerCase()}.${String(child.className).split(' ')[0]} "${(child.textContent ?? '').trim().slice(0, 24)}" spans ${Math.round(r.left)}-${Math.round(r.right)} outside ${c.className.split(' ')[0]} ${Math.round(box.left)}-${Math.round(box.right)}`);
        }
      }
    }
    return out.slice(0, 12);
  });
  expect(problems, `overflow on ${where}`).toEqual([]);
}

/** Text contrast against the nearest opaque background (WCAG AA: 4.5, or 3 for large text). */
export async function expectContrast(page: Page, where: string) {
  const problems = await page.evaluate(() => {
    const parse = (c: string): [number, number, number, number] => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return [0, 0, 0, 1];
      const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      return [p[0], p[1], p[2], p[3] ?? 1];
    };
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const out: string[] = [];
    const seen = new Set<string>();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = (n.textContent ?? '').trim();
      const e = n.parentElement;
      if (!text || !e || e.closest('[inert], [hidden], button:disabled, .kit-progress__text, svg, canvas, #toast[hidden]')) continue;
      const r = e.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || r.right <= 0 || r.left >= innerWidth) continue;
      const cs = getComputedStyle(e);
      if (cs.visibility === 'hidden') continue;
      let [fr, fg, fb, fa] = parse(cs.color);
      // background: first ancestor with an (almost) opaque colour
      let bg: [number, number, number] | null = null;
      let opacity = 1;
      for (let a: HTMLElement | null = e; a; a = a.parentElement) {
        const s = getComputedStyle(a);
        opacity *= Number(s.opacity);
        const b = parse(s.backgroundColor);
        if (!bg && b[3] > 0.9) bg = [b[0], b[1], b[2]];
      }
      if (!bg) continue;
      fa *= opacity;
      fr = fr * fa + bg[0] * (1 - fa);
      fg = fg * fa + bg[1] * (1 - fa);
      fb = fb * fa + bg[2] * (1 - fa);
      const [hi, lo] = [lum([fr, fg, fb]), lum(bg)].sort((x, y) => y - x);
      const ratio = (hi + 0.05) / (lo + 0.05);
      const size = parseFloat(cs.fontSize);
      const need = size >= 24 ? 3 : 4.5;
      const key = `${text}|${e.className}`;
      if (ratio < need && !seen.has(key)) {
        seen.add(key);
        out.push(`"${text.slice(0, 30)}" (${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]}) ${ratio.toFixed(2)} < ${need}`);
      }
    }
    return out.slice(0, 12);
  });
  expect(problems, `contrast on ${where}`).toEqual([]);
}

export function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/** Puts a save in localStorage before the app starts, unless one is already there (so reloads keep working). */
export async function injectSave(page: Page, save: unknown) {
  await page.addInitScript((text) => {
    if (!localStorage.getItem('4mules.save')) localStorage.setItem('4mules.save', text);
  }, typeof save === 'string' ? save : JSON.stringify(save));
}

export const TABS = ['shop', 'garage', 'race', 'campaign', 'quests'] as const;
export type Tab = (typeof TABS)[number];

export async function goTab(page: Page, tab: Tab) {
  await page.locator(`[data-tab-button="${tab}"]`).click();
  await expect(page.locator('.pager')).toHaveAttribute('data-tab', tab);
  await settleTabs(page);
}

/** Waits for the page slide transition to finish. */
export async function settleTabs(page: Page) {
  await page.waitForFunction(() => {
    const p = document.querySelector('.pager');
    if (!p) return true;
    return !p.getAnimations().some((a) => a.playState === 'running');
  });
}

type Playable = {
  __game: { state: { phase: string; status: string }; destinations(): string[] };
  __render: { settle(): void; cellScreen(id: string): { x: number; y: number } };
};

/**
 * Plays one step of a human turn like a player: gear phase = press the roll button, adjust phase = tap the first
 * highlighted cell, pit phase = skip the stop. Returns the phase it acted on.
 */
export async function humanStep(page: Page, hooks: { onAdjust?: () => Promise<void> } = {}): Promise<string> {
  // the die animation (when motion is not reduced) applies the gear after it has finished
  await page.waitForFunction(() => !document.querySelector('.die.rolling'));
  const phase = await page.evaluate(() => (window as unknown as Playable).__game.state.phase);
  if (phase === 'gear') {
    await page.getByRole('button', { name: /^(Lancer|Départ)$/ }).click();
  } else if (phase === 'adjust') {
    // tap the first destination that is really visible (below the top bar, above the control panel)
    const at = await page.evaluate(() => {
      const w = window as unknown as Playable;
      w.__render.settle();
      const hud = document.querySelector('.hud')?.getBoundingClientRect().top ?? innerHeight;
      for (const id of w.__game.destinations()) {
        const p = w.__render.cellScreen(id);
        if (p.x > 8 && p.x < innerWidth - 8 && p.y > 70 && p.y < hud - 12) return p;
      }
      return null;
    });
    await hooks.onAdjust?.();
    if (!at) throw new Error('no destination is visible above the control panel');
    await page.mouse.click(at.x, at.y);
  } else if (phase === 'pit') {
    await page.getByTestId('pit-skip').click();
  }
  return phase;
}
