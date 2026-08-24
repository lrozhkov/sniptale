import path from 'node:path';

import { expect, it } from 'vitest';

import { createTempRoot, writeFile, writeJson } from './test-helpers';

function writeDesignSystemFixtures(root: string) {
  writeFile(root, 'src/shared/ui/Button.tsx', 'export function Button() { return null; }\n');
  writeFile(
    root,
    'apps/extension/src/design-system/catalog/registry/index.ts',
    [
      'export const registry = [',
      '  {',
      "    componentId: 'button',",
      "    status: 'active',",
      "    scope: 'shared-ui',",
      "    previewFidelity: 'canonical',",
      "    canonicalImplementation: 'src/shared/ui/Button.tsx',",
      "    canonicalPreview: 'src/shared/ui/Button.design-system.tsx',",
      "    sourcePath: 'src/shared/ui/Button.tsx',",
      "    sourceFiles: ['src/shared/ui/Button.tsx'],",
      "    usageContexts: [{ files: ['src/shared/ui/Button.tsx'] }],",
      '  },',
      '];',
      '',
    ].join('\n')
  );
  writeFile(root, 'src/shared/ui/Button.design-system.tsx', "export const preview = 'button';\n");
  writeFile(
    root,
    'apps/extension/src/design-system/design-system-preview.tsx',
    "export const previews = ['button'];\n"
  );
  writeFile(
    root,
    'apps/extension/src/popup/Popup.tsx',
    "import { Button } from '../../../../src/shared/components';\nexport { Button };\n"
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

  const module = await import('./verify-typecheck.mjs');
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
  const module = await import('../guards/architecture/verify-boundaries.mjs');
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
  const srcRoot = path.join(root, 'src');
  const extensionSrcRoot = path.join(root, 'apps', 'extension', 'src');
  const sharedUiRoot = path.join(srcRoot, 'shared', 'ui');
  const designSystemRoot = path.join(extensionSrcRoot, 'design-system');
  const popupRoot = path.join(extensionSrcRoot, 'popup');

  writeDesignSystemFixtures(root);

  const module = await import('./verify-design-system.mjs');
  const failures = module.runDesignSystemCheck({
    srcRootOverride: srcRoot,
    sharedUiRootOverride: sharedUiRoot,
    designSystemRootOverride: designSystemRoot,
    featureRootsOverride: [popupRoot],
    ignoredFilesOverride: new Set(),
    familyClassBypassRulesOverride: [],
    repoRootOverride: root,
  });

  expect(failures).toEqual(
    expect.arrayContaining(['apps/extension/src/popup/Popup.tsx bypasses design-system imports'])
  );
});
