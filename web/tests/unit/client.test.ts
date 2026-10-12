// S06 "Done when": typed supabase.from('events') compiles strict, and
// importing the client under Node/prerender opens no socket.
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { Database } from '$lib/db/database.types';

describe('typed supabase client', () => {
  it('imports without touching the network (prerender-safe)', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    try {
      const { supabase } = await import('$lib/db/client');
      expect(supabase).toBeTruthy();
      expect(typeof supabase.from).toBe('function');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('is typed against the generated schema', () => {
    type EventsRow = Database['public']['Tables']['events']['Row'];
    type IncomeRow = Database['public']['Tables']['fin_income']['Row'];
    expectTypeOf<EventsRow>().toHaveProperty('id');
    expectTypeOf<IncomeRow>().toHaveProperty('occurred_on');
    expectTypeOf<IncomeRow>().toHaveProperty('amount');
  });
});
