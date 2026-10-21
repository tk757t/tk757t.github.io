import { claimPseudo, accountError, loadAccount, pseudoProblem, signInGuest, startDiscord, type Account } from './account';
import { devParam } from './devParams';
import { Button, Modal, type ModalHandle } from '../ui/kit';
import { el } from '../ui/dom';

/** In development the account step is skipped (the e2e tests play offline); ?account=1 turns it on. Production always asks. */
const accountStepEnabled = (): boolean => !import.meta.env.DEV || devParam('account') === '1';

/**
 * First launch: the player chooses a pseudo first, then plays as a guest or signs in with Discord. Resolves once the
 * account has its pseudo. If the server cannot be reached the game is playable offline (nothing is blocked).
 */
export async function ensureAccount(): Promise<void> {
  if (!accountStepEnabled()) return;
  let account: Account | null;
  try {
    account = await loadAccount();
  } catch {
    return; // offline: play without an account
  }
  if (account?.pseudo) return;
  await new Promise<void>((resolve) => {
    let modal: ModalHandle | null = null;
    const input = el('input', { type: 'text', maxlength: 16, autocomplete: 'off', spellcheck: 'false', placeholder: 'Votre pseudo', 'aria-label': 'Votre pseudo', 'data-testid': 'account-pseudo' });
    const message = el('p', { class: 'account__message', role: 'alert', 'data-testid': 'account-message' });
    const say = (t: string): void => {
      message.textContent = t;
    };
    const finish = (): void => {
      modal?.close();
      resolve();
    };
    const checked = (): string | null => {
      const problem = pseudoProblem(input.value);
      if (problem) {
        say(problem);
        input.focus();
        return null;
      }
      return input.value.trim();
    };
    const buttons: HTMLButtonElement[] = [];
    const busy = (on: boolean): void => buttons.forEach((b) => (b.disabled = on));
    // no network: the game stays playable, without an account (offered only after a connection error)
    const offlineBtn = Button({ text: 'Jouer hors ligne', variant: 'ghost', block: true, attrs: { 'data-testid': 'account-offline', hidden: true }, onClick: finish });
    const fail = (e: unknown): void => {
      say(accountError(e));
      offlineBtn.hidden = !/Connexion impossible/.test(message.textContent ?? '');
      busy(false);
    };
    const guestBtn = Button({
      text: account ? 'Valider' : 'Jouer en invité',
      variant: 'green',
      size: 'lg',
      block: true,
      attrs: { 'data-testid': 'account-guest' },
      onClick: async () => {
        const pseudo = checked();
        if (!pseudo) return;
        busy(true);
        say('');
        try {
          if (account) await claimPseudo(pseudo);
          else await signInGuest(pseudo);
          finish();
        } catch (e) {
          fail(e);
        }
      },
    });
    buttons.push(guestBtn);
    if (!account) {
      buttons.push(
        Button({
          text: 'Continuer avec Discord',
          variant: 'blue',
          block: true,
          attrs: { 'data-testid': 'account-discord' },
          onClick: async () => {
            if (input.value.trim() && !checked()) return;
            busy(true);
            try {
              await startDiscord(input.value.trim() || null);
            } catch (e) {
              fail(e);
            }
          },
        }),
      );
    }
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') guestBtn.click();
    });
    modal = Modal({
      title: account ? 'Choisissez votre pseudo' : 'Bienvenue sur 4 Mules',
      testid: 'account-modal',
      dismissible: false,
      children: [
        el('label', { class: 'online__field' }, el('span', { text: 'Pseudo (visible par les autres joueurs)' }), input),
        el('p', { class: 'account__hint', text: 'Aucune donnée personnelle n’est demandée ni enregistrée : seulement ce pseudo.' }),
        message,
      ],
      actions: [...buttons, offlineBtn],
    });
    queueMicrotask(() => input.focus());
  });
}
