import { describe, expect, it } from 'vitest';
import { accountError, pseudoProblem, redirectErrorMessage } from './account';

describe('pseudo rules (same as the server)', () => {
  it('accepts 3 to 16 letters, digits and _ - .', () => {
    for (const p of ['Léa'.replace('é', 'e'), 'Max_07', 'a.b-c', 'ABC', 'x'.repeat(16)]) expect(pseudoProblem(p)).toBeNull();
  });

  it('refuses a wrong length or other characters', () => {
    for (const p of ['', 'ab', 'x'.repeat(17), 'two words', 'é_é_é', '<b>hi</b>', 'a;b']) expect(pseudoProblem(p)).not.toBeNull();
  });

  it('refuses reserved names, whatever the case', () => {
    for (const p of ['Admin', 'xxADMINxx', 'Modo42', 'Staff', 'System', '4Mules', 'Anonyme']) expect(pseudoProblem(p)).toMatch(/disponible/);
  });

  it('trims the spaces around', () => {
    expect(pseudoProblem('  Max  ')).toBeNull();
  });
});

describe('error messages for the player', () => {
  it('explains the usual failures in French', () => {
    expect(accountError(new Error('Ce pseudo est déjà pris.'))).toBe('Ce pseudo est déjà pris.');
    expect(accountError({ message: 'duplicate key value violates unique constraint' })).toBe('Ce pseudo est déjà pris.');
    expect(accountError(new Error('Compte suspendu.'))).toBe('Compte suspendu.');
    expect(accountError(new TypeError('Failed to fetch'))).toMatch(/Connexion impossible/);
  });

  it('never shows a raw technical message', () => {
    expect(accountError(new Error('relation "profiles" does not exist'))).toBe('Une erreur est survenue. Réessayez.');
    expect(accountError(null)).toBe('Une erreur est survenue. Réessayez.');
  });
});

describe('Discord failures, in words the player can act on', () => {
  it('turns what the server says into a sentence about the cause', () => {
    expect(accountError(new Error('Unsupported provider: provider is not enabled'))).toMatch(/Discord n’est pas encore disponible/);
    expect(accountError(new Error('Manual linking is disabled'))).toMatch(/Lier ce compte à Discord/);
    expect(accountError({ message: 'Identity is already linked to another user', code: 'identity_already_exists' })).toMatch(/déjà lié/);
    expect(accountError(new Error('requested path is invalid'))).toMatch(/adresse du jeu/);
  });

  it('reads the error of a return from Discord, in the query or in the # part', () => {
    expect(redirectErrorMessage('?error=access_denied&error_description=The+resource+owner+denied', '')).toBe('Connexion Discord annulée.');
    expect(redirectErrorMessage('', '#error=access_denied&error_code=bad_oauth_callback')).toBe('Connexion Discord annulée.');
    expect(redirectErrorMessage('?error=server_error&error_description=Error+getting+user+email+from+external+provider', '')).toMatch(/adresse vérifiée/);
    expect(redirectErrorMessage('?error=server_error&error_description=Something+odd', '')).toMatch(/La connexion avec Discord a échoué/);
  });

  it('says nothing when the address carries no error', () => {
    expect(redirectErrorMessage('?join=ABCD', '')).toBeNull();
    expect(redirectErrorMessage('', '')).toBeNull();
  });
});
