import { printViolations } from './shared.mjs';
import { printFailure, printOk } from './focused-qa-helpers.mjs';
import { formatStepDetail, formatStepSummary } from './step-timing.helpers.mjs';

function trimTrailingColon(value) {
  return value.replace(/:\s*$/u, '');
}

function printFailureOutput(output = '') {
  if (!output) {
    return;
  }

  process.stdout.write(output.endsWith('\n') ? output : `${output}\n`);
}

function printFailureError(error = '') {
  if (!error) {
    return;
  }

  process.stderr.write(error.endsWith('\n') ? error : `${error}\n`);
}

function formatViolationFileAdvice(violations = []) {
  const files = [...new Set(violations.map((violation) => violation.file).filter(Boolean))].sort();
  if (files.length === 0) {
    return '';
  }

  const suffix = files.length > 4 ? `, +${files.length - 4} more` : '';
  return `fix all reported issues before rerun; files: ${files.slice(0, 4).join(', ')}${suffix}`;
}

export function createOkStep(label, detail = '') {
  return {
    label,
    status: 'ok',
    detail,
  };
}

export function createSkippedStep(label, detail = 'no matching files') {
  return {
    label,
    status: 'skipped',
    detail,
  };
}

export function createBlockedStep(label, detail = 'blocked by earlier hardfail steps') {
  return {
    label,
    status: 'blocked',
    detail,
  };
}

export function createViolationStep(label, header, result) {
  if (result.violations.length === 0) {
    return result.skipped ? createSkippedStep(label) : createOkStep(label);
  }

  return {
    label,
    status: 'failed',
    summary: trimTrailingColon(header),
    header,
    violations: result.violations,
  };
}

export function createStringFailureStep(label, header, failures) {
  if (failures.length === 0) {
    return createOkStep(label);
  }

  return {
    label,
    status: 'failed',
    summary: trimTrailingColon(header),
    header,
    failures,
  };
}

function stringifyProcessOutput(output) {
  if (!output) {
    return '';
  }

  if (typeof output === 'string') {
    return output;
  }

  if (Array.isArray(output)) {
    return output.filter((part) => typeof part === 'string').join('');
  }

  return String(output);
}

export function createProcessStep(label, result, { advice = '', summary = 'failed' } = {}) {
  const exitCode = result.status ?? result.exitCode ?? 0;
  if (exitCode === 0) {
    return createOkStep(label);
  }

  return {
    label,
    status: 'failed',
    summary,
    stdout: stringifyProcessOutput(result.stdout ?? result.output),
    stderr: stringifyProcessOutput(result.stderr),
    advice,
    exitCode: exitCode || 1,
  };
}

export function createFailureStep(label, summary, details = {}) {
  return {
    label,
    status: 'failed',
    summary,
    ...details,
  };
}

function printStepFailure(step) {
  printFailure(step.label, formatStepSummary(step.summary ?? 'failed', step.durationMs));

  if (step.header && step.violations) {
    printViolations(step.header, step.violations);
    const fileAdvice = formatViolationFileAdvice(step.violations);
    if (fileAdvice) {
      process.stdout.write(
        `${step.label}: advisory (${formatStepDetail(fileAdvice, step.durationMs)})\n`
      );
    }
  }

  if (step.header && step.failures) {
    process.stderr.write(`${step.header}\n\n`);
    for (const failure of step.failures) {
      process.stderr.write(`- ${failure}\n`);
    }
  }

  printFailureOutput(step.stdout);
  printFailureError(step.stderr);

  if (step.advice) {
    process.stdout.write(
      `${step.label}: advisory (${formatStepDetail(step.advice, step.durationMs)})\n`
    );
  }
}

export function printStepResult(step) {
  if (step.status === 'failed') {
    printStepFailure(step);
    return;
  }

  if (step.status === 'blocked') {
    process.stdout.write(
      `${step.label}: blocked${step.detail ? ` (${formatStepDetail(step.detail, step.durationMs)})` : ''}\n`
    );
    return;
  }

  printOk(step.label, formatStepDetail(step.detail ?? '', step.durationMs));
}

function formatFailedStep(step) {
  return `- ${step.label}: ${step.summary ?? 'failed'}`;
}

export function finalizeFocusedResults(steps, summaryLabel = 'QA checkpoint') {
  const failedSteps = steps.filter((step) => step.status === 'failed');
  if (failedSteps.length === 0) {
    process.stdout.write(`${summaryLabel}: OK\n`);
    return;
  }

  process.stderr.write(
    [
      `${summaryLabel}: failed (${failedSteps.length} step`,
      failedSteps.length === 1 ? '' : 's',
      ')\n',
      failedSteps.map(formatFailedStep).join('\n'),
      '\n',
    ].join('')
  );
  process.exit(1);
}
