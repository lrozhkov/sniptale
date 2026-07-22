import { describe, expect, it } from 'vitest';

import { FUNCTION_PROFILES } from './structural-risk/config.mjs';
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
