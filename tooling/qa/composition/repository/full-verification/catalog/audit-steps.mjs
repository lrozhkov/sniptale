import {
  createFailureStep,
  createOkStep,
  createSkippedStep,
} from '../../../checkpoint/focused-qa-results.mjs';
import { runAudit } from '../../../../audits/supply-chain/npm-audit.mjs';
import {
  collectSecurityStep,
  withDuration,
} from '../../../closeout/closeout-step-helpers/check.mjs';
import { measureSyncStep } from '../../../../runtime/observability/step-timing.helpers.mjs';

export function collectAuditStep() {
  const { durationMs, value: auditResult } = measureSyncStep(() => runAudit());
  return auditResult.status === 'failed'
    ? createFailureStep('Audit', 'failed', {
        stderr: auditResult.output ? `${auditResult.output.trim()}\n` : '',
        durationMs,
      })
    : withDuration(createOkStep('Audit', auditResult.detail ?? ''), durationMs);
}

export async function collectOptionalSecurityStep(
  { codeFiles },
  { securityCollector = collectSecurityStep } = {}
) {
  if (codeFiles.length === 0) {
    return createSkippedStep('HTML sanitizer ownership');
  }
  return securityCollector();
}
