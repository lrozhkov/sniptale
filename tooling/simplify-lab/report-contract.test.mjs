import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  compareRunSummaries,
  validateBaselineSummary,
  validateManifest,
} from './report-contract.mjs';

const hash = 'a'.repeat(64);
function manifest() {
  return {
    schemaVersion: 1,
    fingerprint: hash,
    profile: 'smoke',
    seed: 1,
    generatorVersion: '1',
    recipeVersion: '1',
    renderEnvironment: { chromium: '156', dpr: 1 },
    splitDefinition: { tuning: ['body'], holdout: ['table'] },
    fonts: [{ sha256: hash }],
    cases: [
      {
        id: 'small-cyrillic',
        width: 10,
        height: 10,
        split: 'tuning',
        tags: ['cyrillic'],
        region: { x: 0, y: 0, width: 10, height: 10 },
        path: 'small/source.png',
        sourceHash: hash,
        referencePath: 'small/reference.png',
        referenceHash: hash,
        inkMaskPath: 'small/ink.png',
        inkMaskHash: hash,
        protectedMaskPath: 'small/protected.png',
        protectedMaskHash: hash,
        fragments: [
          { id: 'caption', text: 'Тест', rects: [{ x: 1, y: 1, width: 8, height: 4 }], tags: [] },
        ],
      },
    ],
  };
}
function summary() {
  return {
    schemaVersion: 1,
    status: 'baseline',
    complete: true,
    corpus: { fingerprint: hash },
    selection: { caseIds: ['small-cyrillic'], split: null, subset: false },
    settings: { erase: true },
    engineHash: hash,
    oracleVersion: '1',
    thresholds: { repeatNoise: 0, regressionTolerance: 0 },
    cases: [
      {
        caseId: 'small-cyrillic',
        sourceHash: hash,
        metrics: { textRemainingFraction: 0.4, protectedDamageFraction: 0 },
        fragments: [{ id: 'caption', remainingFraction: 0.4, status: 'partial-cleanup' }],
      },
    ],
  };
}
const rejects = (run, classification) =>
  assert.throws(run, (error) => error.classification === classification);

test('corpus validation retains paired resources and rejects path traversal before loading', () => {
  const source = manifest();
  assert.equal(validateManifest(source), source);
  for (const path of [
    '../outside.png',
    '/tmp/outside.png',
    'a/../../x.png',
    'a\\x.png',
    'a//x.png',
  ]) {
    const next = manifest();
    next.cases[0].referencePath = path;
    rejects(() => validateManifest(next), 'generation-error');
  }
});

test('corpus refuses empty cohorts, unknown fonts, duplicate fragments and invalid geometry', () => {
  for (const mutate of [
    (m) => {
      m.cases = [];
    },
    (m) => {
      delete m.cases[0].id;
    },
    (m) => {
      m.fonts[0].sha256 = 'unknown';
    },
    (m) => {
      m.cases.push(structuredClone(m.cases[0]));
    },
    (m) => {
      m.cases[0].fragments.push(structuredClone(m.cases[0].fragments[0]));
    },
    (m) => {
      m.cases[0].region.width = 11;
    },
    (m) => {
      m.cases[0].region.x = 0.5;
    },
    (m) => {
      m.cases[0].fragments[0].rects[0].height = Infinity;
    },
  ]) {
    const input = manifest();
    mutate(input);
    rejects(() => validateManifest(input), 'generation-error');
  }
});

test('baseline permits measured failures but refuses partial, empty and nonfinite reports', () => {
  const measured = summary();
  measured.status = 'failed';
  assert.equal(validateBaselineSummary(measured), measured);
  for (const mutate of [
    (s) => {
      s.complete = false;
    },
    (s) => {
      s.status = 'incomplete';
    },
    (s) => {
      s.cases = [];
    },
    (s) => {
      s.cases[0].metrics.textRemainingFraction = NaN;
    },
    (s) => {
      s.cases[0].fragments[0].remainingFraction = 1.1;
    },
  ]) {
    const input = summary();
    mutate(input);
    rejects(() => validateBaselineSummary(input), 'incompatible-baseline');
  }
});

test('comparison ignores engine and output paths but refuses a different input or calibration', () => {
  const a = summary(),
    b = summary();
  b.engineHash = 'b'.repeat(64);
  b.outputPath = '/different';
  assert.equal(compareRunSummaries(a, b).status, 'pass');
  for (const mutate of [
    (s) => {
      s.corpus.fingerprint = 'b'.repeat(64);
    },
    (s) => {
      s.settings.erase = false;
    },
    (s) => {
      s.oracleVersion = '2';
    },
    (s) => {
      s.thresholds.repeatNoise = 1;
    },
    (s) => {
      s.selection.split = 'holdout';
    },
    (s) => {
      s.cases[0].sourceHash = 'b'.repeat(64);
    },
    (s) => {
      s.cases[0].fragments[0].id = 'different';
    },
    (s) => {
      delete s.cases[0].metrics.protectedDamageFraction;
    },
  ]) {
    const next = summary();
    mutate(next);
    rejects(() => compareRunSummaries(a, next), 'incompatible-baseline');
  }
});

test('text improvements never compensate new protected damage', () => {
  const a = summary(),
    b = summary();
  b.cases[0].metrics.textRemainingFraction = 0;
  b.cases[0].metrics.protectedDamageFraction = 0.001;
  b.cases[0].fragments[0].remainingFraction = 0;
  const result = compareRunSummaries(a, b);
  assert.equal(result.status, 'failed');
  assert.ok(result.improvements.length > 0);
  assert.equal(result.regressions[0].metric, 'protectedDamageFraction');
});

test('new full misses and protected damage block even within continuous tolerance', () => {
  const a = summary(),
    b = summary();
  a.thresholds.regressionTolerance = b.thresholds.regressionTolerance = 0.1;
  a.cases[0].fragments[0] = { id: 'caption', remainingFraction: 0.99, status: 'partial-cleanup' };
  b.cases[0].fragments[0] = { id: 'caption', remainingFraction: 1, status: 'full-miss' };
  b.cases[0].metrics.protectedDamageFraction = 0.001;
  assert.equal(compareRunSummaries(a, b).regressions.length, 2);
});
