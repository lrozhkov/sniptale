import { expect, it } from 'vitest';
import JSZip from 'jszip';

import { AGENT_TOOLING_PAYLOAD_PATHS } from '../../../../agent-tooling/agent-tooling.mjs';

import {
  createTempRoot,
  importFresh,
  withCwd,
  writeFile,
  writeJson,
} from '../../../test-support/test-helpers';
import {
  DEFAULT_BUILD_HTML_INPUTS,
  DEFAULT_RUNTIME_TOPOLOGY,
  DEFAULT_WEB_ACCESSIBLE_RESOURCES,
} from './test.data';

async function writeTopologyFixture(
  root: string,
  docsText: string,
  manifestOverrides: Record<string, unknown> = {}
) {
  writeJson(root, 'apps/extension/manifest.json', {
    background: { service_worker: 'apps/extension/src/background/index.ts' },
    action: { default_popup: 'apps/extension/src/popup/index.html' },
    sandbox: { pages: ['apps/extension/src/effect-runtime-sandbox/index.html'] },
    web_accessible_resources: [
      {
        resources: DEFAULT_WEB_ACCESSIBLE_RESOURCES,
        matches: ['<all_urls>'],
      },
    ],
    ...manifestOverrides,
  });
  writeJson(
    root,
    'tooling/qa/guards/architecture/runtime-topology/runtime-topology.data.json',
    DEFAULT_RUNTIME_TOPOLOGY
  );
  writeJson(root, 'apps/extension/build/layout.data.json', {
    htmlInputs: DEFAULT_BUILD_HTML_INPUTS,
    manifestModuleInputs: [
      {
        sourcePath: 'apps/extension/src/background/index.ts',
        virtualPath: 'apps/extension/src/background/index.ts',
      },
    ],
  });
  for (const runtime of DEFAULT_RUNTIME_TOPOLOGY) {
    for (const entrypoint of runtime.entrypointFiles) writeFile(root, entrypoint, 'entrypoint\n');
  }
  writeJson(root, 'package.json', { name: 'verify-runtime-topology-temp', type: 'module' });
  writeFile(root, '.dependency-cruiser.cjs', 'module.exports = {};\n');
  writeFile(root, 'docs/architecture/code-organization.md', 'runtime topology\n');
  writeFile(root, 'docs/tooling/code-quality.md', 'runtime topology\n');
  writeFile(root, 'docs/tooling/operator-handbook.md', 'runtime topology\n');
  const zip = new JSZip();
  for (const relativePath of AGENT_TOOLING_PAYLOAD_PATHS) {
    const contents = relativePath === 'DESIGN.md' ? 'active\n' : 'runtime topology\n';
    zip.file(relativePath, contents, { createFolders: false, unixPermissions: 0o100644 });
  }
  writeFile(
    root,
    'docs/agent-tooling/agent-tooling.zip',
    await zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX' })
  );
  writeFile(root, 'docs/architecture/runtime-contexts.md', docsText);
}

const defaultDocsText = () => 'Runtime coordination rules.\n';

async function loadRuntimeTopologyModule(root: string) {
  return withCwd(root, async () =>
    importFresh<typeof import('./check.mjs')>('./check.mjs', import.meta.url)
  );
}

it('accepts the complete current thirteen-runtime manifest/build/docs closure', async () => {
  const root = createTempRoot('verify-runtime-topology-complete-');
  await writeTopologyFixture(root, defaultDocsText());

  const module = await loadRuntimeTopologyModule(root);

  expect(module.collectRuntimeTopologyViolations({ rootDir: root })).toEqual([]);
});

it('does not require a runtime id to mirror its existing runtime folder name', async () => {
  const root = createTempRoot('verify-runtime-topology-id-root-');
  await writeTopologyFixture(root, defaultDocsText());
  writeJson(
    root,
    'tooling/qa/guards/architecture/runtime-topology/runtime-topology.data.json',
    DEFAULT_RUNTIME_TOPOLOGY.map((runtime) =>
      runtime.id === 'content' ? { ...runtime, id: 'page-agent' } : runtime
    )
  );

  const module = await loadRuntimeTopologyModule(root);

  expect(module.collectRuntimeTopologyViolations({ rootDir: root })).toEqual([]);
});

it('flags static content script manifest registration', async () => {
  const root = createTempRoot('verify-runtime-topology-content-scripts-');
  await writeTopologyFixture(root, defaultDocsText(), {
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
  await writeTopologyFixture(root, defaultDocsText());
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
    'apps/extension/src/background/page-access/service.ts',
    "export const CONTENT_RUNTIME_FILE = 'assets/contentRuntime.js';\n"
  );
  writeFile(
    root,
    'apps/extension/build/injected-build.ts',
    "const CONTENT_RUNTIME_OUTPUT = 'assets/contentRuntime.js';\n"
  );
  writeFile(
    root,
    'tooling/qa/guards/architecture/runtime-topology/content-runtime.mjs',
    "export const CONTENT_RUNTIME_FILE = 'assets/contentRuntime.js';\n"
  );

  const module = await loadRuntimeTopologyModule(root);

  expect(
    module
      .collectRuntimeTopologyViolations({ rootDir: root })
      .filter(({ rule }) => rule === 'runtime-topology-content-runtime-reference')
  ).toEqual([
    expect.objectContaining({
      rule: 'runtime-topology-content-runtime-reference',
      file: 'apps/extension/src/background/page-access/service.ts',
    }),
    expect.objectContaining({
      rule: 'runtime-topology-content-runtime-reference',
      file: 'apps/extension/src/content/feature.ts',
    }),
  ]);
});

it('flags retired sidepanel references in active topology docs', async () => {
  const root = createTempRoot('verify-runtime-topology-retired-');
  await writeTopologyFixture(root, defaultDocsText());
  const zip = new JSZip();
  for (const relativePath of AGENT_TOOLING_PAYLOAD_PATHS) {
    zip.file(relativePath, relativePath === 'DESIGN.md' ? 'sidepanel\n' : 'active\n', {
      createFolders: false,
      unixPermissions: 0o100644,
    });
  }
  writeFile(
    root,
    'docs/agent-tooling/agent-tooling.zip',
    await zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX' })
  );

  const module = await loadRuntimeTopologyModule(root);

  expect(module.collectRuntimeTopologyViolations({ rootDir: root })).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        rule: 'runtime-topology-retired-runtime',
        file: 'docs/agent-tooling/agent-tooling.zip',
        message: expect.stringContaining('sidepanel'),
      }),
    ])
  );
});

it('fails closed when a runtime registry row is incomplete', async () => {
  const root = createTempRoot('verify-runtime-topology-manifest-');
  await writeTopologyFixture(root, defaultDocsText());
  writeJson(
    root,
    'tooling/qa/guards/architecture/runtime-topology/runtime-topology.data.json',
    DEFAULT_RUNTIME_TOPOLOGY.map((runtime) =>
      runtime.id === 'scenario-editor' ? { ...runtime, entrypointFiles: [] } : runtime
    )
  );

  const module = await loadRuntimeTopologyModule(root);

  expect(module.collectRuntimeTopologyViolations({ rootDir: root })).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        rule: 'runtime-topology-registry-invalid',
        file: 'tooling/qa/guards/architecture/runtime-topology/runtime-topology.data.json',
        message: expect.stringContaining('scenario-editor'),
      }),
    ])
  );
});

it('flags registered entrypoint paths that do not resolve to files', async () => {
  const root = createTempRoot('verify-runtime-topology-entrypoint-file-');
  await writeTopologyFixture(root, defaultDocsText());
  writeJson(root, 'tooling/qa/guards/architecture/runtime-topology/runtime-topology.data.json', [
    ...DEFAULT_RUNTIME_TOPOLOGY,
    {
      entrypointFiles: ['apps/extension/src/missing-runtime/index.ts'],
      featureRoot: false,
      id: 'missing-runtime',
      manifestOwned: false,
      root: 'apps/extension/src/missing-runtime',
    },
  ]);

  const module = await loadRuntimeTopologyModule(root);

  expect(module.collectRuntimeTopologyViolations({ rootDir: root })).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        file: 'tooling/qa/guards/architecture/runtime-topology/runtime-topology.data.json',
        rule: 'runtime-topology-entrypoint-missing',
      }),
    ])
  );
});

it('flags a build-only runtime removed from the registry', async () => {
  const root = createTempRoot('verify-runtime-topology-build-closure-');
  await writeTopologyFixture(root, defaultDocsText());
  writeJson(
    root,
    'tooling/qa/guards/architecture/runtime-topology/runtime-topology.data.json',
    DEFAULT_RUNTIME_TOPOLOGY.filter((runtime) => runtime.id !== 'design-system')
  );

  const module = await loadRuntimeTopologyModule(root);

  expect(module.collectRuntimeTopologyViolations({ rootDir: root })).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        rule: 'runtime-topology-unregistered-build-runtime',
        file: 'apps/extension/build/layout.data.json',
        message: expect.stringContaining('design-system'),
      }),
    ])
  );
});

it('flags a registered HTML runtime removed from the build layout', async () => {
  const root = createTempRoot('verify-runtime-topology-build-reverse-');
  await writeTopologyFixture(root, defaultDocsText());
  writeJson(root, 'apps/extension/build/layout.data.json', {
    htmlInputs: DEFAULT_BUILD_HTML_INPUTS.filter(
      ({ sourcePath }) => sourcePath !== 'apps/extension/src/camera-recorder/index.html'
    ),
    manifestModuleInputs: [
      {
        sourcePath: 'apps/extension/src/background/index.ts',
        virtualPath: 'apps/extension/src/background/index.ts',
      },
    ],
  });

  const module = await loadRuntimeTopologyModule(root);

  expect(module.collectRuntimeTopologyViolations({ rootDir: root })).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        rule: 'runtime-topology-unowned-build-entrypoint',
        message: expect.stringContaining('camera-recorder'),
      }),
    ])
  );
});

it('includes manifest sandbox pages in registry closure', async () => {
  const root = createTempRoot('verify-runtime-topology-sandbox-');
  await writeTopologyFixture(root, defaultDocsText());
  writeJson(
    root,
    'tooling/qa/guards/architecture/runtime-topology/runtime-topology.data.json',
    DEFAULT_RUNTIME_TOPOLOGY.filter((runtime) => runtime.id !== 'effect-runtime-sandbox')
  );

  const module = await loadRuntimeTopologyModule(root);

  expect(module.collectRuntimeTopologyViolations({ rootDir: root })).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        rule: 'runtime-topology-unregistered-runtime',
        file: 'apps/extension/manifest.json',
        message: expect.stringContaining('effect-runtime-sandbox'),
      }),
    ])
  );
});

it('fails closed on duplicate runtime identities', async () => {
  const root = createTempRoot('verify-runtime-topology-duplicates-');
  await writeTopologyFixture(root, defaultDocsText());
  writeJson(root, 'tooling/qa/guards/architecture/runtime-topology/runtime-topology.data.json', [
    ...DEFAULT_RUNTIME_TOPOLOGY,
    { ...DEFAULT_RUNTIME_TOPOLOGY[0], root: 'apps/extension/src/background-copy' },
  ]);

  const module = await loadRuntimeTopologyModule(root);

  expect(module.collectRuntimeTopologyViolations({ rootDir: root })).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        rule: 'runtime-topology-registry-invalid',
        message: expect.stringContaining('duplicate id'),
      }),
    ])
  );
});

it('rejects a registry-only folder with no manifest or build runtime authority', async () => {
  const root = createTempRoot('verify-runtime-topology-registry-only-');
  await writeTopologyFixture(root, defaultDocsText());
  const runtime = {
    entrypointFiles: ['apps/extension/src/artificial-runtime/index.ts'],
    featureRoot: false,
    id: 'artificial-runtime',
    manifestOwned: false,
    root: 'apps/extension/src/artificial-runtime',
  };
  writeFile(root, runtime.entrypointFiles[0], 'entrypoint\n');
  writeJson(root, 'tooling/qa/guards/architecture/runtime-topology/runtime-topology.data.json', [
    ...DEFAULT_RUNTIME_TOPOLOGY,
    runtime,
  ]);

  const module = await loadRuntimeTopologyModule(root);

  expect(module.collectRuntimeTopologyViolations({ rootDir: root })).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        rule: 'runtime-topology-runtime-without-build-authority',
        message: expect.stringContaining('artificial-runtime'),
      }),
    ])
  );
});

it('flags manifest runtime roots that are not registered', async () => {
  const root = createTempRoot('verify-runtime-topology-unregistered-');
  await writeTopologyFixture(root, defaultDocsText(), {
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
