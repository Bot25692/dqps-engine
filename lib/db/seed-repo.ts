import type { SeedData } from '../../seed';

// A dedicated write repository bootstraps fixture tables through server-side PostgREST.
export class SeedRepo {
  async saveSeed(data: SeedData) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Database mode requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    const tables = [
      ['skus', data.skus], ['campaigns', data.campaigns],
      ['ad_metrics_daily', data.metrics], ['inventory_daily', data.inventory],
      ['campaign_state', data.campaign_state], ['confidence_weights', data.confidence_weights],
    ] as const;
    // FK order matters. Upserts make reruns safe; unrelated rows and decisions are preserved.
    for (const [table, rows] of tables) {
      const response = await fetch(new URL(`/rest/v1/${table}`, url), {
        method: 'POST', signal: AbortSignal.timeout(3000),
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(rows),
      });
      if (!response.ok) throw new Error(`Seed write to ${table} failed (${response.status}); earlier tables may have been written. Rerun to retry.`);
    }
  }
}
