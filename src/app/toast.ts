import { el } from '../ui/dom';

let timer: ReturnType<typeof setTimeout> | null = null;

/** Short message at the top of the screen (announced to screen readers). */
export function toast(text: string, tone: 'good' | 'bad' = 'good'): void {
  let box = document.getElementById('toast');
  if (!box) {
    box = el('div', { id: 'toast', role: 'status', 'aria-live': 'polite', 'data-testid': 'toast' });
    document.body.append(box);
  }
  box.className = `toast toast--${tone}`;
  box.textContent = text;
  box.hidden = false;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    if (box) box.hidden = true;
  }, 2200);
}
