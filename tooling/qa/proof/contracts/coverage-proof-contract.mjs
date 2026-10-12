import { createProofDigest } from './proof-input.mjs';

export function parseCoverageProof(proof) {
  if (
    proof?.schemaVersion !== 2 ||
    proof.artifactKind !== 'sniptale-coverage-proof' ||
    proof.outcome !== 'passed' ||
    !/^[a-f0-9]{64}$/u.test(proof.inputDigest ?? '') ||
    !/^[a-f0-9]{64}$/u.test(proof.fullUnit?.inputDigest ?? '') ||
    proof.fullUnit?.execution?.suite !== 'product' ||
    !['threads', 'forks'].includes(proof.fullUnit?.execution?.pool) ||
    ['arch', 'locale', 'node', 'platform', 'timezone'].some(
      (key) => typeof proof.fullUnit?.execution?.[key] !== 'string'
    ) ||
    !Array.isArray(proof.reports) ||
    createProofDigest(proof) !== proof.proofDigest
  )
    throw new Error('Malformed or corrupted coverage proof.');
  return proof;
}
