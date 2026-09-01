/**
 * Config policy guardrail.
 * Keeps the canonical runtime baseline and strictness flags pinned in config.
 */

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import { repoRoot } from '../../../../analysis/repository/shared-paths.mjs';
import { isExecutedAsScript, printViolations } from '../../../../runtime/process/shared-cli.mjs';
import { hasRequiredViteBuildTarget } from './vite-target.mjs';

const MANIFEST_PATH = 'apps/extension/manifest.json';
const NVMRC_PATH = '.nvmrc';
const NPMRC_PATH = '.npmrc';
const PACKAGE_JSON_PATH = 'package.json';
const PACKAGE_LOCK_PATH = 'package-lock.json';
const TSCONFIG_PATH = 'tsconfig.json';
const TSCONFIG_NODE_PATH = 'tsconfig.node.json';
const VITE_CONFIG_PATH = 'apps/extension/vite.config.ts';

const REQUIRED_TSCONFIG_FLAGS = {
  target: 'ES2024',
  forceConsistentCasingInFileNames: true,
  noUncheckedSideEffectImports: true,
  verbatimModuleSyntax: true,
};

const REQUIRED_TSCONFIG_NODE_FLAGS = {
  forceConsistentCasingInFileNames: true,
  noUncheckedSideEffectImports: true,
  verbatimModuleSyntax: true,
};

const REQUIRED_TSCONFIG_LIB = ['ES2024', 'DOM', 'DOM.Iterable'];
const REQUIRED_BUILD_TARGET = 'chrome140';
const REQUIRED_NODE_VERSION = '24.18.0';
const REQUIRED_NODE_ENGINE = '>=24.18.0 <25';
const REQUIRED_PACKAGE_MANAGER = 'npm@11.19.1';
const REQUIRED_NPM_CONFIG = Object.freeze(['loglevel=error', 'min-release-age=7']);
const REQUIRED_PACKAGE_DEPENDENCY_BASELINES = {
  react: /^\^19\.2\.\d+$/u,
  'react-dom': /^\^19\.2\.\d+$/u,
};
const REQUIRED_PACKAGE_DEV_DEPENDENCY_BASELINES = {
  '@types/react': /^\^19\.2\.\d+$/u,
  '@types/react-dom': /^\^19\.2\.\d+$/u,
  '@vitejs/plugin-react': /^\^6\.1\.\d+$/u,
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

  if (!/^\d+$/u.test(manifest.minimum_chrome_version ?? '')) {
    violations.push(
      createViolation(
        MANIFEST_PATH,
        'minimum_chrome_version must be a decimal Chrome major version'
      )
    );
  }

  if (Object.hasOwn(manifest, 'message_serialization')) {
    violations.push(
      createViolation(
        MANIFEST_PATH,
        'message_serialization must remain absent until a production messaging owner requires it'
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

function collectNpmPolicyViolations(packageJson, npmrcSource, nvmrcSource) {
  const violations = [];
  const npmConfig = npmrcSource
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
  if (!arraysMatch(npmConfig, REQUIRED_NPM_CONFIG)) {
    violations.push(
      createViolation(
        NPMRC_PATH,
        `npm config must be exactly ${JSON.stringify(REQUIRED_NPM_CONFIG)}`
      )
    );
  }
  if (npmConfig.some((line) => line.startsWith('min-release-age-exclude'))) {
    violations.push(
      createViolation(
        NPMRC_PATH,
        'urgent security exclusions must stay one-shot and must not be committed'
      )
    );
  }

  if (packageJson.packageManager !== REQUIRED_PACKAGE_MANAGER) {
    violations.push(
      createViolation(
        PACKAGE_JSON_PATH,
        `packageManager must be ${JSON.stringify(REQUIRED_PACKAGE_MANAGER)}`
      )
    );
  }
  if (nvmrcSource !== `${REQUIRED_NODE_VERSION}\n`) {
    violations.push(
      createViolation(NVMRC_PATH, `.nvmrc must contain exactly ${REQUIRED_NODE_VERSION}`)
    );
  }
  if (
    packageJson.devEngines?.runtime?.name !== 'node' ||
    packageJson.devEngines.runtime.version !== REQUIRED_NODE_ENGINE ||
    packageJson.devEngines.runtime.onFail !== 'error'
  ) {
    violations.push(
      createViolation(PACKAGE_JSON_PATH, 'devEngines.runtime must enforce the Node engine baseline')
    );
  }
  if (
    packageJson.devEngines?.packageManager?.name !== 'npm' ||
    packageJson.devEngines.packageManager.version !== '11.19.1' ||
    packageJson.devEngines.packageManager.onFail !== 'error'
  ) {
    violations.push(
      createViolation(PACKAGE_JSON_PATH, 'devEngines.packageManager must enforce npm 11.19.1')
    );
  }
  return violations;
}

function collectPackageBaselineViolations(packageJson, packageLock, npmrcSource, nvmrcSource) {
  const violations = collectNpmPolicyViolations(packageJson, npmrcSource, nvmrcSource);

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

  for (const [dependency, expectedBaseline] of Object.entries(
    REQUIRED_PACKAGE_DEPENDENCY_BASELINES
  )) {
    if (!expectedBaseline.test(packageJson.dependencies?.[dependency] ?? '')) {
      violations.push(
        createViolation(
          PACKAGE_JSON_PATH,
          `dependencies.${dependency} must stay on the ${JSON.stringify(expectedBaseline.source)} baseline`
        )
      );
    }
  }

  for (const [dependency, expectedPrefix] of Object.entries(
    REQUIRED_PACKAGE_DEV_DEPENDENCY_BASELINES
  )) {
    if (!expectedPrefix.test(packageJson.devDependencies?.[dependency] ?? '')) {
      violations.push(
        createViolation(
          PACKAGE_JSON_PATH,
          `devDependencies.${dependency} must stay on the ${JSON.stringify(expectedPrefix.source)} baseline`
        )
      );
    }
  }

  return violations;
}

export function collectConfigPolicyViolations({ rootDir = repoRoot } = {}) {
  const packageJson = readJson(PACKAGE_JSON_PATH, rootDir);
  const packageLock = readJson(PACKAGE_LOCK_PATH, rootDir);
  const nvmrcSource = readText(NVMRC_PATH, rootDir);
  const npmrcSource = readText(NPMRC_PATH, rootDir);
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
    ...collectPackageBaselineViolations(packageJson, packageLock, npmrcSource, nvmrcSource),
    ...collectCompilerOptionViolations({
      file: TSCONFIG_NODE_PATH,
      compilerOptions: tsconfigNodeCompilerOptions,
      requiredFlags: REQUIRED_TSCONFIG_NODE_FLAGS,
    }),
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
