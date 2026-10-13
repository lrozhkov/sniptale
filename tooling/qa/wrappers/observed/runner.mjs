import path from 'node:path';

import {
  createObservabilityRun,
  enforceRetention,
  recoverStaleRuns,
  resolveObservabilityRoot,
  withObservabilityTimeline,
} from '../../runtime/observability/index.mjs';
import { assertQaExecutionContract } from '../../composition/catalog/contract.mjs';
import { acquireBlockingWrapperLock } from '../../runtime/locking/blocking-wrapper-lock.helpers.mjs';
import { acquireHostQaSlot, HOST_QUEUE_TICKET_ENV } from '../../runtime/locking/host-queue.mjs';
import { parseWrapperArguments } from '../contracts/cli-contracts.mjs';
import { formatObservedRunSummary, normalizeObservedStep } from './output.mjs';
import { createHelpStep, recordObservedResult, resolveInvocationMode } from './result.mjs';
export {
  formatObservedRunSummary,
  normalizeObservedStep,
  renderObservedStepLog,
} from './output.mjs';

function relativeRunPath(session, storageRoot) {
  return path.relative(storageRoot, session.runPath).replaceAll(path.sep, '/');
}

function emitSummary(summary, suppressSummary) {
  if (!suppressSummary) process.stdout.write(summary);
}

function signalExitCode(signal) {
  return signal === 'SIGINT' ? 130 : 143;
}

function attachObservedSignalHandlers({
  session,
  label,
  storageRoot,
  suppressSummary,
  releaseLock,
  processExit,
}) {
  let handled = false;
  const handlers = ['SIGINT', 'SIGTERM'].map((signal) => {
    const handler = () => {
      if (handled) return;
      handled = true;
      const record = session.interrupt(signal);
      releaseLock();
      emitSummary(
        formatObservedRunSummary({
          label,
          record,
          runPath: relativeRunPath(session, storageRoot),
        }),
        suppressSummary
      );
      processExit(signalExitCode(signal));
    };
    process.once(signal, handler);
    return [signal, handler];
  });
  return () => {
    for (const [signal, handler] of handlers) process.off(signal, handler);
  };
}

function writeMaintenanceFailure(session, action, error) {
  const message = error instanceof Error ? error.message : String(error);
  session.writeLog(`[observability.maintenance]\nUnable to ${action}: ${message}\n`);
}

function deniedGitAccess(error) {
  const message = error instanceof Error ? `${error.message} ${error.stack ?? ''}` : String(error);
  return (
    (error?.code === 'EPERM' || /\bEPERM\b/u.test(message)) &&
    (String(error?.syscall ?? '').includes('git') || /spawnSync git/u.test(message))
  );
}

function failObservedRun(session, error) {
  return deniedGitAccess(error)
    ? session.fail(error, {
        stepId: 'wrapper.lifecycle',
        problemId: 'environment.git-access',
        remediation:
          'Repeat the wrapper with read-only git access; this is an environment failure, not a project defect.',
      })
    : session.fail(error, {
        stepId: 'wrapper.lifecycle',
        problemId: 'wrapper.unhandled-error',
      });
}

async function executeObservedCommand(input) {
  let lock = null;
  let hostSlot = null;
  let environmentChanged = false;
  const previousTicket = process.env[HOST_QUEUE_TICKET_ENV];
  const controller = new AbortController();
  function releaseLocks() {
    if (environmentChanged) {
      if (previousTicket === undefined) delete process.env[HOST_QUEUE_TICKET_ENV];
      else process.env[HOST_QUEUE_TICKET_ENV] = previousTicket;
      environmentChanged = false;
    }
    try {
      hostSlot?.release();
    } finally {
      lock?.release();
    }
  }
  const detachSignals = attachObservedSignalHandlers({
    ...input,
    releaseLock: () => {
      controller.abort(new Error('QA wrapper was interrupted.'));
      releaseLocks();
    },
  });
  try {
    if (input.blocking) {
      lock = input.lockFactory(input.wrapperId, {
        runId: input.session.runId,
        rootRunId: input.session.rootRunId,
        parentRunId: input.session.parentRunId,
      });
    }
    if (input.blocking && !lock?.handoff) {
      const activityId = 'wrapper.host-admission';
      const kind = 'host-admission';
      const queuedAt = Date.now();
      input.session.recordActivityTransition({ activityId, kind, state: 'queued' });
      hostSlot = await input.hostSlotFactory(input.wrapperId, {
        runId: input.session.runId,
        signal: controller.signal,
        onWaiting: ({ owner, position }) => {
          process.stdout.write(
            `Waiting for QA slot: position=${position}, owner=${owner ?? 'pending'}.\n`
          );
        },
      });
      input.session.recordActivityTransition({
        activityId,
        kind,
        state: 'started',
        waitReasons: ['concurrency-limit'],
        waitDurations: { concurrencyLimitMs: Date.now() - queuedAt },
      });
      input.session.recordActivityTransition({ activityId, kind, state: 'completed' });
      if (hostSlot.ticketName) {
        process.env[HOST_QUEUE_TICKET_ENV] = hostSlot.ticketName;
        environmentChanged = true;
      }
    }
    if (input.blocking) input.session.refreshRepositoryContext();
    const result = await withObservabilityTimeline(input.session, () =>
      input.execute({ options: input.parsed.values, session: input.session })
    );
    return recordObservedResult(input.session, result, input.parsed.values.verbose ?? false, {
      executionMode: input.executionMode,
      invocationMode: input.invocationMode,
      validator: input.contractValidator,
      wrapperId: input.wrapperId,
    });
  } catch (error) {
    if (controller.signal.aborted) return input.session.snapshot();
    return failObservedRun(input.session, error);
  } finally {
    detachSignals();
    releaseLocks();
  }
}

async function executeObservedInvocation(input) {
  let parsed;
  try {
    parsed = input.parseArguments(input.wrapperId, input.argv);
  } catch (error) {
    input.session.attachRepositoryContext({ mode: 'invalid-arguments' });
    return { helpText: '', record: failObservedRun(input.session, error) };
  }
  if (parsed.values.help) {
    input.session.attachRepositoryContext({ mode: 'help' });
    input.session.addStep(normalizeObservedStep(createHelpStep()).observation);
    input.contractValidator({
      wrapperId: input.wrapperId,
      mode: 'help',
      steps: [createHelpStep()],
      skipped: false,
    });
    const record = input.session.finalize({ status: 'skipped' });
    if (!input.suppressSummary) process.stdout.write(parsed.help);
    return { helpText: parsed.help, record };
  }
  input.session.addSensitiveValues?.([parsed.values.commitMessage]);
  const invocationMode = resolveInvocationMode(input.wrapperId, parsed.values);
  const executionMode = input.wrapperId === 'qa:build' ? invocationMode : 'default';
  const record = await executeObservedCommand({
    ...input,
    executionMode,
    invocationMode,
    parsed,
  });
  return { helpText: parsed.help, record };
}

function createWrapperSession({ wrapperId, environment, storageRoot, sessionFactory }) {
  return sessionFactory({
    wrapperId,
    environment,
    repositoryRoot: process.cwd(),
    storageRoot,
  });
}

function completeObservedRun({ helpText, label, record, session, storageRoot, suppressSummary }) {
  try {
    enforceRetention({ rootDir: storageRoot });
  } catch (error) {
    writeMaintenanceFailure(session, 'enforce retention', error);
  }
  const summary = formatObservedRunSummary({
    label,
    record,
    runPath: relativeRunPath(session, storageRoot),
  });
  emitSummary(summary, suppressSummary);
  return { exitCode: record.exitCode, helpText, record, runPath: session.runPath, summary };
}

/** Own one observed CLI lifecycle. A caller that injects retained leases must release them. */
export async function runObservedWrapper({
  wrapperId,
  label,
  argv = process.argv.slice(2),
  blocking = false,
  execute,
  parseArguments = parseWrapperArguments,
  sessionFactory = createObservabilityRun,
  lockFactory = acquireBlockingWrapperLock,
  hostSlotFactory = acquireHostQaSlot,
  environment = process.env,
  processExit = process.exit,
  contractValidator = assertQaExecutionContract,
} = {}) {
  const storageRoot = resolveObservabilityRoot({ environment });
  const session = createWrapperSession({ wrapperId, environment, storageRoot, sessionFactory });
  try {
    recoverStaleRuns({ rootDir: storageRoot });
  } catch (error) {
    writeMaintenanceFailure(session, 'recover stale records', error);
  }
  const suppressSummary = environment.SNIPTALE_QA_SUPPRESS_SUMMARY === '1';
  const { helpText, record } = await executeObservedInvocation({
    argv,
    blocking,
    contractValidator,
    execute,
    label,
    lockFactory,
    hostSlotFactory,
    parseArguments,
    processExit,
    session,
    storageRoot,
    suppressSummary,
    wrapperId,
  });
  return completeObservedRun({ helpText, label, record, session, storageRoot, suppressSummary });
}
