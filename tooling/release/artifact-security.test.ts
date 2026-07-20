import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { EXPECTED_SANDBOX_CSP, verifyReleaseArtifactFiles } from './artifact-security.mjs';
import {
  createTestLegalArtifactFiles,
  seedTestOssReleasePolicy,
} from './oss-release-policy.test-support';

const tempRoots: string[] = [];
const baseManifest = {
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self';",
    sandbox: EXPECTED_SANDBOX_CSP,
  },
  manifest_version: 3,
  optional_host_permissions: ['http://*/*', 'https://*/*'],
  permissions: ['storage'],
  web_accessible_resources: [
    {
      matches: ['http://*/*', 'https://*/*'],
      resources: ['fonts/manrope-latin-wght-normal.woff2'],
    },
  ],
  sandbox: { pages: ['apps/extension/src/effect-runtime-sandbox/index.html'] },
};
const basePolicy = {
  hostPermissions: [],
  optionalHostPermissions: [{ name: 'http://*/*' }, { name: 'https://*/*' }],
  permissions: [{ name: 'storage' }],
  webAccessibleResources: [
    {
      name: [
        'web_accessible_resources:',
        '{"resources":["fonts/manrope-latin-wght-normal.woff2"],',
        '"matches":["http://*/*","https://*/*"],"extensionIds":[],"useDynamicUrl":false}',
      ].join(''),
    },
  ],
};

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true }))
  );
});

async function createRepoRoot({
  policy = basePolicy,
  writePolicy = true,
}: {
  policy?: typeof basePolicy;
  writePolicy?: boolean;
} = {}): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sniptale-artifact-security-'));
  tempRoots.push(root);
  if (writePolicy) {
    await fs.mkdir(path.join(root, 'tooling/configs/qa'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'tooling/configs/qa/manifest-permissions.data.json'),
      JSON.stringify(policy)
    );
  }
  await seedTestOssReleasePolicy(root);
  return root;
}

function createFiles({
  extraFiles = [],
  manifest = baseManifest,
  path: relativePath = 'assets/popup.js',
  sandboxHtml = '<!doctype html>',
  text = 'const ok = true;',
  writeSandboxPage = true,
} = {}) {
  return [
    ...createTestLegalArtifactFiles(),
    {
      contents: Buffer.from(JSON.stringify(manifest)),
      relativePath: 'manifest.json',
    },
    {
      contents: Buffer.from(text),
      relativePath,
    },
    ...(writeSandboxPage
      ? [
          {
            contents: Buffer.from(sandboxHtml),
            relativePath: 'apps/extension/src/effect-runtime-sandbox/index.html',
          },
        ]
      : []),
    ...extraFiles.map((file: { relativePath: string; text: string }) => ({
      contents: Buffer.from(file.text),
      relativePath: file.relativePath,
    })),
  ];
}

async function expectVerifierRejects(args: Parameters<typeof createFiles>[0], message: string) {
  const repoRoot = await createRepoRoot();

  await expect(verifyReleaseArtifactFiles({ files: createFiles(args), repoRoot })).rejects.toThrow(
    message
  );
}

it('accepts a release artifact that matches manifest policy', async () => {
  const repoRoot = await createRepoRoot();

  await expect(
    verifyReleaseArtifactFiles({ files: createFiles(), repoRoot })
  ).resolves.toBeUndefined();
});

it('rejects a missing or altered release legal payload', async () => {
  const repoRoot = await createRepoRoot();
  const withoutNotice = createFiles().filter((file) => file.relativePath !== 'NOTICE');
  await expect(verifyReleaseArtifactFiles({ files: withoutNotice, repoRoot })).rejects.toThrow(
    'Release artifact is missing legal file: NOTICE'
  );

  const alteredLicense = createFiles().map((file) =>
    file.relativePath === 'LICENSE' ? { ...file, contents: Buffer.from('altered') } : file
  );
  await expect(verifyReleaseArtifactFiles({ files: alteredLicense, repoRoot })).rejects.toThrow(
    'Release artifact legal file digest drift: LICENSE'
  );
});

it('fails closed when manifest permission policy data is missing', async () => {
  const repoRoot = await createRepoRoot({ writePolicy: false });

  await expect(verifyReleaseArtifactFiles({ files: createFiles(), repoRoot })).rejects.toThrow(
    'missing manifest permissions policy data'
  );
});

it('rejects trace-enabled release markers and development endpoints', async () => {
  await expectVerifierRejects(
    { text: 'if (__TRACE_MESSAGES__) new WebSocket("ws://localhost:9223");' },
    'trace-enabled release marker'
  );
  await expectVerifierRejects(
    { text: 'fetch("http://127.0.0.1:5173/@vite/client");' },
    'development server endpoint'
  );
});

it('rejects script web-accessible resources and unsafe CSP', async () => {
  await expectVerifierRejects(
    {
      manifest: {
        ...baseManifest,
        web_accessible_resources: [{ matches: ['https://*/*'], resources: ['assets/content.js'] }],
      },
    },
    'unsafe web-accessible resource'
  );
  await expectVerifierRejects(
    {
      manifest: {
        ...baseManifest,
        content_security_policy: {
          extension_pages: "script-src 'self' 'unsafe-eval'; object-src 'self';",
        },
      },
    },
    'forbidden token'
  );
});

it('rejects effect runtime sandbox page drift', async () => {
  await expectVerifierRejects(
    {
      manifest: {
        ...baseManifest,
        sandbox: { pages: ['apps/extension/src/effect-runtime-sandbox/other.html'] },
      },
    },
    'sandbox page drift'
  );
  await expectVerifierRejects(
    { writeSandboxPage: false },
    'missing sandbox page: apps/extension/src/effect-runtime-sandbox/index.html'
  );
});

it('rejects effect runtime sandbox CSP drift', async () => {
  await expectVerifierRejects(
    {
      manifest: {
        ...baseManifest,
        content_security_policy: {
          ...baseManifest.content_security_policy,
          sandbox: baseManifest.content_security_policy.sandbox.replace(
            "connect-src 'none'",
            'connect-src https:'
          ),
        },
      },
    },
    'sandbox CSP drift'
  );
  await expectVerifierRejects(
    {
      manifest: {
        ...baseManifest,
        content_security_policy: {
          ...baseManifest.content_security_policy,
          sandbox: baseManifest.content_security_policy.sandbox.replace(
            'worker-src blob:',
            "worker-src 'self'"
          ),
        },
      },
    },
    'sandbox CSP drift'
  );
  await expectVerifierRejects(
    {
      manifest: {
        ...baseManifest,
        content_security_policy: {
          ...baseManifest.content_security_policy,
          sandbox: baseManifest.content_security_policy.sandbox.replace(
            'worker-src blob:',
            'worker-src blob: data:'
          ),
        },
      },
    },
    'sandbox CSP drift'
  );
});

it('rejects effect runtime sandbox script asset drift', async () => {
  await expectVerifierRejects(
    { sandboxHtml: '<!doctype html><script src="/assets/missing-sandbox.js"></script>' },
    'sandbox page references missing script: assets/missing-sandbox.js'
  );
  await expectVerifierRejects(
    {
      extraFiles: [
        {
          relativePath: 'assets/effect-runtime-sandbox.js',
          text: 'new Worker(new URL("./worker.js", import.meta.url));',
        },
        {
          relativePath: 'assets/worker.js',
          text: 'export const ok = true;',
        },
      ],
      sandboxHtml:
        '<!doctype html><script type="module" src="/assets/effect-runtime-sandbox.js"></script>',
    },
    'sandbox script references external worker asset: assets/worker.js'
  );
});

it('rejects sourcemaps, externally connectable manifests, and permission drift', async () => {
  await expectVerifierRejects({ path: 'assets/popup.js.map' }, 'sourcemap file');
  await expectVerifierRejects(
    {
      manifest: {
        ...baseManifest,
        externally_connectable: { matches: ['https://example.test/*'] },
      },
    },
    'externally_connectable'
  );
  await expectVerifierRejects(
    { manifest: { ...baseManifest, permissions: ['storage', 'bookmarks'] } },
    'permissions drift'
  );
});

it('rejects retired Engine1, SDK handoff, golden, and bundled demo artifacts', async () => {
  const cases = [
    ['apps/extension/src/package-renderer-sandbox/index.js', 'retired Engine1 artifact'],
    ['extension-engine2-handoff/runtime-proof-results.json', 'SDK handoff or golden artifact'],
    ['assets/golden/neutral-transition.json', 'SDK handoff or golden artifact'],
    ['sniptale.sdk.transition-demo/manifest.json', 'retired bundled SDK demo artifact'],
  ];
  for (const [path, message] of cases) await expectVerifierRejects({ path }, message);
  await expectVerifierRejects(
    { text: 'const old = "features/video/project/video-pack/runtime";' },
    'retired Engine1 source path'
  );
});
