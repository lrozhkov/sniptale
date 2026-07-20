import fs from 'node:fs';
import path from 'node:path';

import { DEFAULT_LIMITS } from './constants.mjs';
import { parseRunRecord, parseStep } from './schema.mjs';
import {
  appendBoundedLog,
  listJsonFiles,
  listLogFiles,
  readJsonFile,
  resolveLogsRoot,
  resolveRunsRoot,
  writeJsonAtomic,
} from './storage.mjs';
import { summarizeSteps } from './run.mjs';
import { assertObservedQaRuleId } from '../../core/qa-steps/runtime-registry.mjs';

function readRecord(filePath, runsRoot) {
  try {
    const record = parseRunRecord(readJsonFile(filePath));
    const expectedPath = path.join(runsRoot, record.startedAt.slice(0, 10), `${record.runId}.json`);
    if (filePath !== expectedPath) {
      throw new Error('Run record is not stored at its canonical schema path');
    }
    return { filePath, record };
  } catch (error) {
    return { filePath, error };
  }
}

export function readRunRecords({ rootDir = process.cwd() } = {}) {
  const runsRoot = resolveRunsRoot(rootDir);
  return listJsonFiles(runsRoot).map((filePath) => readRecord(filePath, runsRoot));
}

export function isProcessAlive(processId) {
  try {
    process.kill(processId, 0);
    return true;
  } catch (error) {
    return !(error instanceof Error && 'code' in error && error.code === 'ESRCH');
  }
}

function createStaleRecoveryStep(finishedAt) {
  assertObservedQaRuleId('qa.rule.wrapper-stale-run-recovery');
  return parseStep({
    stepId: 'qa.rule.wrapper-stale-run-recovery',
    outcome: 'interrupted',
    startedAt: finishedAt,
    finishedAt,
    durationMs: 0,
    controlIds: [],
    problemIds: ['wrapper.interrupted.stale-run'],
    skipReasonId: null,
    diagnostic: {
      summary: 'Run owner stopped updating the record',
      locations: [],
      remediation: 'Inspect the abandoned wrapper log before starting replacement proof.',
      ruleDoc: 'docs/tooling/wrapper-summary.md',
      evidence: [],
    },
  });
}

export function recoverStaleRuns({
  rootDir = process.cwd(),
  now = Date.now(),
  staleAfterMs = DEFAULT_LIMITS.staleRunAgeMs,
  isOwnerAlive = isProcessAlive,
} = {}) {
  const recovered = [];
  for (const entry of readRunRecords({ rootDir })) {
    if (!entry.record || entry.record.status !== 'running') continue;
    if (now - Date.parse(entry.record.startedAt) < staleAfterMs) continue;
    if (isOwnerAlive(entry.record.ownerPid)) continue;
    const finishedAt = new Date(now).toISOString();
    entry.record.steps.push(createStaleRecoveryStep(finishedAt));
    entry.record.status = 'interrupted';
    entry.record.exitCode = 143;
    entry.record.finishedAt = finishedAt;
    entry.record.durationMs = Math.max(0, now - Date.parse(entry.record.startedAt));
    entry.record.summary = summarizeSteps(entry.record.steps);
    const logResult = appendBoundedLog(
      path.join(rootDir, ...entry.record.log.path.split('/')),
      '[wrapper.stale-run-recovery]\nRun recovered as interrupted after its owner stopped updating it.\n',
      { repositoryRoot: rootDir }
    );
    entry.record.log = {
      ...entry.record.log,
      digest: logResult.digest,
      byteCount: logResult.byteCount,
      truncated: logResult.truncated,
    };
    writeJsonAtomic(entry.filePath, parseRunRecord(entry.record));
    recovered.push(entry.record.runId);
  }
  return recovered.sort();
}

function removeEmptyParents(startPath, stopPath) {
  let current = path.dirname(startPath);
  while (current.startsWith(stopPath) && current !== stopPath) {
    try {
      fs.rmdirSync(current);
    } catch {
      break;
    }
    current = path.dirname(current);
  }
}

function selectQuarantineRemovals(filePaths, { maximumAgeMs, maximumFiles, now }) {
  return filePaths
    .map((filePath) => ({ filePath, modifiedAt: fs.statSync(filePath).mtimeMs }))
    .sort(
      (left, right) =>
        right.modifiedAt - left.modifiedAt || left.filePath.localeCompare(right.filePath)
    )
    .filter(
      (entry, index) => index >= Math.max(0, maximumFiles) || now - entry.modifiedAt > maximumAgeMs
    )
    .map((entry) => entry.filePath);
}

function removeQuarantinedFiles(filePaths, rootPath) {
  for (const filePath of filePaths) {
    fs.rmSync(filePath, { force: true });
    removeEmptyParents(filePath, rootPath);
  }
}

export function enforceRetention({
  rootDir = process.cwd(),
  now = Date.now(),
  maximumAgeMs = DEFAULT_LIMITS.retentionAgeMs,
  maximumRuns = DEFAULT_LIMITS.retainedRuns,
  maximumInvalidRecords = DEFAULT_LIMITS.retainedInvalidRecords,
  maximumOrphanLogs = DEFAULT_LIMITS.retainedOrphanLogs,
} = {}) {
  const runsRoot = resolveRunsRoot(rootDir);
  const logsRoot = resolveLogsRoot(rootDir);
  const allEntries = readRunRecords({ rootDir });
  const validEntries = allEntries
    .filter((entry) => entry.record)
    .sort((left, right) => Date.parse(right.record.startedAt) - Date.parse(left.record.startedAt));
  const finalizedEntries = validEntries.filter((entry) => entry.record.status !== 'running');
  const retainedFinalizedCount = Math.max(1, maximumRuns);
  const removals = finalizedEntries.filter((entry, index) => {
    const age = now - Date.parse(entry.record.finishedAt ?? entry.record.startedAt);
    return index >= retainedFinalizedCount || (index > 0 && age > maximumAgeMs);
  });
  for (const entry of removals) {
    fs.rmSync(entry.filePath, { force: true });
    const logPath = path.join(rootDir, ...entry.record.log.path.split('/'));
    fs.rmSync(logPath, { force: true });
    removeEmptyParents(entry.filePath, runsRoot);
    removeEmptyParents(logPath, logsRoot);
  }
  const invalidRemovals = selectQuarantineRemovals(
    allEntries.filter((entry) => !entry.record).map((entry) => entry.filePath),
    { maximumAgeMs, maximumFiles: maximumInvalidRecords, now }
  );
  removeQuarantinedFiles(invalidRemovals, runsRoot);

  const removedRunPaths = new Set(removals.map((entry) => entry.filePath));
  const referencedLogs = new Set(
    validEntries
      .filter((entry) => !removedRunPaths.has(entry.filePath))
      .map((entry) => path.resolve(rootDir, ...entry.record.log.path.split('/')))
  );
  const orphanRemovals = selectQuarantineRemovals(
    listLogFiles(logsRoot).filter((filePath) => !referencedLogs.has(path.resolve(filePath))),
    { maximumAgeMs, maximumFiles: maximumOrphanLogs, now }
  );
  removeQuarantinedFiles(orphanRemovals, logsRoot);
  return removals.map((entry) => entry.record.runId).sort();
}
