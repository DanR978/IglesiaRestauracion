// js/pages/admin/admin-fn.js
// Thin wrapper around the `admin-invite` Edge Function. Every privileged
// account/preset operation goes through here; the function runs with the
// service-role key and re-checks that the caller is an admin.

import { sb } from './state.js';

export async function callAdmin(action, payload = {}) {
  const { data, error } = await sb.functions.invoke('admin-invite', {
    body: { action, ...payload },
  });
  if (error) {
    let msg = 'No se pudo completar la operación.';
    try {
      const body = await error.context.json();
      if (body?.error) msg = body.error;
    } catch { msg = error.message || msg; }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
