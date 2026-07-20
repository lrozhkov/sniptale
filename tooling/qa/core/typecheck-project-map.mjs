import fs from 'node:fs';

import { fromRelativePath } from './shared-paths.mjs';
import { isProductSourcePath } from './src-production-targets.mjs';
import {
  FULL_TYPECHECK_PROJECT_IDS,
  OWNER_TEST_TYPECHECK_PROJECTS,
  PRODUCTION_TYPECHECK_PROJECTS,
  TEST_HARNESS_TYPECHECK_PROJECT,
  TYPECHECK_PROJECT_DEFINITIONS_PATH,
  TYPECHECK_PROJECTS,
} from './typecheck-project-definitions.mjs';

export const TYPECHECK_PROJECT_MAP_PATH = 'tooling/qa/core/typecheck-project-map.mjs';
export {
  FULL_TYPECHECK_PROJECT_IDS,
  OWNER_TEST_TYPECHECK_PROJECTS,
  PRODUCTION_TYPECHECK_PROJECTS,
  TEST_HARNESS_TYPECHECK_PROJECT,
  TYPECHECK_PROJECT_DEFINITIONS_PATH,
  TYPECHECK_PROJECTS,
} from './typecheck-project-definitions.mjs';

const PROJECT_BY_ID = new Map(TYPECHECK_PROJECTS.map((project) => [project.id, project]));
const PRODUCTION_PROJECT_IDS = PRODUCTION_TYPECHECK_PROJECTS.map((project) => project.id);
const OWNER_TEST_PROJECT_BY_ROOT = new Map(
  OWNER_TEST_TYPECHECK_PROJECTS.flatMap((project) =>
    project.rootPrefixes.map((rootPrefix) => [rootPrefix, project.id])
  )
);
const BROAD_SHARED_PREFIXES = [
  'apps/extension/src/contracts/',
  'apps/extension/src/composition/persistence/',
  'apps/extension/src/platform/',
  'apps/extension/src/ui/',
  'packages/runtime-contracts/src/',
  'packages/platform/src/',
  'packages/ui/src/',
];
const FULL_TYPECHECK_SOURCE_PREFIXES = ['apps/extension/src/content/'];
const FULL_TYPECHECK_TRIGGER_FILES = new Set([
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'tsconfig.node.json',
  'apps/extension/vite.config.ts',
  'apps/extension/build/content-runtime-build-id.ts',
  'apps/extension/build/injected-build.ts',
  'apps/extension/build/injected-build-shim-guard.ts',
  'apps/extension/build/layout.ts',
  'apps/extension/build/extension-html-inputs.ts',
  TYPECHECK_PROJECT_DEFINITIONS_PATH,
  TYPECHECK_PROJECT_MAP_PATH,
  'tooling/qa/core/verify-typecheck.mjs',
  'tooling/qa/core/verify-typecheck-cache.mjs',
]);
const TS_SOURCE_PATTERN = /\.(?:ts|tsx|cts|mts)$/u;
const TEST_SOURCE_PATTERN = /\.(?:test|spec|test-support)\.(?:ts|tsx)$/u;

function normalizePath(file) {
  return file.replaceAll('\\', '/');
}

function isTypeScriptSource(file) {
  return TS_SOURCE_PATTERN.test(file);
}

function isBroadSharedFile(file) {
  return BROAD_SHARED_PREFIXES.some((prefix) => file.startsWith(prefix));
}

function projectExists(projectId) {
  return PROJECT_BY_ID.has(projectId);
}

function collectReverseDependents(projectIds) {
  const required = new Set(projectIds);
  let changed = true;

  while (changed) {
    changed = false;
    for (const project of TYPECHECK_PROJECTS) {
      if (project.id === TEST_HARNESS_TYPECHECK_PROJECT.id && !required.has(project.id)) {
        continue;
      }

      if (
        required.has(project.id) ||
        !project.references?.some((reference) => required.has(reference))
      ) {
        continue;
      }

      required.add(project.id);
      changed = true;
    }
  }

  return [...required].filter(projectExists).sort();
}

function resolveDirectProjectId(file) {
  if (file === 'apps/extension/src/vite-env.d.ts') {
    return null;
  }

  if (file.startsWith('tooling/test/harness/editor/')) {
    return 'editor-tests';
  }

  if (file.startsWith('tooling/test/harness/')) {
    return null;
  }

  const matchingProductionProject = PRODUCTION_TYPECHECK_PROJECTS.find((project) =>
    project.rootPrefixes.some((prefix) => file.startsWith(prefix))
  );
  if (!matchingProductionProject) {
    return null;
  }

  if (TEST_SOURCE_PATTERN.test(file) || file.includes('/test-support/')) {
    const matchingRoot = matchingProductionProject.rootPrefixes.find((prefix) =>
      file.startsWith(prefix)
    );
    return matchingRoot ? (OWNER_TEST_PROJECT_BY_ROOT.get(matchingRoot) ?? null) : null;
  }

  return matchingProductionProject.id;
}

function createFullResolution(reason) {
  return {
    mode: 'full',
    projectIds: FULL_TYPECHECK_PROJECT_IDS,
    reason,
  };
}

export function getTypecheckProject(projectId) {
  return PROJECT_BY_ID.get(projectId) ?? null;
}

export function resolveAffectedTypecheckProjects(targetFiles = []) {
  const normalizedFiles = [...new Set(targetFiles.map(normalizePath))].sort();
  const sourceFiles = normalizedFiles.filter(isTypeScriptSource);

  if (normalizedFiles.some((file) => FULL_TYPECHECK_TRIGGER_FILES.has(file))) {
    return createFullResolution('config or typecheck tooling changed');
  }

  if (sourceFiles.length === 0) {
    return {
      mode: 'skip',
      projectIds: [],
      reason: 'no TypeScript targets',
    };
  }

  if (
    sourceFiles.some((file) => isProductSourcePath(file) && !fs.existsSync(fromRelativePath(file)))
  ) {
    return createFullResolution('deleted or missing TypeScript source target');
  }

  if (sourceFiles.some(isBroadSharedFile)) {
    return createFullResolution('broad shared contract owner changed');
  }
  if (
    sourceFiles.some((file) =>
      FULL_TYPECHECK_SOURCE_PREFIXES.some((prefix) => file.startsWith(prefix))
    )
  ) {
    return createFullResolution('broad content owner changed');
  }

  const directProjectIds = new Set();
  for (const file of sourceFiles) {
    const projectId = resolveDirectProjectId(file);
    if (!projectId) {
      return createFullResolution(`unmapped TypeScript target: ${file}`);
    }

    directProjectIds.add(projectId);
  }

  return {
    mode: 'affected',
    projectIds: collectReverseDependents(directProjectIds),
    reason: 'changed owner projects',
  };
}

export function collectMissingTypecheckProjectFiles({ rootDir = process.cwd() } = {}) {
  const missing = [];
  for (const project of TYPECHECK_PROJECTS) {
    for (const file of project.files ?? []) {
      if (!fs.existsSync(`${rootDir}/${file}`)) {
        missing.push(file);
      }
    }
  }

  return missing;
}

export function collectProjectReferenceViolations() {
  const violations = [];
  for (const project of TYPECHECK_PROJECTS) {
    for (const reference of project.references ?? []) {
      if (!PROJECT_BY_ID.has(reference)) {
        violations.push(`${project.id} references unknown typecheck project ${reference}`);
      }
    }
  }

  const ownerTestReferences = OWNER_TEST_TYPECHECK_PROJECTS.map(
    (project) => project.references?.[0]
  );
  if (!ownerTestReferences.every((projectId) => PRODUCTION_PROJECT_IDS.includes(projectId))) {
    violations.push('owner test projects must reference production typecheck projects');
  }

  return violations;
}
