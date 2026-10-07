import type { Repo } from './repo.ts';
import { createRepo, type DataRepo } from './data-source.ts';
import { validateRange } from './supabase-repo.ts';

// Fetch one coherent dataset of plain arrays; analysis functions receive no database objects.
export async function loadAnalysisData(from: string, to: string, repo: DataRepo = createRepo()) {
  validateRange(from, to);
  const data = await repo.run(async (source: Repo) => {
    const [skus, campaigns, metrics, inventory] = await Promise.all([
      source.getSkus(), source.getCampaigns(), source.getMetrics(from, to), source.getInventory(from, to),
    ]);
    return { skus, campaigns, metrics, inventory };
  });
  return { ...data, ...repo.status };
}
