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
    [PRODUCT_PROOF_CODE_FILES[0], 'export function Toolbar() { return <button />; }\n'],
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

it('reports deleted internal aggregates, thin shell drift, and owner-local proof gaps', async () => {
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
});

it('keeps same-directory fragmentation context when only one family file changed', async () => {
  const root = createTempRoot('guardrail-bounded-owner-directory-');
  const controller = 'apps/extension/src/content/overlay/example/controller.ts';
  const sibling = 'apps/extension/src/content/overlay/example/controller-state.ts';
  const operation = 'apps/extension/src/content/overlay/example/operation-step.ts';
  const operationSibling = 'apps/extension/src/content/overlay/example/operation-result.ts';
  writeFile(
    root,
    controller,
    [
      'export function createController() {',
      ...Array.from({ length: 121 }, (_, index) => `  const value${index} = ${index};`),
      '  return null;',
      '}',
      '',
    ].join('\n')
  );
  writeFile(root, sibling, 'export const state = {};\n');
  writeFile(root, operation, 'export const step = {};\n');
  writeFile(root, operationSibling, 'export const result = {};\n');

  const report = await collectReport(root, {
    targetFiles: [controller, operation],
    codeFiles: [controller, operation],
  });

  expect(report.thinShells).toEqual(
    expect.arrayContaining([expect.stringContaining('thin-shell candidate still owns local logic')])
  );
  expect(report.ownerLocalProof).toEqual(
    expect.arrayContaining([expect.stringContaining('owner-local proof may be missing')])
  );
  expect(report.topologyQuestions).toEqual(
    expect.arrayContaining([expect.stringContaining('same-family seams')])
  );
});

it('forecasts broad qa:build scope without test-size budgets', async () => {
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
      expect.stringContaining('bounded owner and affected-consumer discovery required'),
      expect.stringContaining('broad transitive scope expected'),
    ])
  );
  expect(report.buildScopeForecast[0]).not.toContain('broader related tests');
  expect(report).not.toHaveProperty('buildScopeBudgetRisks');
});

it('does not claim an exact selected scope for bounded manifest forecasting', async () => {
  const root = createTempRoot('guardrail-build-manifest-scope-');
  writeFile(root, 'apps/extension/manifest.json', '{}\n');

  const report = await collectReport(root, {
    targetFiles: ['apps/extension/manifest.json'],
    codeFiles: [],
  });

  expect(report.buildScopeForecast[0]).toContain(
    'selected unit-test scope=consumer-discovery-required'
  );
  expect(report.buildScopeForecast[0]).not.toContain('skipped');
  expect(report.buildScopeForecast).toEqual(
    expect.arrayContaining([expect.stringContaining('broad transitive scope expected')])
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

it('uses the full diff for build forecasting while behavioral hints stay diff-filtered', async () => {
  const root = createTempRoot('guardrail-build-full-diff-');
  const deleted = 'apps/extension/src/content/selection/example/events.ts';
  const owner = 'apps/extension/src/content/selection/example/runtime.events.ts';
  const ownerTest = 'apps/extension/src/content/selection/example/runtime.events.test.ts';
  writeFile(root, owner, 'export const createRuntimeEvents = () => ({});\n');
  writeFile(root, ownerTest, "it('covers runtime events', () => {});\n");

  const report = await collectReport(root, {
    targetFiles: [deleted, ownerTest],
    codeFiles: [ownerTest],
    buildScopeContext: {
      targetFiles: [deleted, owner, ownerTest],
      codeFiles: [owner, ownerTest],
      addedFiles: [],
    },
    buildScopeOptions: {
      deletedSuccessorResolver: () => new Map([[deleted, [owner]]]),
      ownerTestResolver: (file) => (file === owner ? [ownerTest] : []),
    },
  });

  expect(report.buildScopeForecast[0]).toContain('graph-closed successor owner proof');
  expect(report.buildScopeForecast[0]).not.toContain('full product test suite');
  expect(report.clusters).toEqual(['apps/extension/src=2']);
});

it('reports product proof risk checklist without test-size hints', async () => {
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
    ])
  );
  expect(report.hints).not.toEqual(
    expect.arrayContaining([expect.stringContaining('test shape risk')])
  );
});

it('recommends behavioral wiring proof without visual states for state-only UI code', async () => {
  const root = createTempRoot('guardrail-state-only-ui-proof-');
  const controller = 'apps/extension/src/content/overlay/ai/modal/session/controller.ts';
  const controllerTest = 'apps/extension/src/content/overlay/ai/modal/session/controller.test.tsx';
  writeFile(root, controller, 'export function useModalController() { return {}; }\n');
  writeFile(root, controllerTest, "it('binds state', () => {});\n");

  const report = await collectReport(root, {
    targetFiles: [controller, controllerTest],
    codeFiles: [controller, controllerTest],
  });

  expect(report.hints).toEqual(
    expect.arrayContaining([expect.stringContaining('risk checklist: UI wiring')])
  );
  expect(report.hints).not.toEqual(
    expect.arrayContaining([
      expect.stringContaining('risk checklist: visual states'),
      expect.stringContaining('visual proof plan recommended'),
    ])
  );
});
