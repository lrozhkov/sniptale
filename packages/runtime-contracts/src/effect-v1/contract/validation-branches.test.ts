import { expect, it } from 'vitest';

import { validateEffectV1Assets } from '../asset/validation';
import { validatePathSegments, validatePoints } from '../command/paths';
import {
  validateFilter,
  validateNumericExpression,
  validatePaint,
  validateShadow,
} from '../command/values';
import { createEffectV1Diagnostics } from '../model/diagnostics';
import { validateEffectV1Expression } from '../expression/validation';
import { createEffectV1ReadReferences } from '../graph/model';
import { validateLayerHierarchy } from '../layer/hierarchy';
import {
  isSafeRelativePath,
  isSafeSvg,
  requireIdentifier,
  requirePositiveNumber,
  requireString,
  toRecordArray,
  validateLocaleText,
  validateRange,
} from '../validation/shared';

it('exercises every asset declaration and embedded-content rejection branch', () => {
  const report = createEffectV1Diagnostics();
  const oversized = Array.from({ length: 257 }, () => null);
  validateEffectV1Assets(oversized, report);
  validateEffectV1Assets('invalid', report);
  validateEffectV1Assets(
    [
      { dataUrl: 'bad', id: 'bad', kind: 'video', mimeType: 'video/mp4' },
      {
        byteLength: -1,
        dataUrl: 'data:image/svg+xml;base64,PHN2Zz4=',
        duration: 0,
        height: -1,
        id: 'bad',
        kind: 'svg',
        mimeType: 'image/svg+xml',
        path: '../escape',
        sha256: 'BAD',
        svgText: '<svg onload="x"/>',
        width: Number.NaN,
      },
      { id: 'missing', kind: 'image', mimeType: 'image/png' },
      { id: 'wrong-content', kind: 'image', mimeType: 'image/png', svgText: '<svg/>' },
    ],
    report
  );

  expect(report.diagnostics.map(({ code }) => code)).toEqual(
    expect.arrayContaining([
      'ASSET_BUDGET',
      'ASSET_TYPE',
      'ASSET_KIND',
      'ASSET_MIME',
      'ASSET_ID_DUPLICATE',
      'ASSET_PATH_UNSAFE',
      'ASSET_DATA_URL',
      'ASSET_SVG_UNSAFE',
      'ASSET_SVG_DATA_URL_FORBIDDEN',
      'ASSET_CONTENT_KIND',
      'ASSET_CONTENT_MISSING',
      'ASSET_SHA256',
      'ASSET_BYTE_LENGTH_REQUIRED',
      'ASSET_SHA256_REQUIRED',
    ])
  );
});

it('validates malformed points, segments, filters, shadows, and gradients', () => {
  const report = createEffectV1Diagnostics();
  validatePoints('invalid', '$.points', report);
  validatePoints([null, { x: Number.NaN, z: 1 }], '$.points', report);
  validatePathSegments('invalid', '$.segments', report);
  validatePathSegments([], '$.segments', report);
  validatePathSegments(
    [null, { kind: 'unknown' }, { counterclockwise: 'yes', kind: 'lineTo', x: 0 }],
    '$.segments',
    report
  );
  validateNumericExpression('bad', '$.number', report);
  validateFilter('bad', '$.filter', report);
  validateFilter({ blur: 'bad', typo: 1 }, '$.filter', report);
  validateShadow('bad', '$.shadow', report);
  validateShadow({ blur: 'bad', color: 1, x: 0 }, '$.shadow', report);
  validatePaint(null, '$.paint', report);
  validatePaint({ kind: 'unknown' }, '$.paint', report);
  validatePaint({ kind: 'linearGradient', stops: [] }, '$.paint', report);
  validatePaint(
    {
      kind: 'radialGradient',
      r0: 0,
      r1: 1,
      stops: [null, { color: '#fff', offset: 2 }, { offset: 0 }],
      x0: 0,
      x1: 1,
      y0: 0,
      y1: 1,
    },
    '$.paint',
    report
  );

  expect(report.diagnostics.length).toBeGreaterThan(20);
});

it('covers expression arity, child, field, reference, and depth failures', () => {
  const report = createEffectV1Diagnostics();
  const references = createEffectV1ReadReferences({}, new Set(), {
    controlIds: new Set(),
    layerIds: new Set(),
    trackIds: new Set(),
  });
  for (const expression of [
    Number.NaN,
    [],
    { args: [], op: 'add', typo: true },
    { args: 'bad', op: 'add' },
    { op: 'fallback' },
    { op: 'read', path: '__proto__.x' },
    { op: 'select', value: 0, values: [1] },
  ]) {
    validateEffectV1Expression(expression, '$.expression', 0, report, references);
  }
  validateEffectV1Expression({ args: [1], op: 'abs' }, '$.deep', 33, report, references);

  expect(report.diagnostics.map(({ code }) => code)).toEqual(
    expect.arrayContaining([
      'EXPRESSION_NUMBER',
      'EXPRESSION_OP',
      'EXPRESSION_ARITY',
      'EXPRESSION_ARGS',
      'EXPRESSION_FIELD_REQUIRED',
      'EXPRESSION_SELECT_VALUES',
      'READ_PATH',
      'EXPRESSION_DEPTH',
    ])
  );
});

it('detects unknown parents, non-group parents, cycles, depth, and discontinuous groups', () => {
  const report = createEffectV1Diagnostics();
  const ordered = [
    { id: 'group', type: 'group' },
    { id: 'leaf-a', parentId: 'group', type: 'rect' },
    { id: 'middle', type: 'rect' },
    { id: 'leaf-b', parentId: 'group', type: 'rect' },
    { id: 'unknown', parentId: 'missing', type: 'rect' },
    { id: 'not-group-child', parentId: 'middle', type: 'rect' },
    { id: 'cycle-a', parentId: 'cycle-b', type: 'group' },
    { id: 'cycle-b', parentId: 'cycle-a', type: 'group' },
  ];
  const layers = new Map(ordered.map((layer) => [layer.id, layer]));
  let parentId = 'group';
  for (let index = 0; index < 10; index += 1) {
    const layer = { id: `depth-${index}`, parentId, type: 'group' };
    ordered.push(layer);
    layers.set(layer.id, layer);
    parentId = layer.id;
  }
  validateLayerHierarchy(ordered, layers, report);

  expect(report.diagnostics.map(({ code }) => code)).toEqual(
    expect.arrayContaining([
      'LAYER_PARENT_UNKNOWN',
      'LAYER_PARENT_NOT_GROUP',
      'LAYER_PARENT_CYCLE',
      'LAYER_DEPTH',
      'LAYER_SUBTREE_DISCONTIGUOUS',
    ])
  );
});

it('covers shared scalar, locale, range, path, and SVG boundary helpers', () => {
  const report = createEffectV1Diagnostics();
  expect(toRecordArray([{}, null, []])).toEqual([{}]);
  expect(toRecordArray(null)).toEqual([]);
  expect(requireIdentifier('valid.id', '$.id', report)).toBe(true);
  expect(requireIdentifier('../bad', '$.id', report)).toBe(false);
  expect(requireString('value', '$.value', report)).toBe(true);
  expect(requireString(' ', '$.value', report)).toBe(false);
  expect(requirePositiveNumber(1, '$.number', report)).toBe(true);
  expect(requirePositiveNumber(0, '$.number', report)).toBe(false);
  validateRange('bad', 0, 1, '$.range', report);
  validateRange(1, 1, 1, '$.range', report);
  validateLocaleText(null, '$.label', true, report);
  validateLocaleText({ en: '', ru: '', xx_bad: 1 }, '$.label', true, report);
  expect(isSafeRelativePath('assets/file.png')).toBe(true);
  expect(isSafeRelativePath('/absolute')).toBe(false);
  expect(isSafeRelativePath('C:\\file')).toBe(false);
  expect(isSafeSvg('<svg/>')).toBe(true);
  expect(isSafeSvg('<foreignObject/>')).toBe(false);
  expect(isSafeSvg('<svg href="https://example.test"/>')).toBe(false);
});
