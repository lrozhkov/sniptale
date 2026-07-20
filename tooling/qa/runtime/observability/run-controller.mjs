import {
  createStep,
  elapsedMilliseconds,
  isoTimestamp,
  resolveExitCode,
  resolveFinalStatus,
  summarizeSteps,
} from './run-record.mjs';
import { parseRunRecord } from './schema.mjs';
import { sanitizeDiagnostic } from './sanitize.mjs';
import { appendBoundedLog, writeJsonAtomic } from './storage.mjs';
import { assertObservedQaRuleId } from '../../core/qa-steps/runtime-registry.mjs';

export class ObservabilityRunController {
  #record;
  #repositoryRoots;
  #clock;
  #maximumLogBytes;
  #sensitiveValues;
  #finalized = false;

  constructor({ record, paths, repositoryRoots, clock, maximumLogBytes, sensitiveValues }) {
    this.#record = record;
    this.#repositoryRoots = repositoryRoots;
    this.#clock = clock;
    this.#maximumLogBytes = maximumLogBytes;
    this.#sensitiveValues = new Set(sensitiveValues);
    this.runId = record.runId;
    this.rootRunId = record.rootRunId;
    this.parentRunId = record.parentRunId;
    this.runPath = paths.runPath;
    this.logPath = paths.logPath;
    this.logRelativePath = paths.logRelativePath;
  }

  #assertActive() {
    if (this.#finalized) {
      throw new Error(`Observability run ${this.runId} is already finalized`);
    }
  }

  #persist() {
    this.#record.summary = summarizeSteps(this.#record.steps);
    writeJsonAtomic(this.runPath, parseRunRecord(this.#record));
  }

  writeLog(value) {
    const result = appendBoundedLog(this.logPath, value, {
      maximumBytes: this.#maximumLogBytes,
      repositoryRoots: this.#repositoryRoots,
      sensitiveValues: [...this.#sensitiveValues],
    });
    this.#record.log = {
      path: this.logRelativePath,
      digest: result.digest,
      byteCount: result.byteCount,
      truncated: result.truncated,
    };
    this.#persist();
    return result;
  }

  addSensitiveValues(values = []) {
    this.#assertActive();
    for (const value of values) {
      if (typeof value === 'string' && value.length >= 3) this.#sensitiveValues.add(value);
    }
  }

  addStep(input) {
    this.#assertActive();
    const step = createStep(
      {
        ...input,
        diagnostic: sanitizeDiagnostic(input.diagnostic, {
          repositoryRoots: this.#repositoryRoots,
          sensitiveValues: [...this.#sensitiveValues],
        }),
      },
      this.#clock
    );
    if (input.log !== undefined) this.writeLog(`[${step.stepId}]\n${String(input.log)}\n`);
    this.#record.steps.push(step);
    this.#persist();
    return step;
  }

  attachRepositoryContext({ scope, suite, mode, targetFiles } = {}) {
    this.#assertActive();
    this.#record.repository = {
      ...this.#record.repository,
      ...(scope === undefined ? {} : { scope }),
      ...(suite === undefined ? {} : { suite }),
      ...(mode === undefined ? {} : { mode }),
      ...(targetFiles === undefined ? {} : { targetFiles: [...new Set(targetFiles)].sort() }),
    };
    this.#persist();
    return structuredClone(this.#record.repository);
  }

  finalize({ status, exitCode } = {}) {
    this.#assertActive();
    const finishedAt = isoTimestamp(this.#clock);
    this.#record.status = resolveFinalStatus(this.#record.steps, status);
    this.#record.exitCode = resolveExitCode(this.#record.status, exitCode);
    this.#record.finishedAt = finishedAt;
    this.#record.durationMs = elapsedMilliseconds(this.#record.startedAt, finishedAt);
    this.#persist();
    this.#finalized = true;
    return this.snapshot();
  }

  fail(error, { stepId = 'wrapper.lifecycle', problemId = 'wrapper.unhandled-error' } = {}) {
    const canonicalStepId = stepId === 'wrapper.lifecycle' ? 'qa.rule.wrapper-lifecycle' : stepId;
    assertObservedQaRuleId(canonicalStepId);
    const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
    this.addStep({
      stepId: canonicalStepId,
      outcome: 'error',
      problemIds: [problemId],
      diagnostic: {
        summary: error instanceof Error ? error.message : String(error),
        locations: [],
        remediation:
          'Inspect the recorded lifecycle failure and correct the owning wrapper contract.',
        ruleDoc: 'docs/tooling/wrapper-summary.md',
        evidence: [],
      },
      log: detail,
    });
    return this.finalize({ status: 'problems-found', exitCode: 1 });
  }

  interrupt(signal = 'SIGTERM') {
    assertObservedQaRuleId('qa.rule.wrapper-interruption');
    const normalizedSignal = String(signal).toLowerCase().replaceAll('_', '-');
    this.addStep({
      stepId: 'qa.rule.wrapper-interruption',
      outcome: 'interrupted',
      problemIds: [`wrapper.interrupted.${normalizedSignal}`],
      diagnostic: {
        summary: `Wrapper interrupted by ${String(signal)}`,
        locations: [],
        remediation: 'Confirm repository state before restarting the interrupted wrapper.',
        ruleDoc: 'docs/tooling/wrapper-summary.md',
        evidence: [],
      },
      log: `Wrapper interrupted by ${String(signal)}`,
    });
    return this.finalize({
      status: 'interrupted',
      exitCode: signal === 'SIGINT' ? 130 : 143,
    });
  }

  attachProcessInterruptionHandlers({ signals = ['SIGINT', 'SIGTERM'] } = {}) {
    const handlers = signals.map((signal) => {
      const handler = () => {
        if (!this.#finalized) this.interrupt(signal);
      };
      process.once(signal, handler);
      return [signal, handler];
    });
    return () => {
      for (const [signal, handler] of handlers) process.off(signal, handler);
    };
  }

  snapshot() {
    return structuredClone(this.#record);
  }
}
