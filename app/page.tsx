import { connection } from 'next/server';
import { getRuntimeRepo } from '@/lib/db/runtime-repo';
import { loadAnalysisInputs } from '@/lib/run-analysis';
import { overviewView } from '@/lib/presentation/manus-adapters';
import { OverviewScreen } from '@/components/manus/overview/OverviewScreen';
export const instant=false;
// Feed the new presentation from the selected dataset's existing Repo snapshot.
export default async function OverviewPage(){await connection();const repo=await getRuntimeRepo();const data=overviewView(await repo.run(loadAnalysisInputs));return <>{repo.status.banner&&<p role="status" className="host-notice">{repo.status.banner}</p>}<OverviewScreen data={data}/></>;}
