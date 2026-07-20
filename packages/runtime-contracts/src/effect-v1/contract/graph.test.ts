import { expect, it } from 'vitest';

import {
  normalizeEffectV1ToTemplate,
  parseEffectV1Source,
  validateEffectV1Document,
  type EffectV1Command,
} from '../index';
import { createEffectV1TestDocument, validationCodes } from './test-support';

it('rejects executable legacy fields and malformed strict JSON', () => {
  const document = Object.assign(createEffectV1TestDocument(), {
    engineVersion: '2.0-prototype',
    renderer: { kind: 'compiled-js', source: 'alert(1)' },
  });

  expect(validationCodes(document)).toEqual(
    expect.arrayContaining(['EXECUTABLE_FIELD_FORBIDDEN', 'UNKNOWN_FIELD'])
  );
  expect(parseEffectV1Source("{ schemaVersion: 'sniptale.effect.v1' }")).toMatchObject({
    diagnostics: [expect.objectContaining({ code: 'JSON_INVALID', path: '$' })],
    ok: false,
  });
  expect(parseEffectV1Source('[]').ok).toBe(false);
});

it('blocks unbounded work, expression cycles, and undeclared graph references', () => {
  const document = createEffectV1TestDocument();
  document.program = {
    commands: [
      {
        commands: [{ color: '#000', op: 'clear' }],
        count: 2,
        indexVar: 'i',
        op: 'forRange',
      },
      {
        fill: { op: 'read', path: 'controls.missing' },
        height: { op: 'read', path: 'input.source' },
        layerId: 'missing-layer',
        op: 'shape',
        shape: 'rect',
        width: { op: 'read', path: 'tracks.missing' },
        x: { op: 'read', path: 'defs.missing' },
        y: 0,
      },
    ],
    definitions: {
      a: { op: 'read', path: 'defs.b' },
      b: { op: 'read', path: 'defs.a' },
    },
    kind: 'graph',
    version: 1,
  };
  Object.assign(document.program.commands[0]!, { count: { op: 'read', path: 'width' } });

  expect(validationCodes(document)).toEqual(
    expect.arrayContaining([
      'LOOP_BOUND',
      'DEFINITION_CYCLE',
      'COMMAND_LAYER_UNKNOWN',
      'READ_REFERENCE_UNKNOWN',
    ])
  );
});

it('validates every bounded path segment and rejects open command bags', () => {
  const document = createEffectV1TestDocument();
  const path: EffectV1Command = {
    fill: '#fff',
    op: 'path',
    segments: [
      { kind: 'moveTo', x: 0, y: 0 },
      { kind: 'lineTo', x: 1, y: 1 },
      { cpx: 2, cpy: 1, kind: 'quadraticTo', x: 2, y: 2 },
      { cp1x: 2, cp1y: 2, cp2x: 3, cp2y: 3, kind: 'cubicTo', x: 4, y: 4 },
      { centerX: 4, centerY: 4, end: 1, kind: 'arc', radius: 2, start: 0 },
      {
        centerX: 4,
        centerY: 4,
        end: 1,
        kind: 'ellipse',
        radiusX: 2,
        radiusY: 1,
        rotation: 0,
        start: 0,
      },
      { height: 2, kind: 'rect', width: 2, x: 0, y: 0 },
      { height: 2, kind: 'roundRect', radius: 1, width: 2, x: 0, y: 0 },
    ],
  };
  document.program.commands = [path];
  expect(validateEffectV1Document(document).ok).toBe(true);

  Object.assign(path, { points: [{ x: 0, y: 0 }] });
  Object.assign(path.segments![1]!, { typo: 1 });
  expect(validationCodes(document)).toEqual(
    expect.arrayContaining(['COMMAND_PATH_SOURCE', 'COMMAND_POINTS_SHORT', 'UNKNOWN_FIELD'])
  );
});

it('traverses the complete declarative command and expression surface', () => {
  const document = createEffectV1TestDocument();
  document.kind = 'transition';
  document.program.definitions = {
    opacity: { args: [0, 1, 0.5], op: 'mix' },
  };
  document.program.commands = createCommandSurface();

  const result = validateEffectV1Document(document);
  expect(result.diagnostics.map(({ code }) => code)).not.toContain('COMMAND_OP');
  expect(result.diagnostics.map(({ code }) => code)).not.toContain('EXPRESSION_OP');
});

it.each([
  ['standalone', 'composition', 'scene'],
  ['targetEffect', 'layerEffect', 'selectedTarget'],
  ['transition', 'transitionEffect', 'transitionBoundary'],
] as const)('normalizes %s without sharing mutable author state', (kind, expectedKind, target) => {
  const document = createEffectV1TestDocument();
  document.kind = kind;
  document.assets = [
    {
      byteLength: 1,
      id: 'image',
      kind: 'image',
      mimeType: 'image/png',
      path: 'assets/image.png',
      sha256: 'a'.repeat(64),
    },
  ];
  document.presets = [{ id: 'default', label: { en: 'Default' }, values: {} }];
  const normalized = normalizeEffectV1ToTemplate(document);

  expect(normalized).toMatchObject({ assets: ['image'], kind: expectedKind, target });
  expect(normalized.effectV1).not.toBe(document);
  expect(normalized.layers).not.toBe(document.layers);
});

function createCommandSurface(): EffectV1Command[] {
  return [
    { color: '#000', op: 'clear' },
    { fill: '#fff', height: 2, op: 'fillRect', width: 2, x: 0, y: 0 },
    { fill: '#fff', height: 2, op: 'shape', shape: 'ellipse', width: 2, x: 0, y: 0 },
    { fill: '#fff', fontSize: 12, op: 'text', text: 'text', x: 0, y: 0 },
    { height: 2, input: 'from', op: 'image', width: 2, x: 0, y: 0 },
    {
      commands: [{ color: '#fff', op: 'clear' }],
      count: 2,
      indexVar: 'i',
      op: 'forRange',
    },
    { commands: [{ color: '#fff', op: 'clear' }], op: 'group' },
    {
      from: 0,
      op: 'sampledPath',
      samples: 2,
      stroke: '#fff',
      to: 1,
      x: { op: 'read', path: 'vars.sample' },
      y: { args: [{ op: 'read', path: 'vars.sample' }], op: 'add' },
    },
    {
      commands: [{ color: '#fff', op: 'clear' }],
      height: 2,
      id: 'pass',
      op: 'renderPass',
      width: 2,
    },
    { op: 'compositePass', passId: 'pass' },
  ];
}
