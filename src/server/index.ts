// The game server: pure rules (actions, import, race checks) and the HTTP handler, shared by the Supabase Edge Function
// (supabase/functions/game) and the tests. No DOM, no src/app, no src/render here.
export { ACTIONS, applyAction, isAction, type ActionContext, type ActionName, type ActionResult, type Applied, type OpenedResult } from './actions';
export { GameError, fail, type ErrorCode } from './errors';
export { IMPORT_CAPS, MAX_SAVE_CHARS, boundProfile, importSave, type Adjustment } from './importSave';
export { createGameHandler, cryptoRandom, defaultAllowedOrigin, PROD_ORIGIN, type ErrorResponse, type GameResponse, type GameStore, type HandlerOptions, type LogEntry, type ServerAction, type StoredRow } from './handler';
export { memoryStore, type MemoryStore } from './memoryStore';
export { LAP_LENGTH, RACE_RULES, minRaceMs, type RaceRules } from './race';
export { RULES_VERSION, STATE_VERSION, freshState, publicState, readState, type PublicState, type RaceToken, type ServerState } from './state';
