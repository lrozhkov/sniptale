import { expect, it } from 'vitest';

import { createStructuralRiskReport } from './report.mjs';

it('inherits body-identical function lineage from a fully consolidated deleted owner', () => {
  const target = 'apps/extension/src/content/selection/example/index.ts';
  const predecessor = 'apps/extension/src/content/selection/example/update.ts';
  const implementation = `export function update(region, tooltip) {
      region.style.left = '1px';
      region.style.width = '2px';
      tooltip.textContent = 'Ready';
    }
`;
  const report = createStructuralRiskReport({
    files: [target],
    getCurrentSource: () => implementation,
    getPreviousSource: () => "export { update } from './update';\n",
    previousCandidateSources: [{ file: predecessor, source: implementation }],
  });

  expect(report.files[0]).toMatchObject({
    delta: 0,
    deltaKind: 'consolidated',
    predecessorFiles: [predecessor],
  });
  expect(report.functions.find((metric) => metric.symbol === 'update')).toMatchObject({
    delta: 0,
    deltaKind: 'move-only',
    isNew: false,
    predecessorFile: predecessor,
  });
});

it('does not inherit a file baseline from a partially consumed predecessor', () => {
  const target = 'apps/extension/src/content/selection/example/index.ts';
  const predecessor = 'apps/extension/src/content/selection/example/update.ts';
  const moved = `export function update(region, tooltip) {
      region.style.left = '1px';
      region.style.width = '2px';
      tooltip.textContent = 'Ready';
    }
`;
  const report = createStructuralRiskReport({
    files: [target],
    getCurrentSource: () => moved,
    getPreviousSource: () => "export { update } from './update';\n",
    previousCandidateSources: [
      {
        file: predecessor,
        source: `${moved}\nexport function retained() { return true; }\n`,
      },
    ],
  });

  expect(report.files[0]).toMatchObject({
    deltaKind: 'same-path',
    predecessorFiles: [],
    previousScore: 0,
  });
  expect(report.functions.find((metric) => metric.symbol === 'update')).toMatchObject({
    delta: 0,
    deltaKind: 'move-only',
    predecessorFile: predecessor,
  });
});

it('does not accept cross-owner function lineage', () => {
  const target = 'apps/extension/src/content/selection/example/index.ts';
  const predecessor = 'apps/extension/src/background/example/update.ts';
  const implementation = 'export function update() { return true; }\n';
  const report = createStructuralRiskReport({
    files: [target],
    getCurrentSource: () => implementation,
    getPreviousSource: () => "export { update } from './update';\n",
    previousCandidateSources: [{ file: predecessor, source: implementation }],
  });

  expect(report.files[0]).toMatchObject({
    deltaKind: 'same-path',
    predecessorFiles: [],
  });
  expect(report.functions.find((metric) => metric.symbol === 'update')).toMatchObject({
    deltaKind: 'new',
    isNew: true,
    predecessorFile: null,
  });
});

it.each([
  [
    'async modifier',
    'export function update() { return this.value; }\n',
    'export async function update() { return this.value; }\n',
  ],
  [
    'function kind and lexical this',
    'export function update() { return this.value; }\n',
    'export const update = () => { return this.value; };\n',
  ],
])('rejects move-only lineage after a %s change', (_reason, previous, current) => {
  const target = 'apps/extension/src/content/selection/example/index.ts';
  const predecessor = 'apps/extension/src/content/selection/example/update.ts';
  const report = createStructuralRiskReport({
    files: [target],
    getCurrentSource: () => current,
    getPreviousSource: () => "export { update } from './update';\n",
    previousCandidateSources: [{ file: predecessor, source: previous }],
  });

  expect(report.files[0]).toMatchObject({ predecessorFiles: [] });
  expect(report.functions.find((metric) => metric.symbol === 'update')).toMatchObject({
    deltaKind: 'new',
    isNew: true,
    predecessorFile: null,
  });
});

it('rejects move-only lineage when a referenced import changes provider', () => {
  const target = 'apps/extension/src/content/selection/example/index.ts';
  const predecessor = 'apps/extension/src/content/selection/example/update.ts';
  const report = createStructuralRiskReport({
    files: [target],
    getCurrentSource: () =>
      "import { save } from './replacement';\nexport function update() { return save(); }\n",
    getPreviousSource: () => "export { update } from './update';\n",
    previousCandidateSources: [
      {
        file: predecessor,
        source: "import { save } from './legacy';\nexport function update() { return save(); }\n",
      },
    ],
  });

  expect(report.files[0]).toMatchObject({ predecessorFiles: [] });
  expect(report.functions.find((metric) => metric.symbol === 'update')).toMatchObject({
    deltaKind: 'new',
    isNew: true,
  });
});

it('accepts equivalent relative import providers after a same-owner move', () => {
  const target = 'apps/extension/src/content/selection/example/index.ts';
  const predecessor = 'apps/extension/src/content/selection/example/internal/update.ts';
  const movedFunction = 'export function update() { return save(); }\n';
  const report = createStructuralRiskReport({
    files: [target],
    getCurrentSource: () => `import { save } from './save';\n${movedFunction}`,
    getPreviousSource: () => "export { update } from './internal/update';\n",
    previousCandidateSources: [
      { file: predecessor, source: `import { save } from '../save';\n${movedFunction}` },
    ],
  });

  expect(report.files[0]).toMatchObject({
    delta: 0,
    deltaKind: 'consolidated',
    predecessorFiles: [predecessor],
  });
  expect(report.functions.find((metric) => metric.symbol === 'update')).toMatchObject({
    delta: 0,
    deltaKind: 'move-only',
    predecessorFile: predecessor,
  });
});

it('resolves an outer import despite an inner block-local binding with the same name', () => {
  const target = 'apps/extension/src/content/selection/example/index.ts';
  const predecessor = 'apps/extension/src/content/selection/example/update.ts';
  const body = `export function update() {
    save('outer');
    { const save = (value) => value; save('inner'); }
  }
`;
  const report = createStructuralRiskReport({
    files: [target],
    getCurrentSource: () => `import { save } from './replacement';\n${body}`,
    getPreviousSource: () => "export { update } from './update';\n",
    previousCandidateSources: [
      { file: predecessor, source: `import { save } from './legacy';\n${body}` },
    ],
  });

  expect(report.files[0]).toMatchObject({ predecessorFiles: [] });
  expect(report.functions.find((metric) => metric.symbol === 'update')).toMatchObject({
    deltaKind: 'new',
    isNew: true,
  });
});

it('rejects move-only lineage when referenced top-level support changes', () => {
  const target = 'apps/extension/src/content/selection/example/index.ts';
  const predecessor = 'apps/extension/src/content/selection/example/update.ts';
  const report = createStructuralRiskReport({
    files: [target],
    getCurrentSource: () =>
      "const mode = 'replacement';\nexport function update() { return mode; }\n",
    getPreviousSource: () => "export { update } from './update';\n",
    previousCandidateSources: [
      {
        file: predecessor,
        source: "const mode = 'legacy';\nexport function update() { return mode; }\n",
      },
    ],
  });

  expect(report.files[0]).toMatchObject({ predecessorFiles: [] });
  expect(report.functions.find((metric) => metric.symbol === 'update')).toMatchObject({
    deltaKind: 'new',
    isNew: true,
  });
});

it('rejects a file baseline when unreferenced top-level effects changed', () => {
  const target = 'apps/extension/src/content/selection/example/index.ts';
  const predecessor = 'apps/extension/src/content/selection/example/update.ts';
  const effects = (label) => `
    fetch('/${label}');
    localStorage.setItem('mode', '${label}');
    chrome.tabs.query({ active: true });
    document.body.appendChild(document.createElement('div'));
    navigator.mediaDevices.getUserMedia({ audio: true });
  `;
  const movedFunction = 'export function update() { return true; }\n';
  const report = createStructuralRiskReport({
    files: [target],
    getCurrentSource: () => `${effects('replacement')}\n${movedFunction}`,
    getPreviousSource: () => "export { update } from './update';\n",
    previousCandidateSources: [
      { file: predecessor, source: `${effects('legacy')}\n${movedFunction}` },
    ],
  });

  expect(report.files[0]).toMatchObject({
    delta: 3,
    deltaKind: 'same-path',
    predecessorFiles: [],
    previousScore: 0,
    score: 3,
  });
  expect(report.functions.find((metric) => metric.symbol === 'update')).toMatchObject({
    deltaKind: 'move-only',
  });
  expect(report.advisories).toContainEqual(
    expect.objectContaining({ file: target, rule: 'structural-file-risk' })
  );
});

it('rescores an exact predecessor with the current profile before computing delta', () => {
  const target = 'apps/extension/src/content/selection/example/index.ts';
  const predecessor = 'apps/extension/src/content/selection/example/update.ts';
  const implementation = `export function update(a, b, c, d, e) {
      if (a) return 1;
      if (b) return 2;
      if (c) return 3;
      if (d) return 4;
      if (e) return 5;
      if (a && b) return 6;
      return 0;
    }
`;
  const report = createStructuralRiskReport({
    files: [target],
    getCurrentSource: () => implementation,
    getPreviousSource: () =>
      'export function update(...args) { return delegateUpdate(...args); }\n',
    previousCandidateSources: [{ file: predecessor, source: implementation }],
  });
  const metric = report.functions.find((item) => item.symbol === 'update');

  expect(metric).toMatchObject({
    profile: 'entrypoint',
    delta: 0,
    deltaKind: 'move-only',
    predecessorFile: predecessor,
  });
  expect(metric?.score).toBeGreaterThan(0);
  expect(metric?.previousScore).toBe(metric?.score);
});
