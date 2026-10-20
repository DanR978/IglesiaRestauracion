// S06 "Done when": typed supabase.from('events') compiles strict, and
// importing the client under Node/prerender opens no socket. S38: its auth
// options.
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { Database } from '#lib/db/database.types.js';

describe('typed supabase client', () => {
  it('imports without touching the network (prerender-safe)', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    try {
      const { supabase } = await import('#lib/db/client.js');
      expect(supabase).toBeTruthy();
      expect(typeof supabase.from).toBe('function');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  // S38 (D-035): PKCE, the OAuth callback route exchanges the code itself,
  // and the default storage key is the session the legacy /admin uses (D-040).
  it('signs in with PKCE and never reads a session from the URL', async () => {
    const { AUTH_OPTIONS } = await import('#lib/db/client.js');
    expect(AUTH_OPTIONS).toEqual({
      flowType: 'pkce',
      detectSessionInUrl: false,
      persistSession: false, // browser=false under the test stub: prerender-safe
      autoRefreshToken: false,
    });
    expect(AUTH_OPTIONS).not.toHaveProperty('storageKey');
  });

  it('keeps the default storage key, shared with the legacy /admin', async () => {
    const { supabase } = await import('#lib/db/client.js');
    const key = (supabase.auth as unknown as { storageKey: string }).storageKey;
    expect(key).toBe('sb-stub-auth-token');
  });

  it('is typed against the generated schema', () => {
    type EventsRow = Database['public']['Tables']['events']['Row'];
    type IncomeRow = Database['public']['Tables']['fin_income']['Row'];
    expectTypeOf<EventsRow>().toHaveProperty('id');
    expectTypeOf<IncomeRow>().toHaveProperty('occurred_on');
    expectTypeOf<IncomeRow>().toHaveProperty('amount');
  });
});
