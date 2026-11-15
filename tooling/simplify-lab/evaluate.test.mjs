import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_THRESHOLDS, ORACLE_VERSION, evaluateRaster } from './evaluate.mjs';

function raster(width, height, color = [255, 255, 255, 255]) {
  const value = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index++) value.set(color, index * 4);
  return value;
}
function fixture() {
  const width = 6,
    height = 3,
    reference = raster(width, height);
  reference.set([0, 0, 0, 255], 16 * 4);
  const source = reference.slice(),
    inkMask = new Uint8Array(width * height),
    protectedMask = new Uint8Array(width * height);
  for (const index of [1, 2, 7, 8]) {
    source.set([0, 0, 0, 255], index * 4);
    inkMask[index] = 255;
  }
  protectedMask[16] = 255;
  return {
    source,
    reference,
    output: source.slice(),
    width,
    height,
    inkMask,
    protectedMask,
    fragments: [
      {
        id: 'text-1',
        text: 'Пример 12',
        rects: [{ x: 1, y: 0, width: 2, height: 2 }],
        tags: ['cyrillic', 'small'],
      },
    ],
    region: { x: 0, y: 0, width, height },
  };
}
function oracleError(callback) {
  assert.throws(
    callback,
    (error) => error instanceof TypeError && error.classification === 'oracle-error'
  );
}

test('versioned controls classify unchanged source as a full miss and independent reference as clean', () => {
  assert.equal(ORACLE_VERSION, 'simplify-erase-raster-v1');
  assert.deepEqual(DEFAULT_THRESHOLDS, { repeatNoise: 0, regressionTolerance: 0 });
  assert.ok(Object.isFrozen(DEFAULT_THRESHOLDS));
  const args = fixture(),
    missed = evaluateRaster(args);
  assert.equal(missed.status, 'fail');
  assert.equal(missed.metrics.remainingFraction, 1);
  assert.equal(missed.fragments[0].status, 'full-miss');
  assert.deepEqual(missed.findings[0], {
    type: 'full-miss',
    fragmentId: 'text-1',
    text: 'Пример 12',
    rects: args.fragments[0].rects,
    tags: ['cyrillic', 'small'],
    value: 1,
    affectedPixels: 4,
  });
  const clean = evaluateRaster({ ...args, output: args.reference });
  assert.equal(clean.status, 'pass');
  assert.equal(clean.metrics.remainingFraction, 0);
  assert.equal(clean.fragments[0].status, 'pass');
  assert.deepEqual(clean.findings, []);
});
test('partial deletion and glyph recoloring remain localized residue', () => {
  const args = fixture(),
    partial = args.reference.slice();
  for (const index of [1, 2])
    partial.set(args.source.subarray(index * 4, index * 4 + 4), index * 4);
  const result = evaluateRaster({ ...args, output: partial });
  assert.equal(result.metrics.remainingFraction, 0.5);
  assert.equal(result.fragments[0].status, 'partial-cleanup');
  assert.equal(result.findings[0].affectedPixels, 2);
  const recolored = args.reference.slice();
  for (const index of [1, 2, 7, 8]) recolored.set([255, 0, 0, 255], index * 4);
  assert.equal(evaluateRaster({ ...args, output: recolored }).fragments[0].status, 'full-miss');
  for (const index of [1, 2, 7, 8]) recolored.set([128, 128, 128, 255], index * 4);
  const faint = evaluateRaster({ ...args, output: recolored });
  assert.equal(faint.fragments[0].status, 'partial-cleanup');
  assert.equal(faint.metrics.remainingFraction, 127 / 255);
});
test('erasing the whole page fails protected geometry even when every text pixel is removed', () => {
  const args = fixture(),
    result = evaluateRaster({ ...args, output: raster(args.width, args.height) });
  assert.equal(result.metrics.remainingFraction, 0);
  assert.equal(result.metrics.protectedDamageFraction, 1);
  assert.equal(result.status, 'fail');
  assert.deepEqual(
    result.findings.map((finding) => finding.type),
    ['protected-damage']
  );
  assert.deepEqual(result.findings[0].rects, [{ x: 4, y: 2, width: 1, height: 1 }]);
});
test('background damage cannot be cancelled by perfect text cleanup or unchanged protected lines', () => {
  const args = fixture(),
    output = args.reference.slice();
  output.set([0, 0, 255, 255], 5 * 4);
  const result = evaluateRaster({ ...args, output });
  assert.equal(result.metrics.remainingFraction, 0);
  assert.equal(result.metrics.protectedDamageFraction, 0);
  assert.equal(result.metrics.backgroundDamagedPixels, 1);
  assert.equal(result.status, 'fail');
  assert.equal(result.findings[0].type, 'background-damage');
});
test('one-byte thin antialiasing strokes stay in the oracle without erosion, including calibrated noise', () => {
  const args = fixture();
  for (const index of [1, 2, 7, 8]) args.source.set([254, 254, 254, 255], index * 4);
  const unchanged = evaluateRaster({
    ...args,
    output: args.source,
    thresholds: { repeatNoise: 2 },
  });
  assert.equal(unchanged.metrics.insideInkPixels, 4);
  assert.equal(unchanged.metrics.remainingFraction, 1);
  assert.equal(unchanged.fragments[0].status, 'full-miss');
  assert.equal(evaluateRaster({ ...args, output: args.reference }).status, 'pass');
});
test('repeat noise is byte calibration and regression tolerance does not change local measurements', () => {
  const args = fixture(),
    output = args.reference.slice();
  output.set([254, 255, 255, 255], 0);
  assert.equal(evaluateRaster({ ...args, output }).status, 'fail');
  const measured = evaluateRaster({
    ...args,
    output,
    thresholds: { repeatNoise: 1, regressionTolerance: 0 },
  });
  assert.equal(measured.status, 'pass');
  assert.equal(measured.metrics.repeatNoise, 1);
  assert.deepEqual(
    measured,
    evaluateRaster({ ...args, output, thresholds: { repeatNoise: 1, regressionTolerance: 0.05 } })
  );
  assert.equal(
    evaluateRaster({ ...args, output: args.source, thresholds: { repeatNoise: 1 } }).metrics
      .remainingFraction,
    1
  );
});
test('partly intersected fragments evaluate only inside ink and require original source outside the ROI', () => {
  const width = 6,
    height = 1,
    reference = raster(width, height),
    source = reference.slice(),
    inkMask = new Uint8Array(width);
  for (const index of [1, 4]) {
    source.set([0, 0, 0, 255], index * 4);
    inkMask[index] = 255;
  }
  const args = {
    width,
    height,
    source,
    reference,
    inkMask,
    protectedMask: new Uint8Array(width),
    fragments: [
      {
        id: 'crossing',
        text: 'AB',
        rects: [{ x: 1, y: 0, width: 4, height: 1 }],
        tags: ['roi-edge'],
      },
    ],
    region: { x: 0, y: 0, width: 3, height: 1 },
  };
  const output = source.slice();
  output.set(reference.subarray(4, 8), 4);
  const result = evaluateRaster({ ...args, output });
  assert.equal(result.status, 'pass');
  assert.equal(result.metrics.insideInkPixels, 1);
  assert.equal(result.metrics.outsideInkPixels, 1);
  assert.equal(result.fragments[0].insideInkPixels, 1);
  assert.equal(result.fragments[0].outsideInkPixels, 1);
  assert.equal(result.fragments[0].outsideChangedFraction, 0);
  const illegal = evaluateRaster({ ...args, output: reference });
  assert.equal(illegal.status, 'fail');
  assert.equal(illegal.metrics.remainingFraction, 0);
  assert.equal(illegal.fragments[0].outsideChangedFraction, 1);
  assert.equal(illegal.findings[0].type, 'outside-region-change');
  const untouched = evaluateRaster({ ...args, output: source });
  assert.equal(untouched.fragments[0].remainingFraction, 1);
  assert.equal(untouched.fragments[0].status, 'full-miss');
});
test('fragments outside the ROI and empty controls are explicit not-applicable instead of false PASS', () => {
  const args = fixture(),
    outside = evaluateRaster({ ...args, region: { x: 4, y: 0, width: 2, height: 2 } });
  assert.equal(outside.status, 'not-applicable');
  assert.equal(outside.fragments[0].status, 'not-applicable');
  assert.equal(outside.fragments[0].insideInkPixels, 0);
  assert.equal(outside.fragments[0].remainingFraction, 0);
  const blank = raster(2, 2),
    empty = evaluateRaster({
      width: 2,
      height: 2,
      source: blank,
      reference: blank,
      output: blank,
      inkMask: new Uint8Array(4),
      protectedMask: new Uint8Array(4),
      fragments: [],
      region: { x: 0, y: 0, width: 2, height: 2 },
    });
  assert.equal(empty.status, 'not-applicable');
  assert.deepEqual(empty.findings, []);
  assert.ok(Object.values(empty.metrics).every(Number.isFinite));
});
test('fractional fragment geometry stays stable and localization tolerance does not erode edge ink', () => {
  const args = fixture();
  args.fragments[0].rects = [{ x: 1.75, y: 0.25, width: 1, height: 1.5 }];
  const geometry = structuredClone(args.fragments),
    source = args.source.slice(),
    mask = args.inkMask.slice();
  const result = evaluateRaster(args);
  assert.deepEqual(result.fragments[0].rects, geometry[0].rects);
  assert.equal(result.fragments[0].inkPixels, 4);
  assert.equal(result.fragments[0].remainingFraction, 1);
  assert.deepEqual(args.fragments, geometry);
  assert.deepEqual(args.source, source);
  assert.deepEqual(args.inkMask, mask);
  result.fragments[0].rects[0].x = 100;
  assert.deepEqual(args.fragments, geometry);
});
test('invalid dimensions, arrays, masks, thresholds and annotations refuse evaluation', () => {
  const args = fixture();
  for (const change of [
    { width: NaN },
    { width: Infinity },
    { height: 0 },
    { width: 1.5 },
    { width: '6' },
    { output: [] },
    { source: new Uint8Array(1) },
    { reference: new Uint8ClampedArray(72) },
    { inkMask: new Uint8Array(18).fill(1) },
    { protectedMask: new Uint8Array(1) },
    { region: { x: 0, y: 0, width: 0, height: 1 } },
    { region: { x: 0.5, y: 0, width: 1, height: 1 } },
    { region: { x: 6, y: 0, width: 1, height: 1 } },
    { thresholds: { repeatNoise: Infinity } },
    { thresholds: { repeatNoise: -1 } },
    { thresholds: { regressionTolerance: NaN } },
    { fragments: [{ ...args.fragments[0], rects: [{ x: 0, y: 0, width: Infinity, height: 1 }] }] },
    { fragments: [args.fragments[0], args.fragments[0]] },
  ])
    oracleError(() => evaluateRaster({ ...args, ...change }));
  oracleError(() => evaluateRaster(null));
});
test('invalid reference pairs and missing fragment localization cannot produce successful quality', () => {
  const args = fixture(),
    mismatched = args.reference.slice();
  mismatched[0] = 0;
  oracleError(() => evaluateRaster({ ...args, reference: mismatched }));
  oracleError(() => evaluateRaster({ ...args, inkMask: new Uint8Array(18) }));
  oracleError(() => evaluateRaster({ ...args, source: args.reference }));
  oracleError(() => evaluateRaster({ ...args, fragments: [] }));
});
