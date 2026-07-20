import { expect, it } from 'vitest';

import { collectDependencyAdmission } from './verify-dependency-admission.mjs';

function rules() {
  return {
    allowedProtocols: ['https'],
    allowedRegistryHosts: ['registry.npmjs.org'],
    sourceExceptions: [],
    installScriptApprovals: [
      {
        packageName: 'native-tool',
        resolvedVersion: '1.0.0',
        dependencyScope: 'direct-development',
        artifactInclusion: 'development-only',
      },
    ],
    rootLifecycleApprovals: [{ scriptName: 'prepare', command: 'husky', ownerId: 'tooling.qa' }],
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
