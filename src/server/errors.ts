/**
 * Errors of the game server. The message is shown to the player as is: short, in French, without any internal detail
 * (no stack, no id, no SQL). `code` lets the client react (resync, sign in again...), `status` is the HTTP status.
 */
export type ErrorCode =
  | 'invalid' // malformed request or parameter
  | 'refused' // a rule says no (not enough gems, quest not finished...)
  | 'not_found' // unknown id of the catalogue
  | 'race' // race token missing, reused, expired, or race too short
  | 'import_refused' // the save is already on the server
  | 'too_many' // rate limit
  | 'conflict' // optimistic lock lost three times
  | 'corrupt' // the stored state cannot be read
  | 'auth' // no valid session
  | 'suspended'
  | 'server';

export class GameError extends Error {
  constructor(
    message: string,
    readonly code: ErrorCode = 'refused',
    readonly status = 400,
  ) {
    super(message);
    this.name = 'GameError';
  }
}

export function fail(message: string, code: ErrorCode = 'refused', status = 400): never {
  throw new GameError(message, code, status);
}
