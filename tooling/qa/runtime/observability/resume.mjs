import fs from 'node:fs';
import path from 'node:path';

import { DEFAULT_LIMITS } from './constants.mjs';
import { ObservabilityRunController } from './run-controller.mjs';
import { parseRunRecord } from './schema.mjs';
import { collectSensitiveEnvironmentValues } from './sanitize.mjs';
import { resolveObservabilityPaths, resolveRunsRoot } from './storage.mjs';

export function resumeLatestObservabilityRun({
  rootDir = process.cwd(),
  wrapperId,
  notBeforeMs,
  allowMissing = false,
  clock = Date.now,
  environment = process.env,
} = {}) {
  const candidates = [];
  const runsRoot = resolveRunsRoot(rootDir);
  if (!fs.existsSync(runsRoot)) {
    if (allowMissing) return null;
    throw new Error('No observability records exist for artifact collection.');
  }
  for (const day of fs.readdirSync(runsRoot)) {
    const dayRoot = path.join(runsRoot, day);
    if (!fs.statSync(dayRoot).isDirectory()) continue;
    for (const name of fs.readdirSync(dayRoot).filter((entry) => entry.endsWith('.json'))) {
      const record = parseRunRecord(JSON.parse(fs.readFileSync(path.join(dayRoot, name), 'utf8')));
      if (
        record.schemaVersion === 3 &&
        record.wrapperId === wrapperId &&
        record.parentRunId === null &&
        Date.parse(record.startedAt) >= notBeforeMs
      ) {
        candidates.push(record);
      }
    }
  }
  if (candidates.length === 0 && allowMissing) return null;
  if (candidates.length !== 1) {
    throw new Error(`Expected one resumable ${wrapperId} run, found ${candidates.length}.`);
  }
  const record = candidates[0];
  const paths = resolveObservabilityPaths({
    rootDir,
    runId: record.runId,
    startedAt: record.startedAt,
  });
  const session = new ObservabilityRunController({
    record,
    paths,
    repositoryRoots: [rootDir],
    clock,
    maximumLogBytes: DEFAULT_LIMITS.logBytes,
    sensitiveValues: collectSensitiveEnvironmentValues(environment),
  });
  session.resume();
  return session;
}
