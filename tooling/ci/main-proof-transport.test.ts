import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { createTempRoot, writeFile } from '../qa/test-support/test-helpers';
import {
  downloadLatestReleaseProof,
  downloadSuccessfulMainProof,
} from './main-proof-transport.mjs';

it('tries older successful runs when a newer run for the commit has no fast-proof artifact', () => {
  const root = createTempRoot('main-proof-transport-');
  const artifactRoot = path.join(root, 'main-proof-candidate');
  const commit = 'a'.repeat(40);
  const attempted: number[] = [];
  const attemptedNames: string[] = [];
  const workflowNames: string[] = [];
  const commandRunner = (args: string[]) => {
    if (args[1] === 'list') {
      workflowNames.push(args[3]);
      return JSON.stringify([
        { databaseId: 43, headSha: commit },
        { databaseId: 42, headSha: commit },
      ]);
    }
    if (args[0] === 'api') return '2\n';
    const runId = Number(args[2]);
    attempted.push(runId);
    attemptedNames.push(args[4]);
    if (runId === 43) {
      writeFile(artifactRoot, 'partial', 'partial\n');
      throw new Error('artifact not found');
    }
    writeFile(artifactRoot, 'proof-manifest.json', '{}\n');
    return '';
  };
  expect(downloadSuccessfulMainProof({ artifactRoot, commandRunner, commit })).toBe(42);
  expect(attempted).toEqual([43, 42]);
  expect(attemptedNames).toEqual([`fast-proof-${commit}-43-2`, `fast-proof-${commit}-42-2`]);
  expect(workflowNames).toEqual(['provenance.yml']);
  expect(fs.existsSync(path.join(artifactRoot, 'partial'))).toBe(false);
  expect(fs.existsSync(path.join(artifactRoot, 'proof-manifest.json'))).toBe(true);
});

it('restores release proof only from the provenance workflow', () => {
  const root = createTempRoot('release-proof-transport-');
  const artifactRoot = path.join(root, 'release-proof');
  const commit = 'b'.repeat(40);
  const calls: string[][] = [];
  const commandRunner = (args: string[]) => {
    calls.push(args);
    if (args[1] === 'list') return JSON.stringify([{ databaseId: 52, headSha: commit }]);
    if (args[0] === 'api') return '3\n';
    writeFile(artifactRoot, 'proof-manifest.json', '{}\n');
    return '';
  };

  expect(downloadLatestReleaseProof({ artifactRoot, commandRunner })).toEqual({
    runId: 52,
    runAttempt: 3,
    commit,
  });
  expect(calls[0]).toContain('provenance.yml');
  expect(calls[0]).toContain('workflow_dispatch');
  expect(calls.at(-1)).toContain(`release-provenance-${commit}-52-3`);
});
