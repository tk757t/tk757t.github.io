import { describe, expect, it } from 'vitest';
import { userFromVerifiedJwt } from './jwt';

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const token = (payload: object) => `${b64({ alg: 'ES256', typ: 'JWT' })}.${b64(payload)}.signature`;
const NOW = Date.UTC(2026, 9, 21, 12);
const SUB = '72d68c74-ed44-4bee-ad5e-e9becaf26224';
const good = { sub: SUB, role: 'authenticated', exp: NOW / 1000 + 3600 };

describe('userFromVerifiedJwt', () => {
  it('reads the player of a valid session token', () => {
    expect(userFromVerifiedJwt(token(good), NOW)).toEqual({ id: SUB });
  });

  it('refuses an expired token', () => {
    expect(userFromVerifiedJwt(token({ ...good, exp: NOW / 1000 - 1 }), NOW)).toBeNull();
    expect(userFromVerifiedJwt(token({ ...good, exp: NOW / 1000 }), NOW)).toBeNull();
  });

  it('refuses a token that is not a signed-in player (anon key, service role, no subject)', () => {
    expect(userFromVerifiedJwt(token({ ...good, role: 'anon' }), NOW)).toBeNull();
    expect(userFromVerifiedJwt(token({ ...good, role: 'service_role' }), NOW)).toBeNull();
    expect(userFromVerifiedJwt(token({ role: 'authenticated', exp: good.exp }), NOW)).toBeNull();
    expect(userFromVerifiedJwt(token({ ...good, sub: 'not-a-uuid' }), NOW)).toBeNull();
    expect(userFromVerifiedJwt(token({ ...good, sub: 42 }), NOW)).toBeNull();
  });

  it('refuses a token without an expiry, and anything unreadable', () => {
    expect(userFromVerifiedJwt(token({ sub: SUB, role: 'authenticated' }), NOW)).toBeNull();
    expect(userFromVerifiedJwt('', NOW)).toBeNull();
    expect(userFromVerifiedJwt('a.b.c', NOW)).toBeNull();
    expect(userFromVerifiedJwt('only-one-part', NOW)).toBeNull();
    expect(userFromVerifiedJwt(`x.${Buffer.from('[1,2]').toString('base64url')}.y`, NOW)).toBeNull();
  });
});
