import { isExecutedAsScript } from '../core/shared.mjs';
import {
  collectAuditSteps,
  createAuditToolStep,
  MAX_AUDIT_FAILURE_PREVIEW,
} from './audit.steps.mjs';
import { runObservedWrapper } from './observed/runner.mjs';
import { resolveAuditProfile } from '../audits/profiles/index.mjs';
import { createAuditProgressReporter } from './audit-progress.mjs';
import {
  recordSkippedTimelineActivity,
  runTimelineActivity,
} from '../runtime/observability/timeline-context.mjs';

export { createAuditToolStep, MAX_AUDIT_FAILURE_PREVIEW };

export async function collectAuditProfileResult({
  profileId,
  session,
  progressReporter = createAuditProgressReporter,
  stepCollector = collectAuditSteps,
} = {}) {
  const profile = resolveAuditProfile(profileId);
  const context = { mode: `profile:${profile.id}`, scope: 'workspace' };
  session?.attachRepositoryContext(context);
  const onProgress = session ? progressReporter({ session }) : undefined;
  return {
    steps: await runTimelineActivity(
      { activityId: `audit-profile.${profile.id}`, kind: 'audit-profile' },
      () => stepCollector({ profile, onProgress })
    ),
    context,
  };
}

export function recordSkippedAuditProfile(profileId) {
  const profile = resolveAuditProfile(profileId);
  recordSkippedTimelineActivity({
    activityId: `audit-profile.${profile.id}`,
    kind: 'audit-profile',
  });
  for (const controlId of profile.controls.keys()) {
    recordSkippedTimelineActivity({
      activityId: `audit-control.${controlId}`,
      kind: 'audit-control',
      dependencies: [`audit-profile.${profile.id}`],
    });
  }
}

if (isExecutedAsScript(import.meta.url)) {
  const outcome = await runObservedWrapper({
    wrapperId: 'qa:audit',
    label: 'QA audit',
    blocking: true,
    execute: async ({ options, session }) => {
      return collectAuditProfileResult({ profileId: options.profile, session });
    },
  });
  process.exitCode = outcome.exitCode;
}
