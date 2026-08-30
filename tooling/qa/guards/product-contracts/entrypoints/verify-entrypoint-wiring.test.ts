import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

function withTempRepo(files: Record<string, string>, run: (root: string) => Promise<void> | void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-entrypoint-wiring-'));
  tempDirs.push(root);

  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, contents);
  }

  return Promise.resolve(run(root));
}

async function loadModule() {
  return import('./verify-entrypoint-wiring.mjs');
}

function collectViolationsForFile(
  module: Awaited<ReturnType<typeof loadModule>>,
  root: string,
  relativePath: string
) {
  return module.collectEntrypointWiringViolationsWithOptions([path.join(root, relativePath)], {
    root,
  });
}

it('flags direct browser listener registration inside an entrypoint', async () => {
  const module = await loadModule();

  await withTempRepo(
    { 'apps/extension/src/editor/index.tsx': 'chrome.runtime.onMessage.addListener(() => {});\n' },
    (root) => {
      expect(collectViolationsForFile(module, root, 'apps/extension/src/editor/index.tsx')).toEqual(
        [
          expect.objectContaining({
            rule: 'entrypoint-browser-transport',
            file: 'apps/extension/src/editor/index.tsx',
          }),
        ]
      );
    }
  );
});

it('allows entrypoints that delegate runtime wiring to dedicated modules', async () => {
  const module = await loadModule();

  await withTempRepo(
    {
      'apps/extension/src/editor/index.tsx': [
        "import { registerEditorRuntimeMessageBridge } from './editor-runtime-bridge';",
        '// chrome.runtime.sendMessage({ type: "comment-only" });',
        'registerEditorRuntimeMessageBridge();',
        '',
      ].join('\n'),
    },
    (root) => {
      expect(collectViolationsForFile(module, root, 'apps/extension/src/editor/index.tsx')).toEqual(
        []
      );
    }
  );
});

it('allows the canonical runtime transport factory but flags direct browser access', async () => {
  const module = await loadModule();

  await withTempRepo(
    {
      'apps/extension/src/camera-recorder/index.tsx': [
        "import { createRuntimeMessagingTransport } from '../platform/runtime-messaging';",
        "chrome['runtime'].sendMessage({ type: 'unsafe' });",
      ].join('\n'),
    },
    (root) => {
      expect(
        collectViolationsForFile(module, root, 'apps/extension/src/camera-recorder/index.tsx')
      ).toEqual([expect.objectContaining({ rule: 'entrypoint-browser-transport' })]);
    }
  );
});

it('uses exact registered entrypoint files instead of nested index basenames', async () => {
  const module = await loadModule();

  await withTempRepo(
    {
      'apps/extension/src/editor/shell/index.ts':
        'chrome.runtime.onMessage.addListener(() => {});\n',
      'apps/extension/src/offscreen/offscreen.ts':
        'chrome.runtime.onMessage.addListener(() => {});\n',
    },
    (root) => {
      expect(
        collectViolationsForFile(module, root, 'apps/extension/src/editor/shell/index.ts')
      ).toEqual([]);
      expect(
        collectViolationsForFile(module, root, 'apps/extension/src/offscreen/offscreen.ts')
      ).toHaveLength(1);
    }
  );
});

it('treats scenario-editor as an entrypoint runtime surface', async () => {
  const module = await loadModule();

  await withTempRepo(
    {
      'apps/extension/src/scenario-editor/index.tsx':
        'chrome.runtime.onMessage.addListener(() => {});\n',
    },
    (root) => {
      expect(
        collectViolationsForFile(module, root, 'apps/extension/src/scenario-editor/index.tsx')
      ).toEqual([
        expect.objectContaining({
          rule: 'entrypoint-browser-transport',
          file: 'apps/extension/src/scenario-editor/index.tsx',
        }),
      ]);
    }
  );
});
