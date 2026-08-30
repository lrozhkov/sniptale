import { expect, it } from 'vitest';

import APP_PACKAGE from '../../../../../apps/extension/package.json';
import POLICY from '../../../../../apps/extension/build/layout.data.json';
import ROOT_PACKAGE from '../../../../../package.json';

import {
  extensionBuildLayoutErrors,
  isDeclaredExtensionBuildInput,
} from './verify-extension-build-layout.mjs';

const VITE_SOURCE = [
  "import { defineConfig } from 'vite';",
  "import tailwindcss from '@tailwindcss/vite';",
  'export default defineConfig(() => ({',
  '  root: BUILD_LAYOUT.appRoot,',
  '  plugins: [tailwindcss(), extensionHtmlInputs(BUILD_LAYOUT)],',
  '  build: { outDir: BUILD_LAYOUT.outputRoot, emptyOutDir: true },',
  '  server: { fs: { strict: true, allow: [BUILD_LAYOUT.appRoot, ...BUILD_LAYOUT.externalInputRoots] } },',
  '}));',
].join('\n');
const RETIRED_VITE_CONFIG_PATH = 'vite.config.ts';
const TAILWIND_STYLES_SOURCE = [
  "@import 'tailwindcss' source(none);",
  "@source '../../../../apps/extension/src';",
  "@source '..';",
  '@layer base { * { border-color: var(--color-gray-200, currentcolor); } }',
  '@theme inline { --color-background: black; }',
].join('\n');

function existingPaths(policy = POLICY) {
  return new Set([
    ...policy.configPaths,
    ...policy.htmlInputs.map((entry: { sourcePath: string }) => entry.sourcePath),
    ...policy.manifestModuleInputs.map((entry: { sourcePath: string }) => entry.sourcePath),
  ]);
}

it('accepts the complete bounded app build layout', () => {
  expect(
    extensionBuildLayoutErrors({
      policy: POLICY,
      rootPackage: ROOT_PACKAGE,
      appPackage: APP_PACKAGE,
      viteConfigSource: VITE_SOURCE,
      tailwindStylesSource: TAILWIND_STYLES_SOURCE,
      existingPaths: existingPaths(),
    })
  ).toEqual([]);
});

it('rejects broad inputs, app-local output, command drift and missing configs', () => {
  const policy = structuredClone(POLICY);
  policy.externalInputRoots = ['node_modules', 'src', 'tooling'];
  policy.outputRoot = 'apps/extension/dist';
  const appPackage = structuredClone(APP_PACKAGE);
  appPackage.scripts.build = 'vite build';
  delete appPackage.devDependencies.vite;
  const paths = existingPaths(policy);
  paths.delete('apps/extension/vite.config.ts');

  expect(
    extensionBuildLayoutErrors({
      policy,
      rootPackage: ROOT_PACKAGE,
      appPackage,
      viteConfigSource: 'export default {}',
      tailwindStylesSource: '',
      existingPaths: paths,
      retiredFiles: [RETIRED_VITE_CONFIG_PATH],
    })
  ).toEqual(
    expect.arrayContaining([
      expect.stringContaining('external build inputs'),
      expect.stringContaining('repository dist'),
      expect.stringContaining('app command drift'),
      expect.stringContaining('app development dependency closure'),
      expect.stringContaining('required app build config is missing'),
      expect.stringContaining('Vite config is missing semantic layout claim'),
      expect.stringContaining('Tailwind stylesheet is missing semantic ownership claim'),
      expect.stringContaining('retired root build input remains'),
    ])
  );
});

it('rejects path traversal through app and external input roots', () => {
  const policy = structuredClone(POLICY);
  policy.htmlInputs[0]!.sourcePath = 'apps/extension/../../docs/example.html';
  policy.manifestModuleInputs[0]!.sourcePath = 'tooling/test/harness/../../qa/core/shared.mjs';

  expect(
    extensionBuildLayoutErrors({
      policy,
      rootPackage: ROOT_PACKAGE,
      appPackage: APP_PACKAGE,
      viteConfigSource: VITE_SOURCE,
      tailwindStylesSource: TAILWIND_STYLES_SOURCE,
      existingPaths: existingPaths(policy),
    })
  ).toEqual(
    expect.arrayContaining([
      expect.stringContaining('undeclared HTML source input'),
      expect.stringContaining('undeclared manifest module input'),
    ])
  );
});

it('requires every app-owned build helper registered in config paths', () => {
  const paths = existingPaths();
  paths.delete('apps/extension/build/injected-build-support.ts');

  expect(
    extensionBuildLayoutErrors({
      policy: POLICY,
      rootPackage: ROOT_PACKAGE,
      appPackage: APP_PACKAGE,
      viteConfigSource: VITE_SOURCE,
      tailwindStylesSource: TAILWIND_STYLES_SOURCE,
      existingPaths: paths,
    })
  ).toContain(
    'required app build config is missing: apps/extension/build/injected-build-support.ts'
  );
});

it('rejects an unregistered build helper even when the registered paths exist', () => {
  expect(
    extensionBuildLayoutErrors({
      policy: POLICY,
      rootPackage: ROOT_PACKAGE,
      appPackage: APP_PACKAGE,
      viteConfigSource: VITE_SOURCE,
      tailwindStylesSource: TAILWIND_STYLES_SOURCE,
      existingPaths: existingPaths(),
      buildFiles: ['apps/extension/build/layout.ts', 'apps/extension/build/phantom-helper.ts'],
    })
  ).toContain('unregistered app build helper: apps/extension/build/phantom-helper.ts');
});

it('does not accept semantic Vite or Tailwind claims that appear only in comments', () => {
  const comments = [
    '// root: BUILD_LAYOUT.appRoot',
    '// outDir: BUILD_LAYOUT.outputRoot',
    '// tailwindcss()',
    '// extensionHtmlInputs(BUILD_LAYOUT)',
    'export default {};',
  ].join('\n');
  const styleComments = [
    "/* @import 'tailwindcss' source(none); */",
    "/* @source '../../../../apps/extension/src'; @source '..'; @theme inline; */",
  ].join('\n');

  expect(
    extensionBuildLayoutErrors({
      policy: POLICY,
      rootPackage: ROOT_PACKAGE,
      appPackage: APP_PACKAGE,
      viteConfigSource: comments,
      tailwindStylesSource: styleComments,
      existingPaths: existingPaths(),
    })
  ).toEqual(
    expect.arrayContaining([
      expect.stringContaining('Vite config is missing semantic layout claim'),
      expect.stringContaining('Tailwind stylesheet is missing semantic ownership claim'),
    ])
  );
});

it('rejects invalid layout schema, duplicate rollup names and unsupported modes', () => {
  const policy = structuredClone(POLICY);
  policy.schemaVersion = 2;
  policy.htmlInputs[1]!.rollupName = policy.htmlInputs[0]!.rollupName;
  policy.htmlInputs[1]!.mode = 'preview';
  policy.configPaths.push(policy.configPaths[0]!);

  expect(
    extensionBuildLayoutErrors({
      policy,
      rootPackage: ROOT_PACKAGE,
      appPackage: APP_PACKAGE,
      viteConfigSource: VITE_SOURCE,
      tailwindStylesSource: TAILWIND_STYLES_SOURCE,
      existingPaths: existingPaths(policy),
    })
  ).toEqual(
    expect.arrayContaining([
      'layout schema must be version 1',
      'HTML rollup names must be unique',
      'unsupported HTML input mode: preview',
      'build config paths must be unique canonical repository paths',
    ])
  );
});

it('admits only the app root and exact external input roots', () => {
  for (const allowed of [
    'apps/extension/src/popup/index.tsx',
    'packages/runtime-contracts/src/messaging/index.ts',
    'node_modules/react/index.js',
    'tooling/build/shims/zod-jitless.ts',
    'tooling/test/harness/popup.tsx',
  ]) {
    expect(isDeclaredExtensionBuildInput(allowed, POLICY)).toBe(true);
  }
  for (const forbidden of [
    'package.json',
    'docs/architecture/repository-overview.md',
    'tooling/ci/release-wrapper.mjs',
    'tooling/release/package/package-dist.mjs',
    '.tmp/report.json',
  ]) {
    expect(isDeclaredExtensionBuildInput(forbidden, POLICY)).toBe(false);
  }
});
