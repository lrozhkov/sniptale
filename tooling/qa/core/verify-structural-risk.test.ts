import { describe, expect, it } from 'vitest';

import { FUNCTION_PROFILES } from './structural-risk/config.mjs';
import { collectEffectFamilies } from './structural-risk/owner-classifier.mjs';
import {
  createStructuralRiskReport,
  analyzeStructuralSource,
  validateStructuralAllowances,
} from './structural-risk/report.mjs';
import { isOrchestrationReviewExempt, scoreFile, scoreFunction } from './structural-risk/score.mjs';
import { sanitizeStructuralCliOutput } from './verify-structural-risk.mjs';

function functionMetric(overrides = {}) {
  return {
    profile: 'default',
    lines: 1,
    statements: 1,
    cyclomatic: 1,
    cognitive: 0,
    nesting: 0,
    params: 0,
    effectCount: 0,
    effectFamilies: [],
    stateAuthorities: 0,
    ownerGroupCount: 1,
    recoveryPressure: 0,
    classifiedCallCount: 10,
    cohesion: 1,
    ...overrides,
  };
}

describe('structural function profiles', () => {
  it.each(Object.entries(FUNCTION_PROFILES))(
    'uses the %s warning and hard line thresholds',
    (profile, limits) => {
      const before = functionMetric({ profile, lines: limits.lines[0] });
      const after = functionMetric({ profile, lines: limits.lines[0] + 1 });
      expect(scoreFunction(before)).toBe(0);
      expect(scoreFunction(after)).toBe(1);
      expect(limits.lines[1]).toBeGreaterThan(limits.lines[0]);
    }
  );

  it('scores effects, state, recovery, and low cohesion independently', () => {
    expect(scoreFunction(functionMetric({ effectCount: 4 }))).toBe(3);
    expect(scoreFunction(functionMetric({ stateAuthorities: 3 }))).toBe(3);
    expect(scoreFunction(functionMetric({ recoveryPressure: 3 }))).toBe(2);
    expect(scoreFunction(functionMetric({ cohesion: 0.49 }))).toBe(3);
  });

  it('keeps tests free from effect/state/recovery scoring', () => {
    expect(
      scoreFunction(
        functionMetric({
          profile: 'test',
          effectCount: 20,
          stateAuthorities: 20,
          recoveryPressure: 20,
        })
      )
    ).toBe(0);
  });

  it('turns a registered cohesive orchestration owner into review instead of score-only failure', () => {
    expect(
      isOrchestrationReviewExempt(
        functionMetric({
          profile: 'orchestration',
          effectCount: 6,
          effectFamilies: ['messaging', 'network', 'persistence'],
          stateAuthorities: 4,
          cohesion: 0.8,
          ownerGroupCount: 4,
          cyclomatic: 10,
          nesting: 4,
        })
      )
    ).toBe(true);
  });

  it.each([
    ['default', 'apps/extension/src/composition/example.ts', 'run'],
    ['entrypoint', 'apps/extension/src/background/routes/example.ts', 'run'],
    ['react', 'apps/extension/src/popup/components/example.tsx', 'Example'],
    ['pure', 'apps/extension/src/content/parser/example.ts', 'parse'],
    ['test', 'apps/extension/src/content/example.test.ts', 'run'],
  ])('hard-fails the %s profile above its line cap', (profile, file, symbol) => {
    const hardLines = FUNCTION_PROFILES[profile].lines[1];
    const body = Array.from({ length: hardLines }, (_, index) => `const value${index} = ${index};`);
    const returned = profile === 'react' ? 'return <div />;' : 'return value0;';
    const report = createStructuralRiskReport({
      files: [file],
      getCurrentSource: () => `export function ${symbol}() {\n${body.join('\n')}\n${returned}\n}`,
      getPreviousSource: () => null,
    });
    expect(report.functions[0]?.profile).toBe(profile);
    expect(report.violations).toContainEqual(
      expect.objectContaining({ rule: 'structural-function-risk', symbol })
    );
  });
});

describe('structural file scoring', () => {
  it('honors exact score boundaries', () => {
    const base = {
      lines: 400,
      ownerGroupCount: 4,
      externalEdges: 12,
      exports: 12,
      effectCount: 3,
      stateAuthorities: 2,
      effectfulClusters: 3,
      cohesion: 1,
    };
    expect(scoreFile(base)).toBe(0);
    expect(scoreFile({ ...base, lines: 601, ownerGroupCount: 7 })).toBe(6);
    expect(scoreFile({ ...base, effectCount: 4, stateAuthorities: 3 })).toBe(6);
  });
});

describe('structural persistence effects', () => {
  it.each([
    'weakMap.delete(key)',
    'map.delete(key)',
    'set.delete(key)',
    'captureMenuStates.delete(container)',
    'context.save()',
    'queue.put(item)',
    'service.save(item)',
    'controller.persist(item)',
    'map.delete(db)',
    'queue.put(repository)',
    'context.save(projectRepository)',
    'map.get(repository).delete(key)',
    'map.delete(storage.key)',
    'context.save(localStorage)',
    'queue.put(browser.storage.local)',
  ])('does not classify unrelated mutation as persistence: %s', (source) => {
    expect(collectEffectFamilies(source)).not.toContain('persistence');
  });

  it.each([
    "localStorage.setItem('key', 'value')",
    "sessionStorage.removeItem('key')",
    "indexedDB.open('projects')",
    "window.localStorage.setItem('key', 'value')",
    "globalThis.indexedDB.open('projects')",
    "chrome.storage.local.set({ key: 'value' })",
    "browser.storage.sync.get('key')",
    'storage.save(item)',
    'db.transaction()',
    'objectStore.delete(key)',
    'projectRepository.save(project)',
    "tx.objectStore('projects').delete(key)",
    "database.table('projects').put(project)",
    'getStore().delete(key)',
  ])('classifies proven persistence receiver mutation: %s', (source) => {
    expect(collectEffectFamilies(source)).toContain('persistence');
  });
});

describe('structural report delta policy', () => {
  const file = 'apps/extension/src/background/application/example.ts';
  const stable = 'export function run() { return 1; }\n';
  const risky = `export async function run() {
    try {
      if (await fetch('/one')) localStorage.setItem('a', 'b');
      if (await fetch('/two')) chrome.runtime.sendMessage({ ok: true });
      document.body.appendChild(document.createElement('div'));
    } catch (error) {
      await rollback(error);
    } finally {
      await cleanup();
    }
  }\n`;

  it('does not scan an unchanged legacy file unless it is supplied as a target', () => {
    const report = createStructuralRiskReport({
      files: [],
      getCurrentSource: () => risky,
      getPreviousSource: () => risky,
    });
    expect(report.files).toEqual([]);
  });

  it('compares a behavioral edit with HEAD and exposes the score delta', () => {
    const report = createStructuralRiskReport({
      files: [file],
      getCurrentSource: () => risky,
      getPreviousSource: () => stable,
    });
    expect(report.functions.find((metric) => metric.symbol === 'run')?.delta).toBeGreaterThan(0);
  });

  it('treats an added file as a new absolute-risk candidate', () => {
    const report = createStructuralRiskReport({
      files: [file],
      getCurrentSource: () => risky,
      getPreviousSource: () => null,
    });
    expect(report.files[0]?.isNew).toBe(true);
  });

  it('matches unchanged duplicate callbacks before occurrence fallback', () => {
    const stableCallbacks = `
      const ids = items.map((item) => item.id);
      const published = items.map(async (item) => {
        try {
          if (await fetch('/one')) localStorage.setItem('item', item.id);
          if (await fetch('/two')) chrome.runtime.sendMessage({ item });
          document.body.appendChild(document.createElement('div'));
          await navigator.mediaDevices.getUserMedia({ audio: true });
          setTimeout(() => publish(item), 0);
          if (item.a) setA(item.a);
          if (item.b) setB(item.b);
          if (item.c) setC(item.c);
          if (item.d) setD(item.d);
          if (item.e) setE(item.e);
          if (item.f) setF(item.f);
          if (item.g) setG(item.g);
          if (item.h) setH(item.h);
          if (item.i) setI(item.i);
        } catch (error) {
          await rollback(error);
        } finally {
          await cleanup();
        }
        return item;
      });`;
    const previous = `export function run(items) {${stableCallbacks}\nreturn { ids, published };\n}`;
    const current = `export function run(items) {
      const indexes = items.map((item) => item.index);${stableCallbacks}
      return { indexes, ids, published };
    }`;
    const report = createStructuralRiskReport({
      files: [file],
      getCurrentSource: () => current,
      getPreviousSource: () => previous,
    });
    const callbacks = report.functions.filter((metric) =>
      metric.symbol.includes('items.map callback')
    );
    const riskyCallback = callbacks.find((metric) => metric.effectCount > 2);

    expect(callbacks.filter((metric) => metric.isNew)).toHaveLength(1);
    expect(riskyCallback).toMatchObject({ isNew: false, delta: 0 });
    expect(riskyCallback?.score).toBeGreaterThanOrEqual(8);
    expect(report.violations).not.toContainEqual(
      expect.objectContaining({ symbol: riskyCallback?.symbol })
    );
  });
});

describe('effectful cluster architecture levels', () => {
  it('classifies Fabric canvas mutations as DOM/UI state effects', () => {
    const mutation = analyzeStructuralSource(
      'apps/extension/src/editor/controller/public-actions/scene/browser-frame/mutation.ts',
      `export function replaceLayer(canvas, previous, next) {
        canvas.remove(previous);
        canvas.add(next);
        canvas.moveObjectTo(next, 1);
        canvas.setActiveObject(next);
        canvas.requestRenderAll();
        canvas?.setDimensions({ width: 100, height: 100 });
        options.canvas?.requestRenderAll();
      }`
    );

    expect(mutation.effectFamilies).toContain('dom-ui');
    expect(mutation.functions[0]?.effectFamilies).toContain('dom-ui');
  });

  it('allows a narrow adapter but identifies mixed UI/application effects', () => {
    const adapter = analyzeStructuralSource(
      'apps/extension/src/platform/browser/download-adapter.ts',
      `export async function download() {
        await chrome.downloads.download({ url: 'x' });
        logger.info('downloaded');
      }`
    );
    const application = analyzeStructuralSource(
      'apps/extension/src/features/export/application/run.ts',
      `export async function exportProject() {
        await chrome.downloads.download({ url: 'x' });
        await indexedDB.put('project');
        await fetch('/publish');
        document.body.appendChild(document.createElement('div'));
      }`
    );
    expect(adapter.effectfulClusters).toBe(0);
    expect(application.effectfulClusters).toBe(1);
  });

  it('does not turn a cohesive runtime binding adapter into a state owner', () => {
    const adapter = analyzeStructuralSource(
      'apps/extension/src/content/selection/controller/runtime-bindings/facade.ts',
      `export function bind(session, getEvents) {
        return {
          setActive: (value) => { session.isActive = value; }, setSelection: (value) => { session.selection = value; },
          setCallback: (value) => { session.callback = value; }, updateFinalFrame: () => getEvents().updateFinalFrame(),
        };
      }`
    );
    expect(adapter.architecturalLayer).toBe('adapter');
    expect(adapter.stateAuthorities).toBe(1);
    expect(adapter.stateAuthorityNames).toEqual(['session']);
    expect(adapter.stateReceiverNames).toEqual(['session']);
    expect(adapter.unresolvedStateAuthorityCount).toBe(0);
    expect(scoreFile(adapter)).toBe(0);
  });

  it('does not exempt an adapter that mutates multiple receiver roots', () => {
    const adapter = analyzeStructuralSource(
      'apps/extension/src/content/selection/controller/runtime-bindings/facade.ts',
      `export function bind(firstState, secondState, thirdState) {
        return { setFirst: (next) => { firstState.ready = next; },
          setSecond: (next) => { secondState.value = next; },
          setThird: (next) => { thirdState.callback = next; } };
      }`
    );
    expect(adapter.stateReceiverNames).toEqual(['firstState', 'secondState', 'thirdState']);
    expect(scoreFile(adapter)).toBe(3);
  });

  it('keeps one state authority distinct from branching pressure', () => {
    const adapter = analyzeStructuralSource(
      'apps/extension/src/content/selection/controller/runtime-bindings/facade.ts',
      `export function bind(session, value) {
        return {
          setFirst: (next) => {
            if (next > 0) {
              if (next > 1) {
                if (next > 2) {
                  if (next > 3) {
                    if (next > 4) session.first = next;
                  }
                }
              }
            }
          },
          setSecond: (next) => { session.second = next; },
          setThird: (next) => { session.third = next; },
        };
      }`
    );
    expect(adapter.stateAuthorities).toBe(1);
    expect(scoreFile(adapter)).toBe(0);
    expect(Math.max(...adapter.functions.map((metric) => scoreFunction(metric)))).toBeGreaterThan(
      0
    );
  });
});

it('collapses a nested session callback family to one file-level authority', () => {
  const metric = analyzeStructuralSource(
    'apps/extension/src/content/selection/ui/size-panel/runtime.ts',
    `export function bind(args) {
      return {
        setAspectRatio: (value) => { args.session.aspectRatio = value; },
        setSelection: (value) => { args.session.selection = value; },
        setMaintainAspectRatio: (value) => { args.session.maintainAspectRatio = value; },
      };
    }`
  );

  expect(metric.stateAuthorities).toBe(1);
  expect(metric.stateAuthorityNames).toEqual(['args.session']);
  expect(metric.stateReceiverNames).toEqual(['args.session']);
  expect(scoreFile(metric)).toBe(0);
});

it('keeps same-spelling independent lexical session bindings distinct', () => {
  const metric = analyzeStructuralSource(
    'apps/extension/src/content/selection/state.ts',
    `export function updateFirst(session) { session.ready = true; }
    export function updateSecond(session) { session.ready = true; }
    export function updateThird(session) { session.ready = true; }`
  );

  expect(metric.stateAuthorities).toBe(3);
  expect(metric.stateReceiverNames).toEqual(['session']);
  expect(metric.stateReceiverKeys).toHaveLength(3);
  expect(scoreFile(metric)).toBe(3);
});

it('does not score test fixture mutations as production state authority', () => {
  const metric = analyzeStructuralSource(
    'apps/extension/src/content/selection/runtime.test.ts',
    `it('updates a fixture', () => {
      firstFixture.isActive = true;
      secondFixture.selection = selection;
      thirdFixture.cleanup = cleanup;
    });`
  );

  expect(metric.profile).toBe('test');
  expect(metric.stateAuthorities).toBeGreaterThan(2);
  expect(scoreFile(metric)).toBe(0);
});

it('uses formatting-stable normalized AST and signature hashes for allowances', () => {
  const compact = analyzeStructuralSource(
    'apps/extension/src/example.ts',
    'export function parse(value:string):number{return Number(value);}'
  ).functions[0];
  const formatted = analyzeStructuralSource(
    'apps/extension/src/example.ts',
    `export function parse(value: string): number {
      return Number(value);
    }`
  ).functions[0];
  expect(formatted.astHash).toBe(compact.astHash);
  expect(formatted.signatureHash).toBe(compact.signatureHash);
  const compactFile = analyzeStructuralSource(
    'apps/extension/src/example.ts',
    'export function parse(value:string):number{return Number(value);}'
  );
  const formattedFile = analyzeStructuralSource(
    'apps/extension/src/example.ts',
    `export function parse(value: string): number {
      return Number(value);
    }`
  );
  expect(formattedFile.astHash).toBe(compactFile.astHash);
  expect(formattedFile.signatureHash).toBe(compactFile.signatureHash);
});

it('requires complete ownership metadata for structural allowances', () => {
  expect(() =>
    validateStructuralAllowances({
      $schemaVersion: 1,
      allowances: [
        {
          rule: 'structural-function-risk',
          file: 'apps/extension/src/example.ts',
          symbol: 'run',
          astHash: 'a'.repeat(64),
          signatureHash: 'b'.repeat(64),
        },
      ],
    })
  ).toThrow(/ownership metadata/u);
});

it('counts distinct state authorities instead of repeated writes', () => {
  const metric = analyzeStructuralSource(
    'apps/extension/src/example.ts',
    `export function update() {
      store.setState({ ready: true });
      store.setState({ ready: false });
      setSelection('one');
      setSelection('two');
    }`
  ).functions[0];
  expect(metric.stateAuthorities).toBe(2);
});

it('collapses repeated DOM field writes to their owning receiver', () => {
  const metric = analyzeStructuralSource(
    'apps/extension/src/content/selection/example.ts',
    `export function update(region, doc, tooltip) {
      region.style.left = '1px';
      region.style.width = '2px';
      region.dataset.owner = 'selection';
      doc.body.style.userSelect = 'none';
      tooltip.textContent = 'Ready';
    }`
  ).functions[0];

  expect(metric.stateAuthorityNames).toEqual(['doc.body', 'region', 'tooltip']);
});

it('keeps distinct nested state and collection receivers separate', () => {
  const metric = analyzeStructuralSource(
    'apps/extension/src/example.ts',
    `export function update(state, items, index) {
      state.isSelecting = true;
      state.callbacks.addFrame = () => {};
      (items[index] as { selected: boolean }).selected = true;
      this.value = 1;
    }`
  ).functions[0];

  expect(metric.stateAuthorityNames).toEqual(['items[index]', 'state', 'state.callbacks', 'this']);
});

it('sanitizes and byte-bounds direct structural CLI output', () => {
  const secret = 'bare-structural-cli-secret';
  const output = sanitizeStructuralCliOutput(`src/${secret}.ts\n${'🙂'.repeat(10_000)}`, {
    repositoryRoot: process.cwd(),
    sensitiveValues: [secret],
  });
  expect(output).not.toContain(secret);
  expect(output).not.toContain('\ufffd');
  expect(output).toContain('console output truncated');
  expect(Buffer.byteLength(output)).toBeLessThanOrEqual(16 * 1024);
});
