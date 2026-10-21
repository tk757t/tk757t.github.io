import { describe, expect, it } from 'vitest';
import { MAX_CHAT_CHARS, REPORT_REASONS, chatError, chatProblem, cleanChatText } from './chat';

describe('what is checked before a message leaves (the server checks again)', () => {
  it('collapses the spaces, like the server', () => {
    expect(cleanChatText('  bonjour    à \n tous  ')).toBe('bonjour à tous');
  });

  it('accepts a normal message and refuses an empty or a too long one', () => {
    expect(chatProblem('Salut !')).toBeNull();
    expect(chatProblem('   ')).toMatch(/Écrivez/);
    expect(chatProblem('a'.repeat(MAX_CHAT_CHARS))).toBeNull();
    expect(chatProblem('a'.repeat(MAX_CHAT_CHARS + 1))).toMatch(/200 caractères/);
  });

  it('refuses links and web addresses, but not words that only look alike', () => {
    for (const t of ['regarde http://exemple.com', 'https://exemple.fr/x', 'www.exemple.org', 'mon site exemple.fr', 'va sur discord.gg']) expect(chatProblem(t), t).toMatch(/liens/);
    for (const t of ['Belle conduite !', 'à 3.5 secondes', 'ok.merci', 'rendez-vous à 15h.']) expect(chatProblem(t), t).toBeNull();
  });
});

describe('the words of the refusals', () => {
  it('shows the sentences the server wrote for the player', () => {
    expect(chatError(new Error('Doucement : un message par seconde au maximum.'))).toBe('Doucement : un message par seconde au maximum.');
    expect(chatError({ message: 'Vous êtes réduit au silence pour le moment.' })).toBe('Vous êtes réduit au silence pour le moment.');
    expect(chatError(new Error('Message refusé : langage inapproprié.'))).toBe('Message refusé : langage inapproprié.');
  });

  it('never shows a raw technical message, and explains a network failure', () => {
    expect(chatError(new Error('permission denied for table chat_messages'))).toBe('Le chat ne répond pas. Réessayez.');
    expect(chatError(new Error('relation "chat_messages" does not exist'))).toBe('Le chat ne répond pas. Réessayez.');
    expect(chatError(null)).toBe('Le chat ne répond pas. Réessayez.');
    expect(chatError(new TypeError('Failed to fetch'))).toMatch(/Connexion impossible/);
  });

  it('offers the four reasons of the server, no other', () => {
    expect(REPORT_REASONS.map((r) => r.id)).toEqual(['insulte', 'spam', 'harcelement', 'autre']);
  });
});
