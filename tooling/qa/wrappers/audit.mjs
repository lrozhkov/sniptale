import { isExecutedAsScript } from '../core/shared.mjs';
import {
  collectAuditSteps,
  createAuditToolStep,
  MAX_AUDIT_FAILURE_PREVIEW,
} from './audit.steps.mjs';
import { runObservedWrapper } from './observed/runner.mjs';
import { resolveAuditProfile } from '../audits/profiles/index.mjs';
import { createAuditProgressReporter } from './audit-progress.mjs';

export { createAuditToolStep, MAX_AUDIT_FAILURE_PREVIEW };

if (isExecutedAsScript(import.meta.url)) {
  const outcome = await runObservedWrapper({
    wrapperId: 'qa:audit',
    label: 'QA audit',
    blocking: true,
    execute: async ({ options, session }) => {
      const profile = resolveAuditProfile(options.profile);
      session.attachRepositoryContext({
        mode: `profile:${profile.id}`,
        scope: 'workspace',
      });
      const onProgress = createAuditProgressReporter({ session });
      return {
        steps: await collectAuditSteps({ profile, onProgress }),
        context: { mode: `profile:${profile.id}`, scope: 'workspace' },
      };
    },
  });
  process.exitCode = outcome.exitCode;
}
