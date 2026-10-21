import { fetchBoard, fetchMyPlace, ordinal, seasonInfo, type BoardEntry, type MyPlace } from '../net/leaderboard';
import { serverError } from '../net/chat';
import { Badge, Button, Modal, type ModalHandle } from '../ui/kit';
import { el } from '../ui/dom';

const nf = new Intl.NumberFormat('fr-FR');

/** The ranking of the season: the best players by trophies, and the place of the person. */
export function openLeaderboard(): ModalHandle {
  const list = el('ol', { class: 'board__list', 'data-testid': 'board-list' });
  const mine = el('p', { class: 'board__mine', 'data-testid': 'board-mine' });
  const status = el('p', { class: 'board__status muted', role: 'status', 'data-testid': 'board-status', text: 'Chargement…' });
  const season = seasonInfo(Date.now());
  const modal = Modal({
    title: 'Classement',
    testid: 'board',
    variant: 'sheet',
    children: [
      el('p', { class: 'muted board__season', 'data-testid': 'board-season', text: `Saison ${season.number} · fin dans ${season.daysLeft} jour${season.daysLeft > 1 ? 's' : ''}` }),
      mine,
      list,
      status,
      Button({ text: 'Actualiser', variant: 'ghost', block: true, attrs: { 'data-testid': 'board-refresh' }, onClick: () => load() }),
    ],
  });

  function draw(rows: BoardEntry[], place: MyPlace | null): void {
    mine.replaceChildren(
      ...(place
        ? [el('span', { text: 'Vous : ' }), el('b', { text: ordinal(place.rank) }), el('span', { text: ` sur ${place.total} · ${nf.format(place.trophies)} trophées · ligue ${place.league.label}` })]
        : [el('span', { text: 'Jouez une course classée pour entrer au classement.' })]),
    );
    list.replaceChildren(
      ...rows.map((r) =>
        el(
          'li',
          { class: `board__row${r.mine ? ' board__row--me' : ''}`, 'data-rank': String(r.rank) },
          el('span', { class: 'board__rank', text: ordinal(r.rank) }),
          el('span', { class: 'board__who' }, el('b', { text: r.pseudo }), el('small', { text: `${r.wins} victoire${r.wins > 1 ? 's' : ''} · ${r.races} course${r.races > 1 ? 's' : ''}` })),
          Badge({ text: r.league.label, tone: 'blue', label: `Ligue ${r.league.label}` }),
          el('b', { class: 'board__trophies', text: `🏆 ${nf.format(r.trophies)}` }),
        ),
      ),
    );
    status.textContent = rows.length ? '' : 'Personne n’a encore joué de course classée cette saison.';
  }

  async function load(): Promise<void> {
    status.textContent = 'Chargement…';
    try {
      const [rows, place] = await Promise.all([fetchBoard(50), fetchMyPlace()]);
      draw(rows, place);
    } catch (e) {
      list.replaceChildren();
      status.textContent = serverError(e, 'Le classement ne répond pas. Réessayez.');
    }
  }
  void load();
  return modal;
}
