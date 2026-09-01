import fs from 'node:fs';
import path from 'node:path';

import { isExecutedAsScript } from '../qa/runtime/process/shared-cli.mjs';

const COMMIT = /^[a-f0-9]{40}$/u;
const DIGEST = /^sha256:[a-f0-9]{64}$/u;

export function verifyFinalizerAdmission(file, expected) {
  let descriptor;
  let value;
  try {
    descriptor = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    if (!fs.fstatSync(descriptor).isFile()) {
      throw new Error('Finalizer admission is not a regular file.');
    }
    value = JSON.parse(fs.readFileSync(descriptor, 'utf8'));
  } catch (error) {
    if (error?.code === 'ELOOP') {
      throw new Error('Finalizer admission is not a regular file.', { cause: error });
    }
    throw error;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
  if (
    value.schemaVersion !== 1 ||
    value.artifactKind !== 'sniptale-release-finalizer-admission' ||
    value.classification !== 'post-proof-only' ||
    value.repository !== expected.repository ||
    value.releaseCommit !== expected.releaseCommit ||
    value.controlCommit !== expected.controlCommit ||
    value.finalizerRunId !== expected.finalizerRunId ||
    !/^[1-9][0-9]*$/u.test(value.sourceProofRunId ?? '') ||
    !/^[1-9][0-9]*$/u.test(value.sourceProofRunAttempt ?? '') ||
    !COMMIT.test(value.releaseCommit ?? '') ||
    !COMMIT.test(value.controlCommit ?? '') ||
    !DIGEST.test(value.images?.qa ?? '') ||
    !DIGEST.test(value.images?.controller ?? '')
  ) {
    throw new Error('Finalizer admission identity is invalid.');
  }
  return value;
}

if (isExecutedAsScript(import.meta.url)) {
  const [file, releaseCommit, controlCommit, finalizerRunId] = process.argv.slice(2);
  const value = verifyFinalizerAdmission(path.resolve(file), {
    repository: process.env.GITHUB_REPOSITORY ?? 'lrozhkov/sniptale',
    releaseCommit,
    controlCommit,
    finalizerRunId,
  });
  process.stdout.write(`${JSON.stringify(value)}\n`);
}
