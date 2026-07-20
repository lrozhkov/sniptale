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
function writeDragSeamFixture(root) {
  writeFile(
    root,
    'apps/extension/src/content/overlay/ai/template-list-drag.ts',
    [
      'export function createTemplateDragMoveHandler() {',
      "  if (true) return 'move';",
      "  return 'noop';",
      '}',
      'export function useTemplateDragRef() {',
      '  return null;',
      '}',
      'export function useTemplateDragLifecycle() {',
      '  return null;',
      '}',
      'export function useTemplateDragState() {',
      '  return null;',
      '}',
      '',
    ].join('\n')
  );
  writeFile(
    root,
    'apps/extension/src/content/overlay/ai/template-list-drag-start.ts',
    'export function startTemplateDragIfNeeded() { return true; }\n'
  );
  writeFile(
    root,
    'apps/extension/src/content/overlay/ai/template-list-drag-end.ts',
    'export function createTemplateDragEndHandler() { return null; }\n'
  );
  writeFile(
    root,
    'apps/extension/src/content/overlay/ai/template-list-drag-end.test.ts',
    "vi.mock('./template-list-drag-handlers', () => ({}));\n"
  );
}
const PRODUCT_PROOF_CODE_FILES = [
  'apps/extension/src/editor/workspace/floating/toolbar.tsx',
  'apps/extension/src/editor/inspector/sidebar-controller/actions.tsx',
  'apps/extension/src/editor/controller/public-api/layer-actions.ts',
  'apps/extension/src/editor/inspector/compact/tool-commands/line.tsx',
  'apps/extension/src/editor/inspector/compact/tool-commands/shape.tsx',
  'apps/extension/src/editor/inspector/compact/tool-commands/text.tsx',
  'apps/extension/src/editor/inspector/compact/tool-commands/arrow.tsx',
];
function writeProductProofRiskFixture(root) {
  const sources = new Map([
    [PRODUCT_PROOF_CODE_FILES[0], 'export function ToolbarControllerState() { return null; }\n'],
    [
      PRODUCT_PROOF_CODE_FILES[1],
      'export function useHiddenFileInputController() { return null; }\n',
    ],
    [PRODUCT_PROOF_CODE_FILES[2], 'export function resizeLayer() { return null; }\n'],
    [PRODUCT_PROOF_CODE_FILES[3], 'export function buildLineToolbarCommands() { return []; }\n'],
    [PRODUCT_PROOF_CODE_FILES[4], 'export function buildShapeToolbarCommands() { return []; }\n'],
    [PRODUCT_PROOF_CODE_FILES[5], 'export function buildTextToolbarCommands() { return []; }\n'],
    [PRODUCT_PROOF_CODE_FILES[6], 'export function buildArrowToolbarCommands() { return []; }\n'],
  ]);

  for (const [file, source] of sources) {
    writeFile(root, file, source);
  }
}

it('does not report path-sensitive registry hints for stable existing paths', async () => {
  const root = createTempRoot('guardrail-path-audit-');
  writeFile(root, 'apps/extension/src/background/example.ts', 'export const value = 1;\n');
  writeFile(
    root,
    'tooling/qa/core/example.rules.mjs',
    "export const allow = ['apps/extension/src/background/example.ts'];\n"
  );

  const report = await collectReport(root, {
    targetFiles: ['apps/extension/src/background/example.ts'],
    codeFiles: ['apps/extension/src/background/example.ts'],
  });

  expect(report.pathAudits).toEqual([]);
});

it('reports path-sensitive registry hints for missing moved paths referenced in quality-gate data', async () => {
  const root = createTempRoot('guardrail-missing-path-audit-');
  writeFile(
    root,
    'tooling/qa/core/example.rules.mjs',
    "export const allow = ['apps/extension/src/background/moved-owner.ts'];\n"
  );

  const report = await collectReport(root, {
    targetFiles: ['apps/extension/src/background/moved-owner.ts'],
    codeFiles: [],
  });

  expect(report.pathAudits).toEqual(
    expect.arrayContaining([expect.stringContaining('path-sensitive registry may need sync')])
  );
});

it('reports deleted internal aggregates, thin shell drift, owner-local proof gaps, and residual seams', async () => {
  const root = createTempRoot('guardrail-seam-audits-');
  writeDragSeamFixture(root);

  const report = await collectReport(root, {
    targetFiles: [
      'apps/extension/src/content/overlay/ai/template-list-drag.ts',
      'apps/extension/src/content/overlay/ai/template-list-drag-start.ts',
      'apps/extension/src/content/overlay/ai/template-list-drag-end.ts',
      'apps/extension/src/content/overlay/ai/template-list-drag-end.test.ts',
      'apps/extension/src/content/overlay/ai/template-list-drag-handlers.ts',
    ],
    codeFiles: [
      'apps/extension/src/content/overlay/ai/template-list-drag.ts',
      'apps/extension/src/content/overlay/ai/template-list-drag-start.ts',
      'apps/extension/src/content/overlay/ai/template-list-drag-end.ts',
    ],
  });

  expect(report.deletedInternalAggregates).toEqual(
    expect.arrayContaining([expect.stringContaining('deleted internal aggregate still referenced')])
  );
  expect(report.thinShells).toEqual(
    expect.arrayContaining([expect.stringContaining('thin-shell candidate still owns local logic')])
  );
  expect(report.ownerLocalProof).toEqual(
    expect.arrayContaining([expect.stringContaining('owner-local proof may be missing')])
  );
  expect(report.residualSeams).toEqual(
    expect.arrayContaining([
      expect.stringContaining('apps/extension/src/content/overlay/ai/template-list-drag.ts'),
    ])
  );
});

it('forecasts broad qa:build scope and related test budget risks', async () => {
  const root = createTempRoot('guardrail-build-scope-');
  writeFile(
    root,
    'apps/extension/src/platform/runtime-messaging/index.ts',
    'export const send = () => null;\n'
  );
  writeFile(
    root,
    'apps/extension/src/platform/runtime-messaging/client.ts',
    'export const client = () => null;\n'
  );
  writeFile(
    root,
    'apps/extension/src/platform/runtime-messaging/client.test.ts',
    Array.from({ length: 245 }, (_, index) => `it('case ${index}', () => {});`).join('\n')
  );

  const report = await collectReport(root, {
    targetFiles: ['apps/extension/src/platform/runtime-messaging/index.ts'],
    codeFiles: ['apps/extension/src/platform/runtime-messaging/index.ts'],
  });

  expect(report.buildScopeForecast).toEqual(
    expect.arrayContaining([
      expect.stringContaining('trigger families: messaging-runtime, package-and-app-core'),
      expect.stringContaining('broad transitive scope expected'),
    ])
  );
  expect(report.buildScopeBudgetRisks).toEqual(
    expect.arrayContaining([expect.stringContaining('client.test.ts: 245 lines')])
  );
});

it('forecasts exact owner tests without a broad transitive warning', async () => {
  const root = createTempRoot('guardrail-build-owner-direct-');
  const targetFiles = [
    'apps/extension/src/content/platform/quick-action-hotkeys/index.test.ts',
    'apps/extension/src/content/platform/quick-action-hotkeys/index.ts',
    'apps/extension/src/ui/command-palette/helpers.test.ts',
    'apps/extension/src/ui/command-palette/helpers.ts',
    'apps/extension/src/ui/command-palette/hotkey.ts',
    'apps/extension/src/ui/keyboard/editable-target.test.ts',
    'apps/extension/src/ui/keyboard/editable-target.ts',
    'docs/engineering/tech-debt-report.md',
  ];
  for (const file of targetFiles) {
    writeFile(root, file, file.includes('.test.') ? "it('covers owner', () => {});\n" : '\n');
  }
  writeFile(
    root,
    'apps/extension/src/ui/command-palette/hotkey.test.tsx',
    "it('covers hotkey owner', () => {});\n"
  );

  const report = await collectReport(root, {
    targetFiles,
    codeFiles: targetFiles.filter((file) => /\.(?:ts|tsx)$/u.test(file)),
    addedFiles: targetFiles.filter((file) => !file.startsWith('docs/')),
  });

  expect(report.buildScopeForecast).toEqual([expect.stringContaining('profile=owner-direct')]);
  expect(report.buildScopeForecast[0]).toContain('selected unit-test scope=4');
  expect(report.buildScopeForecast).not.toEqual(
    expect.arrayContaining([expect.stringContaining('broad transitive scope expected')])
  );
});

it('reports the skip profile and zero selected tests for a non-product-test diff', async () => {
  const root = createTempRoot('guardrail-build-skip-');
  writeFile(root, 'docs/tooling/example.md', 'No product tests.\n');

  const report = await collectReport(root, {
    targetFiles: ['docs/tooling/example.md'],
    codeFiles: [],
  });

  expect(report.buildScopeForecast).toEqual([expect.stringContaining('profile=skip')]);
  expect(report.buildScopeForecast[0]).toContain('selected unit-test scope=0');
});

it('forecasts the full-suite fallback for a deleted owner without surviving proof', async () => {
  const root = createTempRoot('guardrail-build-deleted-full-');
  const report = await collectReport(root, {
    targetFiles: ['apps/extension/src/gallery/unmapped-deleted-leaf.tsx'],
    codeFiles: [],
  });

  expect(report.buildScopeForecast).toEqual([
    expect.stringContaining('profile=related-transitive'),
  ]);
  expect(report.buildScopeForecast[0]).toContain('selected unit-test scope=full-suite');
});

it('reports product proof risk checklist and changed test shape hints', async () => {
  const root = createTempRoot('guardrail-product-proof-risk-');
  writeProductProofRiskFixture(root);
  writeFile(
    root,
    'apps/extension/src/editor/workspace/floating/toolbar.test.ts',
    Array.from({ length: 245 }, (_, index) => `it('case ${index}', () => {});`).join('\n')
  );

  const report = await collectReport(root, {
    targetFiles: [
      ...PRODUCT_PROOF_CODE_FILES,
      'apps/extension/src/editor/workspace/floating/toolbar.test.ts',
    ],
    codeFiles: PRODUCT_PROOF_CODE_FILES,
    untrackedFiles: ['apps/extension/src/editor/workspace/floating/toolbar.test.ts'],
  });

  expect(report.hints).toEqual(
    expect.arrayContaining([
      expect.stringContaining('risk checklist: state authority'),
      expect.stringContaining('risk checklist: UI parity'),
      expect.stringContaining('risk checklist: hidden inputs'),
      expect.stringContaining('risk checklist: public API'),
      expect.stringContaining('risk checklist: untracked tests'),
      expect.stringContaining('visual proof plan recommended'),
      expect.stringContaining('capability-loss risk'),
      expect.stringContaining('test shape risk'),
    ])
  );
});
