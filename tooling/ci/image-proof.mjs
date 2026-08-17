import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { isExecutedAsScript } from '../qa/core/shared.mjs';

const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/u;
const IMAGE = 'ghcr.io/lrozhkov/sniptale-qa';

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

export function writeImageProof(root, { commit, digest, repository, runId }) {
  if (!COMMIT_PATTERN.test(commit ?? '') || !DIGEST_PATTERN.test(digest ?? '')) {
    throw new Error('Image proof requires a full commit SHA and registry digest.');
  }
  if (!/^\d+$/u.test(String(runId ?? '')) || repository !== 'lrozhkov/sniptale') {
    throw new Error('Image proof repository or workflow run identity is invalid.');
  }
  fs.mkdirSync(root, { recursive: false });
  const proof = {
    schemaVersion: 1,
    artifactKind: 'sniptale-qa-image-proof',
    repository,
    workflow: 'quality-gate.yml',
    workflowRunId: String(runId),
    commit,
    image: IMAGE,
    digest,
  };
  const proofPath = path.join(root, 'image-proof.json');
  fs.writeFileSync(proofPath, `${JSON.stringify(proof, null, 2)}\n`, { flag: 'wx' });
  fs.writeFileSync(path.join(root, 'SHA256SUMS'), `${sha256(proofPath)}  image-proof.json\n`, {
    flag: 'wx',
  });
  return proof;
}

export function verifyImageProof(root, { commit, repository, runId }) {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  if (
    entries.length !== 2 ||
    entries.some((entry) => !entry.isFile() || entry.isSymbolicLink()) ||
    entries
      .map(({ name }) => name)
      .sort()
      .join(',') !== 'SHA256SUMS,image-proof.json'
  ) {
    throw new Error('Image proof artifact inventory is not exact.');
  }
  const proofPath = path.join(root, 'image-proof.json');
  const proof = JSON.parse(fs.readFileSync(proofPath, 'utf8'));
  const expectedSum = `${sha256(proofPath)}  image-proof.json`;
  if (fs.readFileSync(path.join(root, 'SHA256SUMS'), 'utf8').trim() !== expectedSum) {
    throw new Error('Image proof checksum does not match.');
  }
  if (
    proof.schemaVersion !== 1 ||
    proof.artifactKind !== 'sniptale-qa-image-proof' ||
    proof.repository !== repository ||
    proof.workflow !== 'quality-gate.yml' ||
    proof.workflowRunId !== String(runId) ||
    proof.commit !== commit ||
    proof.image !== IMAGE ||
    !DIGEST_PATTERN.test(proof.digest ?? '')
  ) {
    throw new Error('Image proof identity does not match the successful main workflow.');
  }
  return { ...proof, reference: `${proof.image}@${proof.digest}` };
}

if (isExecutedAsScript(import.meta.url)) {
  const [mode, root, commit, runId, digest] = process.argv.slice(2);
  const repository = process.env.GITHUB_REPOSITORY ?? 'lrozhkov/sniptale';
  if (mode === 'write') {
    writeImageProof(path.resolve(root), { commit, digest, repository, runId });
  } else if (mode === 'verify') {
    const proof = verifyImageProof(path.resolve(root), { commit, repository, runId });
    process.stdout.write(`${proof.reference}\n`);
  } else {
    throw new Error('Usage: image-proof.mjs <write|verify> <root> <commit> <run-id> [digest]');
  }
}
