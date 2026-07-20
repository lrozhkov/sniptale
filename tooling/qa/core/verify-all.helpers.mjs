import { printViolations } from './shared.mjs';
import {
  formatStepDetail,
  formatStepSummary,
  measureAsyncStep,
  measureSyncStep,
} from './step-timing.helpers.mjs';

function trimTrailingColon(value) {
  return value.replace(/:\s*$/u, '');
}

export function printOk(label, detail = '', durationMs = null) {
  const formattedDetail =
    durationMs === null || durationMs === undefined ? detail : formatStepDetail(detail, durationMs);
  process.stdout.write(`${label}: OK${formattedDetail ? ` (${formattedDetail})` : ''}\n`);
}

export function printAdvisory(label, detail = '', durationMs = null) {
  const formattedDetail =
    durationMs === null || durationMs === undefined ? detail : formatStepDetail(detail, durationMs);
  process.stdout.write(`${label}: advisory${formattedDetail ? ` (${formattedDetail})` : ''}\n`);
}

export function printFailure(label, summary, durationMs = null) {
  const formattedSummary =
    durationMs === null || durationMs === undefined
      ? summary
      : formatStepSummary(summary, durationMs);
  process.stderr.write(`${label}: ${formattedSummary}\n`);
}

export async function exitOnProcessFailure(
  resultOrRunner,
  label,
  { advice = '', suppressSuccessOutput = false } = {}
) {
  const { durationMs, value: result } =
    typeof resultOrRunner === 'function'
      ? await measureAsyncStep(resultOrRunner)
      : { durationMs: null, value: resultOrRunner };

  if (result.status !== 0) {
    printFailure(label, 'failed', durationMs);
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
    if (advice) {
      printAdvisory(label, advice, durationMs);
    }
    process.exit(result.status ?? 1);
  }

  if (!suppressSuccessOutput) {
    printOk(label, '', durationMs);
  }
}

export function runViolationStep(label, header, runner) {
  const { durationMs, value: result } = measureSyncStep(runner);
  if (result.violations.length > 0) {
    printFailure(label, trimTrailingColon(header), durationMs);
    printViolations(header, result.violations);
    process.exit(1);
  }

  printOk(label, '', durationMs);
}

export function runStringFailureStep(label, header, failures) {
  if (failures.length > 0) {
    printFailure(label, trimTrailingColon(header));
    process.stderr.write(`${header}\n\n`);
    for (const failure of failures) {
      process.stderr.write(`- ${failure}\n`);
    }
    process.exit(1);
  }

  printOk(label);
}

export function runTimedStringFailureStep(label, header, runner) {
  const { durationMs, value: failures } = measureSyncStep(runner);
  if (failures.length > 0) {
    printFailure(label, trimTrailingColon(header), durationMs);
    process.stderr.write(`${header}\n\n`);
    for (const failure of failures) {
      process.stderr.write(`- ${failure}\n`);
    }
    process.exit(1);
  }

  printOk(label, '', durationMs);
}
