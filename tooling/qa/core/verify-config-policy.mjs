/**
 * Config policy guardrail.
 * Keeps the canonical runtime baseline and strictness flags pinned in config.
 */

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import { isExecutedAsScript, printViolations, repoRoot } from './shared.mjs';
import { hasRequiredViteBuildTarget } from './verify-config-policy.vite-target.mjs';
import { collectExtensionBuildLayoutViolations } from './verify-extension-build-layout.mjs';

const MANIFEST_PATH = 'apps/extension/manifest.json';
const PACKAGE_JSON_PATH = 'package.json';
const PACKAGE_LOCK_PATH = 'package-lock.json';
const TSCONFIG_PATH = 'tsconfig.json';
const TSCONFIG_NODE_PATH = 'tsconfig.node.json';
const VITE_CONFIG_PATH = 'apps/extension/vite.config.ts';

const REQUIRED_TSCONFIG_FLAGS = {
  target: 'ES2024',
  forceConsistentCasingInFileNames: true,
  verbatimModuleSyntax: true,
};

const REQUIRED_TSCONFIG_NODE_FLAGS = {
  forceConsistentCasingInFileNames: true,
  verbatimModuleSyntax: true,
};

const REQUIRED_TSCONFIG_LIB = ['ES2024', 'DOM', 'DOM.Iterable'];
const REQUIRED_MINIMUM_CHROME_VERSION = '140';
const REQUIRED_BUILD_TARGET = 'chrome140';
const REQUIRED_NODE_ENGINE = '>=22.12 <23';
const REQUIRED_PACKAGE_DEPENDENCY_PREFIXES = {
  react: '^19.2.',
  'react-dom': '^19.2.',
};
const REQUIRED_PACKAGE_DEV_DEPENDENCY_PREFIXES = {
  '@types/react': '^19.2.',
  '@types/react-dom': '^19.2.',
  '@vitejs/plugin-react': '^5.2.',
};

function createViolation(file, message) {
  return {
    rule: 'config-policy',
    file,
    message,
  };
}

function readJson(relativePath, rootDir) {
  const absolutePath = path.join(rootDir, relativePath);
  return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
}

function readTsConfig(relativePath, rootDir) {
  const absolutePath = path.join(rootDir, relativePath);
  const source = fs.readFileSync(absolutePath, 'utf8');
  const result = ts.parseConfigFileTextToJson(absolutePath, source);

  if (result.error) {
    throw new Error(ts.flattenDiagnosticMessageText(result.error.messageText, '\n'));
  }

  return result.config;
}

function readText(relativePath, rootDir) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function arraysMatch(left, right) {
  return (
    Array.isArray(left) &&
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function collectCompilerOptionViolations({ file, compilerOptions, requiredFlags }) {
  return Object.entries(requiredFlags).flatMap(([flag, expectedValue]) =>
    compilerOptions[flag] === expectedValue
      ? []
      : [createViolation(file, `compilerOptions.${flag} must be ${JSON.stringify(expectedValue)}`)]
  );
}

function collectRuntimeBaselineViolations({ compilerOptions, manifest, viteConfigSource }) {
  const violations = [];

  if (!arraysMatch(compilerOptions.lib, REQUIRED_TSCONFIG_LIB)) {
    violations.push(
      createViolation(
        TSCONFIG_PATH,
        `compilerOptions.lib must be ${JSON.stringify(REQUIRED_TSCONFIG_LIB)}`
      )
    );
  }

  if (manifest.minimum_chrome_version !== REQUIRED_MINIMUM_CHROME_VERSION) {
    violations.push(
      createViolation(
        MANIFEST_PATH,
        `minimum_chrome_version must be ${JSON.stringify(REQUIRED_MINIMUM_CHROME_VERSION)}`
      )
    );
  }

  if (!hasRequiredViteBuildTarget(viteConfigSource)) {
    violations.push(
      createViolation(
        VITE_CONFIG_PATH,
        `build.target must be ${JSON.stringify(REQUIRED_BUILD_TARGET)}`
      )
    );
  }

  return violations;
}

function collectPackageBaselineViolations(packageJson, packageLock) {
  const violations = [];

  if (packageJson.engines?.node !== REQUIRED_NODE_ENGINE) {
    violations.push(
      createViolation(
        PACKAGE_JSON_PATH,
        `engines.node must be ${JSON.stringify(REQUIRED_NODE_ENGINE)}`
      )
    );
  }
  if (packageLock.packages?.['']?.engines?.node !== REQUIRED_NODE_ENGINE) {
    violations.push(
      createViolation(
        PACKAGE_LOCK_PATH,
        `packages[""].engines.node must be ${JSON.stringify(REQUIRED_NODE_ENGINE)}`
      )
    );
  }

  for (const [dependency, expectedPrefix] of Object.entries(REQUIRED_PACKAGE_DEPENDENCY_PREFIXES)) {
    if (!packageJson.dependencies?.[dependency]?.startsWith(expectedPrefix)) {
      violations.push(
        createViolation(
          PACKAGE_JSON_PATH,
          `dependencies.${dependency} must stay on the ${JSON.stringify(expectedPrefix)}x baseline`
        )
      );
    }
  }

  for (const [dependency, expectedPrefix] of Object.entries(
    REQUIRED_PACKAGE_DEV_DEPENDENCY_PREFIXES
  )) {
    if (!packageJson.devDependencies?.[dependency]?.startsWith(expectedPrefix)) {
      violations.push(
        createViolation(
          PACKAGE_JSON_PATH,
          `devDependencies.${dependency} must stay on the ${JSON.stringify(expectedPrefix)}x baseline`
        )
      );
    }
  }

  return violations;
}

export function collectConfigPolicyViolations({ rootDir = repoRoot } = {}) {
  const packageJson = readJson(PACKAGE_JSON_PATH, rootDir);
  const packageLock = readJson(PACKAGE_LOCK_PATH, rootDir);
  const tsconfigCompilerOptions = readTsConfig(TSCONFIG_PATH, rootDir).compilerOptions ?? {};
  const tsconfigNodeCompilerOptions =
    readTsConfig(TSCONFIG_NODE_PATH, rootDir).compilerOptions ?? {};
  const manifest = readJson(MANIFEST_PATH, rootDir);
  const viteConfigSource = readText(VITE_CONFIG_PATH, rootDir);

  return [
    ...collectCompilerOptionViolations({
      file: TSCONFIG_PATH,
      compilerOptions: tsconfigCompilerOptions,
      requiredFlags: REQUIRED_TSCONFIG_FLAGS,
    }),
    ...collectRuntimeBaselineViolations({
      compilerOptions: tsconfigCompilerOptions,
      manifest,
      viteConfigSource,
    }),
    ...collectPackageBaselineViolations(packageJson, packageLock),
    ...collectCompilerOptionViolations({
      file: TSCONFIG_NODE_PATH,
      compilerOptions: tsconfigNodeCompilerOptions,
      requiredFlags: REQUIRED_TSCONFIG_NODE_FLAGS,
    }),
    ...(fs.existsSync(path.join(rootDir, 'apps/extension/package.json'))
      ? collectExtensionBuildLayoutViolations({ rootDir })
      : []),
  ];
}

export function runConfigPolicyCheck(options = {}) {
  return {
    violations: collectConfigPolicyViolations(options),
  };
}

if (isExecutedAsScript(import.meta.url)) {
  const result = runConfigPolicyCheck();

  if (result.violations.length > 0) {
    printViolations('Config policy violations found:', result.violations);
    process.exit(1);
  }

  process.stdout.write('Config policy passed\n');
}
