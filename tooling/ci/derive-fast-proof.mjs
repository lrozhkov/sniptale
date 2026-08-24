import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { createProofSemanticDigest } from './artifacts.mjs';
import { createCandidateControlDigest } from './control-digest.mjs';
import { createFastGateInputDigest } from './fast-gate-inputs.mjs';
import { verifyMainProof } from './verify-main-proof.mjs';
import { collectDocumentationFactViolations } from '../qa/core/documentation-facts.mjs';
import { collectOssReleaseSurfaceErrors } from '../qa/core/verify-oss-release-surface.mjs';

const [sourceValue, outputValue, baseCommit] = process.argv.slice(2);
if (!sourceValue || !outputValue || !/^[a-f0-9]{40}$/u.test(baseCommit ?? '')) {
  throw new Error('Usage: derive-fast-proof.mjs <source-proof> <output-proof> <base-commit>');
}

const cwd = process.cwd();
const sourceRoot = path.resolve(sourceValue);
const outputRoot = path.resolve(outputValue);

function git(args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed.`);
  return result.stdout.trim();
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function copyFile(relative) {
  const source = path.join(sourceRoot, relative);
  const destination = path.join(outputRoot, relative);
  const resolved = path.resolve(outputRoot, relative);
  if (!resolved.startsWith(`${outputRoot}${path.sep}`))
    throw new Error(`Unsafe proof path: ${relative}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
}

const source = verifyMainProof(sourceRoot, baseCommit);
const commit = git(['rev-parse', 'HEAD']);
const candidateTree = git(['rev-parse', 'HEAD^{tree}']);
const controlDigest = createCandidateControlDigest({ cwd });
const gateInputDigest = createFastGateInputDigest({ cwd });
if (
  source.manifest.gateInputDigest !== gateInputDigest ||
  source.manifest.controlDigest !== controlDigest
) {
  throw new Error('Fast gate inputs changed; Selectel execution is required.');
}
const documentationViolations = collectDocumentationFactViolations({ rootDir: cwd });
const releaseViolations = collectOssReleaseSurfaceErrors(cwd);
if (documentationViolations.length > 0 || releaseViolations.length > 0) {
  throw new Error(
    `Non-gate documentation validation failed:\n${[
      ...documentationViolations.map((violation) => JSON.stringify(violation)),
      ...releaseViolations,
    ].join('\n')}`
  );
}

fs.mkdirSync(outputRoot, { recursive: false });
for (const { file } of source.manifest.files) copyFile(file);
const receiptRelative = '.tmp/ci/non-gate-reuse.json';
const receiptPath = path.join(outputRoot, receiptRelative);
fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
fs.writeFileSync(
  receiptPath,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      artifactKind: 'sniptale-non-gate-input-reuse',
      outcome: 'passed',
      baseCommit,
      candidateCommit: commit,
      gateInputDigest,
      sourceProofSemanticDigest: source.manifest.proofSemanticDigest,
      validators: ['documentation-facts', 'oss-release-surface'],
      recordedAt: new Date().toISOString(),
    },
    null,
    2
  )}\n`,
  { flag: 'wx' }
);
const files = [...source.manifest.files.map(({ file }) => file), receiptRelative]
  .sort()
  .map((file) => ({ file, sha256: sha256(path.join(outputRoot, file)) }));
const executionEnvironment = source.manifest.executionEnvironment;
const semanticIdentity = {
  lane: 'proof',
  commit,
  candidateTree,
  trustedControlSha: baseCommit,
  trustedControlDigest: source.manifest.trustedControlDigest,
  controlDigest,
  gateInputDigest,
  executionEnvironment,
};
const manifest = {
  ...source.manifest,
  commit,
  baseSha: baseCommit,
  candidateTree,
  trustedControlSha: baseCommit,
  controlAuthority: 'trusted-base',
  trustedControlDigest: source.manifest.trustedControlDigest,
  controlDigest,
  controlsChanged: false,
  controlDisposition: 'trusted-controls',
  gateInputDigest,
  proofSemanticDigest: createProofSemanticDigest(semanticIdentity),
  command: ['verified non-gate input reuse'],
  phases: [
    {
      id: 'non-gate-input-reuse',
      command: 'candidate documentation validators',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      status: 'passed',
      exitCode: 0,
    },
  ],
  infrastructure: null,
  derivation: {
    baseCommit,
    sourceProofSemanticDigest: source.manifest.proofSemanticDigest,
  },
  startedAt: new Date().toISOString(),
  finishedAt: new Date().toISOString(),
  files,
};
const manifestPath = path.join(outputRoot, 'proof-manifest.json');
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
const checksums = [
  ...files.map(({ file, sha256: digest }) => `${digest}  ${file}`),
  `${sha256(manifestPath)}  proof-manifest.json`,
];
fs.writeFileSync(path.join(outputRoot, 'SHA256SUMS'), `${checksums.join('\n')}\n`, { flag: 'wx' });
process.stdout.write(`${outputRoot}\n`);
