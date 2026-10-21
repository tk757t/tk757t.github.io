/* global URL, fetch, performance, Buffer */
// Live check of the deployed game function with a throwaway guest account (docs/deploiement.md).
//   node tools/smoke-game.mjs            -> project of src/net/config.ts
//   SMOKE_URL=... SMOKE_KEY=... node tools/smoke-game.mjs
// It creates ONE guest account on the real project: delete it afterwards (its id is printed on the first line).
import { readFileSync } from 'node:fs';

const config = readFileSync(new URL('../src/net/config.ts', import.meta.url), 'utf8');
const URL_ = process.env.SMOKE_URL ?? /SUPABASE_URL = '([^']+)'/.exec(config)?.[1];
const KEY = process.env.SMOKE_KEY ?? /SUPABASE_KEY = '([^']+)'/.exec(config)?.[1];
if (!URL_ || !KEY) throw new Error('project URL / key not found');

const signup = await fetch(`${URL_}/auth/v1/signup`, { method: 'POST', headers: { apikey: KEY, 'content-type': 'application/json' }, body: '{}' });
const s = await signup.json();
console.log('USER_ID (à supprimer)', s.user?.id);
if (!s.access_token) throw new Error(`signup refused: ${JSON.stringify(s)}`);

const post = async (token, action, params = {}) => {
  const a = performance.now();
  const r = await fetch(`${URL_}/functions/v1/game`, {
    method: 'POST',
    headers: { apikey: KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json', origin: 'https://tk757t.github.io' },
    body: JSON.stringify({ action, params }),
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ms: Math.round(performance.now() - a), region: r.headers.get('x-sb-edge-region'), j };
};
const call = (action, params) => post(s.access_token, action, params);

let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${label}${detail ? '  ' + detail : ''}`);
};

let r = await call('sync');
check('sync', r.status === 200 && r.j.state?.profile?.welcomeUntil > r.j.serverTime, `${r.ms} ms, région ${r.region}`);
r = await call('claim_welcome');
check('pack de bienvenue', r.status === 200 && r.j.state.profile.gold === 2200 && r.j.state.profile.gems === 325, `${r.ms} ms`);
r = await call('claim_welcome');
check('pack de bienvenue refusé la 2e fois', r.status === 400);
r = await call('claim_gift');
check('cadeau du jour', r.status === 200 && r.j.state.profile.gold === 2220, `${r.ms} ms`);
r = await call('buy_offer', { id: 'pack-epic' });
check('achat (écriture)', r.status === 200 && r.j.state.profile.gems === 265, `${r.ms} ms`);
r = await call('start_race', { trackId: 'oval', laps: 2, players: 2, bots: 1 });
check('jeton de course', r.status === 200 && !!r.j.result?.race?.id);
r = await call('nope');
check('action inconnue refusée', r.status === 400);

// forged tokens must be stopped by the gateway (verify_jwt): the function trusts the token payload
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const forged = `${b64({ alg: 'ES256', typ: 'JWT' })}.${b64({ sub: '72d68c74-ed44-4bee-ad5e-e9becaf26224', role: 'authenticated', exp: 4_102_444_800 })}.${Buffer.from('forged-signature').toString('base64url')}`;
r = await post(forged, 'sync');
check('jeton falsifié refusé par la passerelle', r.status === 401, `statut ${r.status}`);
r = await post(KEY, 'sync');
check('clé publique seule (pas un joueur) refusée', r.status === 401, `statut ${r.status}`);

const times = [];
for (let i = 0; i < 11; i++) {
  const x = await call('sync');
  if (i > 0) times.push(x.ms);
}
times.sort((a, b) => a - b);
console.log(`sync x10 : min ${times[0]}, médiane ${times[5]}, p90 ${times[9]}, max ${times[9]} ms`);
if (failures > 0) {
  console.log(`${failures} échec(s)`);
  process.exit(1);
}
console.log('tout est bon');
