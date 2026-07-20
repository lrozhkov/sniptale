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
  permissions: [],
  sandbox: { pages: ['apps/extension/src/effect-runtime-sandbox/index.html'] },
  web_accessible_resources: [],
};
const basePolicy = {
  hostPermissions: [],
  optionalHostPermissions: [],
  permissions: [],
  webAccessibleResources: [],
};
const WORKER_SCRIPT =
  'new Worker(new URL("./effect-runtime-worker.js", import.meta.url), { type: "module" });';

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true }))
  );
});

it('rejects sandbox-owned dynamic code in external worker assets', async () => {
  const repoRoot = await createRepoRoot();

  await expect(
    verifyReleaseArtifactFiles({
      files: createFiles({ popupScript: 'export const ok = true;', sandboxScript: WORKER_SCRIPT }),
      repoRoot,
    })
  ).rejects.toThrow('sandbox script references external worker asset');
});

it('rejects Function constructors in sandbox-owned inline worker scripts', async () => {
  const repoRoot = await createRepoRoot();
  const inlineWorkerScript = [
    'const jsContent = "export const run = new Function(\\"return 1\\");";',
    'new Worker(URL.createObjectURL(new Blob([jsContent], { type: "text/javascript" })));',
  ].join('\n');

  await expect(
    verifyReleaseArtifactFiles({
      files: createFiles({
        includeWorkerAsset: false,
        popupScript: 'export const ok = true;',
        sandboxScript: inlineWorkerScript,
      }),
      repoRoot,
    })
  ).rejects.toThrow('dynamic code execution');
});

async function createRepoRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sniptale-artifact-worker-dynamic-'));
  tempRoots.push(root);
  await fs.mkdir(path.join(root, 'tooling/configs/qa'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'tooling/configs/qa/manifest-permissions.data.json'),
    JSON.stringify(basePolicy)
  );
  await seedTestOssReleasePolicy(root);
  return root;
}

function createFiles(args: {
  extensionHtml?: string;
  includeWorkerAsset?: boolean;
  popupScript: string;
  sandboxScript: string;
}) {
  return [
    ...createTestLegalArtifactFiles(),
    { contents: Buffer.from(JSON.stringify(baseManifest)), relativePath: 'manifest.json' },
    { contents: Buffer.from(args.popupScript), relativePath: 'assets/popup.js' },
    ...(args.extensionHtml
      ? [
          {
            contents: Buffer.from(args.extensionHtml),
            relativePath: 'apps/extension/src/popup/index.html',
          },
        ]
      : []),
    {
      contents: Buffer.from(
        '<!doctype html><script type="module" src="/assets/effect-runtime-sandbox.js"></script>'
      ),
      relativePath: 'apps/extension/src/effect-runtime-sandbox/index.html',
    },
    {
      contents: Buffer.from(args.sandboxScript),
      relativePath: 'assets/effect-runtime-sandbox.js',
    },
    ...(args.includeWorkerAsset === false
      ? []
      : [
          {
            contents: Buffer.from('export const run = new Function("return 1");'),
            relativePath: 'assets/effect-runtime-worker.js',
          },
        ]),
  ];
}
