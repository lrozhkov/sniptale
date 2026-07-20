import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { collectManifestIntegrityViolations } from './verify-manifest-integrity.mjs';

const tempDirs: string[] = [];
const SANDBOX_CSP = [
  'sandbox allow-scripts;',
  "default-src 'none';",
  "script-src 'self';",
  "style-src 'self';",
  "connect-src 'none';",
  'worker-src blob:;',
  "child-src 'none';",
  "object-src 'none';",
].join(' ');
type SandboxManifest = ReturnType<typeof createBaseManifest>;

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

it('pins effect runtime sandbox page and containment CSP', () => {
  for (const mutate of createSandboxPolicyMutations()) {
    const root = createTempRoot();
    const manifest = createBaseManifest();
    mutate(manifest);
    writeManifest(root, manifest);
    writeStandardManifestFiles(root);

    expect(collectManifestIntegrityViolations({ rootDir: root })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'apps/extension/manifest.json',
          rule: 'manifest-integrity',
        }),
      ])
    );
  }
});

function createSandboxPolicyMutations(): Array<(manifest: SandboxManifest) => void> {
  return [
    (manifest) => {
      manifest.sandbox.pages = ['apps/extension/src/effect-runtime-sandbox/other.html'];
    },
    replaceSandboxCsp('allow-scripts', 'allow-scripts allow-same-origin'),
    replaceSandboxCsp("connect-src 'none'", 'connect-src https:'),
    replaceSandboxCsp('worker-src blob:', "worker-src 'self'"),
    replaceSandboxCsp('worker-src blob:', 'worker-src blob: data:'),
    replaceSandboxCsp("child-src 'none'", 'child-src blob:'),
    replaceSandboxCsp("object-src 'none'", "object-src 'self'"),
    replaceSandboxCsp("script-src 'self'", "script-src 'self' 'unsafe-eval'"),
  ];
}

function replaceSandboxCsp(search: string, replacement: string) {
  return (manifest: SandboxManifest) => {
    manifest.content_security_policy.sandbox = manifest.content_security_policy.sandbox.replace(
      search,
      replacement
    );
  };
}

function createBaseManifest() {
  return {
    action: {
      default_popup: 'apps/extension/src/popup/index.html',
      default_title: 'Open Sniptale',
    },
    background: { service_worker: 'apps/extension/src/background/index.ts' },
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self';",
      sandbox: SANDBOX_CSP,
    },
    icons: { 16: 'icons/icon-16.png' },
    sandbox: { pages: ['apps/extension/src/effect-runtime-sandbox/index.html'] },
    web_accessible_resources: [],
  };
}

function createTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-manifest-sandbox-'));
  tempDirs.push(root);
  return root;
}

function writeManifest(root: string, manifest: SandboxManifest) {
  writeFile(root, 'apps/extension/manifest.json', JSON.stringify(manifest, null, 2));
}

function writeStandardManifestFiles(root: string) {
  writeFile(root, 'apps/extension/src/background/index.ts', 'export {};\n');
  writeFile(root, 'apps/extension/src/popup/index.html', '<!doctype html>\n');
  writeFile(root, 'apps/extension/src/effect-runtime-sandbox/index.html', '<!doctype html>\n');
  writeFile(root, 'apps/extension/public/icons/icon-16.png', 'png');
  writeFile(
    root,
    'apps/extension/src/background/media/video/runtime/offscreen-document-dto.ts',
    "const OFFSCREEN_DOCUMENT_REASON = 'USER_MEDIA';\n"
  );
}

function writeFile(root: string, relativePath: string, contents: string) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, contents);
}
