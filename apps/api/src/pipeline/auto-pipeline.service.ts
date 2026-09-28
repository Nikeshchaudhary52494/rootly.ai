import { prisma } from '../prisma';
import { collectContext } from '../incident-context/incident-context.service';
import { startInvestigation } from '../investigations/investigations.service';
import { startReproduction } from '../reproductions/reproductions.service';
import { startFixAttempt } from '../fix-attempts/fix-attempts.service';
import { startPrCreation } from '../pull-requests/pull-requests.service';

const POLL_INTERVAL_MS = 2000;
const STAGE_TIMEOUT_MS = 10 * 60 * 1000;

function log(event: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ event, ...fields }));
}

async function pollUntil<T>(read: () => Promise<T>, isDone: (value: T) => boolean): Promise<T> {
  const deadline = Date.now() + STAGE_TIMEOUT_MS;
  for (;;) {
    const value = await read();
    if (isDone(value)) return value;
    if (Date.now() > deadline) throw new Error('stage timed out');
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

/**
 * Runs the full pipeline for a new incident: context -> investigation ->
 * reproduction -> verified fix -> pull request. Each stage is the same service
 * function the dashboard buttons call, so preconditions are enforced the same
 * way. Stops (with a log line, no throw) at the first stage that doesn't
 * succeed; a human can resume from that stage in the dashboard. Never merges.
 * ponytail: in-process, lost if the API restarts mid-run. Move behind a queue if that matters.
 */
export async function runAutoPipeline(incidentId: string): Promise<void> {
  let stage = 'context';
  const stop = (reason: string) => log('auto_pipeline_stopped', { incidentId, stage, reason });

  try {
    const context = await collectContext(incidentId);
    if (context.status !== 'READY') return stop(`context ${context.status}`);

    stage = 'investigation';
    const investigation = await startInvestigation(incidentId);
    if (investigation.status !== 'COMPLETED') return stop(`investigation ${investigation.status}`);

    stage = 'reproduction';
    const { id: runId } = await startReproduction(incidentId);
    const run = await pollUntil(
      () => prisma.reproductionRun.findUniqueOrThrow({ where: { id: runId }, select: { status: true, result: true } }),
      (r) => r.status === 'COMPLETED' || r.status === 'FAILED',
    );
    if (run.status !== 'COMPLETED' || run.result !== 'REPRODUCED') return stop(`reproduction ${run.status}/${run.result}`);

    stage = 'fix';
    const { id: fixId } = await startFixAttempt(incidentId);
    const fix = await pollUntil(
      () => prisma.fixAttempt.findUniqueOrThrow({ where: { id: fixId }, select: { status: true, result: true } }),
      (f) => f.status === 'COMPLETED' || f.status === 'FAILED',
    );
    if (fix.status !== 'COMPLETED' || fix.result !== 'FIX_VERIFIED') return stop(`fix ${fix.status}/${fix.result}`);

    stage = 'pull_request';
    const pr = await startPrCreation(incidentId);
    log('auto_pipeline_completed', { incidentId, pullRequestId: pr.id });
  } catch (err) {
    stop(err instanceof Error ? err.message : String(err));
  }
}
