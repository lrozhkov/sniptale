import path from 'node:path';

import { expect, it } from 'vitest';

import { createTempRoot, writeFile, writeJson } from '../../test-support/test-helpers';

function writeDesignSystemFixtures(root: string) {
  writeJson(root, 'packages/ui/package.json', {
    exports: { './product-modal': './src/product-modal/index.tsx' },
  });
  writeFile(root, 'packages/ui/src/product-modal/index.tsx', 'export const ProductModal = null;\n');
  writeFile(
    root,
    'apps/extension/src/design-system/catalog/registry/product/modal.data.ts',
    [
      "import type { DesignSystemRegistryEntry } from '../types';",
      'export const registry: DesignSystemRegistryEntry[] = [',
      '  {',
      "    componentId: 'product.ui.modal-shell',",
      "    status: 'active',",
      "    scope: 'product-ui',",
      "    previewFidelity: 'canonical',",
      "    canonicalImplementation: '@sniptale/ui/product-modal',",
      "    canonicalPreview: 'apps/extension/src/design-system/previews/product-modal/design-system.tsx',",
      "    sourceFiles: ['@sniptale/ui/product-modal'],",
      '  },',
      '];',
      '',
    ].join('\n')
  );
  writeFile(
    root,
    'apps/extension/src/design-system/previews/product-modal/design-system.tsx',
    [
      "import { designSystemPreview } from '../support/provider';",
      "designSystemPreview('product.ui.modal-shell', 'default', null);",
    ].join('\n')
  );
  writeFile(
    root,
    'apps/extension/src/design-system/index.tsx',
    'export const page = <DesignSystemThemeSurface />;\n'
  );
  writeFile(
    root,
    'apps/extension/src/design-system/shell/page/index.tsx',
    'useDesignSystemThemeSurface();\n'
  );
  writeFile(
    root,
    'apps/extension/src/design-system/theme/index.tsx',
    'export const surface = <div data-ui="design-system.theme-surface" />;\n'
  );
}

it('runs verify-typecheck against a temporary project cwd', async () => {
  const root = createTempRoot('verify-typecheck-');
  writeJson(root, 'tsconfig.json', {
    compilerOptions: {
      target: 'ES2020',
      module: 'ESNext',
      moduleResolution: 'bundler',
      strict: true,
    },
    include: ['src'],
  });
  writeFile(root, 'src/example.ts', 'export const value: string = 1;\n');

  const module = await import('../../proof/typecheck/execution/check.mjs');
  const result = module.runTypecheck({ cwd: root });
  const errorCode =
    result.error &&
    typeof result.error === 'object' &&
    'code' in result.error &&
    typeof result.error.code === 'string'
      ? result.error.code
      : null;

  expect(result.status).not.toBe(0);
  expect(result).toMatchObject({
    typecheckCheckerCount: 4,
    typecheckMode: 'full',
    typecheckToolVersion: '7.0.2',
  });
  expect(
    result.stdout.includes("Type 'number' is not assignable to type 'string'") ||
      result.stderr.includes("Type 'number' is not assignable to type 'string'") ||
      errorCode === 'EPERM'
  ).toBe(true);
}, 20000);

it('runs verify-boundaries against a temporary source graph', async () => {
  const module = await import('../../guards/architecture/verify-boundaries.mjs');
  let cruiseOptions: unknown = null;
  const result = await module.runBoundaryCheck({
    root: 'src',
    configOverride: {
      forbidden: [
        {
          name: 'synthetic-forbidden',
          severity: 'error',
          from: { path: '^src/a[.]ts$' },
          to: { path: '^src/b[.]ts$' },
        },
      ],
      options: { tsPreCompilationDeps: true },
    },
    cruiseRunner: async (_roots: string[], options: unknown) => {
      cruiseOptions = options;
      return { output: { summary: {} } };
    },
    formatRunner: async () => ({
      output: 'temp-boundary failed',
      exitCode: 1,
    }),
  });

  expect(result.exitCode).not.toBe(0);
  expect(result.output).toContain('temp-boundary');
  expect(cruiseOptions).toEqual(
    expect.objectContaining({
      validate: true,
      ruleSet: expect.objectContaining({
        forbidden: [
          expect.objectContaining({
            name: 'synthetic-forbidden',
          }),
        ],
      }),
      tsPreCompilationDeps: true,
    })
  );
}, 20000);

it('runs verify-design-system against a minimal isolated structure', async () => {
  const root = createTempRoot('verify-design-system-');
  const extensionSrcRoot = path.join(root, 'apps', 'extension', 'src');
  const designSystemRoot = path.join(extensionSrcRoot, 'design-system');

  writeDesignSystemFixtures(root);

  const module = await import('../../guards/product-contracts/verify-design-system.mjs');
  const failures = module.runDesignSystemCheck({
    designSystemRootOverride: designSystemRoot,
    registryRootOverride: path.join(designSystemRoot, 'catalog/registry'),
    previewRootOverride: path.join(designSystemRoot, 'previews'),
    packageJsonPathOverride: path.join(root, 'packages/ui/package.json'),
    repoRootOverride: root,
  });

  expect(failures).toEqual([]);
});
