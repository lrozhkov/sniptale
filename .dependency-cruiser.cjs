const runtimeTopology = require('./tooling/qa/core/runtime-topology.data.json');
const defaultForbiddenRules = require('./tooling/qa/core/dependency-cruiser-default-rules.cjs');
const dependencyCruiserOptions = require('./tooling/qa/core/dependency-cruiser-options.cjs');

const CONTENT_COMPATIBLE_RUNTIME_REUSE = {
  'apps/extension/src/web-snapshot-viewer': ['apps/extension/src/content'],
};

function escapeRegex(source) {
  return source.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
}

function createRuntimeIsolationRules() {
  return runtimeTopology.map((runtime) => {
    const allowedReuseRoots = new Set(CONTENT_COMPATIBLE_RUNTIME_REUSE[runtime.root] ?? []);
    const otherRuntimeRoots = runtimeTopology
      .filter((candidate) => candidate.id !== runtime.id)
      .filter((candidate) => !allowedReuseRoots.has(candidate.root))
      .map((candidate) => escapeRegex(candidate.root));

    return {
      name: `runtime-isolation-${runtime.id}`,
      severity: 'error',
      comment:
        'Runtime contexts must not import each other directly; use package or app-core owners.',
      from: {
        path: `^${escapeRegex(runtime.root)}/`,
      },
      to: {
        path: `^(?:${otherRuntimeRoots.join('|')})/`,
      },
    };
  });
}

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    ...createRuntimeIsolationRules(),
    {
      name: 'web-snapshot-viewer-content-reuse-scope',
      severity: 'error',
      comment: 'Only viewer preparation may reuse content runtime behavior.',
      from: {
        path: '^apps/extension/src/web-snapshot-viewer/(?!preparation/)',
      },
      to: {
        path: '^apps/extension/src/content/',
      },
    },
    {
      name: 'packages-never-import-app',
      severity: 'error',
      comment: 'Workspace packages must not depend on extension lifecycle or app-local owners.',
      from: {
        path: '^packages/',
      },
      to: {
        path: '^apps/extension/',
      },
    },
    {
      name: 'foundation-package-direction',
      severity: 'error',
      from: { path: '^packages/foundation/' },
      to: { path: '^packages/(?:runtime-contracts|platform|ui)/' },
    },
    {
      name: 'runtime-contracts-package-direction',
      severity: 'error',
      from: { path: '^packages/runtime-contracts/' },
      to: { path: '^packages/(?:platform|ui)/' },
    },
    {
      name: 'platform-package-direction',
      severity: 'error',
      from: { path: '^packages/platform/' },
      to: { path: '^packages/ui/' },
    },
    ...defaultForbiddenRules,
  ],
  options: dependencyCruiserOptions,
};
// generated: dependency-cruiser@17.3.8 on 2026-03-02T16:29:41.795Z
