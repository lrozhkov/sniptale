export const TYPECHECK_PROJECT_DEFINITIONS_PATH =
  'tooling/qa/core/typecheck-project-definitions.mjs';

export const PRODUCTION_TYPECHECK_PROJECTS = [
  {
    id: 'foundation-package',
    include: ['packages/foundation/src/**/*'],
    references: [],
    rootPrefixes: ['packages/foundation/src/'],
  },
  {
    id: 'runtime-contracts-package',
    include: ['packages/runtime-contracts/src/**/*'],
    references: ['foundation-package'],
    rootPrefixes: ['packages/runtime-contracts/src/'],
  },
  {
    id: 'platform-package',
    include: ['packages/platform/src/**/*'],
    references: ['foundation-package', 'runtime-contracts-package'],
    rootPrefixes: ['packages/platform/src/'],
  },
  {
    id: 'ui-package',
    include: ['packages/ui/src/**/*'],
    references: ['foundation-package', 'runtime-contracts-package', 'platform-package'],
    rootPrefixes: ['packages/ui/src/'],
  },
  {
    id: 'app-core',
    include: [
      'apps/extension/src/composition/**/*',
      'apps/extension/src/contracts/**/*',
      'apps/extension/src/features/**/*',
      'apps/extension/src/foundation/**/*',
      'apps/extension/src/platform/**/*',
      'apps/extension/src/ui/**/*',
      'apps/extension/src/workflows/**/*',
    ],
    references: [
      'foundation-package',
      'runtime-contracts-package',
      'platform-package',
      'ui-package',
    ],
    rootPrefixes: [
      'apps/extension/src/composition/',
      'apps/extension/src/contracts/',
      'apps/extension/src/features/',
      'apps/extension/src/foundation/',
      'apps/extension/src/platform/',
      'apps/extension/src/ui/',
      'apps/extension/src/workflows/',
    ],
  },
  {
    id: 'background',
    include: ['apps/extension/src/background/**/*'],
    references: ['app-core'],
    rootPrefixes: ['apps/extension/src/background/'],
  },
  {
    id: 'content',
    include: ['apps/extension/src/content/**/*'],
    references: ['app-core'],
    rootPrefixes: ['apps/extension/src/content/'],
  },
  {
    id: 'popup',
    include: ['apps/extension/src/popup/**/*'],
    references: ['app-core'],
    rootPrefixes: ['apps/extension/src/popup'],
  },
  {
    id: 'settings',
    include: ['apps/extension/src/settings/**/*'],
    references: ['app-core'],
    rootPrefixes: ['apps/extension/src/settings'],
  },
  {
    id: 'gallery',
    include: ['apps/extension/src/gallery/**/*'],
    references: ['app-core'],
    rootPrefixes: ['apps/extension/src/gallery'],
  },
  {
    id: 'editor',
    include: ['apps/extension/src/editor/**/*'],
    references: ['app-core'],
    rootPrefixes: ['apps/extension/src/editor/'],
  },
  {
    id: 'video-editor',
    include: ['apps/extension/src/video-editor/**/*'],
    references: ['app-core'],
    rootPrefixes: ['apps/extension/src/video-editor/'],
  },
  {
    id: 'scenario-editor',
    include: ['apps/extension/src/scenario-editor/**/*'],
    references: ['app-core'],
    rootPrefixes: ['apps/extension/src/scenario-editor/'],
  },
  {
    id: 'offscreen',
    include: ['apps/extension/src/offscreen/**/*'],
    references: ['app-core'],
    rootPrefixes: ['apps/extension/src/offscreen/'],
  },
  {
    id: 'web-snapshot-viewer',
    include: ['apps/extension/src/web-snapshot-viewer/**/*'],
    references: ['app-core', 'content'],
    rootPrefixes: ['apps/extension/src/web-snapshot-viewer'],
  },
  {
    id: 'design-system',
    include: ['apps/extension/src/design-system/**/*'],
    references: ['app-core'],
    rootPrefixes: ['apps/extension/src/design-system'],
  },
  {
    id: 'camera-recorder',
    include: ['apps/extension/src/camera-recorder/**/*'],
    references: ['app-core'],
    rootPrefixes: ['apps/extension/src/camera-recorder/'],
  },
];

function createOwnerTestProject(project) {
  const supportInclude = {
    background: ['tooling/test/support/*.ts'],
    content: ['tooling/test/support/content/**/*'],
    editor: ['tooling/test/harness/editor/ownership/**/*'],
    'web-snapshot-viewer': ['apps/extension/src/content/**/*'],
  }[project.id];

  return {
    id: `${project.id}-tests`,
    include: project.rootPrefixes.flatMap((prefix) => [
      `${prefix}**/*.test.ts`,
      `${prefix}**/*.test.tsx`,
      `${prefix}**/*.spec.ts`,
      `${prefix}**/*.spec.tsx`,
      `${prefix}**/*.test.helpers.ts`,
      `${prefix}**/*.test.helpers.tsx`,
      `${prefix}**/*.test-support.ts`,
      `${prefix}**/*.test-support.tsx`,
      `${prefix}**/test-support.ts`,
      `${prefix}**/test-support.tsx`,
      `${prefix}**/test-support/**/*`,
    ]),
    references: [project.id, 'test-harness'],
    rootPrefixes: [...project.rootPrefixes],
    ...(supportInclude ? { supportInclude } : {}),
    testProject: true,
  };
}

export const OWNER_TEST_TYPECHECK_PROJECTS =
  PRODUCTION_TYPECHECK_PROJECTS.map(createOwnerTestProject);

export const TEST_HARNESS_TYPECHECK_PROJECT = {
  id: 'test-harness',
  include: ['tooling/test/harness/**/*', 'tooling/test/support/**/*'],
  references: PRODUCTION_TYPECHECK_PROJECTS.map((project) => project.id),
  rootPrefixes: ['tooling/test/harness/'],
  testProject: true,
};

export const NODE_TYPECHECK_PROJECT = {
  id: 'node-config',
  files: [
    'apps/extension/vite.config.ts',
    'apps/extension/build/content-runtime-build-id.ts',
    'apps/extension/build/injected-build.ts',
    'apps/extension/build/injected-build-shim-guard.ts',
    'apps/extension/build/injected-build-support.ts',
    'apps/extension/build/layout.ts',
    'apps/extension/build/extension-html-inputs.ts',
    'apps/extension/manifest.json',
  ],
  references: [],
  rootPrefixes: [],
};

export const TYPECHECK_PROJECTS = [
  ...PRODUCTION_TYPECHECK_PROJECTS,
  ...OWNER_TEST_TYPECHECK_PROJECTS,
  TEST_HARNESS_TYPECHECK_PROJECT,
  NODE_TYPECHECK_PROJECT,
];

export const FULL_TYPECHECK_PROJECT_IDS = TYPECHECK_PROJECTS.map((project) => project.id);
