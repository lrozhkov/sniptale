import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { createFailureStep, createProcessStep } from '../core/focused-qa-results.mjs';
import { runNpm } from '../core/shared.mjs';
import { authorizeBlockingWrapperLockHandoff } from '../runtime/blocking-wrapper-lock.helpers.mjs';
import { readRunRecords, resolveObservabilityRoot } from '../runtime/observability/index.mjs';
import { timeSyncStep } from '../core/step-timing.helpers.mjs';

const CLOSEOUT_BUILD_LOCK_ENV = 'SNIPTALE_QA_CLOSEOUT_BUILD_LOCK';
const CLOSEOUT_BUILD_OWNER_PID_ENV = 'SNIPTALE_QA_CLOSEOUT_BUILD_OWNER_PID';

function createLockHandoffToken() {
  return randomUUID();
}

function assertChildRecord(record, { parentRunId, rootRunId, processExitCode }) {
  if (
    record.wrapperId !== 'qa:build' ||
    record.parentRunId !== parentRunId ||
    record.rootRunId !== rootRunId ||
    record.finishedAt === null ||
    record.status === 'running' ||
    record.exitCode !== processExitCode
  ) {
    throw new Error(`Child build run lineage or result does not match ${record.runId}`);
  }
}

function assertChildLog(storageRoot, record) {
  const logPath = path.resolve(storageRoot, record.log.path);
  const contents = fs.readFileSync(logPath);
  const digest = createHash('sha256').update(contents).digest('hex');
  if (contents.byteLength !== record.log.byteCount || digest !== record.log.digest) {
    throw new Error(`Child build log integrity does not match ${record.runId}`);
  }
}

export function collectChildRunEvidence(runId, { parentRunId, rootRunId, processExitCode } = {}) {
  if (!runId) return [];
  if (!parentRunId || !rootRunId || !Number.isInteger(processExitCode)) {
    throw new Error(`Child build run evidence expectations are incomplete for ${runId}`);
  }
  const storageRoot = resolveObservabilityRoot();
  const entry = readRunRecords({ rootDir: storageRoot }).find(
    ({ record }) => record?.runId === runId
  );
  if (!entry?.record) {
    throw new Error(`Child build run evidence is unavailable for ${runId}`);
  }
  assertChildRecord(entry.record, { parentRunId, rootRunId, processExitCode });
  assertChildLog(storageRoot, entry.record);
  return [
    {
      kind: 'child-run',
      runId,
      recordPath: path.relative(storageRoot, entry.filePath).replaceAll(path.sep, '/'),
      logPath: entry.record.log.path,
    },
  ];
}

export function createCloseoutBuildHandoffEnv(
  handoffToken,
  ownerPid = process.pid,
  { parentRunId, rootRunId, runId } = {}
) {
  return {
    [CLOSEOUT_BUILD_LOCK_ENV]: handoffToken,
    [CLOSEOUT_BUILD_OWNER_PID_ENV]: String(ownerPid),
    ...(runId ? { SNIPTALE_QA_RUN_ID: runId } : {}),
    ...(rootRunId ? { SNIPTALE_QA_ROOT_RUN_ID: rootRunId } : {}),
    ...(parentRunId ? { SNIPTALE_QA_PARENT_RUN_ID: parentRunId } : {}),
    ...(parentRunId ? { SNIPTALE_QA_SUPPRESS_SUMMARY: '1' } : {}),
  };
}

export function collectBuildStep(buildArgs, runIdentity = {}, dependencies = {}) {
  const handoffToken = (dependencies.tokenFactory ?? createLockHandoffToken)();
  runIdentity.registerSensitiveValues?.([handoffToken]);
  const parentRunId = runIdentity.parentRunId;
  const rootRunId = runIdentity.rootRunId ?? parentRunId;
  const childRunId = parentRunId ? randomUUID() : undefined;
  (dependencies.handoffAuthorizer ?? authorizeBlockingWrapperLockHandoff)('qa:closeout', {
    consumerId: 'qa:build',
    parentRunId,
    rootRunId,
    runId: childRunId,
    token: handoffToken,
  });
  let processResult;
  const step = timeSyncStep(() => {
    processResult = (dependencies.npmRunner ?? runNpm)(
      ['run', '--silent', 'qa:build', '--', ...buildArgs],
      {
        env: createCloseoutBuildHandoffEnv(handoffToken, process.pid, {
          parentRunId,
          rootRunId,
          runId: childRunId,
        }),
        stdio: 'pipe',
      }
    );
    return createProcessStep('Full build', processResult);
  });
  try {
    return {
      ...step,
      evidence: collectChildRunEvidence(childRunId, {
        parentRunId,
        rootRunId,
        processExitCode: processResult.status ?? processResult.exitCode ?? 0,
      }),
    };
  } catch (error) {
    return createFailureStep('Full build', 'child run evidence unavailable', {
      durationMs: step.durationMs,
      stdout: step.stdout,
      stderr: [step.stderr, error instanceof Error ? error.message : String(error)]
        .filter(Boolean)
        .join('\n'),
    });
  }
}

export function runCloseoutBuildStep({
  buildArgs = [],
  buildStepCollector = collectBuildStep,
  onBeforeBuild = () => {},
  runIdentity,
  registerSensitiveValues,
} = {}) {
  onBeforeBuild();
  return buildStepCollector(buildArgs, { ...runIdentity, registerSensitiveValues });
}
