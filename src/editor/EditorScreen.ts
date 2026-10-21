import './editor.css';
import { TRACKS, TRACK_FORMAT, THEMES, type Theme, type TrackDef } from '../data/tracks';
import { Badge, Button, Modal, Panel, ProgressBar, setProgress, type ModalHandle } from '../ui/kit';
import { el } from '../ui/dom';
import { RaceScreen } from '../app/RaceScreen';
import type { RaceConfig } from '../app/setup';
import { checkCircuit, hasErrors, type Check } from './checks';
import { CELL_LENGTH, GRID_SIZE, THEME_LABELS, cloneDoc, newDoc, parseDoc, type EditorDoc } from './doc';
import { BOX_COUNT, generate, type Gears, type Generated } from './generate';
import { slotRange, smoothHandles, splitSegment } from './geometry';
import { EditorView, type DragTarget, type Mode } from './EditorView';
import { SIM_LINEUP, SIM_RACES, simulate, type SimReport } from './simulate';

const STORE_KEY = '4mules.editor';
/** Id under which the drawing is raced (it never replaces a circuit of the game). */
const RACE_TRACK_ID = 'editeur';
const HISTORY = 60;

const MODES: { id: Mode; label: string }[] = [
  { id: 'trace', label: 'Tracé' },
  { id: 'zones', label: 'Zones' },
  { id: 'gears', label: 'Rapports' },
  { id: 'circuit', label: 'Circuit' },
];

const CAUSES: Record<string, string> = {
  tires: 'pneus',
  brakes: 'freins',
  gearbox: 'boîte',
  body: 'carrosserie',
  engine: 'moteur',
  handling: 'tenue de route',
  'no-move': 'bloquées (aucune case jouable)',
  crash: 'mur percuté en sortie de virage',
};

const pct = (x: number) => `${Math.round(x * 100)} %`;
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

function storedDoc(): EditorDoc | null {
  try {
    const text = localStorage.getItem(STORE_KEY);
    return text ? parseDoc(JSON.parse(text)) : null;
  } catch {
    return null;
  }
}

/** Reads a circuit file (or a bare editor document) to edit. Throws a readable error. */
export function docFromFile(text: string): EditorDoc {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Ce fichier n’est pas du JSON.');
  }
  if (typeof raw !== 'object' || raw === null) throw new Error('Ce fichier n’est pas un circuit.');
  const file = raw as Partial<TrackDef> & { points?: unknown };
  if (typeof file.version === 'number' && file.version > TRACK_FORMAT) throw new Error(`Circuit au format ${file.version}, plus récent que cet éditeur (${TRACK_FORMAT}).`);
  if (file.editor !== undefined) return parseDoc(file.editor);
  if (Array.isArray(file.points)) return parseDoc(raw);
  if (Array.isArray(file.cells)) throw new Error('Ce circuit n’a pas été dessiné avec l’éditeur : il n’a pas de tracé à modifier.');
  throw new Error('Ce fichier n’est pas un circuit.');
}

/** The circuit editor (route /editor, development only for now). */
export async function mountEditor(root: HTMLElement): Promise<void> {
  const params = new URLSearchParams(location.search);
  const load = params.get('load');
  const fromGame = load ? TRACKS[load]?.editor : undefined;
  const doc = fromGame ? parseDoc(fromGame) : params.has('new') ? newDoc() : (storedDoc() ?? newDoc());
  const screen = new EditorScreen(root, doc);
  await screen.mount();
}

class EditorScreen {
  private gen: Generated;
  private checks: Check[];
  private mode: Mode = 'trace';
  private selectedPoint: number | null = 0;
  private selection: { anchor: number; end: number } | null = null;
  private selectedCell: string | null = null;
  private highlight = new Set<string>();
  private gearStops = 0;
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private dragging = false;
  private laps = 2;
  private ais = 1;
  private view!: EditorView;

  private stage = el('div', { class: 'editor__stage', 'data-testid': 'editor-stage' });
  private panelBody = el('div', { class: 'editor__section' });
  private checksBox = el('div', { class: 'editor__checks', 'data-testid': 'editor-checks' });
  private msg = el('p', { class: 'editor__msg', role: 'status', 'aria-live': 'polite', 'data-testid': 'editor-message' });
  private tabButtons = new Map<Mode, HTMLButtonElement>();
  private undoBtn = Button({ text: '↶', variant: 'ghost', attrs: { 'aria-label': 'Annuler' }, onClick: () => this.undo() });
  private redoBtn = Button({ text: '↷', variant: 'ghost', attrs: { 'aria-label': 'Rétablir' }, onClick: () => this.redo() });
  private testBtn = Button({ text: `Tester (${SIM_RACES} courses)`, variant: 'blue', block: true, attrs: { 'data-testid': 'editor-test' }, onClick: () => void this.test() });
  private raceBtn = Button({ text: 'Courir sur ce circuit', variant: 'yellow', block: true, attrs: { 'data-testid': 'editor-race' }, onClick: () => void this.race() });
  private title = el('h1', { class: 'editor__title' });

  constructor(
    private root: HTMLElement,
    private doc: EditorDoc,
  ) {
    this.gen = generate(doc);
    this.checks = checkCircuit(this.gen);
  }

  async mount(): Promise<void> {
    const tabs = el('div', { class: 'editor__tabs', role: 'group', 'aria-label': 'Outils' });
    for (const m of MODES) {
      const b = Button({ text: m.label, variant: 'ghost', attrs: { 'data-testid': `editor-tab-${m.id}`, 'aria-pressed': 'false' }, onClick: () => this.setMode(m.id) });
      this.tabButtons.set(m.id, b);
      tabs.append(b);
    }
    const laps = this.select('Tours', [1, 2, 3].map((n) => [String(n), plural(n, 'tour')]), String(this.laps), (v) => (this.laps = Number(v)), 'editor-laps');
    const ais = this.select('Adversaires IA', [1, 2, 3].map((n) => [String(n), plural(n, 'IA')]), String(this.ais), (v) => (this.ais = Number(v)), 'editor-ais');
    const actions = Panel({
      title: 'Essayer et partager',
      tone: 'dark',
      children: [
        el('div', { class: 'editor__row' }, laps, ais),
        this.testBtn,
        this.raceBtn,
        el(
          'div',
          { class: 'editor__row' },
          Button({ text: 'Exporter', variant: 'green', attrs: { 'data-testid': 'editor-export' }, onClick: () => this.exportFile() }),
          Button({ text: 'Importer', variant: 'ghost', attrs: { 'data-testid': 'editor-import' }, onClick: () => this.openImport() }),
          Button({ text: 'Nouveau', variant: 'ghost', attrs: { 'data-testid': 'editor-new' }, onClick: () => this.confirmNew() }),
        ),
      ],
    });
    const panel = el('aside', { class: 'editor__panel', 'aria-label': 'Réglages du circuit' }, tabs, this.msg, this.panelBody, Panel({ title: 'Validation', tone: 'dark', children: [this.checksBox] }), actions);
    const bar = el(
      'header',
      { class: 'editor__bar' },
      this.title,
      this.undoBtn,
      this.redoBtn,
      Button({ text: '⤢', variant: 'ghost', attrs: { 'aria-label': 'Tout voir' }, onClick: () => this.view.fit() }),
      Button({ text: 'Jeu', variant: 'ghost', attrs: { 'aria-label': 'Retour au jeu' }, onClick: () => location.assign('/') }),
    );
    this.root.replaceChildren(el('div', { class: 'editor', 'data-testid': 'editor' }, bar, el('div', { class: 'editor__main' }, this.stage, panel)));
    this.view = await EditorView.create(this.stage);
    this.view.onTap = (x, y) => this.tap(x, y);
    this.view.onDrag = (t, x, y) => this.drag(t, x, y);
    this.view.onDragEnd = () => this.dragEnd();
    this.setMode('trace');
    this.view.fit();
    this.expose();
  }

  // ------------------------------------------------------------------ document

  /** Applies an edit: history, regeneration, save, redraw. */
  private change(edit: (d: EditorDoc) => void, o: { record?: boolean; scenery?: boolean } = {}): void {
    if (o.record ?? true) {
      this.undoStack.push(JSON.stringify(this.doc));
      if (this.undoStack.length > HISTORY) this.undoStack.shift();
      this.redoStack = [];
    }
    edit(this.doc);
    this.regenerate(o.scenery ?? true);
  }

  private regenerate(scenery = true): void {
    this.gen = generate(this.doc);
    this.checks = checkCircuit(this.gen);
    const n = this.gen.n;
    if (this.selection && (this.selection.anchor >= n || this.selection.end >= n)) this.selection = null;
    if (this.selectedPoint !== null && this.selectedPoint >= this.doc.points.length) this.selectedPoint = null;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(this.doc));
    } catch {
      /* private browsing: the drawing is only kept until the page is closed */
    }
    this.redraw(scenery);
    if (!this.dragging) this.renderPanel();
    this.renderChecks();
  }

  private undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(JSON.stringify(this.doc));
    this.doc = parseDoc(JSON.parse(prev));
    this.regenerate();
    this.say('Modification annulée.');
  }

  private redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(JSON.stringify(this.doc));
    this.doc = parseDoc(JSON.parse(next));
    this.regenerate();
  }

  private replaceDoc(doc: EditorDoc, message: string): void {
    this.change((d) => Object.assign(d, cloneDoc(doc)));
    this.selection = null;
    this.selectedCell = null;
    this.selectedPoint = 0;
    this.redraw(true);
    this.view.fit();
    this.say(message);
  }

  private redraw(scenery: boolean): void {
    this.view.render(
      {
        doc: this.doc,
        gen: this.gen,
        mode: this.mode,
        selectedPoint: this.selectedPoint,
        selection: this.selection ? slotRange(this.selection.anchor, this.selection.end, this.gen.n) : [],
        selectedCell: this.selectedCell,
        highlight: this.highlight,
        gearStops: this.gearStops,
      },
      scenery,
    );
    this.title.textContent = this.doc.name;
    this.undoBtn.disabled = this.undoStack.length === 0;
    this.redoBtn.disabled = this.redoStack.length === 0;
  }

  private say(text: string): void {
    this.msg.textContent = text;
  }

  // ------------------------------------------------------------------ input

  private setMode(mode: Mode): void {
    this.mode = mode;
    for (const [m, b] of this.tabButtons) b.setAttribute('aria-pressed', String(m === mode));
    this.say('');
    this.redraw(true);
    this.renderPanel();
    this.renderChecks();
  }

  private nearestCell(x: number, y: number): string | null {
    const r = this.gen.def.cellRadius ?? 15;
    let best: string | null = null;
    let d = r * 1.6;
    for (const c of this.gen.def.cells) {
      const e = Math.hypot(c.x - x, c.y - y);
      if (e < d) {
        d = e;
        best = c.id;
      }
    }
    return best;
  }

  private tap(x: number, y: number): void {
    if (this.mode === 'trace') {
      const s = this.view.camera.worldToScreen(x, y);
      const hit = this.doc.points.findIndex((p) => {
        const q = this.view.camera.worldToScreen(p.x, p.y);
        return Math.hypot(q.x - s.x, q.y - s.y) <= 22;
      });
      this.selectedPoint = hit >= 0 ? hit : null;
      this.redraw(false);
      this.renderPanel();
      return;
    }
    const id = this.nearestCell(x, y);
    if (this.mode === 'zones') {
      if (!id) this.selection = null;
      else {
        const slot = id.startsWith('P') ? Number(id.slice(1)) : Number(id.split('S')[1]);
        this.selection = !this.selection || this.selection.anchor !== this.selection.end ? { anchor: slot, end: slot } : { anchor: this.selection.anchor, end: slot };
      }
    } else if (this.mode === 'gears') this.selectedCell = id;
    this.redraw(false);
    this.renderPanel();
  }

  private drag(t: DragTarget, x: number, y: number): void {
    const first = !this.dragging;
    this.dragging = true;
    this.change(
      (d) => {
        if (t.kind === 'point') {
          d.points[t.index] = { ...d.points[t.index], x: Math.round(x), y: Math.round(y) };
          this.selectedPoint = t.index;
        } else {
          const i = t.index >= 0 ? t.index : -1 - t.index;
          const p = d.points[i];
          const sign = t.index >= 0 ? 1 : -1;
          d.points[i] = { ...p, hx: Math.round((x - p.x) * sign), hy: Math.round((y - p.y) * sign) };
        }
      },
      { record: first, scenery: false },
    );
  }

  private dragEnd(): void {
    this.dragging = false;
    this.redraw(true);
    this.renderPanel();
  }

  // ------------------------------------------------------------------ panels

  private select(label: string, options: [string, string][], value: string, onChange: (v: string) => void, testid?: string): HTMLElement {
    const s = el('select', { 'aria-label': label, ...(testid ? { 'data-testid': testid } : {}) });
    for (const [v, text] of options) s.append(el('option', { value: v, text }));
    s.value = value;
    s.addEventListener('change', () => onChange(s.value));
    return el('label', { class: 'editor__field' }, el('span', { text: label }), s);
  }

  private renderPanel(): void {
    const body = this.panelBody;
    body.replaceChildren();
    if (this.mode === 'trace') body.append(...this.tracePanel());
    else if (this.mode === 'zones') body.append(...this.zonesPanel());
    else if (this.mode === 'gears') body.append(...this.gearsPanel());
    else body.append(...this.circuitPanel());
  }

  private tracePanel(): HTMLElement[] {
    const d = this.doc;
    const p = this.selectedPoint;
    const lanes = el('div', { class: 'editor__tabs editor__tabs--2', role: 'group', 'aria-label': 'Nombre de voies' });
    for (const n of [2, 3]) {
      lanes.append(Button({ text: `${n} voies`, variant: 'ghost', attrs: { 'aria-pressed': String(d.lanes === n), 'data-testid': `editor-lanes-${n}` }, onClick: () => this.change((x) => (x.lanes = n)) }));
    }
    const length = el('input', { type: 'range', min: CELL_LENGTH.min, max: CELL_LENGTH.max, step: 2, value: d.cellLength, 'aria-label': 'Longueur de case', 'data-testid': 'editor-cell-length' });
    const lengthOut = el('output', { text: `${d.cellLength}` });
    length.addEventListener('input', () => (lengthOut.textContent = length.value));
    length.addEventListener('change', () => this.change((x) => (x.cellLength = Number(length.value))));
    return [
      el('p', { class: 'editor__help', text: 'Faites glisser les points (ronds) pour dessiner la ligne centrale, dans le sens de la course (le point blanc est le premier). Touchez un point pour voir ses poignées (carrés) : elles règlent la courbe.' }),
      el(
        'div',
        { class: 'editor__row' },
        Button({ text: 'Ajouter un point', variant: 'blue', attrs: { 'data-testid': 'editor-add-point' }, onClick: () => this.addPoint() }),
        Button({
          text: 'Supprimer le point',
          variant: 'red',
          disabled: p === null || d.points.length <= 3,
          attrs: { 'data-testid': 'editor-remove-point' },
          onClick: () => {
            if (p === null) return;
            this.change((x) => x.points.splice(p, 1));
            this.selectedPoint = null;
            this.redraw(false);
          },
        }),
      ),
      Button({ text: 'Lisser toutes les courbes', variant: 'ghost', block: true, onClick: () => this.change((x) => (x.points = smoothHandles(x.points))) }),
      lanes,
      el('label', { class: 'editor__field' }, el('span', {}, 'Longueur de case : ', lengthOut), length),
      el('p', { class: 'editor__help', text: `${this.gen.n} cases par voie, ${this.gen.def.cells.length} cases en tout.` }),
    ];
  }

  private addPoint(): void {
    const at = this.selectedPoint ?? this.doc.points.length - 1;
    this.change((x) => (x.points = splitSegment(x.points, at)));
    this.selectedPoint = at + 1;
    this.redraw(false);
    this.renderPanel();
    this.say(`Point ${at + 2} ajouté.`);
  }

  private selectedSlots(): number[] {
    return this.selection ? slotRange(this.selection.anchor, this.selection.end, this.gen.n) : [];
  }

  private zonesPanel(): HTMLElement[] {
    const n = this.gen.n;
    const slots = this.selectedSlots();
    const none = slots.length === 0;
    const f = (s: number) => s / n;
    const rowOf = (s: number) => this.gen.def.cells.find((c) => c.id === `L0S${s}`)?.row ?? s;
    const info = none
      ? 'Aucune case sélectionnée : touchez une case, puis une autre plus loin dans le sens de la course.'
      : `Sélection : ${plural(slots.length, 'case')} par voie (rangs ${rowOf(slots[0])} à ${rowOf(slots[slots.length - 1])}).`;
    let stops = 1;
    let risk = 1;
    const replaceCorners = (d: EditorDoc) => {
      const set = new Set(slots);
      d.corners = d.corners.filter((z) => !slotRange(Math.round(z.from * n) % n, Math.round(z.to * n) % n, n).some((s) => set.has(s)));
    };
    const corner = (withRisk: boolean) => {
      this.change((d) => {
        replaceCorners(d);
        d.corners.push({ from: f(slots[0]), to: f(slots[slots.length - 1]), stops, risk: withRisk ? risk : 0 });
      });
      this.say(`${withRisk ? 'Chicane' : 'Virage'} créé : ${plural(slots.length, 'case')}, ${plural(stops, 'arrêt')}.`);
    };
    const pitSlots = new Set(this.gen.pitSlots);
    const zoneList = el('ul', { class: 'editor__list', 'data-testid': 'editor-zones' });
    const named = new Map<string, { stops: number; risk: boolean }>();
    for (const c of this.gen.def.cells) if (c.corner) named.set(c.corner.id, { stops: c.corner.stops, risk: (named.get(c.corner.id)?.risk ?? false) || c.risk > 0 });
    for (const [id, z] of [...named].sort((a, b) => a[0].localeCompare(b[0], 'fr', { numeric: true }))) {
      zoneList.append(el('li', { text: `${id} · ${plural(z.stops, 'arrêt')}${z.risk ? ' · chicane' : ''}` }));
    }
    if (this.gen.pitSlots.length) zoneList.append(el('li', { text: `Voie des stands · ${plural(this.gen.pitSlots.length, 'case')}, ${BOX_COUNT} stands` }));
    return [
      el('p', { class: 'editor__help', 'data-testid': 'editor-selection', text: info }),
      Panel({
        title: 'Virage ou chicane',
        tone: 'dark',
        children: [
          el(
            'div',
            { class: 'editor__row' },
            this.select('Arrêts', [['1', '1 arrêt'], ['2', '2 arrêts'], ['3', '3 arrêts']], '1', (v) => (stops = Number(v)), 'editor-stops'),
            this.select('Cases à risque', [['1', '1 jet'], ['2', '2 jets']], '1', (v) => (risk = Number(v)), 'editor-risk'),
          ),
          el(
            'div',
            { class: 'editor__row' },
            Button({ text: 'Créer un virage', variant: 'yellow', disabled: none, attrs: { 'data-testid': 'editor-make-corner' }, onClick: () => corner(false) }),
            Button({ text: 'Créer une chicane', variant: 'yellow', disabled: none, attrs: { 'data-testid': 'editor-make-chicane' }, onClick: () => corner(true) }),
          ),
        ],
      }),
      Panel({
        title: 'Stands, départ et arrivée',
        tone: 'dark',
        children: [
          el(
            'div',
            { class: 'editor__row' },
            Button({
              text: 'Voie des stands',
              variant: 'blue',
              disabled: none,
              attrs: { 'data-testid': 'editor-make-pit' },
              onClick: () => {
                this.change((d) => {
                  d.pit = { from: f(slots[0]), to: f(slots[slots.length - 1]) };
                  d.boxes = null;
                });
                this.say(`Voie des stands : ${plural(slots.length, 'case')}, ${BOX_COUNT} stands répartis.`);
              },
            }),
            Button({
              text: 'Stands des équipes ici',
              variant: 'blue',
              disabled: none || !slots.some((s) => pitSlots.has(s)),
              attrs: { 'data-testid': 'editor-make-boxes' },
              onClick: () => {
                const inPit = slots.filter((s) => pitSlots.has(s));
                if (inPit.length < BOX_COUNT) return this.say(`Sélectionnez au moins ${BOX_COUNT} cases de la voie des stands.`);
                this.change((d) => (d.boxes = Array.from({ length: BOX_COUNT }, (_, k) => f(inPit[Math.floor(((k + 0.5) * inPit.length) / BOX_COUNT)]))));
                this.say('Stands des 5 équipes placés.');
              },
            }),
          ),
          el(
            'div',
            { class: 'editor__row' },
            Button({
              text: 'Ligne d’arrivée ici',
              variant: 'blue',
              disabled: none,
              attrs: { 'data-testid': 'editor-make-start' },
              onClick: () => {
                this.change((d) => (d.start = f(slots[slots.length - 1])));
                this.say('Ligne d’arrivée placée.');
              },
            }),
            Button({
              text: 'Pole position ici',
              variant: 'blue',
              disabled: none,
              attrs: { 'data-testid': 'editor-make-grid' },
              onClick: () => {
                this.change((d) => (d.grid.pole = f(slots[slots.length - 1])));
                this.say(`Grille de ${this.doc.grid.size} places, en arrière de la pole.`);
              },
            }),
          ),
          this.select(
            'Places sur la grille',
            Array.from({ length: GRID_SIZE.max - GRID_SIZE.min + 1 }, (_, i) => [String(GRID_SIZE.min + i), plural(GRID_SIZE.min + i, 'place')]),
            String(this.doc.grid.size),
            (v) => this.change((d) => (d.grid.size = Number(v))),
            'editor-grid-size',
          ),
        ],
      }),
      Button({
        text: 'Effacer les zones de la sélection',
        variant: 'red',
        block: true,
        disabled: none,
        attrs: { 'data-testid': 'editor-erase' },
        onClick: () => {
          this.change((d) => {
            replaceCorners(d);
            if (slots.some((s) => pitSlots.has(s))) {
              d.pit = null;
              d.boxes = null;
            }
          });
          this.say('Zones effacées.');
        },
      }),
      el('p', { class: 'editor__help', text: 'Zones du circuit :' }),
      zoneList,
    ];
  }

  private gearsPanel(): HTMLElement[] {
    const id = this.selectedCell;
    const cell = id ? this.gen.def.cells.find((c) => c.id === id) : undefined;
    const overrides = Object.keys(this.doc.gears).filter((k) => this.gen.autoGears[k]);
    const out: HTMLElement[] = [
      el('p', {
        class: 'editor__help',
        text: 'Rapport conseillé à l’IA sur chaque case, calculé depuis la distance au prochain virage : le plus rapide dont le meilleur jet ne fait pas dépasser la zone. Touchez une case pour le corriger.',
      }),
      this.select(
        'Afficher pour',
        [0, 1, 2, 3].map((t) => [String(t), t === 0 ? 'aucun arrêt restant' : `${plural(t, 'arrêt')} restant${t > 1 ? 's' : ''}`]),
        String(this.gearStops),
        (v) => {
          this.gearStops = Number(v);
          this.redraw(false);
        },
        'editor-gear-stops',
      ),
    ];
    if (cell && id) {
      const auto = this.gen.autoGears[id];
      const current = [...cell.gear] as Gears;
      const row = el('div', { class: 'editor__gears' });
      current.forEach((g, t) => {
        row.append(
          this.select(
            `${t} arrêt${t > 1 ? 's' : ''} restant${t > 1 ? 's' : ''} (auto ${auto[t]})`,
            [1, 2, 3, 4, 5, 6].map((k) => [String(k), `${k}e`]),
            String(g),
            (v) => {
              const next = [...current] as Gears;
              next[t] = Number(v);
              this.change((d) => {
                if (next.every((x, i) => x === auto[i])) delete d.gears[id];
                else d.gears[id] = next;
              });
            },
            `editor-gear-${t}`,
          ),
        );
      });
      out.push(
        Panel({
          title: `Case ${id}${cell.corner ? ` · virage ${cell.corner.id}` : ''}`,
          tone: 'dark',
          children: [
            row,
            Button({
              text: 'Rétablir le calcul',
              variant: 'ghost',
              block: true,
              disabled: !this.doc.gears[id],
              onClick: () => this.change((d) => delete d.gears[id]),
            }),
          ],
        }),
      );
    } else out.push(el('p', { class: 'editor__help', text: 'Aucune case sélectionnée.' }));
    out.push(
      el('p', { class: 'editor__help', 'data-testid': 'editor-overrides', text: overrides.length ? `${plural(overrides.length, 'case')} corrigée${overrides.length > 1 ? 's' : ''} à la main (cercle blanc).` : 'Aucune correction : tout est calculé.' }),
      Button({ text: 'Tout rétablir', variant: 'ghost', block: true, disabled: overrides.length === 0, onClick: () => this.change((d) => (d.gears = {})) }),
    );
    return out;
  }

  private circuitPanel(): HTMLElement[] {
    const d = this.doc;
    const name = el('input', { type: 'text', value: d.name, maxlength: 60, 'aria-label': 'Nom du circuit', 'data-testid': 'editor-name' });
    name.addEventListener('change', () => {
      const v = name.value.trim();
      if (v) this.change((x) => (x.name = v));
    });
    const id = el('input', { type: 'text', value: d.id, maxlength: 40, 'aria-label': 'Identifiant', 'data-testid': 'editor-id' });
    id.addEventListener('change', () => {
      const v = id.value.trim().toLowerCase();
      if (/^[a-z0-9-]{1,40}$/.test(v)) this.change((x) => (x.id = v));
      else {
        id.value = this.doc.id;
        this.say('Identifiant : lettres minuscules, chiffres et tirets seulement.');
      }
    });
    const d20 = Array.from({ length: 20 }, (_, i) => [String(i + 1), String(i + 1)] as [string, string]);
    const w = d.weather;
    const describe = `d20 : ${w.rain > 1 ? `1 à ${w.rain - 1} pluie, ` : ''}${w.rain} à ${w.sun} nuageux${w.sun < 20 ? `, ${w.sun + 1} à 20 soleil` : ''}.`;
    const loadable = Object.values(TRACKS).filter((t) => t.editor !== undefined && t.id !== RACE_TRACK_ID);
    return [
      el('label', { class: 'editor__field' }, el('span', { text: 'Nom' }), name),
      el('label', { class: 'editor__field' }, el('span', { text: 'Identifiant (nom du fichier)' }), id),
      this.select(
        'Décor',
        THEMES.map((t) => [t, THEME_LABELS[t]]),
        d.theme,
        (v) => this.change((x) => (x.theme = v as Theme)),
        'editor-theme',
      ),
      Panel({
        title: 'Météo',
        tone: 'dark',
        children: [
          el(
            'div',
            { class: 'editor__row' },
            this.select('Pluie sous', d20.slice(0, 19), String(w.rain), (v) => this.change((x) => (x.weather.rain = Number(v))), 'editor-rain'),
            this.select('Nuageux jusqu’à', d20.slice(1), String(w.sun), (v) => this.change((x) => (x.weather.sun = Number(v))), 'editor-sun'),
          ),
          el('p', { class: 'editor__help', 'data-testid': 'editor-weather', text: describe }),
        ],
      }),
      ...(loadable.length
        ? [
            this.select(
              'Ouvrir un circuit du jeu',
              [['', 'Choisir…'], ...loadable.map((t) => [t.id, t.name] as [string, string])],
              '',
              (v) => {
                const t = TRACKS[v];
                if (t?.editor) this.replaceDoc(parseDoc(t.editor), `« ${t.name} » ouvert.`);
              },
              'editor-open',
            ),
          ]
        : []),
    ];
  }

  private renderChecks(): void {
    const errors = this.checks.filter((c) => c.level === 'error').length;
    const warnings = this.checks.length - errors;
    const head = errors
      ? Badge({ text: `${plural(errors, 'erreur')}`, tone: 'red', attrs: { 'data-testid': 'editor-status' } })
      : Badge({ text: 'Circuit valide', tone: 'green', attrs: { 'data-testid': 'editor-status' } });
    const list = el('ul', { class: 'editor__list' });
    for (const c of this.checks) {
      const item = el('li', { class: `editor__check editor__check--${c.level}` });
      item.append(
        c.cells.length
          ? Button({
              text: c.message,
              variant: c.level === 'error' ? 'red' : 'ghost',
              block: true,
              attrs: { 'aria-label': `Montrer : ${c.message}` },
              onClick: () => {
                this.highlight = new Set(c.cells);
                this.redraw(false);
                this.view.focus(c.cells[0]);
              },
            })
          : el('span', { text: c.message }),
      );
      list.append(item);
    }
    const summary = errors ? null : el('p', { class: 'editor__help', text: warnings ? `Prêt pour la course (${plural(warnings, 'remarque')}).` : 'Prêt pour la course : graphe connexe, arrivée atteignable, virages cohérents, grille et stands complets.' });
    this.checksBox.replaceChildren(head, ...(summary ? [summary] : []), list);
    this.testBtn.disabled = hasErrors(this.checks);
    this.raceBtn.disabled = hasErrors(this.checks);
  }

  // ------------------------------------------------------------------ actions

  private exportFile(): void {
    const text = JSON.stringify(this.gen.def, null, 1) + '\n';
    const a = el('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: `${this.doc.id}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    this.say(`Exporté : ${this.doc.id}.json (format ${TRACK_FORMAT}).`);
  }

  private openImport(): void {
    const error = el('p', { class: 'editor__error', role: 'alert', 'data-testid': 'editor-import-error' });
    const file = el('input', { type: 'file', accept: 'application/json,.json', 'aria-label': 'Fichier de circuit', 'data-testid': 'editor-import-file' });
    const text = el('textarea', { rows: 5, 'aria-label': 'Ou collez le JSON du circuit', 'data-testid': 'editor-import-text', placeholder: 'Ou collez le JSON ici' });
    let modal: ModalHandle | null = null;
    const apply = (content: string) => {
      try {
        const doc = docFromFile(content);
        modal?.close();
        this.replaceDoc(doc, `« ${doc.name} » importé.`);
      } catch (e) {
        error.textContent = (e as Error).message;
      }
    };
    file.addEventListener('change', () => {
      const f = file.files?.[0];
      if (f) void f.text().then(apply);
    });
    modal = Modal({
      title: 'Importer un circuit',
      testid: 'editor-import-modal',
      children: [el('p', { class: 'editor__help', text: 'Un fichier exporté par l’éditeur (JSON du circuit, avec son tracé).' }), file, text, error],
      actions: [Button({ text: 'Importer le texte', variant: 'green', onClick: () => apply(text.value) })],
    });
  }

  private confirmNew(): void {
    const modal = Modal({
      title: 'Nouveau circuit',
      children: [el('p', { class: 'editor__help', text: 'Repartir d’un ovale vierge ? Le dessin actuel peut être retrouvé avec « Annuler ».' })],
      actions: [
        Button({ text: 'Garder', variant: 'ghost', onClick: () => modal.close() }),
        Button({
          text: 'Nouveau',
          variant: 'yellow',
          attrs: { 'data-testid': 'editor-new-confirm' },
          onClick: () => {
            modal.close();
            this.replaceDoc(newDoc(), 'Nouveau circuit.');
          },
        }),
      ],
    });
  }

  private async test(): Promise<void> {
    if (hasErrors(this.checks)) return;
    let cancelled = false;
    const bar = ProgressBar({ value: 0, max: SIM_RACES, tone: 'blue', label: 'Courses simulées', text: `0 / ${SIM_RACES}` });
    const results = el('div', { class: 'editor__results', 'data-testid': 'editor-sim-results' });
    const modal = Modal({
      title: 'Test du circuit',
      testid: 'editor-sim',
      onClose: () => (cancelled = true),
      children: [
        el('p', { class: 'editor__help', text: `${SIM_RACES} courses de ${plural(this.laps, 'tour')} entre quatre IA (${SIM_LINEUP.map((l) => ({ easy: 'Facile', medium: 'Moyen', hard: 'Difficile' })[l]).join(', ')}).` }),
        bar,
        results,
      ],
    });
    const report = await simulate(this.gen.def, {
      laps: this.laps,
      onProgress: (done, total) => setProgress(bar, done, total, `${done} / ${total}`),
      isCancelled: () => cancelled,
    });
    if (!report || cancelled) return;
    results.replaceChildren(...this.reportView(report));
    modal.el.querySelector('.kit-modal__body')?.scrollTo({ top: 0 });
  }

  private reportView(r: SimReport): HTMLElement[] {
    const stats = el(
      'dl',
      { class: 'editor__stats' },
      el('dt', { text: 'Manches en moyenne' }),
      el('dd', { 'data-testid': 'sim-rounds', text: r.avgRounds.toFixed(1).replace('.', ',') }),
      el('dt', { text: 'Durée estimée' }),
      el('dd', { 'data-testid': 'sim-minutes', text: `≈ ${Math.round(r.minutes)} min` }),
      el('dt', { text: 'Abandons' }),
      el('dd', { 'data-testid': 'sim-retire', text: pct(r.retireRate) }),
    );
    const causes = Object.entries(r.causes)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${CAUSES[k] ?? k} ${v}`)
      .join(', ');
    const table = el('table', { class: 'editor__table', 'data-testid': 'sim-corners' });
    table.append(el('thead', {}, el('tr', {}, ...['Virage', 'Arrêts', 'Sorties ratées', 'Pneus perdus', 'Abandons'].map((h) => el('th', { text: h })))));
    const body = el('tbody');
    for (const c of r.corners.slice(0, 5)) body.append(el('tr', {}, ...[c.id, c.stops, c.overshoots, c.tires, c.retirements].map((v) => el('td', { text: String(v) }))));
    table.append(body);
    return [
      stats,
      el('p', { class: 'editor__help', text: `Durée pour quatre joueurs à ${6} s par tour. Causes d’abandon : ${causes || 'aucune'}.` }),
      el('h3', { class: 'editor__subtitle', text: 'Virages les plus coûteux' }),
      r.corners.length ? table : el('p', { class: 'editor__help', text: 'Aucun virage.' }),
      ...(r.unfinished ? [el('p', { class: 'editor__error', text: `${plural(r.unfinished, 'course')} arrêtée(s) à la limite de manches.` })] : []),
    ];
  }

  private async race(): Promise<void> {
    if (hasErrors(this.checks)) return;
    TRACKS[RACE_TRACK_ID] = { ...this.gen.def, id: RACE_TRACK_ID };
    const params = new URLSearchParams(location.search);
    const delay = Number(params.get('aiDelay') ?? 400);
    const seed = Number(params.get('seed'));
    const cfg: RaceConfig = {
      players: 1 + this.ais,
      trackId: RACE_TRACK_ID,
      laps: this.laps,
      seed: Number.isFinite(seed) && seed > 0 ? seed : (Date.now() % 900_000) + 1,
      controllers: ['human', 'medium', 'medium', 'hard'],
      aiDelay: Number.isFinite(delay) ? delay : 400,
      useGear: false,
    };
    this.view.destroy();
    let current: RaceScreen | null = null;
    const back = () => {
      current?.destroy();
      void new EditorScreen(this.root, this.doc).mount();
    };
    const start = async (c: RaceConfig): Promise<void> => {
      current?.destroy();
      current = await RaceScreen.create(this.root, c, { onMenu: back, onReplay: (next) => void start(next), onFinished: () => null });
    };
    await start(cfg);
  }

  private expose(): void {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __editor: unknown }).__editor = {
      doc: () => this.doc,
      def: () => this.gen.def,
      checks: () => this.checks,
      cellScreen: (id: string) => this.view.cellScreen(id),
      pointScreen: (i: number) => {
        const p = this.doc.points[i];
        return p ? this.view.toPage(p.x, p.y) : null;
      },
      fit: () => this.view.fit(),
      slots: () => this.gen.n,
    };
  }
}
