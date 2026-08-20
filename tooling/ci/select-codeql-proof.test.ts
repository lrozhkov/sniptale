import fs from 'node:fs';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { createTempRoot, writeFile } from '../qa/core/test-helpers';
import { verifyMainProof } from './verify-main-proof.mjs';

vi.mock('./verify-main-proof.mjs', () => ({
  verifyMainProof: vi.fn(() => ({
    manifest: {
      files: [
        { file: '.tmp/qa/codeql-proof.json', sha256: 'a'.repeat(64) },
        { file: '.tmp/codeql/results.filtered.sarif', sha256: 'b'.repeat(64) },
      ],
    },
  })),
}));

const mockedVerifyMainProof = vi.mocked(verifyMainProof);

it('copies only the CodeQL receipt and SARIF admitted by the verified main manifest', async () => {
  const root = createTempRoot('select-codeql-proof-');
  const destinationRoot = createTempRoot('selected-codeql-proof-');
  writeFile(root, '.tmp/qa/codeql-proof.json', '{"proof":true}\n');
  writeFile(root, '.tmp/codeql/results.filtered.sarif', '{"runs":[]}\n');
  const proofDestination = path.join(destinationRoot, 'codeql-proof.json');
  const sarifDestination = path.join(destinationRoot, 'codeql-results.sarif');
  const { selectVerifiedCodeqlProof } = await import('./select-codeql-proof.mjs');

  expect(
    selectVerifiedCodeqlProof(root, 'a'.repeat(40), proofDestination, sarifDestination)
  ).toEqual({ proofPath: proofDestination, sarifPath: sarifDestination });
  expect(fs.readFileSync(proofDestination, 'utf8')).toContain('proof');
  expect(fs.readFileSync(sarifDestination, 'utf8')).toContain('runs');
});

it('rejects an incomplete or unverifiable CodeQL proof without leaving partial output', async () => {
  const root = createTempRoot('reject-codeql-proof-');
  const destinationRoot = createTempRoot('rejected-codeql-proof-');
  const proofDestination = path.join(destinationRoot, 'codeql-proof.json');
  const sarifDestination = path.join(destinationRoot, 'codeql-results.sarif');
  writeFile(root, '.tmp/qa/codeql-proof.json', '{}\n');
  writeFile(root, '.tmp/codeql/results.filtered.sarif', '{}\n');
  mockedVerifyMainProof.mockImplementationOnce(() => {
    throw new Error('main proof checksum mismatch');
  });
  const { selectVerifiedCodeqlProof } = await import('./select-codeql-proof.mjs');

  expect(() =>
    selectVerifiedCodeqlProof(root, 'a'.repeat(40), proofDestination, sarifDestination)
  ).toThrow('main proof checksum mismatch');
  expect(fs.existsSync(proofDestination)).toBe(false);
  expect(fs.existsSync(sarifDestination)).toBe(false);
});

it('degrades GitHub discovery and download failures to absent reusable CodeQL inputs', async () => {
  const root = createTempRoot('restore-codeql-proof-');
  const artifactRoot = path.join(root, 'main-codeql-proof-candidate');
  const proofDestination = path.join(root, 'codeql-proof-candidate.json');
  const sarifDestination = path.join(root, 'codeql-sarif-candidate.sarif');
  const { restoreVerifiedMainCodeqlProof } = await import('./select-codeql-proof.mjs');
  const failures = [
    () => {
      throw new Error('GitHub API unavailable');
    },
    () => 'not-json',
    () => '[]',
    (args: string[]) =>
      args[1] === 'list'
        ? JSON.stringify([{ databaseId: 42, headSha: 'a'.repeat(40) }])
        : (() => {
            throw new Error('artifact expired');
          })(),
  ];

  for (const commandRunner of failures) {
    writeFile(root, 'main-codeql-proof-candidate/partial', 'partial\n');
    writeFile(root, 'codeql-proof-candidate.json', 'partial\n');
    writeFile(root, 'codeql-sarif-candidate.sarif', 'partial\n');
    expect(
      restoreVerifiedMainCodeqlProof(
        'a'.repeat(40),
        artifactRoot,
        proofDestination,
        sarifDestination,
        { commandRunner }
      )
    ).toBeNull();
    expect(fs.existsSync(artifactRoot)).toBe(false);
    expect(fs.existsSync(proofDestination)).toBe(false);
    expect(fs.existsSync(sarifDestination)).toBe(false);
  }
});
