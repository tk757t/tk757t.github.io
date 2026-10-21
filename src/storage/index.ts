// The saved game: one versioned save (see data/profile/profile.ts) and the shape of the campaign progress inside it.
export * from './campaign';
export { BACKUP_KEY, SAVE_KEY, SAVE_VERSION, loadProfile, parseProfile, saveProfile, serializeProfile } from '../data/profile/profile';
