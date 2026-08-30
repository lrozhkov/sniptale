import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, it } from 'vitest';

import { packageBoundaryErrors, runPackageBoundaryCheck } from './check.mjs';

function write(root: string, path: string, contents: string): void {
  const output = join(root, path);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, contents);
}

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'sniptale-package-boundaries-'));
  const packages = [
    ['foundation', '@sniptale/foundation'],
    ['runtime-contracts', '@sniptale/runtime-contracts'],
    ['platform', '@sniptale/platform'],
    ['ui', '@sniptale/ui'],
  ];
  for (const [folder, name] of packages) {
    write(root, `packages/${folder}/src/index.ts`, 'export const value = true;\n');
    write(
      root,
      `packages/${folder}/package.json`,
      JSON.stringify({
        name,
        private: true,
        exports: { '.': './src/index.ts' },
        dependencies: {},
      })
    );
    write(root, `packages/${folder}/tsconfig.json`, JSON.stringify({ include: ['src/**/*'] }));
  }
  write(root, 'apps/extension/src/index.ts', "import '@sniptale/ui';\n");
  return root;
}

it('accepts exported one-way workspace package imports', () => {
  const root = fixture();
  expect(packageBoundaryErrors(root)).toEqual([]);
  expect(runPackageBoundaryCheck({ root })).toEqual({ violations: [] });
});

it('rejects missing exports, package escape imports and retired roots together', () => {
  const root = fixture();
  write(root, 'src/shared/legacy.ts', 'export {};\n');
  write(
    root,
    'packages/foundation/src/index.ts',
    "import '@sniptale/ui/private';\nimport '../../../apps/extension/src/index';\n"
  );
  const errors = packageBoundaryErrors(root);
  expect(errors).toContain(
    'package deep import is not exported: packages/foundation/src/index.ts -> @sniptale/ui/private'
  );
  expect(errors).toContain(
    'package relative import escapes owner: packages/foundation/src/index.ts -> ../../../apps/extension/src/index'
  );
  expect(errors).toContain('retired shared root remains: src/shared');
});

it('rejects export targets that do not exist', () => {
  const root = fixture();
  const manifestPath = 'packages/platform/package.json';
  write(
    root,
    manifestPath,
    JSON.stringify({
      name: '@sniptale/platform',
      private: true,
      exports: { './missing': './src/missing.ts' },
      dependencies: {},
    })
  );
  expect(packageBoundaryErrors(root)).toContain(
    'missing package export target: @sniptale/platform/missing'
  );
});

it('rejects an existing export target outside its package owner', () => {
  const root = fixture();
  write(
    root,
    'packages/platform/package.json',
    JSON.stringify({
      name: '@sniptale/platform',
      private: true,
      exports: { './escape': '../../apps/extension/src/index.ts' },
      dependencies: {},
    })
  );
  expect(packageBoundaryErrors(root)).toContain(
    'package export target escapes owner: @sniptale/platform/escape'
  );
});

it('rejects app-relative deep imports into workspace packages', () => {
  const root = fixture();
  write(
    root,
    'apps/extension/src/deep-import.ts',
    "import '../../../packages/foundation/src/index';\n"
  );
  expect(packageBoundaryErrors(root)).toContain(
    'app bypasses package exports: apps/extension/src/deep-import.ts -> ../../../packages/foundation/src/index'
  );
});

it('rejects package-export bypasses from CSS imports', () => {
  const root = fixture();
  write(root, 'apps/extension/src/styles.css', "@import '../../../packages/ui/src/private.css';\n");
  write(root, 'packages/ui/src/private.css', '.private {}\n');
  expect(packageBoundaryErrors(root)).toContain(
    'app bypasses package exports: apps/extension/src/styles.css -> ../../../packages/ui/src/private.css'
  );
});

it('covers every module syntax when a UI package reaches into the app design system', () => {
  const root = fixture();
  write(root, 'apps/extension/src/design-system/private.ts', 'export const privateValue = true;\n');
  write(
    root,
    'packages/ui/src/static.ts',
    "import '../../../apps/extension/src/design-system/private';\n"
  );
  write(
    root,
    'packages/ui/src/reexport.ts',
    "export { privateValue } from '../../../apps/extension/src/design-system/private';\n"
  );
  write(
    root,
    'packages/ui/src/dynamic.ts',
    "void import('../../../apps/extension/src/design-system/private');\n"
  );
  write(
    root,
    'packages/ui/src/require.ts',
    "require('../../../apps/extension/src/design-system/private');\n"
  );

  const violations = packageBoundaryErrors(root);
  for (const file of ['static.ts', 'reexport.ts', 'dynamic.ts', 'require.ts']) {
    expect(violations).toContain(
      `package relative import escapes owner: packages/ui/src/${file} -> ` +
        '../../../apps/extension/src/design-system/private'
    );
  }
});

it('rejects app-owned files in package TypeScript inputs', () => {
  const root = fixture();
  write(
    root,
    'packages/platform/tsconfig.json',
    JSON.stringify({ include: ['src/**/*', '../../apps/extension/src/vite-env.d.ts'] })
  );
  expect(packageBoundaryErrors(root)).toContain(
    'package TypeScript config includes app owner: @sniptale/platform'
  );
});

it('rejects browser lifecycle globals in foundation and runtime contracts', () => {
  const root = fixture();
  write(
    root,
    'packages/runtime-contracts/src/index.ts',
    'export const href = window.location.href;\n'
  );
  expect(packageBoundaryErrors(root)).toContain(
    'contract package uses lifecycle global: packages/runtime-contracts/src/index.ts -> window'
  );
});

it('rejects globalThis lifecycle access but accepts a lexically shadowed browser name', () => {
  const root = fixture();
  write(
    root,
    'packages/runtime-contracts/src/index.ts',
    [
      'export function local(window: { location: string }) { return window.location; }',
      'export const href = globalThis.window.location.href;',
      '',
    ].join('\n')
  );
  expect(packageBoundaryErrors(root)).toEqual([
    'contract package uses lifecycle global: packages/runtime-contracts/src/index.ts -> window',
  ]);
});

it('uses parsed import edges instead of comments and reports undeclared workspace imports', () => {
  const root = fixture();
  write(
    root,
    'packages/platform/src/index.ts',
    ["// import '@sniptale/ui/private';", "import '@sniptale/runtime-contracts';", ''].join('\n')
  );
  expect(packageBoundaryErrors(root)).toContain(
    'undeclared workspace dependency: packages/platform/src/index.ts -> @sniptale/runtime-contracts'
  );
  expect(packageBoundaryErrors(root).join('\n')).not.toContain('@sniptale/ui/private');
});
