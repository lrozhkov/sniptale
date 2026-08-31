import { expect, it } from 'vitest';

import {
  collectDependencyAdmission,
  isDependencyAdmissionInputPath,
} from './verify-dependency-admission.mjs';

function rules() {
  return {
    schemaVersion: 1,
    allowedProtocols: ['https'],
    allowedRegistryHosts: ['registry.npmjs.org'],
    sourceExceptions: [],
    installScriptApprovals: [
      {
        packageName: 'native-tool',
        resolvedVersion: '1.0.0',
        dependencyScope: 'direct-development',
        artifactInclusion: 'development-only',
        reason: 'Fixture approval.',
        approvalOwner: 'test-owner',
        expiresOn: '2099-01-01',
      },
    ],
    rootLifecycleApprovals: [
      {
        scriptName: 'prepare',
        command: 'husky',
        ownerId: 'tooling.qa',
        reason: 'Fixture lifecycle approval.',
        approvalOwner: 'test-owner',
        expiresOn: '2099-01-01',
      },
    ],
  };
}

function inputs() {
  return {
    packageJson: {
      devDependencies: { 'native-tool': '1.0.0' },
      scripts: { prepare: 'husky' },
    },
    lock: {
      packages: {
        '': { name: 'fixture' },
        'node_modules/native-tool': {
          version: '1.0.0',
          dev: true,
          resolved: 'https://registry.npmjs.org/native-tool/-/native-tool-1.0.0.tgz',
          integrity: 'sha512-fixture',
          hasInstallScript: true,
        },
        'apps/fixture': { name: '@fixture/app', version: '0.0.0' },
        'node_modules/@fixture/app': { resolved: 'apps/fixture', link: true },
        'packages/foundation': { name: '@fixture/foundation', version: '0.0.0' },
      },
    },
    rules: rules(),
  };
}

it('accepts an exact registry source, integrity, install approval and root lifecycle', () => {
  expect(collectDependencyAdmission(inputs()).violations).toEqual([]);
});

it('inherits provenance only from an ancestor tarball that declares the bundled child', () => {
  const bundled = inputs();
  bundled.lock.packages['node_modules/native-tool'].bundleDependencies = ['bundled-child'];
  bundled.lock.packages['node_modules/native-tool/node_modules/bundled-child'] = {
    version: '2.0.0',
    dev: true,
    inBundle: true,
  };

  const result = collectDependencyAdmission(bundled);

  expect(result.violations).toEqual([]);
  expect(result.rows).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        packageName: 'bundled-child',
        bundledBy: 'native-tool',
        integrity: 'sha512-fixture',
        sourceUrl: 'https://registry.npmjs.org/native-tool/-/native-tool-1.0.0.tgz',
      }),
    ])
  );
});

it('rejects bundled metadata without an ancestor bundle declaration', () => {
  const bundled = inputs();
  bundled.lock.packages['node_modules/native-tool/node_modules/bundled-child'] = {
    version: '2.0.0',
    dev: true,
    inBundle: true,
  };

  expect(collectDependencyAdmission(bundled).violations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        rule: 'dependency-lock-metadata',
        message: expect.stringContaining('bundled-child@2.0.0'),
      }),
      expect.objectContaining({
        rule: 'dependency-source-admission',
        message: expect.stringContaining('bundled-child@2.0.0'),
      }),
    ])
  );
});

it('rejects a malformed string bundle declaration even when it contains the child name', () => {
  const bundled = inputs();
  bundled.lock.packages['node_modules/native-tool'].bundleDependencies =
    'prefix-bundled-child-suffix';
  bundled.lock.packages['node_modules/native-tool/node_modules/bundled-child'] = {
    version: '2.0.0',
    dev: true,
    inBundle: true,
  };

  expect(collectDependencyAdmission(bundled).violations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        rule: 'dependency-lock-metadata',
        message: expect.stringContaining('bundled-child@2.0.0'),
      }),
      expect.objectContaining({
        rule: 'dependency-source-admission',
        message: expect.stringContaining('bundled-child@2.0.0'),
      }),
    ])
  );
});

it('rejects unapproved protocol, missing integrity and an unapproved install script', () => {
  const invalid = inputs();
  const entry = invalid.lock.packages['node_modules/native-tool'];
  entry.resolved = 'git+https://example.invalid/native-tool.git';
  entry.integrity = '';
  invalid.rules.installScriptApprovals = [];

  expect(collectDependencyAdmission(invalid).violations.map((item) => item.rule)).toEqual(
    expect.arrayContaining([
      'dependency-lock-metadata',
      'dependency-source-admission',
      'dependency-install-admission',
    ])
  );
});

it('rejects an unapproved root lifecycle script', () => {
  const invalid = inputs();
  invalid.packageJson.scripts.prepare = 'untrusted-hook';

  expect(collectDependencyAdmission(invalid).violations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ rule: 'dependency-root-lifecycle', file: 'package.json' }),
    ])
  );
});

it('does not grant direct dependency identity to a nested copy with the same name', () => {
  const nested = inputs();
  nested.lock.packages['node_modules/parent/node_modules/native-tool'] = {
    ...nested.lock.packages['node_modules/native-tool'],
    dev: true,
  };

  const result = collectDependencyAdmission(nested);

  expect(result.rows).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        packageName: 'native-tool',
        dependencyScope: 'direct-development',
      }),
      expect.objectContaining({
        packageName: 'native-tool',
        dependencyScope: 'transitive-development',
      }),
    ])
  );
  expect(result.violations).toEqual(
    expect.arrayContaining([expect.objectContaining({ rule: 'dependency-install-admission' })])
  );
});

it('classifies a root-installed package declared directly by a workspace', () => {
  const workspaceDirect = inputs();
  delete workspaceDirect.packageJson.devDependencies['native-tool'];

  const result = collectDependencyAdmission({
    ...workspaceDirect,
    workspacePackages: [{ devDependencies: { 'native-tool': '1.0.0' } }],
  });

  expect(result.rows).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        packageName: 'native-tool',
        dependencyScope: 'direct-development',
      }),
    ])
  );
  expect(result.violations).toEqual([]);
});

it('does not skip a dependency nested below a workspace lock path', () => {
  const nested = inputs();
  nested.lock.packages['apps/fixture/node_modules/nested-tool'] = {
    version: '2.0.0',
    dev: true,
    resolved: 'https://registry.npmjs.org/nested-tool/-/nested-tool-2.0.0.tgz',
    integrity: 'sha512-nested',
  };

  expect(collectDependencyAdmission(nested).rows).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        packageName: 'nested-tool',
        dependencyScope: 'transitive-development',
      }),
    ])
  );
});

it('rejects a stale install-script approval that matches no scripted lock entry', () => {
  const stale = inputs();
  stale.rules.installScriptApprovals[0].resolvedVersion = '9.9.9';

  expect(collectDependencyAdmission(stale).violations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ rule: 'dependency-install-approval-stale' }),
      expect.objectContaining({ rule: 'dependency-install-admission' }),
    ])
  );
});

it('rejects duplicate approvals, unknown fields, impossible dates and invalid scope enums', () => {
  const malformed = inputs();
  const duplicate = { ...malformed.rules.installScriptApprovals[0] };
  malformed.rules.installScriptApprovals.push(duplicate);
  malformed.rules.installScriptApprovals[0].dependencyScope = 'development';
  malformed.rules.installScriptApprovals[0].expiresOn = '2099-02-30';
  malformed.rules.unownedField = true;

  expect(collectDependencyAdmission(malformed).violations).toEqual([
    expect.objectContaining({ rule: 'dependency-policy-schema' }),
  ]);
});

it('rejects contradictory dependency metadata instead of admitting a null scope', () => {
  const contradictory = inputs();
  contradictory.lock.packages['node_modules/native-tool'].dev = false;

  expect(collectDependencyAdmission(contradictory).violations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ rule: 'dependency-lock-metadata' }),
      expect.objectContaining({ rule: 'dependency-install-admission' }),
    ])
  );
});

it('re-evaluates admission for every workspace package manifest but not unrelated product files', () => {
  expect(isDependencyAdmissionInputPath('apps/extension/package.json')).toBe(true);
  expect(isDependencyAdmissionInputPath('packages/platform/package.json')).toBe(true);
  expect(isDependencyAdmissionInputPath('packages/new-owner/package.json')).toBe(true);
  expect(isDependencyAdmissionInputPath('apps/extension/src/index.ts')).toBe(false);
});
