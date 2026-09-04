import { collectQaResultSteps } from '../../composition/catalog/contract.mjs';
import { normalizeObservedStep } from './output.mjs';

export function createHelpStep() {
  return {
    label: 'Wrapper help',
    status: 'skipped',
    detail: 'help requested',
  };
}

export function resolveInvocationMode(wrapperId, values) {
  if (wrapperId === 'qa:build') {
    if (values.proofOnly) return 'proof';
    if (values.shouldCommit) return 'commit';
  }
  if (wrapperId === 'qa:e2e') {
    return `${values.suite ?? 'smoke'}-${values.headed ? 'headed' : 'headless'}`;
  }
  if (wrapperId === 'qa:closeout') return 'commit';
  if (wrapperId === 'qa:preflight' && values.files?.length > 0) return 'explicit-files';
  return 'default';
}

function attachResultContext(session, result, observationMode) {
  if (!result.context) {
    session.attachRepositoryContext({ mode: observationMode });
    return;
  }
  session.attachRepositoryContext({
    scope: result.context.scope ?? (result.context.suite ? 'current-diff' : 'workspace'),
    suite: result.context.suite ?? null,
    targetFiles: result.context.allTargetFiles ?? result.context.targetFiles ?? [],
    mode: observationMode,
  });
}

function emitFailureTail(session, step) {
  const output = [step.stdout, step.stderr].filter(Boolean).join('\n');
  if (!output) return;
  const tail = session.sanitizeConsoleTail(output);
  const quoted = tail
    .split(/\r\n?|\n/u)
    .map((line) => `| ${line}`)
    .join('\n');
  process.stdout.write(`[${step.label}: failure output tail]\n${quoted}\n`);
}

function summarizeAdvisoryConsole(session, step) {
  const findings = step.advisories ?? [];
  if (findings.length <= 12) return null;
  const top = findings.slice(0, 6).map((finding) => {
    const id = finding.id ?? finding.family ?? 'advisory';
    return `${finding.file ?? '<repository>'}: ${id}`;
  });
  return [
    `${step.label}: ${findings.length} advisory findings (top ${top.length})`,
    ...top.map((finding) => `- ${finding}`),
    `Full findings: ${session.logRelativePath}`,
  ].join('\n');
}

export function recordObservedResult(session, result, verbose, contract) {
  const steps = collectQaResultSteps(result);
  const executionMode =
    result.executionMode ?? (result.skipped ? 'no-targets' : contract.executionMode);
  const observationMode = result.context?.mode ?? executionMode ?? contract.invocationMode;
  attachResultContext(session, result, observationMode);
  session.attachAnalysis({
    ...(result.preflightContext === undefined ? {} : { preflightContext: result.preflightContext }),
    ...(result.changeRisk === undefined ? {} : { changeRisk: result.changeRisk }),
    ...(result.advisory === undefined ? {} : { advisory: result.advisory }),
  });
  contract.validator({
    wrapperId: contract.wrapperId,
    mode: executionMode,
    steps,
    skipped: result.skipped ?? false,
  });
  for (const step of steps) {
    if (step.consoleOutput) {
      const fullOutput = session.sanitizeConsoleOutput(step.consoleOutput, 1024 * 1024);
      const consoleOutput =
        summarizeAdvisoryConsole(session, step) ??
        session.sanitizeConsoleOutput(step.consoleOutput);
      process.stdout.write(consoleOutput.endsWith('\n') ? consoleOutput : `${consoleOutput}\n`);
      session.writeLog(`[${step.label}.console]\n${fullOutput}\n`);
    }
    const normalized = normalizeObservedStep(step);
    session.addStep(normalized.observation);
    if (verbose) process.stdout.write(normalized.observation.log);
    else if (step.status === 'failed') emitFailureTail(session, step);
  }
  const hasFailedStep = steps.some((step) => step.status === 'failed');
  return session.finalize(result.skipped && !hasFailedStep ? { status: 'skipped' } : undefined);
}
