import { expect, it } from 'vitest';

import {
  createTempRoot,
  importFresh,
  withCwd,
  writeFile,
  writeJson,
} from '../../core/test-helpers';
import {
  DEFAULT_DOC_MARKERS,
  DEFAULT_RUNTIME_TOPOLOGY,
  DEFAULT_WEB_ACCESSIBLE_RESOURCES,
} from './verify-runtime-topology.test.data';

function writeTopologyFixture(
  root: string,
  docsText: string,
  manifestOverrides: Record<string, unknown> = {}
) {
  writeJson(root, 'apps/extension/manifest.json', {
    background: { service_worker: 'apps/extension/src/background/index.ts' },
    action: { default_popup: 'src/popup/index.html' },
    web_accessible_resources: [
      {
        resources: DEFAULT_WEB_ACCESSIBLE_RESOURCES,
        matches: ['<all_urls>'],
      },
    ],
    ...manifestOverrides,
  });
  writeJson(root, 'tooling/qa/core/runtime-topology.data.json', DEFAULT_RUNTIME_TOPOLOGY);
  for (const runtime of DEFAULT_RUNTIME_TOPOLOGY) {
    for (const entrypoint of runtime.entrypointFiles) writeFile(root, entrypoint, 'entrypoint\n');
  }
  writeJson(root, 'package.json', { name: 'verify-runtime-topology-temp', type: 'module' });
  writeFile(root, '.dependency-cruiser.cjs', 'module.exports = {};\n');
  writeFile(root, 'AGENTS.md', 'runtime topology\n');
  writeFile(root, 'docs/architecture/code-organization.md', 'runtime topology\n');
  writeFile(root, 'docs/tooling/code-quality.md', 'runtime topology\n');
  writeFile(root, 'docs/tooling/operator-handbook.md', 'runtime topology\n');
  writeFile(root, 'DESIGN.md', 'active\n');
  writeFile(root, 'docs/architecture/runtime-contexts.md', docsText);
}

function defaultDocsText(overrides: string[] = []) {
  return [
    ...DEFAULT_DOC_MARKERS.filter((marker) => !overrides.includes(marker)),
    ...overrides,
  ].join('\n');
}

async function loadRuntimeTopologyModule(root: string) {
  return withCwd(root, async () =>
    importFresh<typeof import('./verify-runtime-topology.mjs')>(
      './verify-runtime-topology.mjs',
      import.meta.url
    )
  );
}

it('flags docs drift when scenario-editor is missing from runtime contexts', async () => {
  const root = createTempRoot('verify-runtime-topology-');
  writeTopologyFixture(
    root,
    DEFAULT_DOC_MARKERS.filter(
      (marker) => marker !== 'apps/extension/src/scenario-editor/index.tsx'
    ).join('\n')
  );

  const module = await loadRuntimeTopologyModule(root);

  expect(module.collectRuntimeTopologyViolations({ rootDir: root })).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        rule: 'runtime-topology-docs-drift',
        file: 'docs/architecture/runtime-contexts.md',
        message: expect.stringContaining('scenario-editor'),
      }),
    ])
  );
});

it('flags static content script manifest registration', async () => {
  const root = createTempRoot('verify-runtime-topology-content-scripts-');
  writeTopologyFixture(root, defaultDocsText(), {
    content_scripts: [{ js: ['apps/extension/src/content/index.tsx'] }],
  });

  const module = await loadRuntimeTopologyModule(root);

  expect(module.collectRuntimeTopologyViolations({ rootDir: root })).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        rule: 'runtime-topology-static-content-scripts',
        file: 'apps/extension/manifest.json',
        message: expect.stringContaining('site/all-sites grant mode may use persistent'),
      }),
    ])
  );
});

it('flags unapproved content runtime bundle references', async () => {
  const root = createTempRoot('verify-runtime-topology-content-runtime-');
  writeTopologyFixture(root, defaultDocsText());
  writeFile(
    root,
    'apps/extension/src/content/feature.ts',
    "export const runtime = 'assets/contentRuntime.js';\n"
  );
  writeFile(
    root,
    'apps/extension/src/content/feature.test.ts',
    "expect('assets/contentRuntime.js').toBeTruthy();\n"
  );
  writeFile(
    root,
    'apps/extension/src/background/runtime/page-access/registration.ts',
    "export const CONTENT_RUNTIME_FILE = 'assets/contentRuntime.js';\n"
  );
  writeFile(
    root,
    'apps/extension/build/injected-build.ts',
    "const CONTENT_RUNTIME_OUTPUT = 'assets/contentRuntime.js';\n"
  );

  const module = await loadRuntimeTopologyModule(root);

  expect(module.collectRuntimeTopologyViolations({ rootDir: root })).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        rule: 'runtime-topology-content-runtime-reference',
        file: 'apps/extension/src/content/feature.ts',
      }),
    ])
  );
});

it('flags retired sidepanel references in active topology docs', async () => {
  const root = createTempRoot('verify-runtime-topology-retired-');
  writeTopologyFixture(root, defaultDocsText());
  writeFile(root, 'DESIGN.md', 'sidepanel\n');

  const module = await loadRuntimeTopologyModule(root);

  expect(module.collectRuntimeTopologyViolations({ rootDir: root })).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        rule: 'runtime-topology-retired-runtime',
        file: 'DESIGN.md',
        message: expect.stringContaining('sidepanel'),
      }),
    ])
  );
});

it('flags manifest/runtime registry mismatches', async () => {
  const root = createTempRoot('verify-runtime-topology-manifest-');
  writeTopologyFixture(root, defaultDocsText());
  writeJson(
    root,
    'tooling/qa/core/runtime-topology.data.json',
    DEFAULT_RUNTIME_TOPOLOGY.map((runtime) =>
      runtime.id === 'scenario-editor' ? { ...runtime, entrypointFiles: [] } : runtime
    )
  );

  const module = await loadRuntimeTopologyModule(root);

  expect(module.collectRuntimeTopologyViolations({ rootDir: root })).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        rule: 'runtime-topology-missing-entrypoint',
        file: 'apps/extension/manifest.json',
        message: expect.stringContaining('scenario-editor'),
      }),
    ])
  );
});

it('flags registered entrypoint paths that do not resolve to files', async () => {
  const root = createTempRoot('verify-runtime-topology-entrypoint-file-');
  writeTopologyFixture(root, defaultDocsText());
  writeJson(root, 'tooling/qa/core/runtime-topology.data.json', [
    ...DEFAULT_RUNTIME_TOPOLOGY,
    {
      docsMarkers: [],
      entrypointFiles: ['apps/extension/src/missing-runtime/index.ts'],
      featureRoot: false,
      id: 'missing-runtime',
      manifestOwned: true,
      root: 'apps/extension/src/missing-runtime',
    },
  ]);

  const module = await loadRuntimeTopologyModule(root);

  expect(module.collectRuntimeTopologyViolations({ rootDir: root })).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        file: 'tooling/qa/core/runtime-topology.data.json',
        rule: 'runtime-topology-entrypoint-missing',
      }),
    ])
  );
});

it('flags manifest runtime roots that are not registered', async () => {
  const root = createTempRoot('verify-runtime-topology-unregistered-');
  writeTopologyFixture(root, defaultDocsText(), {
    web_accessible_resources: [
      {
        resources: [...DEFAULT_WEB_ACCESSIBLE_RESOURCES, 'src/new-runtime/index.html'],
        matches: ['<all_urls>'],
      },
    ],
  });

  const module = await loadRuntimeTopologyModule(root);

  expect(module.collectRuntimeTopologyViolations({ rootDir: root })).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        rule: 'runtime-topology-unregistered-runtime',
        file: 'apps/extension/manifest.json',
        message: expect.stringContaining('src/new-runtime'),
      }),
    ])
  );
});
