import fs from 'node:fs';
import path from 'node:path';

import { classifyChangedPaths, createFastGateInputDigest } from './fast-gate-inputs.mjs';

const [trustedValue, candidateValue, baseCommit, candidateCommit] = process.argv.slice(2);
if (
  !trustedValue ||
  !candidateValue ||
  !/^[a-f0-9]{40}$/u.test(baseCommit ?? '') ||
  !/^[a-f0-9]{40}$/u.test(candidateCommit ?? '')
) {
  throw new Error(
    'Usage: classify-fast-gate.mjs <trusted-root> <candidate-root> <base-commit> <candidate-commit>'
  );
}
const trustedRoot = path.resolve(trustedValue);
const candidateRoot = path.resolve(candidateValue);
const baseDigest = createFastGateInputDigest({ cwd: trustedRoot, policyRoot: trustedRoot });
const candidateDigest = createFastGateInputDigest({
  cwd: candidateRoot,
  policyRoot: trustedRoot,
});
const pathClassification = classifyChangedPaths({
  baseCommit,
  candidateCommit,
  candidateRoot,
  policyRoot: trustedRoot,
});
const reusable = baseDigest === candidateDigest && pathClassification.nonGateOnly;
const result = {
  schemaVersion: 1,
  artifactKind: 'sniptale-fast-gate-classification',
  outcome: 'passed',
  authority: 'trusted-base',
  baseDigest,
  candidateDigest,
  pathClassification,
  requiresSelectel: !reusable,
};
const output = process.env.GITHUB_OUTPUT;
if (output) {
  fs.appendFileSync(output, `reuse=${reusable ? 'true' : 'false'}\n`);
  fs.appendFileSync(output, `candidate-digest=${candidateDigest}\n`);
}
process.stdout.write(`${JSON.stringify(result)}\n`);
