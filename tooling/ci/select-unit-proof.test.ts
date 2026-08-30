import fs from 'node:fs';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { createTempRoot, writeFile } from '../qa/test-support/test-helpers';
import { verifyMainProof } from './verify-main-proof.mjs';

vi.mock('./verify-main-proof.mjs', () => ({
  verifyMainProof: vi.fn(() => ({
    manifest: {
      files: [
        {
          file: '.tmp/qa/unit-proof.json',
          sha256: '5c5ce2fdd3156a954f60b61cab4f1cfb4e789c3d14e91794324ce7e3fc390ba9',
        },
      ],
    },
  })),
  verifyReleaseProof: vi.fn(() => ({
    manifest: {
      files: [
        {
          file: '.tmp/qa/unit-proof.json',
          sha256: '5c5ce2fdd3156a954f60b61cab4f1cfb4e789c3d14e91794324ce7e3fc390ba9',
        },
      ],
    },
  })),
}));

const mockedVerifyMainProof = vi.mocked(verifyMainProof);

it('copies only the unit receipt admitted by the verified main manifest without overwrite', async () => {
  const root = createTempRoot('select-unit-proof-');
  const destinationRoot = createTempRoot('selected-unit-proof-');
  writeFile(root, '.tmp/qa/unit-proof.json', '{"proof":true}\n');
  const destination = path.join(destinationRoot, 'unit-proof.json');
  const { selectVerifiedUnitProof } = await import('./select-unit-proof.mjs');

  expect(selectVerifiedUnitProof(root, 'a'.repeat(40), destination)).toBe(destination);
  expect(fs.readFileSync(destination, 'utf8')).toBe('{"proof":true}\n');
  expect(() => selectVerifiedUnitProof(root, 'a'.repeat(40), destination)).toThrow();
});

it('rejects unverifiable or incomplete main transport without producing a receipt', async () => {
  const root = createTempRoot('reject-unit-proof-');
  const destinationRoot = createTempRoot('rejected-unit-proof-');
  const destination = path.join(destinationRoot, 'unit-proof.json');
  writeFile(root, '.tmp/qa/unit-proof.json', '{}\n');
  mockedVerifyMainProof.mockImplementationOnce(() => {
    throw new Error('main proof checksum mismatch');
  });
  const { selectVerifiedUnitProof } = await import('./select-unit-proof.mjs');

  expect(() => selectVerifiedUnitProof(root, 'a'.repeat(40), destination)).toThrow(
    'main proof checksum mismatch'
  );
  expect(fs.existsSync(destination)).toBe(false);
});

it('degrades discovery, JSON, and download failures to an absent reusable receipt', async () => {
  const root = createTempRoot('restore-unit-proof-');
  const artifactRoot = path.join(root, 'main-proof-candidate');
  const destination = path.join(root, 'unit-proof-candidate.json');
  const { restoreVerifiedMainUnitProof } = await import('./select-unit-proof.mjs');
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
    writeFile(root, 'main-proof-candidate/partial', 'partial\n');
    writeFile(root, 'unit-proof-candidate.json', 'partial\n');
    expect(
      restoreVerifiedMainUnitProof('a'.repeat(40), artifactRoot, destination, {
        commandRunner,
      })
    ).toBeNull();
    expect(fs.existsSync(artifactRoot)).toBe(false);
    expect(fs.existsSync(destination)).toBe(false);
  }
});

it('restores a content-addressed unit receipt from the latest release provenance artifact', async () => {
  const root = createTempRoot('restore-release-unit-proof-');
  const artifactRoot = path.join(root, 'release-unit-proof');
  const destination = path.join(root, 'unit-proof.json');
  const commit = 'b'.repeat(40);
  const commandRunner = (args: string[]) => {
    if (args[1] === 'list') return JSON.stringify([{ databaseId: 77, headSha: commit }]);
    if (args[0] === 'api') return '1\n';
    writeFile(artifactRoot, '.tmp/qa/unit-proof.json', '{"proof":true}\n');
    return '';
  };
  const { restoreLatestReleaseUnitProof } = await import('./select-unit-proof.mjs');
  expect(restoreLatestReleaseUnitProof(artifactRoot, destination, { commandRunner })).toBe(
    destination
  );
  expect(fs.readFileSync(destination, 'utf8')).toBe('{"proof":true}\n');
});
