import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { createTempRoot, writeFile } from '../qa/core/test-helpers';
import { selectReleaseCoverage } from './select-release-coverage.mjs';

function digest(value: string | Buffer) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function createReleaseAudit(root: string, commit: string) {
  const lcov = 'TN:\nSF:apps/extension/src/example.ts\nDA:1,1\nend_of_record\n';
  writeFile(root, '.tmp/coverage/canonical/lcov.info', lcov);
  const manifest = {
    schemaVersion: 1,
    artifactKind: 'sniptale-ci-proof',
    lane: 'release-audit',
    status: 'passed',
    commit,
    containerDigest: `sha256:${'a'.repeat(64)}`,
    files: [{ file: '.tmp/coverage/canonical/lcov.info', sha256: digest(lcov) }],
  };
  const manifestText = `${JSON.stringify(manifest)}\n`;
  writeFile(root, 'proof-manifest.json', manifestText);
  writeFile(
    root,
    'SHA256SUMS',
    `${digest(lcov)}  .tmp/coverage/canonical/lcov.info\n${digest(manifestText)}  proof-manifest.json\n`
  );
}

it('selects only digest-bound coverage from the exact successful release audit', () => {
  const root = createTempRoot('release-coverage-');
  const commit = 'b'.repeat(40);
  createReleaseAudit(root, commit);
  const destination = path.join(root, 'selected/lcov.info');
  expect(selectReleaseCoverage(root, commit, destination)).toMatchObject({ commit });
  expect(fs.readFileSync(destination, 'utf8')).toContain('SF:apps/extension/src/example.ts');

  fs.appendFileSync(path.join(root, '.tmp/coverage/canonical/lcov.info'), 'drift\n');
  expect(() => selectReleaseCoverage(root, commit, path.join(root, 'other/lcov.info'))).toThrow(
    'Release LCOV report or proof digest drifted'
  );
  expect(() =>
    selectReleaseCoverage(root, 'c'.repeat(40), path.join(root, 'third/lcov.info'))
  ).toThrow('identity does not match');
});
