import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { createTempRoot, writeFile } from '../qa/core/test-helpers';
import { downloadSuccessfulMainProof } from './main-proof-transport.mjs';

it('tries older successful runs when a newer run for the commit has no fast-proof artifact', () => {
  const root = createTempRoot('main-proof-transport-');
  const artifactRoot = path.join(root, 'main-proof-candidate');
  const commit = 'a'.repeat(40);
  const attempted: number[] = [];
  const commandRunner = (args: string[]) => {
    if (args[1] === 'list') {
      return JSON.stringify([
        { databaseId: 43, headSha: commit },
        { databaseId: 42, headSha: commit },
      ]);
    }
    const runId = Number(args[2]);
    attempted.push(runId);
    if (runId === 43) {
      writeFile(artifactRoot, 'partial', 'partial\n');
      throw new Error('artifact not found');
    }
    writeFile(artifactRoot, 'proof-manifest.json', '{}\n');
    return '';
  };
  expect(downloadSuccessfulMainProof({ artifactRoot, commandRunner, commit })).toBe(42);
  expect(attempted).toEqual([43, 42]);
  expect(fs.existsSync(path.join(artifactRoot, 'partial'))).toBe(false);
  expect(fs.existsSync(path.join(artifactRoot, 'proof-manifest.json'))).toBe(true);
});
