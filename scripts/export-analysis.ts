import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { FixtureRepo } from '../lib/db/repo.ts';
import { runAnalysis } from '../lib/run-analysis.ts';

// Export seed 1 through the same Repo pipeline, independently of DATA_SOURCE and credentials.
export async function main() {
  const { anomalies, recommendations } = await runAnalysis(new FixtureRepo({ seed: 1 }));
  await mkdir(new URL('../fixtures/', import.meta.url), { recursive: true });
  await writeFile(new URL('../fixtures/analysis.json', import.meta.url),
    JSON.stringify({ anomalies, recommendations }, null, 2) + '\n');
  console.log(`Exported ${anomalies.length} anomalies and ${recommendations.length} recommendations.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error('Analysis export failed; no new analysis was exported.'); process.exitCode = 1; });
}
