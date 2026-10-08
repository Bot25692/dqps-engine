import { connection } from 'next/server';
import { getRuntimeRepo } from '@/lib/db/runtime-repo';
import { loadAnalysisInputs } from '@/lib/run-analysis';
import { campaignsView } from '@/lib/presentation/manus-adapters';
import { CampaignsScreen } from '@/components/manus/campaigns/CampaignsScreen';
export const instant=false;
// Preserve dataset routing and existing analytics; filtering is presentation-only.
export default async function CampaignsPage(){await connection();const repo=await getRuntimeRepo();const data=campaignsView(await repo.run(loadAnalysisInputs));return <>{repo.status.banner&&<p role="status" className="host-notice">{repo.status.banner}</p>}<CampaignsScreen data={data}/></>;}
