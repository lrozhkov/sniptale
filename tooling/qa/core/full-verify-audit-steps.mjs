import { createFailureStep, createOkStep, createSkippedStep } from './focused-qa-results.mjs';
import { runAudit } from './verify-audit.mjs';
import { collectSecurityStep, withDuration } from './verify-closeout-step-helpers.mjs';
import { measureSyncStep } from './step-timing.helpers.mjs';

export function collectAuditStep() {
  const { durationMs, value: auditResult } = measureSyncStep(() => runAudit());
  return auditResult.status === 'failed'
    ? createFailureStep('Audit', 'failed', {
        stderr: auditResult.output ? `${auditResult.output.trim()}\n` : '',
        durationMs,
      })
    : withDuration(createOkStep('Audit', auditResult.detail ?? ''), durationMs);
}

export async function collectOptionalSecurityStep({ codeFiles }) {
  if (codeFiles.length === 0) {
    return createSkippedStep('Security');
  }
  return collectSecurityStep();
}
