import fs from 'node:fs';
import path from 'node:path';

import { emitCommandResult, isExecutedAsScript, runRepoNodeEntry } from './shared.mjs';
import {
  FULL_TYPECHECK_PROJECT_IDS,
  TYPECHECK_PROJECTS,
  collectMissingTypecheckProjectFiles,
  collectProjectReferenceViolations,
  getTypecheckProject,
  resolveAffectedTypecheckProjects,
} from './typecheck-project-map.mjs';
import { PRODUCT_SOURCE_ROOTS } from './src-production-targets.mjs';

const TYPECHECK_TMP_ROOT = '.tmp/qa/typecheck';
const TYPECHECK_PROJECT_ROOT = `${TYPECHECK_TMP_ROOT}/projects`;
const TYPECHECK_BUILD_INFO_ROOT = `${TYPECHECK_TMP_ROOT}/buildinfo`;
const BASE_CONFIG_RELATIVE_PATH = '../../../../../tsconfig.json';
const REPO_ROOT = '../../../../..';
const VITE_ENV = `${REPO_ROOT}/apps/extension/src/vite-env.d.ts`;
const APP_AMBIENT_DECLARATION_FILES = [
  VITE_ENV,
  `${REPO_ROOT}/packages/runtime-contracts/src/messaging/message-types/literals.d.ts`,
  `${REPO_ROOT}/packages/runtime-contracts/src/video/messages/index.literals.d.ts`,
  `${REPO_ROOT}/packages/runtime-contracts/src/video/types/types.literals.d.ts`,
];
const TEST_SUPPORT_FILES = [
  'packages/runtime-contracts/src/tab-capabilities/test-support.ts',
  'apps/extension/src/features/video/project/timeline/project-meta.test.helpers.ts',
];

function toGeneratedProjectPath(projectId) {
  return `${TYPECHECK_PROJECT_ROOT}/${projectId}/tsconfig.json`;
}

function toRepoRelativeFromProjectConfig(relativePath) {
  return `${REPO_ROOT}/${relativePath}`;
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function collectProjectIncludes(project) {
  const include = [...(project.include ?? [])];
  if (project.id === 'web-snapshot-viewer' || project.id === 'web-snapshot-viewer-tests') {
    include.push('apps/extension/src/content/public/preparation-surface/**/*');
  }
  if (project.testProject) {
    include.push(...project.rootPrefixes.map((prefix) => `${prefix}**/*`));
    include.push(...(project.supportInclude ?? []));
  }

  return [...new Set(include)].map(toRepoRelativeFromProjectConfig);
}

function createProjectCompilerOptions(project) {
  const runtimeTypes = ['chrome', 'dom-mediacapture-transform', 'dom-webcodecs'];
  return {
    allowImportingTsExtensions: true,
    noEmit: true,
    noEmitOnError: true,
    rootDir: REPO_ROOT,
    tsBuildInfoFile: `${REPO_ROOT}/${TYPECHECK_BUILD_INFO_ROOT}/${project.id}.tsbuildinfo`,
    types: project.testProject ? [...runtimeTypes, 'node'] : runtimeTypes,
  };
}

function createProjectFiles(project) {
  const appEnvironmentFiles = project.rootPrefixes?.some((prefix) => prefix.startsWith('packages/'))
    ? []
    : APP_AMBIENT_DECLARATION_FILES;
  if (project.files) {
    return [...appEnvironmentFiles, ...project.files.map(toRepoRelativeFromProjectConfig)];
  }

  return [
    ...appEnvironmentFiles,
    ...(project.testProject ? TEST_SUPPORT_FILES.map(toRepoRelativeFromProjectConfig) : []),
  ];
}

function createProductionExcludePatterns() {
  return [
    ...PRODUCT_SOURCE_ROOTS.flatMap((root) => [
      `${root}/**/*.test.ts`,
      `${root}/**/*.test.tsx`,
      `${root}/**/*.spec.ts`,
      `${root}/**/*.spec.tsx`,
      `${root}/**/*.test.helpers.ts`,
      `${root}/**/*.test.helpers.tsx`,
      `${root}/**/*.test-support.ts`,
      `${root}/**/*.test-support.tsx`,
      `${root}/**/test-fixtures*`,
      `${root}/**/test-support.ts`,
      `${root}/**/test-support.tsx`,
      `${root}/**/test-support/**/*`,
    ]),
    'tooling/test/harness/**/*',
  ].map(toRepoRelativeFromProjectConfig);
}

function createProjectExclude(project) {
  if (!project.testProject) {
    return createProductionExcludePatterns();
  }
  return null;
}

export function createProjectConfig(project) {
  const projectConfig = {
    extends: BASE_CONFIG_RELATIVE_PATH,
    compilerOptions: createProjectCompilerOptions(project),
    files: createProjectFiles(project),
  };

  if (!project.files) {
    projectConfig.include = collectProjectIncludes(project);
  }

  const exclude = createProjectExclude(project);
  if (exclude) {
    projectConfig.exclude = exclude;
  }

  return projectConfig;
}

function assertValidTypecheckProjectMap({ cwd }) {
  const missingFiles = collectMissingTypecheckProjectFiles({ rootDir: cwd });
  const referenceViolations = collectProjectReferenceViolations();
  const violations = [
    ...missingFiles.map((file) => `missing typecheck project file: ${file}`),
    ...referenceViolations,
  ];

  if (violations.length > 0) {
    throw new Error(`Invalid typecheck project map:\n${violations.join('\n')}`);
  }
}

function writeGeneratedTypecheckConfigs({ cwd }) {
  assertValidTypecheckProjectMap({ cwd });

  for (const project of TYPECHECK_PROJECTS) {
    writeJsonFile(path.join(cwd, toGeneratedProjectPath(project.id)), createProjectConfig(project));
  }
}

function runGeneratedProjectTypecheck({ cwd, projectIds }) {
  const results = projectIds.map((projectId) =>
    runRepoNodeEntry(
      'node_modules/typescript/lib/tsc.js',
      ['--project', toGeneratedProjectPath(projectId)],
      {
        cwd,
        maxBuffer: 16 * 1024 * 1024,
        stdio: 'pipe',
      }
    )
  );

  return {
    status: results.find((result) => result.status !== 0)?.status ?? 0,
    stdout: results.map((result) => result.stdout).join(''),
    stderr: results.map((result) => result.stderr).join(''),
  };
}

function appendTypecheckMetadata(result, metadata) {
  return {
    ...result,
    checkedProjectIds: metadata.projectIds,
    typecheckMode: metadata.mode,
    typecheckReason: metadata.reason,
  };
}

function createSkippedTypecheckResult(metadata) {
  return appendTypecheckMetadata(
    {
      status: 0,
      stdout: `Typecheck skipped: ${metadata.reason}\n`,
      stderr: '',
    },
    metadata
  );
}

export function resolveTypecheckRun({ mode = 'full', targetFiles = [] } = {}) {
  if (mode === 'affected') {
    return resolveAffectedTypecheckProjects(targetFiles);
  }

  return {
    mode: 'full',
    projectIds: FULL_TYPECHECK_PROJECT_IDS,
    reason: 'full typecheck requested',
  };
}

export function runTypecheck({ cwd = process.cwd(), mode = 'full', targetFiles = [] } = {}) {
  const metadata = resolveTypecheckRun({ mode, targetFiles });
  if (metadata.mode === 'skip') {
    return createSkippedTypecheckResult(metadata);
  }

  if (metadata.mode === 'full') {
    const result = runRepoNodeEntry('node_modules/typescript/lib/tsc.js', [], {
      cwd,
      maxBuffer: 16 * 1024 * 1024,
      stdio: 'pipe',
    });
    return appendTypecheckMetadata(result, metadata);
  }

  writeGeneratedTypecheckConfigs({ cwd });

  const projectIds = metadata.projectIds.filter((projectId) => getTypecheckProject(projectId));
  const result = runGeneratedProjectTypecheck({ cwd, projectIds });
  return appendTypecheckMetadata(result, {
    ...metadata,
    projectIds,
  });
}

if (isExecutedAsScript(import.meta.url)) {
  const result = runTypecheck();
  emitCommandResult(result, 'Typecheck passed\n');
}
