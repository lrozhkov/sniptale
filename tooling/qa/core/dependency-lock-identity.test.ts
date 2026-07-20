import { describe, expect, it } from 'vitest';

import { classifyDependencyScope, resolveLockPackageName } from './dependency-lock-identity.mjs';

describe('resolveLockPackageName', () => {
  it.each([
    ['node_modules/plain', {}, 'plain'],
    ['node_modules/@scope/package', {}, '@scope/package'],
    ['node_modules/direct/node_modules/plain', {}, 'plain'],
    ['node_modules/alias', { name: 'declared-package' }, 'declared-package'],
  ])('resolves %s', (lockPath, entry, expected) => {
    expect(resolveLockPackageName(lockPath, entry)).toBe(expected);
  });

  it.each([
    ['packages/workspace', {}],
    ['node_modules/@scope', {}],
    ['node_modules/', {}],
    ['node_modules/plain', null],
  ])('rejects malformed identity for %s', (lockPath, entry) => {
    expect(resolveLockPackageName(lockPath, entry)).toBeNull();
  });
});

describe('classifyDependencyScope', () => {
  const rootPackage = {
    dependencies: { runtime: '1.0.0' },
    optionalDependencies: { optional: '1.0.0' },
    devDependencies: { development: '1.0.0' },
  };

  it.each([
    ['node_modules/runtime', 'runtime', {}, 'direct-runtime'],
    ['node_modules/optional', 'optional', {}, 'direct-runtime'],
    ['node_modules/development', 'development', { dev: true }, 'direct-development'],
    ['node_modules/development', 'development', { devOptional: true }, 'direct-development'],
    ['node_modules/runtime/node_modules/runtime', 'runtime', {}, 'transitive-runtime'],
    [
      'node_modules/runtime/node_modules/development',
      'development',
      { dev: true },
      'transitive-development',
    ],
  ])('classifies %s', (lockPath, name, entry, expected) => {
    expect(classifyDependencyScope(rootPackage, lockPath, name, entry)).toBe(expected);
  });

  it.each([
    [
      {
        dependencies: { ambiguous: '1.0.0' },
        devDependencies: { ambiguous: '1.0.0' },
      },
      'node_modules/ambiguous',
      'ambiguous',
      {},
    ],
    [rootPackage, 'node_modules/runtime', 'runtime', { dev: true }],
    [rootPackage, 'node_modules/development', 'development', {}],
    [rootPackage, 'node_modules/development', 'development', { dev: 'true' }],
    [rootPackage, 'node_modules/development', 'development', null],
  ])('rejects contradictory or malformed lock metadata', (root, lockPath, name, entry) => {
    expect(classifyDependencyScope(root, lockPath, name, entry)).toBeNull();
  });
});
