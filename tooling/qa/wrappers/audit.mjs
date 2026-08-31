import { collectAuditSteps } from './audit/execution/steps.mjs';
import { resolveAuditProfile } from '../audits/profiles/index.mjs';
import { createAuditProgressReporter } from './audit/audit-progress.mjs';
import { runTimelineActivity } from '../runtime/observability/timeline-context.mjs';

export async function collectAuditProfileResult({
  profileId,
  reusedControlIds = [],
  session,
  progressReporter = createAuditProgressReporter,
  stepCollector = collectAuditSteps,
} = {}) {
  const profile = resolveAuditProfile(profileId);
  const reusedControls = new Set(reusedControlIds);
  for (const controlId of reusedControls) {
    if (profile.controls.get(controlId)?.requirement !== 'required') {
      throw new Error(`Audit proof reuse is not required by profile ${profile.id}: ${controlId}`);
    }
  }
  const executionProfile = { ...profile, reusedControlIds: reusedControls };
  const context = { mode: `profile:${profile.id}`, scope: 'workspace' };
  session?.attachRepositoryContext(context);
  const onProgress = session ? progressReporter({ session }) : undefined;
  return {
    steps: await runTimelineActivity(
      { activityId: `audit-profile.${profile.id}`, kind: 'audit-profile' },
      () => stepCollector({ profile: executionProfile, onProgress })
    ),
    context,
  };
}
