import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const RESULT = new Set(['success', 'failure', 'cancelled', 'skipped']);

export function admitGateGraph({
  admissionResult,
  canonicalResult,
  classifierResult,
  cleanupResult,
  executionPath,
  imageResult,
  provisionResult,
  reuse,
}) {
  const results = {
    admissionResult,
    canonicalResult,
    classifierResult,
    cleanupResult,
    imageResult,
    provisionResult,
  };
  if (Object.values(results).some((result) => !RESULT.has(result))) {
    throw new Error('Gate graph contains an unknown GitHub job result.');
  }
  const derived =
    executionPath === 'derived' &&
    reuse === true &&
    classifierResult === 'success' &&
    admissionResult === 'success' &&
    imageResult === 'skipped' &&
    provisionResult === 'skipped' &&
    canonicalResult === 'skipped' &&
    cleanupResult === 'skipped';
  const vm =
    executionPath === 'vm' &&
    reuse === false &&
    ['success', 'skipped'].includes(classifierResult) &&
    admissionResult === 'success' &&
    imageResult === 'success' &&
    provisionResult === 'success' &&
    canonicalResult === 'success' &&
    cleanupResult === 'success';
  if (!derived && !vm) {
    throw new Error('Gate jobs do not form an explicitly admitted derived or VM graph.');
  }
  return {
    schemaVersion: 1,
    artifactKind: 'sniptale-trusted-gate-graph',
    outcome: 'passed',
    executionPath,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const inputPath = process.argv[2];
  let input;
  if (inputPath) input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  else {
    input = {
      admissionResult: process.env.SNIPTALE_ADMISSION_RESULT,
      canonicalResult: process.env.SNIPTALE_CANONICAL_RESULT,
      classifierResult: process.env.SNIPTALE_CLASSIFIER_RESULT,
      cleanupResult: process.env.SNIPTALE_CLEANUP_RESULT,
      executionPath: process.env.SNIPTALE_EXECUTION_PATH,
      imageResult: process.env.SNIPTALE_IMAGE_RESULT,
      provisionResult: process.env.SNIPTALE_PROVISION_RESULT,
      reuse: process.env.SNIPTALE_DERIVED_REUSE === 'true',
    };
  }
  process.stdout.write(`${JSON.stringify(admitGateGraph(input))}\n`);
}
