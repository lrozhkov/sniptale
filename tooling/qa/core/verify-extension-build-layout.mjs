import fs from 'node:fs';
import path from 'node:path';

import { extensionBuildLayoutErrors } from './extension-build-layout-policy.mjs';
import { isExecutedAsScript, printViolations, repoRoot } from './shared.mjs';

export {
  extensionBuildLayoutErrors,
  isDeclaredExtensionBuildInput,
} from './extension-build-layout-policy.mjs';

export const EXTENSION_BUILD_LAYOUT_PATH = 'apps/extension/build/layout.data.json';
const VITE_CONFIG_PATH = 'apps/extension/vite.config.ts';
const POSTCSS_CONFIG_PATH = 'apps/extension/postcss.config.js';
const TAILWIND_CONFIG_PATH = 'apps/extension/tailwind.config.js';
const RETIRED_BUILD_PATHS = [
  'postcss.config.js',
  'public',
  'src/manifest.json',
  'src/vite-env.d.ts',
  'tailwind.config.js',
  'vite.config.ts',
  'vite.content-runtime-build-id.ts',
  'vite.injected-build-shim-guard.ts',
  'vite.injected-build.ts',
];

function collectFiles(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) return [];
  if (fs.statSync(absolutePath).isFile()) return [relativePath];
  return fs
    .readdirSync(absolutePath, { withFileTypes: true })
    .flatMap((entry) => collectFiles(root, `${relativePath}/${entry.name}`));
}

function readJson(rootDir, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), 'utf8'));
}

export function collectExtensionBuildLayoutViolations({ rootDir = repoRoot } = {}) {
  if (!fs.existsSync(path.join(rootDir, EXTENSION_BUILD_LAYOUT_PATH))) {
    return [
      {
        rule: 'config-policy',
        file: EXTENSION_BUILD_LAYOUT_PATH,
        message: 'extension build layout registry is missing',
      },
    ];
  }
  const policy = readJson(rootDir, EXTENSION_BUILD_LAYOUT_PATH);
  const existingPaths = new Set(
    [
      ...policy.configPaths,
      ...policy.htmlInputs.map((entry) => entry.sourcePath),
      ...policy.manifestModuleInputs.map((entry) => entry.sourcePath),
    ].filter((file) => fs.existsSync(path.join(rootDir, file)))
  );
  const retiredFiles = RETIRED_BUILD_PATHS.flatMap((file) => collectFiles(rootDir, file));
  return extensionBuildLayoutErrors({
    policy,
    rootPackage: readJson(rootDir, 'package.json'),
    appPackage: readJson(rootDir, 'apps/extension/package.json'),
    viteConfigSource: fs.readFileSync(path.join(rootDir, VITE_CONFIG_PATH), 'utf8'),
    postcssConfigSource: fs.readFileSync(path.join(rootDir, POSTCSS_CONFIG_PATH), 'utf8'),
    tailwindConfigSource: fs.readFileSync(path.join(rootDir, TAILWIND_CONFIG_PATH), 'utf8'),
    existingPaths,
    retiredFiles,
  }).map((message) => ({ rule: 'config-policy', file: EXTENSION_BUILD_LAYOUT_PATH, message }));
}

if (isExecutedAsScript(import.meta.url)) {
  const violations = collectExtensionBuildLayoutViolations();
  if (violations.length > 0) {
    printViolations('Extension build layout violations found:', violations);
    process.exit(1);
  }
  process.stdout.write('Extension build layout passed\n');
}
