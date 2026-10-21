import { AI_LABELS, AI_LEVELS, type AiLevel } from '../ai';
import { TRACK_LIST } from '../data/tracks';
import { Button, Modal, type ModalHandle } from '../ui/kit';
import { el } from '../ui/dom';

export type Controller = 'human' | AiLevel;

export const AI_DELAYS = [
  { label: 'Rapide (200 ms)', ms: 200 },
  { label: 'Normale (600 ms)', ms: 600 },
  { label: 'Lente (1200 ms)', ms: 1200 },
];

export interface RaceConfig {
  players: number;
  trackId: string;
  laps: number;
  seed: number;
  /** One entry per player seat (4 entries, only the first `players` are used). */
  controllers: Controller[];
  /** Pause before each AI action, in ms. */
  aiDelay: number;
  /** Player 1 races with the garage equipment and cosmetics. */
  useGear: boolean;
  /** Campaign level being played (index in LEVELS): its opponents, equipment and objectives apply. */
  level?: number;
  /** Weather of the race: drawn from the circuit by default. */
  weather?: 'random' | 'sun' | 'cloud' | 'rain';
}

export const MAX_LAPS = 3;

export interface SetupInfo {
  /** Number of equipped parts, shown on the equipment switch. */
  equipped: number;
}

/**
 * The "Régler la course" window: players (human or AI), AI speed, circuit, laps, equipment.
 * `onChange` is called on every edit; `onStart` when the start button is pressed.
 */
export function openSetup(initial: RaceConfig, info: SetupInfo, onChange: (cfg: RaceConfig) => void, onStart: (cfg: RaceConfig) => void): ModalHandle {
  const cfg: RaceConfig = { ...initial, controllers: [...initial.controllers] };
  const emit = () => onChange({ ...cfg, controllers: [...cfg.controllers] });

  const seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Nombre de joueurs' });
  const segButtons = [1, 2, 3, 4].map((n) =>
    Button({ text: String(n), variant: 'ghost', attrs: { 'aria-label': `${n} joueur${n > 1 ? 's' : ''}` }, onClick: () => setPlayers(n) }),
  );
  seg.append(...segButtons);

  const delayField = el('fieldset', { 'data-testid': 'ai-speed' });
  const delay = el('select', {
    'aria-label': 'Vitesse des IA',
    onchange: () => {
      cfg.aiDelay = Number(delay.value);
      emit();
    },
  });
  for (const d of AI_DELAYS) delay.append(el('option', { value: String(d.ms), text: d.label }));
  if (!AI_DELAYS.some((d) => d.ms === cfg.aiDelay)) delay.append(el('option', { value: String(cfg.aiDelay), text: `${cfg.aiDelay} ms` }));
  delay.value = String(cfg.aiDelay);
  delayField.append(el('legend', { text: 'Vitesse des IA' }), delay);
  const syncDelay = () => {
    delayField.hidden = !cfg.controllers.slice(0, cfg.players).some((c) => c !== 'human');
  };

  const slots = el('div', { class: 'slots' });
  const renderSlots = () => {
    slots.replaceChildren(
      ...Array.from({ length: cfg.players }, (_, i) => {
        const sel = el('select', {
          'aria-label': `Type du joueur ${i + 1}`,
          onchange: () => {
            cfg.controllers[i] = sel.value as Controller;
            syncDelay();
            emit();
          },
        });
        sel.append(el('option', { value: 'human', text: 'Humain' }));
        for (const l of AI_LEVELS) sel.append(el('option', { value: l, text: `IA ${AI_LABELS[l]}` }));
        sel.value = cfg.controllers[i];
        return el('label', { class: 'slot' }, el('span', { text: `Joueur ${i + 1}` }), sel);
      }),
    );
  };

  const paintPlayers = () => {
    renderSlots();
    syncDelay();
    segButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(i + 1 === cfg.players)));
  };
  const setPlayers = (n: number) => {
    cfg.players = n;
    paintPlayers();
    emit();
  };

  const track = el('select', {
    id: 'track',
    'aria-label': 'Circuit',
    onchange: () => {
      cfg.trackId = track.value;
      emit();
    },
  });
  for (const t of TRACK_LIST) track.append(el('option', { value: t.id, text: `${t.name} · ${t.cells} cases` }));
  track.value = cfg.trackId;

  const gearToggle = Button({
    variant: 'ghost',
    attrs: { 'data-testid': 'use-gear' },
    onClick: () => {
      cfg.useGear = !cfg.useGear;
      syncGear();
      emit();
    },
  });
  gearToggle.classList.add('toggle');
  const syncGear = () => {
    gearToggle.setAttribute('aria-pressed', String(cfg.useGear));
    gearToggle.textContent = `Équipement du garage (Joueur 1) : ${cfg.useGear ? 'activé' : 'désactivé'} · ${info.equipped} pièce${info.equipped > 1 ? 's' : ''}`;
  };

  const lapsOut = el('output', { 'aria-live': 'polite', 'data-testid': 'laps' });
  const minus = Button({ text: '−', variant: 'ghost', attrs: { 'aria-label': 'Moins de tours' }, onClick: () => setLaps(cfg.laps - 1) });
  const plus = Button({ text: '+', variant: 'ghost', attrs: { 'aria-label': 'Plus de tours' }, onClick: () => setLaps(cfg.laps + 1) });
  const paintLaps = () => {
    lapsOut.textContent = String(cfg.laps);
    minus.disabled = cfg.laps <= 1;
    plus.disabled = cfg.laps >= MAX_LAPS;
  };
  const setLaps = (n: number) => {
    cfg.laps = Math.min(MAX_LAPS, Math.max(1, n));
    paintLaps();
    emit();
  };

  const modal = Modal({
    title: 'Régler la course',
    label: 'Régler la course',
    testid: 'setup',
    children: [
      el('fieldset', {}, el('legend', { text: 'Joueurs' }), seg, slots),
      delayField,
      el('fieldset', {}, el('legend', { text: 'Circuit' }), track),
      gearToggle,
      el('fieldset', {}, el('legend', { text: 'Nombre de tours' }), el('div', { class: 'stepper' }, minus, lapsOut, plus)),
    ],
    actions: [
      Button({
        text: 'Démarrer la course',
        variant: 'yellow',
        size: 'lg',
        attrs: { 'data-testid': 'start-from-setup' },
        onClick: () => {
          modal.close();
          onStart({ ...cfg, controllers: [...cfg.controllers] });
        },
      }),
    ],
  });
  paintPlayers();
  syncGear();
  paintLaps();
  return modal;
}
