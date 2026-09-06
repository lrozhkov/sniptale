import fs from 'node:fs';

import { expect, it } from 'vitest';

import { createTempRoot, writeFile, writeJson } from '../qa/test-support/test-helpers';
import {
  canReuseLocalNative,
  canReuseLocalInstall,
  createLocalInstallFingerprint,
  invalidateLocalBootstrapState,
  projectLocalNativeStamp,
  recordLocalInstallState,
} from './local-project-bootstrap.mjs';

function fixture() {
  const root = createTempRoot('local-install-stamp-');
  writeJson(root, 'package.json', {
    name: 'fixture',
    private: true,
    workspaces: ['packages/*'],
  });
  writeJson(root, 'packages/example/package.json', { name: '@fixture/example', version: '1.0.0' });
  writeJson(root, 'package-lock.json', { lockfileVersion: 3, packages: {} });
  writeJson(root, 'node_modules/.package-lock.json', { lockfileVersion: 3, packages: {} });
  writeFile(root, '.npmrc', 'audit=false\n');
  return root;
}

it('reuses only an install tree stamped for exact manifests, npm policy, and hidden lock', () => {
  const root = fixture();
  const fingerprint = recordLocalInstallState({ root });

  expect(createLocalInstallFingerprint({ root })).toBe(fingerprint);
  expect(canReuseLocalInstall({ root })).toMatchObject({ fingerprint, reusable: true });

  writeJson(root, 'packages/example/package.json', { name: '@fixture/example', version: '2.0.0' });
  expect(canReuseLocalInstall({ root }).reusable).toBe(false);
});

it('invalidates reuse when npm policy or the installed hidden lock drifts', () => {
  const root = fixture();
  recordLocalInstallState({ root });

  writeFile(root, '.npmrc', 'audit=true\n');
  expect(canReuseLocalInstall({ root }).reusable).toBe(false);
  writeFile(root, '.npmrc', 'audit=false\n');
  expect(canReuseLocalInstall({ root }).reusable).toBe(true);

  fs.appendFileSync(`${root}/node_modules/.package-lock.json`, '\n');
  expect(canReuseLocalInstall({ root }).reusable).toBe(false);
});

it('invalidates install and native stamps before a cold install can be interrupted', () => {
  const root = fixture();
  recordLocalInstallState({ root });
  writeJson(root, '.tmp/ci/local-native-stamp.json', { schemaVersion: 1 });

  invalidateLocalBootstrapState({ root });

  expect(fs.existsSync(`${root}/.tmp/ci/local-install-stamp.json`)).toBe(false);
  expect(fs.existsSync(`${root}/.tmp/ci/local-native-stamp.json`)).toBe(false);
});

it.each([
  ['install fingerprint changed', 'next-install', 'artifact-digest', true],
  ['native artifact digest changed', 'install-digest', 'next-artifact', true],
  ['functional probe failed', 'install-digest', 'artifact-digest', false],
] as const)(
  'rejects native reuse when the %s',
  (_reason, installFingerprint, artifactDigest, ready) => {
    expect(
      canReuseLocalNative({
        artifactDigest,
        installFingerprint,
        ready,
        recorded: { digest: 'artifact-digest', installFingerprint: 'install-digest' },
      })
    ).toBe(false);
  }
);

it('reuses native state only when every invariant matches', () => {
  expect(
    canReuseLocalNative({
      artifactDigest: 'artifact-digest',
      installFingerprint: 'install-digest',
      ready: true,
      recorded: { digest: 'artifact-digest', installFingerprint: 'install-digest' },
    })
  ).toBe(true);
});

it('projects a freshly provisioned artifact into the native stamp without losing peers', () => {
  expect(
    projectLocalNativeStamp({
      artifactDigest: 'new-canvas-digest',
      installFingerprint: 'install-digest',
      kind: 'canvas',
      nativeStamp: {
        schemaVersion: 1,
        'ast-grep': { digest: 'ast-digest', installFingerprint: 'install-digest' },
      },
    })
  ).toEqual({
    schemaVersion: 1,
    canvas: { digest: 'new-canvas-digest', installFingerprint: 'install-digest' },
    'ast-grep': { digest: 'ast-digest', installFingerprint: 'install-digest' },
  });
});
