import { findObservedQaRule } from '../../core/qa-steps/runtime-registry.mjs';
import { formatDuration } from '../../runtime/run-metrics.helpers.mjs';

const SUMMARY_PROBLEM_LIMIT = 6;

function collectChildRunLogPaths(record) {
  const paths = new Set();
  for (const step of record.steps ?? []) {
    for (const evidence of step.diagnostic?.evidence ?? []) {
      if (evidence.kind === 'child-run' && typeof evidence.logPath === 'string') {
        paths.add(evidence.logPath);
      }
    }
  }
  paths.delete(record.log?.path);
  return [...paths];
}

function findDefinition(label) {
  const definition = findObservedQaRule(label);
  if (!definition) throw new Error(`Unregistered QA step emitted by a wrapper: ${label}`);
  return definition;
}

function problemCategory(step) {
  if (step.violations?.length > 0) return 'violations';
  if (step.failures?.length > 0) return 'failures';
  if (step.exitCode) return 'process-exit';
  return 'failed';
}

function skipReason(step) {
  if (step.skipReasonId) return step.skipReasonId;
  const detail = String(step.detail ?? '').toLowerCase();
  if (step.status === 'blocked') return 'blocked-by-prerequisite';
  if (detail.includes('help requested')) return 'help-requested';
  if (detail.includes('fresh') || detail.includes('reuse')) return 'fresh-proof-reused';
  if (
    detail.includes('no matching') ||
    detail.includes('no changed') ||
    detail.includes('no product') ||
    detail.includes('control-only')
  ) {
    return 'no-applicable-targets';
  }
  return 'conditional-not-run';
}

function stepOutcome(step) {
  if (step.status === 'ok') return 'passed';
  if (step.status === 'failed') return 'problems-found';
  return 'skipped';
}

function renderViolations(violations = []) {
  return violations.map((violation) => {
    if (typeof violation === 'string') return `- ${violation}`;
    const line = violation.line == null ? '' : `:${violation.line}`;
    return `- ${violation.file ?? '<repository>'}${line} ${violation.message ?? 'violation'}`;
  });
}

function structuredLocations(step) {
  const violations = (step.violations ?? []).map((violation) =>
    typeof violation === 'string'
      ? { file: '<repository>', line: null, message: violation }
      : {
          file: violation.file ?? '<repository>',
          line: violation.line ?? null,
          message: violation.message ?? 'violation',
        }
  );
  const failures = (step.failures ?? []).map((failure) => ({
    file: '<repository>',
    line: null,
    message: String(failure),
  }));
  return [...violations, ...failures];
}

function createStructuredDiagnostic(step, definition, failed) {
  const evidence = step.evidence ?? [];
  if (!failed && evidence.length === 0) return null;
  return {
    summary: step.summary ?? step.detail ?? (failed ? 'step failed' : null),
    locations: structuredLocations(step),
    remediation: step.advice ?? definition.remediation,
    ruleDoc: definition.ruleDoc,
    evidence,
  };
}

export function renderObservedStepLog(step, definition) {
  const lines = [
    `${step.label} [${definition.id}]`,
    `status: ${step.status}`,
    step.summary ? `summary: ${step.summary}` : '',
    step.detail ? `detail: ${step.detail}` : '',
    ...renderViolations(step.violations),
    ...(step.failures ?? []).map((failure) => `- ${failure}`),
    step.stdout ? `stdout:\n${step.stdout}` : '',
    step.stderr ? `stderr:\n${step.stderr}` : '',
    step.advice ? `step remediation: ${step.advice}` : '',
    `repository remediation: ${definition.remediation}`,
    `rule: ${definition.ruleDoc}`,
  ].filter(Boolean);
  return `${lines.join('\n')}\n`;
}

export function normalizeObservedStep(step) {
  const definition = findDefinition(step.label);
  const outcome = stepOutcome(step);
  const failed = outcome === 'problems-found';
  return {
    definition,
    observation: {
      stepId: definition.id,
      outcome,
      durationMs: step.durationMs ?? 0,
      controlIds: [definition.id],
      problemIds: failed ? [`${definition.id}.${problemCategory(step)}`] : [],
      skipReasonId: outcome === 'skipped' ? skipReason(step) : null,
      diagnostic: createStructuredDiagnostic(step, definition, failed),
      log: renderObservedStepLog(step, definition),
    },
  };
}

export function formatObservedRunSummary({ label, record, runPath }) {
  const problems = record.summary.problemIds;
  const result =
    record.status === 'skipped'
      ? 'skipped'
      : problems.length === 0
        ? 'all passed'
        : 'problems found';
  const problemLine =
    problems.length === 0
      ? 'Problems: none'
      : `Problems: ${problems.length} — ${problems.slice(0, SUMMARY_PROBLEM_LIMIT).join(', ')}${
          problems.length > SUMMARY_PROBLEM_LIMIT
            ? `, +${problems.length - SUMMARY_PROBLEM_LIMIT} more`
            : ''
        }`;
  const pathLines = [
    `Run record: ${runPath}`,
    record.log?.path ? `Run log: ${record.log.path}` : '',
    ...(problems.length > 0 ? collectChildRunLogPaths(record) : []).map(
      (logPath) => `Child run log: ${logPath}`
    ),
  ].filter(Boolean);
  return `${label}: ${result} in ${formatDuration(record.durationMs ?? 0)}\n${problemLine}\n${pathLines.join('\n')}\n`;
}
