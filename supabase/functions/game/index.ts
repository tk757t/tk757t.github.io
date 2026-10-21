// Edge Function « game » (Deno) : seule porte d'écriture sur l'économie des joueurs connectés (invité ou Discord).
// Le navigateur envoie { action, params } avec son jeton de session ; la logique (règles, import borné, contrôles de
// course, CORS, limites, verrou optimiste, journal) est dans src/server, partagée avec les tests.
//
// Ce fichier n'est pas déployé tel quel : `npx tsx tools/build-edge.ts` produit supabase/functions/game/index.js, un seul
// fichier qui contient src/server et les règles de src/data. Seul import restant : le client Supabase (npm:).
// La clé de service est lue dans Deno.env (fournie par Supabase aux Edge Functions), jamais écrite dans le code.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { createGameHandler } from '../../../src/server/handler.ts';
import { supabaseStore } from '../../../src/server/supabaseStore.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Promise<Response>): void;
};

const url = Deno.env.get('SUPABASE_URL');
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? (JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>).default;
if (!url || !key) throw new Error('SUPABASE_URL / clé de service absentes de l’environnement de la fonction');

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

Deno.serve(createGameHandler(supabaseStore(db)));
