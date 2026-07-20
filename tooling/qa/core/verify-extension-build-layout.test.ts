import { expect, it } from 'vitest';

import APP_PACKAGE from '../../../apps/extension/package.json';
import POLICY from '../../../apps/extension/build/layout.data.json';
import ROOT_PACKAGE from '../../../package.json';

import {
  extensionBuildLayoutErrors,
  isDeclaredExtensionBuildInput,
} from './verify-extension-build-layout.mjs';

const VITE_SOURCE = [
  'root: BUILD_LAYOUT.appRoot',
  'outDir: BUILD_LAYOUT.outputRoot',
  'emptyOutDir: true',
  'strict: true',
  'allow: [BUILD_LAYOUT.appRoot, ...BUILD_LAYOUT.externalInputRoots]',
  'extensionHtmlInputs(BUILD_LAYOUT)',
].join('\n');
const RETIRED_VITE_CONFIG_PATH = 'vite.config.ts';
const POSTCSS_SOURCE = [
  "import tailwindConfig from './tailwind.config.js'",
  'tailwindcss: tailwindConfig',
].join('\n');
const TAILWIND_SOURCE = [
  "fileURLToPath(new URL('.', import.meta.url))",
  "resolve(APP_ROOT, 'src/**/*.{js,jsx,ts,tsx}')",
  "resolve(APP_ROOT, '../../packages/ui/src/**/*.{js,jsx,ts,tsx}')",
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
      postcssConfigSource: POSTCSS_SOURCE,
      tailwindConfigSource: TAILWIND_SOURCE,
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
      postcssConfigSource: 'export default {}',
      tailwindConfigSource: 'export default {}',
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
      expect.stringContaining('Vite config is missing layout marker'),
      expect.stringContaining('PostCSS config is missing Tailwind ownership marker'),
      expect.stringContaining('Tailwind config is missing bounded content marker'),
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
      postcssConfigSource: POSTCSS_SOURCE,
      tailwindConfigSource: TAILWIND_SOURCE,
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
      postcssConfigSource: POSTCSS_SOURCE,
      tailwindConfigSource: TAILWIND_SOURCE,
      existingPaths: paths,
    })
  ).toContain(
    'required app build config is missing: apps/extension/build/injected-build-support.ts'
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
    'tooling/qa/core/verify-all.mjs',
    'tooling/release/package-dist.mjs',
    '.tmp/report.json',
  ]) {
    expect(isDeclaredExtensionBuildInput(forbidden, POLICY)).toBe(false);
  }
});
