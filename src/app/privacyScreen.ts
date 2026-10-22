import { deleteAccount, accountError, getAccount } from './account';
import { deleteConfirmed, PRIVACY } from '../data/privacy';
import { toast } from './toast';
import { pageBody } from './guideScreen';
import { Button, Modal, type ModalHandle } from '../ui/kit';
import { el } from '../ui/dom';

/** The privacy notice: who publishes the game, what it keeps, what Discord adds, how to delete the account. */
export function openPrivacy(): ModalHandle {
  return Modal({
    title: 'Confidentialité',
    testid: 'privacy-modal',
    children: [el('div', { class: 'guide__page' }, ...PRIVACY.flatMap((s) => [el('h3', { class: 'privacy__title', text: s.title }), ...pageBody(s.lines)]))],
  });
}

/** Deleting the account takes two steps: a warning, then the pseudo typed back. Nothing is sent before the second one. */
export function openDeleteAccount(): void {
  const pseudo = getAccount()?.pseudo;
  if (!pseudo) return;
  let step1: ModalHandle | null = null;
  step1 = Modal({
    title: 'Supprimer mon compte ?',
    testid: 'delete-step1',
    children: [
      el('p', { class: 'guide__p', text: 'Votre compte, votre pseudo, votre progression, vos messages et votre lien Discord seront effacés du serveur, tout de suite et sans retour possible. Cet appareil sera aussi vidé.' }),
    ],
    actions: [
      Button({ text: 'Annuler', variant: 'ghost', block: true, attrs: { 'data-testid': 'delete-cancel' }, onClick: () => step1?.close() }),
      Button({
        text: 'Continuer',
        variant: 'red',
        block: true,
        attrs: { 'data-testid': 'delete-continue' },
        onClick: () => {
          step1?.close();
          openStep2(pseudo);
        },
      }),
    ],
  });
}

function openStep2(pseudo: string): void {
  const input = el('input', { type: 'text', maxlength: 16, autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Votre pseudo', placeholder: pseudo, 'data-testid': 'delete-pseudo' });
  const message = el('p', { class: 'account__message', role: 'alert', 'data-testid': 'delete-message' });
  let modal: ModalHandle | null = null;
  const confirm = Button({
    text: 'Supprimer définitivement',
    variant: 'red',
    block: true,
    attrs: { 'data-testid': 'delete-confirm', disabled: true },
    onClick: async () => {
      confirm.disabled = true;
      message.textContent = '';
      try {
        await deleteAccount();
      } catch (e) {
        message.textContent = accountError(e);
        confirm.disabled = !deleteConfirmed(input.value, pseudo);
        return;
      }
      toast('Compte supprimé.', 'good');
      modal?.close();
      setTimeout(() => location.reload(), 600);
    },
  });
  input.addEventListener('input', () => {
    confirm.disabled = !deleteConfirmed(input.value, pseudo);
  });
  modal = Modal({
    title: 'Dernière étape',
    testid: 'delete-step2',
    children: [
      el('p', { class: 'guide__p', text: `Pour confirmer, tapez votre pseudo : ${pseudo}` }),
      el('label', { class: 'online__field' }, el('span', { text: 'Votre pseudo' }), input),
      message,
    ],
    actions: [Button({ text: 'Annuler', variant: 'ghost', block: true, attrs: { 'data-testid': 'delete-cancel2' }, onClick: () => modal?.close() }), confirm],
  });
  queueMicrotask(() => input.focus());
}
