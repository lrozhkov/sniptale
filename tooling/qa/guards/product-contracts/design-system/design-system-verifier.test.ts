import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { runDesignSystemCheck } from '../verify-design-system.mjs';
import {
  collectRegistryEntries,
  getCanonicalOwnershipFailures,
} from './design-system-verifier.mjs';
import { createAstGrepIdentity } from '../../../audits/ast-grep/ast-grep.mjs';
import { AST_GREP_CORE_GROUP_IDS } from '../../../audits/ast-grep/ast-grep.rules.mjs';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { force: true, recursive: true });
});

function write(root: string, relativePath: string, source: string) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, source);
}

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'design-system-contract-'));
  roots.push(root);
  write(
    root,
    'packages/ui/package.json',
    JSON.stringify({
      exports: { './product-modal': './src/product-modal/index.tsx' },
    })
  );
  write(root, 'packages/ui/src/product-modal/index.tsx', 'export const ProductModal = null;\n');
  write(
    root,
    'apps/extension/src/design-system/catalog/registry/product/modal.data.ts',
    [
      "import type { DesignSystemRegistryEntry } from '../types';",
      'export const entries: DesignSystemRegistryEntry[] = [{',
      "  componentId: 'product.ui.modal-shell',",
      "  scope: 'product-ui',",
      "  source: '@sniptale/ui/product-modal',",
      "  sourceFiles: ['@sniptale/ui/product-modal'],",
      "  status: 'active',",
      "  previewFidelity: 'canonical',",
      "  canonicalImplementation: '@sniptale/ui/product-modal',",
      "  canonicalPreview: 'apps/extension/src/design-system/previews/product-modal/design-system.tsx',",
      '}];',
    ].join('\n')
  );
  write(
    root,
    'apps/extension/src/design-system/previews/product-modal/design-system.tsx',
    [
      "import { designSystemPreview } from '../support/provider';",
      "designSystemPreview('product.ui.modal-shell', 'default', null);",
    ].join('\n')
  );
  write(
    root,
    'apps/extension/src/design-system/index.tsx',
    'export const page = <DesignSystemThemeSurface />;\n'
  );
  write(
    root,
    'apps/extension/src/design-system/shell/page/index.tsx',
    'useDesignSystemThemeSurface();\n'
  );
  write(
    root,
    'apps/extension/src/design-system/theme/index.tsx',
    'export const surface = <div data-ui="design-system.theme-surface" />;\n'
  );
  return root;
}

function runFixture(root: string, astGrepReceipt: object | null = null) {
  const designSystemRoot = path.join(root, 'apps/extension/src/design-system');
  return runDesignSystemCheck({
    astGrepReceipt,
    designSystemRootOverride: designSystemRoot,
    registryRootOverride: path.join(designSystemRoot, 'catalog/registry'),
    previewRootOverride: path.join(designSystemRoot, 'previews'),
    packageJsonPathOverride: path.join(root, 'packages/ui/package.json'),
    repoRootOverride: root,
  });
}

it('projects design-system findings from the unified receipt', () => {
  const files = ['tooling/qa/audits/ast-grep/unified-ast-grep.mjs'];
  const receipt = {
    files,
    identity: createAstGrepIdentity({ files, groupIds: AST_GREP_CORE_GROUP_IDS }),
    skipped: false,
    violations: [
      {
        rule: 'design-system-direct-body-portal',
        file: 'apps/extension/src/editor/example.tsx',
        line: 17,
        message: 'Use the theme-safe portal owner.',
      },
    ],
  };

  expect(runFixture(createFixture(), receipt)).toContain(
    'apps/extension/src/editor/example.tsx:17 Use the theme-safe portal owner.'
  );
});

it('accepts the current registry, package export, preview, and theme owner topology', () => {
  expect(runFixture(createFixture())).toEqual([]);
});

it('keeps the real typed registry non-vacuous', () => {
  const entries = collectRegistryEntries(
    path.join(process.cwd(), 'apps/extension/src/design-system/catalog/registry')
  );

  expect(entries.length).toBeGreaterThan(0);
  expect(entries.every(({ componentId }) => Boolean(componentId))).toBe(true);
});

it('reads typed registry entries and imported preview calls independent of quotes and layout', () => {
  const root = createFixture();
  write(
    root,
    'apps/extension/src/design-system/catalog/registry/product/modal.data.ts',
    [
      "import type { DesignSystemRegistryEntry } from '../types';",
      'export const entries: DesignSystemRegistryEntry[] = [',
      '  {',
      '    componentId:',
      '      "product.ui.modal-shell",',
      '    scope: "product-ui",',
      '    source: "@sniptale/ui/product-modal",',
      '    sourceFiles: ["@sniptale/ui/product-modal"],',
      '    status: "active",',
      '    previewFidelity: "canonical",',
      '    canonicalImplementation: "@sniptale/ui/product-modal",',
      '    canonicalPreview:',
      '      "apps/extension/src/design-system/previews/product-modal/design-system.tsx",',
      '  },',
      '];',
    ].join('\n')
  );
  write(
    root,
    'apps/extension/src/design-system/previews/product-modal/design-system.tsx',
    [
      "import { designSystemPreview as preview } from '../support/provider';",
      'preview(',
      '  "product.ui.modal-shell",',
      '  "default",',
      '  null',
      ');',
    ].join('\n')
  );

  expect(runFixture(root)).toEqual([]);
});

it('does not accept decorative registry strings as typed contract data', () => {
  const root = createFixture();
  write(
    root,
    'apps/extension/src/design-system/catalog/registry/product/modal.data.ts',
    [
      'const decorative = "componentId: \'product.ui.modal-shell\'";',
      "export const entries = [{ componentId: 'product.ui.modal-shell' }];",
    ].join('\n')
  );
  write(
    root,
    'apps/extension/src/design-system/previews/product-modal/design-system.tsx',
    [
      "import { designSystemPreview } from '../support/provider';",
      "designSystemPreview('product.ui.modal-shell', 'default', null);",
    ].join('\n')
  );

  expect(runFixture(root)).toEqual(
    expect.arrayContaining([
      'design-system registry must contain at least one typed entry',
      'product.ui.modal-shell has a real preview but is missing a registry entry',
    ])
  );
});

it('does not accept decorative preview strings as real preview coverage', () => {
  const root = createFixture();
  write(
    root,
    'apps/extension/src/design-system/previews/product-modal/design-system.tsx',
    'export const decorative = "designSystemPreview(\'product.ui.modal-shell\')";\n'
  );

  expect(runFixture(root)).toEqual(
    expect.arrayContaining(['product.ui.modal-shell is missing design-system preview coverage'])
  );
});

it('rejects a real preview whose registry entry was lost', () => {
  const root = createFixture();
  write(
    root,
    'apps/extension/src/design-system/catalog/registry/product/modal.data.ts',
    [
      "import type { DesignSystemRegistryEntry } from '../types';",
      'export const entries: DesignSystemRegistryEntry[] = [];',
    ].join('\n')
  );
  expect(runFixture(root)).toContain(
    'product.ui.modal-shell has a real preview but is missing a registry entry'
  );
});

it('rejects an active registry entry whose preview was lost', () => {
  const root = createFixture();
  fs.rmSync(
    path.join(root, 'apps/extension/src/design-system/previews/product-modal/design-system.tsx')
  );
  expect(runFixture(root)).toEqual(
    expect.arrayContaining([
      'product.ui.modal-shell is missing design-system preview coverage',
      'apps/extension/src/design-system/previews/product-modal/design-system.tsx is referenced ' +
        'by the design-system registry but does not exist',
    ])
  );
});

it('rejects registry references that are neither real paths nor package exports', () => {
  const root = createFixture();
  const registryPath = path.join(
    root,
    'apps/extension/src/design-system/catalog/registry/product/modal.data.ts'
  );
  const source = fs
    .readFileSync(registryPath, 'utf8')
    .replace('@sniptale/ui/product-modal', '@sniptale/ui/missing-modal');
  fs.writeFileSync(registryPath, source);
  expect(runFixture(root)).toContain(
    '@sniptale/ui/missing-modal is referenced by the design-system registry but is not exported'
  );
});

it('accepts package and current path canonical-owner variants', () => {
  const registry = [
    {
      componentId: 'shared.package',
      scope: 'shared-ui',
      status: 'active',
      previewFidelity: 'canonical',
      canonicalImplementation: '@sniptale/ui/skeleton',
      canonicalPreview: '@sniptale/ui/skeleton',
    },
    {
      componentId: 'shared.preview',
      scope: 'shared-ui',
      status: 'active',
      previewFidelity: 'canonical',
      canonicalImplementation: 'apps/extension/src/design-system/previews/glass-popover/index.tsx',
      canonicalPreview: 'apps/extension/src/design-system/previews/glass-popover/design-system.tsx',
    },
    {
      componentId: 'shared.feature',
      scope: 'shared-ui',
      status: 'active',
      previewFidelity: 'canonical',
      canonicalImplementation: 'apps/extension/src/features/scenario/dialog/index.tsx',
      canonicalPreview: 'apps/extension/src/design-system/previews/scenario/design-system.tsx',
    },
    {
      componentId: 'product.preview',
      scope: 'product-ui',
      status: 'active',
      previewFidelity: 'canonical',
      canonicalImplementation: 'packages/ui/src/product-modal/index.tsx',
      canonicalPreview: 'apps/extension/src/design-system/previews/product-modal/design-system.tsx',
    },
  ];

  expect(getCanonicalOwnershipFailures(registry)).toEqual([]);
});

it('rejects canonical registry owners outside the accepted owner folders', () => {
  expect(
    getCanonicalOwnershipFailures([
      {
        componentId: 'product.invalid',
        scope: 'product-ui',
        status: 'active',
        previewFidelity: 'canonical',
        canonicalImplementation: 'apps/extension/src/background/modal.tsx',
        canonicalPreview: 'apps/extension/src/content/modal-preview.tsx',
      },
    ])
  ).toEqual([
    'product.invalid canonical implementation must live under a canonical UI owner',
    'product.invalid canonical preview must live under a canonical UI preview owner',
  ]);
});

it('requires actual theme owner syntax and ignores decorative strings', () => {
  const root = createFixture();
  write(
    root,
    'apps/extension/src/design-system/index.tsx',
    [
      "const decorativeSurface = '<DesignSystemThemeSurface />';",
      "const decorativeInitializer = 'initializeAppTheme()';",
    ].join('\n')
  );
  write(
    root,
    'apps/extension/src/design-system/shell/page/index.tsx',
    "const decorative = 'useDesignSystemThemeSurface()';\n"
  );
  write(
    root,
    'apps/extension/src/design-system/theme/index.tsx',
    'const decorative = \'data-ui="design-system.theme-surface"\';\n'
  );

  expect(runFixture(root)).toEqual(
    expect.arrayContaining([
      'apps/extension/src/design-system/index.tsx must render through DesignSystemThemeSurface',
      'apps/extension/src/design-system/theme/index.tsx must expose data-ui="design-system.theme-surface"',
      'apps/extension/src/design-system/shell/page/index.tsx must consume the design-system-owned theme surface',
    ])
  );
});

it('rejects an actual global theme initialization call', () => {
  const root = createFixture();
  write(
    root,
    'apps/extension/src/design-system/index.tsx',
    'initializeAppTheme(); export const page = <DesignSystemThemeSurface />;\n'
  );

  expect(runFixture(root)).toContain(
    'apps/extension/src/design-system/index.tsx must not initialize a global app theme'
  );
});
