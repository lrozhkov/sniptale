import { createFailureStep, createSkippedStep, createOkStep } from '../core/focused-qa-results.mjs';
import {
  AUDIT_PROFILE_SKIP_REASONS,
  resolveOptionalAuditSkipReason,
} from '../audits/profiles/index.mjs';

export const MAX_AUDIT_FAILURE_PREVIEW = 8;

function toTimedStep(step, durationMs) {
  return {
    ...step,
    durationMs,
  };
}

function formatViolationPreview(violation) {
  const lineLabel = violation.line != null ? `:${violation.line}` : '';
  return `- ${violation.file}${lineLabel} ${violation.message}`;
}

function summarizeAuditFindings(result) {
  const reportPath = result.sarifPath ?? result.reportPath ?? null;
  const lines = [`Findings: ${result.violations.length}`];
  if (reportPath) {
    lines.push(`Report: ${reportPath}`);
  }
  if (result.summaryText) {
    lines.push('', result.summaryText);
  }

  const preview = result.violations.slice(0, MAX_AUDIT_FAILURE_PREVIEW).map(formatViolationPreview);
  if (preview.length > 0) {
    lines.push('', ...preview);
  }

  const hiddenCount = result.violations.length - preview.length;
  if (hiddenCount > 0) {
    lines.push(`- ... and ${hiddenCount} more`);
  }

  return lines.join('\n');
}

function createExcludedStep(label, durationMs, profileId) {
  return toTimedStep(
    {
      ...createSkippedStep(label, `not selected by audit profile ${profileId}`),
      skipReasonId: AUDIT_PROFILE_SKIP_REASONS.profileNotSelected,
    },
    durationMs
  );
}

function createRequiredSkipFailure(label, result, durationMs, profileId) {
  return toTimedStep(
    createFailureStep(label, 'required audit control did not run', {
      stderr: result.reason ?? 'Audit adapter reported a skip without a reason.',
      advice: `Provision or repair ${label} before rerunning the ${profileId} audit profile.`,
    }),
    durationMs
  );
}

function createOptionalSkipStep(label, result, durationMs, profileId) {
  const skipReasonId = resolveOptionalAuditSkipReason(result.skipReasonId);
  if (!skipReasonId) {
    return toTimedStep(
      createFailureStep(label, 'invalid optional audit skip', {
        stderr: `Optional audit control emitted an unauthorized skip reason: ${String(result.skipReasonId)}`,
        advice: 'Return a registered adapter skip reason or run the control.',
      }),
      durationMs
    );
  }
  return toTimedStep(
    {
      ...createSkippedStep(label, `${profileId} optional control: ${result.reason}`),
      skipReasonId,
    },
    durationMs
  );
}

export function createProfileExcludedAuditStep(label, profileId) {
  return createExcludedStep(label, 0, profileId);
}

export function createAuditToolStep(
  label,
  result,
  durationMs,
  { profileId = 'repository', requirement = 'required' } = {}
) {
  if (requirement === 'excluded') return createExcludedStep(label, durationMs, profileId);
  if (result.skipped) {
    return requirement === 'optional'
      ? createOptionalSkipStep(label, result, durationMs, profileId)
      : createRequiredSkipFailure(label, result, durationMs, profileId);
  }

  if (result.violations.length === 0) {
    const detailParts = ['passed'];
    if (result.sarifPath) {
      detailParts.push(`report=${result.sarifPath}`);
    } else if (result.reportPath) {
      detailParts.push(`report=${result.reportPath}`);
    }
    const summaryLine = result.summaryText?.split('\n').find(Boolean);
    if (summaryLine) {
      detailParts.push(summaryLine);
    }
    return toTimedStep(createOkStep(label, detailParts.join('; ')), durationMs);
  }

  return toTimedStep(
    createFailureStep(label, `findings (${result.violations.length})`, {
      stderr: summarizeAuditFindings(result),
    }),
    durationMs
  );
}
