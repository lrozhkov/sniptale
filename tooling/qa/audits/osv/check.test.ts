import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { createTempRoot, writeFile } from '../../test-support/test-helpers';
import { runOsvCheck } from './check.mjs';

const LOCK_ROOTS = [
  'package-lock.json',
  'tooling/npm/package-lock.json',
  'tooling/playwright/package-lock.json',
  'tooling/mutation/package-lock.json',
];

function createOwnerFixture() {
  const root = createTempRoot('osv-owner-');
  for (const lockRoot of LOCK_ROOTS) writeFile(root, lockRoot, '{}\n');
  const configPath = path.join(root, 'dependency-freshness.json');
  fs.writeFileSync(
    configPath,
    `${JSON.stringify({ schemaVersion: 1, npmLockRoots: LOCK_ROOTS })}\n`
  );
  return { configPath, root };
}

function vulnerableOutput(root: string, sourcePath = path.join(root, LOCK_ROOTS[0])) {
  return JSON.stringify({
    results: [
      {
        source: { path: sourcePath, type: 'lockfile' },
        packages: [
          {
            package: { name: 'example', version: '1.0.0', ecosystem: 'npm' },
            groups: [{ ids: ['OSV-1'], max_severity: '8.2' }],
            vulnerabilities: [{ id: 'OSV-1', summary: 'high vulnerability' }],
          },
        ],
      },
    ],
  });
}

it('scans every canonical lock in one process and persists normalized source paths', () => {
  const { configPath, root } = createOwnerFixture();
  let receivedArgs: string[] = [];
  const result = runOsvCheck({
    configPath,
    executable: 'osv-scanner',
    reportPath: '.tmp/osv.json',
    root,
    runCommandImpl: (_command, args) => {
      receivedArgs = args;
      return { status: 1, stdout: vulnerableOutput(root), stderr: '' };
    },
  });

  expect(receivedArgs).toEqual([
    'scan',
    'source',
    ...LOCK_ROOTS.flatMap((lockRoot) => ['-L', lockRoot]),
    '--format',
    'json',
  ]);
  expect(result.violations).toHaveLength(1);
  expect(JSON.parse(fs.readFileSync(result.reportPath, 'utf8')).results[0].source).toEqual({
    path: 'package-lock.json',
    type: 'lockfile',
  });
});

it('rejects a scanner result for a lock outside the requested closure', () => {
  const { configPath, root } = createOwnerFixture();
  expect(() =>
    runOsvCheck({
      configPath,
      executable: 'osv-scanner',
      root,
      runCommandImpl: () => ({
        status: 1,
        stdout: vulnerableOutput(root, path.join(root, 'unrequested/package-lock.json')),
        stderr: '',
      }),
    })
  ).toThrow('unrequested lock source');
});

it('rejects duplicate and missing configured lock roots before execution', () => {
  const { configPath, root } = createOwnerFixture();
  fs.writeFileSync(
    configPath,
    JSON.stringify({ schemaVersion: 1, npmLockRoots: ['package-lock.json', 'package-lock.json'] })
  );
  expect(() =>
    runOsvCheck({
      configPath,
      executable: 'osv-scanner',
      root,
      runCommandImpl: () => ({ status: 0, stdout: '{"results":[]}', stderr: '' }),
    })
  ).toThrow('unique repository-relative npm locks');
});
