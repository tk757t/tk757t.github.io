type Child = Node | string | null | undefined | false;

interface Props {
  class?: string;
  text?: string;
  [attr: string]: string | boolean | number | ((e: Event) => void) | undefined;
}

const safeUrl = (u: string): boolean => !/^\s*[a-z][a-z0-9+.-]*:/i.test(u) || /^\s*(https?:|blob:|data:image\/)/i.test(u);

/** Tiny hyperscript helper: el('button', { class: 'big', onclick: fn }, 'Label'). */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') node.className = String(v);
    else if (k === 'text') node.textContent = String(v);
    else if (typeof v === 'function') node.addEventListener(k.replace(/^on/, ''), v);
    // never an inline handler from a string, and links only to http(s), blob:, data images or relative URLs
    else if (/^on/i.test(k)) continue;
    else if (/^(href|src|action|formaction|xlink:href)$/i.test(k) && !safeUrl(String(v))) continue;
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c) node.append(c);
  return node;
}

export const prefersReducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
