import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const REQUIRED_TOOL_IDS = Object.freeze([
  'oxfmt',
  'oxlint',
  'oxlintTsgolint',
  'typescriptCompilerApi',
  'typescriptCompilerApiShim',
  'typescriptNative',
  'viteReact',
]);

const EXPECTED_PACKAGE_NAMES = Object.freeze({
  typescriptCompilerApi: 'typescript',
  typescriptCompilerApiShim: '@typescript/typescript6',
  typescriptNative: 'typescript',
});

const REQUIRED_ENTRIES = Object.freeze({
  oxfmt: 'bin/oxfmt',
  oxlint: 'bin/oxlint',
  oxlintTsgolint: 'bin/tsgolint.js',
  typescriptCompilerApi: 'lib/typescript.js',
  typescriptCompilerApiShim: 'lib/typescript.js',
  typescriptNative: 'bin/tsc',
});

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function verifyMutationTypescriptAuthority(root, projectLock) {
  const projectTypescript = projectLock.packages?.['node_modules/typescript'];
  const projectCompilerApi = projectLock.packages?.['node_modules/@typescript/old'];
  const mutationPackage = readJson(path.join(root, 'tooling/test/mutation/package.json'));
  const mutationLock = readJson(path.join(root, 'tooling/test/mutation/package-lock.json'));
  const mutationTypescript = mutationLock.packages?.['node_modules/typescript'];
  const mutationCompilerApi = mutationLock.packages?.['node_modules/@typescript/old'];
  if (
    !projectTypescript?.name ||
    !projectTypescript.version ||
    !projectCompilerApi?.name ||
    !projectCompilerApi.version
  ) {
    throw new Error('Project TypeScript lock identity is missing.');
  }
  const expectedSpec = `npm:${projectTypescript.name}@${projectTypescript.version}`;
  if (mutationPackage.devDependencies?.typescript !== expectedSpec) {
    throw new Error(
      `Mutation TypeScript authority drift: expected ${expectedSpec}, ` +
        `got ${String(mutationPackage.devDependencies?.typescript)}.`
    );
  }
  for (const field of ['name', 'version', 'resolved', 'integrity']) {
    if (mutationTypescript?.[field] !== projectTypescript[field]) {
      throw new Error(`Mutation TypeScript ${field} drifted from the project lock.`);
    }
    if (mutationCompilerApi?.[field] !== projectCompilerApi?.[field]) {
      throw new Error(`Mutation TypeScript compiler API ${field} drifted from the project lock.`);
    }
  }
  return projectCompilerApi.version;
}

export function verifyProjectToolchain({ cwd = process.cwd() } = {}) {
  const root = path.resolve(cwd);
  const lock = readJson(path.join(root, 'tooling/configs/ci/toolchain.lock.json'));
  const projectLock = readJson(path.join(root, 'package-lock.json'));
  const toolIds = Object.keys(lock.projectToolchain ?? {}).sort();
  if (lock.schemaVersion !== 1 || JSON.stringify(toolIds) !== JSON.stringify(REQUIRED_TOOL_IDS)) {
    throw new Error('Project toolchain lock schema or required tool inventory drifted.');
  }

  for (const toolId of REQUIRED_TOOL_IDS) {
    const tool = lock.projectToolchain[toolId];
    const packageRoot = path.join(root, tool.packagePath);
    const installedPackage = readJson(path.join(packageRoot, 'package.json'));
    const lockedPackage = projectLock.packages?.[tool.packagePath];
    if (installedPackage.version !== tool.version || lockedPackage?.version !== tool.version) {
      const packageLockVersion = lockedPackage?.version ?? 'missing';
      throw new Error(
        `${toolId} version drift: expected ${tool.version}, ` +
          `installed ${installedPackage.version}, package-lock ${packageLockVersion}.`
      );
    }
    const expectedName = EXPECTED_PACKAGE_NAMES[toolId];
    if (
      expectedName &&
      (installedPackage.name !== expectedName || lockedPackage?.name !== expectedName)
    ) {
      throw new Error(`${toolId} alias identity drift: expected ${expectedName}.`);
    }
    const requiredEntry = REQUIRED_ENTRIES[toolId];
    if (requiredEntry && !fs.existsSync(path.join(packageRoot, requiredEntry))) {
      throw new Error(`${toolId} entrypoint is missing: ${requiredEntry}.`);
    }
  }

  const requireFromCandidate = createRequire(path.join(root, 'package.json'));
  const runtimeTypescriptVersion = requireFromCandidate('typescript').version;
  if (runtimeTypescriptVersion !== lock.projectToolchain.typescriptCompilerApi.version) {
    const expectedVersion = lock.projectToolchain.typescriptCompilerApi.version;
    throw new Error(
      `TypeScript compiler API runtime drift: expected ${expectedVersion}, ` +
        `got ${runtimeTypescriptVersion}.`
    );
  }
  const mutationTypescriptVersion = verifyMutationTypescriptAuthority(root, projectLock);

  return {
    mutationTypescriptVersion,
    toolCount: REQUIRED_TOOL_IDS.length,
    typescriptCompilerApiVersion: runtimeTypescriptVersion,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = verifyProjectToolchain();
  process.stdout.write(
    `Project toolchain passed: tools=${result.toolCount}; ` +
      `typescript-api=${result.typescriptCompilerApiVersion}; ` +
      `mutation-typescript=${result.mutationTypescriptVersion}\n`
  );
}
