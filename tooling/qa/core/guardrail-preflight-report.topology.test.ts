import { expect, it } from 'vitest';

import { createTempRoot, importFresh, withCwd, writeFile } from './test-helpers';

async function collectReport(root, input) {
  return withCwd(root, async () => {
    const module = await importFresh<typeof import('./guardrail-preflight-report.mjs')>(
      './guardrail-preflight-report.mjs'
    );
    return module.collectFocusedGuardrailReport(input);
  });
}

it('reports false public seam hints for moved root facades without importers', async () => {
  const root = createTempRoot('guardrail-preflight-');
  writeFile(
    root,
    'apps/extension/src/gallery/GalleryApp.tsx',
    "export { GalleryApp } from './app-shell';\n"
  );
  writeFile(
    root,
    'apps/extension/src/gallery/index.tsx',
    "export { GalleryApp } from './app-shell';\n"
  );
  writeFile(
    root,
    'apps/extension/src/gallery/shell/app-shell/index.tsx',
    'export const GalleryApp = () => null;\n'
  );

  const report = await collectReport(root, {
    targetFiles: [
      'apps/extension/src/gallery/GalleryApp.tsx',
      'apps/extension/src/gallery/index.tsx',
      'apps/extension/src/gallery/shell/app-shell/index.tsx',
    ],
    codeFiles: [
      'apps/extension/src/gallery/GalleryApp.tsx',
      'apps/extension/src/gallery/index.tsx',
      'apps/extension/src/gallery/shell/app-shell/index.tsx',
    ],
  });

  expect(report.falsePublicSeams).toEqual(
    expect.arrayContaining([expect.stringContaining('root facade candidate has no importer graph')])
  );
});

it('reports topology-first questions for facade and sibling-family pressure', async () => {
  const root = createTempRoot('guardrail-topology-questions-');
  writeFile(
    root,
    'apps/extension/src/gallery/GalleryApp.tsx',
    "export { GalleryApp } from './app/GalleryApp';\n"
  );
  writeFile(
    root,
    'apps/extension/src/gallery/shell/app/GalleryApp.tsx',
    'export const GalleryApp = () => null;\n'
  );
  writeFile(
    root,
    'apps/extension/src/gallery/shell/app/GalleryApp-actions.ts',
    'export const actions = {};\n'
  );
  writeFile(
    root,
    'apps/extension/src/gallery/shell/app/GalleryApp-state.ts',
    'export const state = {};\n'
  );

  const report = await collectReport(root, {
    targetFiles: [
      'apps/extension/src/gallery/GalleryApp.tsx',
      'apps/extension/src/gallery/shell/app/GalleryApp.tsx',
      'apps/extension/src/gallery/shell/app/GalleryApp-actions.ts',
      'apps/extension/src/gallery/shell/app/GalleryApp-state.ts',
    ],
    codeFiles: [
      'apps/extension/src/gallery/GalleryApp.tsx',
      'apps/extension/src/gallery/shell/app/GalleryApp.tsx',
      'apps/extension/src/gallery/shell/app/GalleryApp-actions.ts',
      'apps/extension/src/gallery/shell/app/GalleryApp-state.ts',
    ],
  });

  expect(report.topologyQuestions).toEqual(
    expect.arrayContaining([
      expect.stringContaining('owner seam/runtime boundary'),
      expect.stringContaining('public surface/facade decision'),
      expect.stringContaining('shallow owner folder'),
      expect.stringContaining('next 2-3 growth vectors'),
    ])
  );
});

it('does not classify test-support files as false public seams', async () => {
  const root = createTempRoot('guardrail-test-support-');
  writeFile(
    root,
    'apps/extension/src/gallery/gallery-app-actions.test-support.ts',
    "export { helper } from './actions/test-support/index';\n"
  );
  writeFile(
    root,
    'apps/extension/src/gallery/library/actions/test-support/index.ts',
    'export const helper = () => null;\n'
  );

  const report = await collectReport(root, {
    targetFiles: [
      'apps/extension/src/gallery/gallery-app-actions.test-support.ts',
      'apps/extension/src/gallery/library/actions/test-support/index.ts',
    ],
    codeFiles: [
      'apps/extension/src/gallery/gallery-app-actions.test-support.ts',
      'apps/extension/src/gallery/library/actions/test-support/index.ts',
    ],
  });

  expect(report.falsePublicSeams).toEqual([]);
});
