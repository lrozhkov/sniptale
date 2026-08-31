import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { isExecutedAsScript } from '../qa/runtime/process/shared-cli.mjs';

const COMMIT = /^[a-f0-9]{40}$/u;
const HEX = /^[a-f0-9]{64}$/u;
const DIGEST = /^sha256:[a-f0-9]{64}$/u;

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function readReceipt(file, expected) {
  let descriptor;
  let value;
  try {
    descriptor = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    if (!fs.fstatSync(descriptor).isFile()) throw new Error('Image receipt is not regular.');
    value = JSON.parse(fs.readFileSync(descriptor, 'utf8'));
  } catch (error) {
    if (error?.code === 'ELOOP') throw new Error('Image receipt is not regular.', { cause: error });
    throw error;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
  if (
    value.schemaVersion !== 1 ||
    value.artifactKind !== 'sniptale-candidate-image-use' ||
    !HEX.test(value.cacheKey ?? '') ||
    value.candidateTreeDigest !== expected.treeDigest ||
    value.candidateCommitDigest !== expected.commitDigest ||
    !HEX.test(value.imageInputDigest ?? '') ||
    value.platform !== 'linux/amd64' ||
    typeof value.forced !== 'boolean' ||
    !DIGEST.test(value.digest ?? '') ||
    value.workflowRunId !== expected.runId ||
    value.workflowRunAttempt !== expected.runAttempt ||
    value.verified !== true
  ) {
    throw new Error('Image use receipt does not match the admitted canonical proof run.');
  }
  return value;
}

export function verifyFinalizerImageReceipts(root, { commit, tree, runId, runAttempt }) {
  if (
    !COMMIT.test(commit ?? '') ||
    !COMMIT.test(tree ?? '') ||
    !/^[1-9][0-9]*$/u.test(runId ?? '') ||
    !/^[1-9][0-9]*$/u.test(runAttempt ?? '')
  ) {
    throw new Error('Image receipt admission identity is invalid.');
  }
  const expected = {
    commitDigest: hash(`git-commit:${commit}`),
    treeDigest: hash(`git-tree:${tree}`),
    runId,
    runAttempt,
  };
  const qa = readReceipt(path.join(root, 'candidate-image', 'use-receipt.json'), expected);
  const controller = readReceipt(path.join(root, 'controller-image', 'use-receipt.json'), expected);
  return { qaDigest: qa.digest, controllerDigest: controller.digest };
}

if (isExecutedAsScript(import.meta.url)) {
  const [root, commit, tree, runId, runAttempt] = process.argv.slice(2);
  const result = verifyFinalizerImageReceipts(path.resolve(root), {
    commit,
    tree,
    runId,
    runAttempt,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
