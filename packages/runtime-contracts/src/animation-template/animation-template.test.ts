import { expect, it, vi } from 'vitest';
import {
  parseAnimationTemplateJson,
  validateAnimationTemplate,
  isAnimationResourcePath,
  verifyAnimationResource,
  ANIMATION_TEMPLATE_LIMITS,
  listAnimationTemplateSlots,
} from './index.js';

function fixture() {
  return {
    format: 'sniptale-animation',
    version: 1,
    id: 'caption',
    label: { en: 'Caption', ru: 'Подпись' },
    controls: [{ id: 'title', kind: 'text', defaultValue: 'Текст', group: 'content' }],
    resources: [],
    bindings: [{ kind: 'text', slot: 'title', control: 'title' }],
    animation: {
      v: '5.12.2',
      fr: 30,
      ip: 0,
      op: 60,
      w: 320,
      h: 180,
      ddd: 0,
      assets: [],
      layers: [],
      slots: { title: { p: { a: 0, k: [{ t: 0, s: { t: 'Текст', f: 'Golos', s: 28 } }] } } },
    },
  };
}
it('admits an independent snapshot with a typed text slot and exact source frame interval', async () => {
  const input = fixture();
  const result = validateAnimationTemplate(input);
  expect(result.diagnostics).toEqual([]);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.template).toEqual(input);
  expect(result.template.animation).not.toBe(input.animation);
  input.animation.op = 120;
  expect(result.template.animation['op']).toBe(60);
  expect((await parseAnimationTemplateJson(JSON.stringify(fixture()))).ok).toBe(true);
});
it('rejects incompatible metadata, slot types, duplicates, expressions and external resources', () => {
  const source = fixture();
  for (const value of [
    { ...source, version: 2 },
    { ...source, program: [] },
    { ...source, bindings: [{ kind: 'scalar', slot: 'title', control: 'title' }] },
    { ...source, bindings: [...source.bindings, ...source.bindings] },
    { ...source, animation: { ...source.animation, w: 0 } },
    { ...source, animation: { ...source.animation, fr: 0 } },
    { ...source, animation: { ...source.animation, ip: 60, op: 60 } },
    { ...source, animation: { ...source.animation, layers: [{ ty: 6 }] } },
    { ...source, animation: { ...source.animation, arbitrary: { a: 1, x: 'fetch()' } } },
    {
      ...source,
      animation: { ...source.animation, assets: [{ id: 'image', p: 'https://example.com/a.png' }] },
    },
    { ...source, animation: { ...source.animation, stateMachines: [] } },
    {
      ...source,
      animation: {
        ...source.animation,
        fonts: { list: [{ fPath: 'https://example.com/font.ttf' }] },
      },
    },
  ])
    expect(validateAnimationTemplate(value).ok, JSON.stringify(value)).toBe(false);
});
it('bounds trees before schema evaluation and never invokes accessor input', async () => {
  let invoked = false;
  const input = fixture();
  Object.defineProperty(input.animation, 'evil', {
    get() {
      invoked = true;
      throw new Error('accessor');
    },
    enumerable: true,
  });
  expect(validateAnimationTemplate(input).ok).toBe(false);
  expect(invoked).toBe(false);
  const cyclic: Record<string, unknown> = {};
  cyclic['self'] = cyclic;
  expect(validateAnimationTemplate(cyclic).ok).toBe(false);
  expect(
    validateAnimationTemplate({
      ...fixture(),
      animation: {
        ...fixture().animation,
        giant: 'a'.repeat(ANIMATION_TEMPLATE_LIMITS.stringCharacters + 1),
      },
    }).ok
  ).toBe(false);
  expect((await parseAnimationTemplateJson('{')).ok).toBe(false);
  expect(
    (await parseAnimationTemplateJson(' '.repeat(ANIMATION_TEMPLATE_LIMITS.jsonBytes + 1))).ok
  ).toBe(false);
});
it('requires canonical package paths and verifies decoded sizes, file signatures and digests', async () => {
  for (const path of [
    '../font.ttf',
    '/font.ttf',
    'a//b',
    'a/./b',
    'a\\b',
    'https://example.com',
    'a%2fb',
    'a?b',
  ])
    expect(isAnimationResourcePath(path)).toBe(false);
  expect(isAnimationResourcePath('fonts/Golos.ttf')).toBe(true);
  const bytes = Uint8Array.from([0, 1, 0, 0, 1, 2, 3, 4]);
  const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
  const resource = {
    path: 'fonts/Golos.ttf',
    mimeType: 'font/ttf' as const,
    byteLength: 8,
    sha256,
    base64: btoa(String.fromCharCode(...bytes)),
  };
  expect(await verifyAnimationResource(resource)).toBe(true);
  expect(await verifyAnimationResource({ ...resource, byteLength: 9 })).toBe(false);
  expect(await verifyAnimationResource({ ...resource, sha256: '0'.repeat(64) })).toBe(false);
  expect(await verifyAnimationResource({ ...resource, mimeType: 'image/png' })).toBe(false);
});

it('reflows Cyrillic, long words and padding while keeping source text and pointer controls intact', async () => {
  const { layoutAnimationText } = await import('./index.js');
  const input = {
    text: 'Длинная кириллическая подпись\nСверхдлинноесловобезпробелов',
    width: 240,
    fontSize: 32,
    minFontSize: 8,
    padding: 12,
    lineHeight: 1.2,
    maxLines: 4,
    measure: (text: string, size: number) => Array.from(text).length * size * 0.6,
  };
  const output = layoutAnimationText(input);
  expect(output.lines.length).toBeLessThanOrEqual(4);
  expect(output.fontSize).toBeLessThan(32);
  expect(output.height).toBe(output.lines.length * output.fontSize * 1.2 + 24);
  expect(output.lines.every((line) => input.measure(line, output.fontSize) <= 216)).toBe(true);
  expect(input.text).toContain('\nСверхдлинноесловобезпробелов');
  expect(() => layoutAnimationText({ ...input, width: 20 })).toThrow('Invalid');
  expect(() => layoutAnimationText({ ...input, width: 25, maxLines: 1 })).toThrow('minimum');
});

it('refuses unresolved sources and cyclic layer or precomposition references before runtime loading', () => {
  const base = fixture();
  for (const animation of [
    { ...base.animation, layers: [{ ty: 0, ind: 1, refId: 'missing' }] },
    { ...base.animation, layers: [{ ty: 2, ind: 1, refId: 'missing' }] },
    {
      ...base.animation,
      layers: [
        { ty: 3, ind: 1, parent: 2 },
        { ty: 3, ind: 2, parent: 1 },
      ],
    },
    {
      ...base.animation,
      layers: [
        { ty: 3, ind: 1 },
        { ty: 3, ind: 1 },
      ],
    },
    {
      ...base.animation,
      assets: [
        { id: 'a', layers: [{ ty: 0, ind: 1, refId: 'b' }] },
        { id: 'b', layers: [{ ty: 0, ind: 1, refId: 'a' }] },
      ],
    },
  ])
    expect(validateAnimationTemplate({ ...base, animation }).ok).toBe(false);
});

it(
  'uses the same authored plane for body placement, inverse pointer ' +
    'mapping and negative external raster bounds',
  async () => {
    const { resolveAnimationObjectRenderBounds, mapAnimationScenePoint, mapAnimationObjectPoint } =
      await import('./index.js');
    const result = validateAnimationTemplate(fixture());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const template = {
      ...result.template,
      objectLayout: {
        handles: [{ id: 'tip', label: { en: 'Tip' }, xControl: 'x', yControl: 'y', padding: 16 }],
      },
    };
    expect(resolveAnimationObjectRenderBounds(template, { x: -50, y: 200 })).toEqual({
      x: -66,
      y: 0,
      width: 386,
      height: 216,
    });
    const placement = { x: 100, y: 80, width: 640, height: 360, rotation: 0.7 };
    const point = { x: -50, y: 200 };
    const scene = mapAnimationObjectPoint(template, placement, point);
    const local = mapAnimationScenePoint(template, placement, scene);
    expect(local.x).toBeCloseTo(point.x, 9);
    expect(local.y).toBeCloseTo(point.y, 9);
  }
);

it('keeps the pointer tip fixed as the box grows and hides an internal pointer', async () => {
  const { layoutAnimationPointer } = await import('./index.js');
  const tip = { x: 400, y: -50 };
  for (const box of [
    { width: 100, height: 60 },
    { width: 240, height: 120 },
  ]) {
    const result = layoutAnimationPointer(box, tip, 20);
    const angle = ((result.rotation + 90) * Math.PI) / 180;
    expect(result.position.x + (Math.cos(angle) * result.scale.y) / 100).toBeCloseTo(tip.x, 9);
    expect(result.position.y + (Math.sin(angle) * result.scale.y) / 100).toBeCloseTo(tip.y, 9);
    expect(result.position.x).toBeGreaterThanOrEqual(0);
    expect(result.position.x).toBeLessThanOrEqual(box.width);
    expect(result.position.y).toBeGreaterThanOrEqual(0);
    expect(result.position.y).toBeLessThanOrEqual(box.height);
  }
  expect(layoutAnimationPointer({ width: 100, height: 60 }, { x: 50, y: 30 }, 20).scale).toEqual({
    x: 0,
    y: 0,
  });
});

it('rejects unresolved or conflicting reflow outputs and requires a bounded pointer handle', () => {
  const base = fixture();
  const template = {
    ...base,
    controls: [
      ...base.controls,
      { id: 'fontSize', kind: 'number', defaultValue: 28, min: 8, max: 72 },
      { id: 'width', kind: 'number', defaultValue: 200, min: 40, max: 320 },
      { id: 'x', kind: 'number', defaultValue: 360, min: -1000, max: 1000 },
      { id: 'y', kind: 'number', defaultValue: 90, min: -1000, max: 1000 },
    ],
    resources: [
      {
        path: 'font.ttf',
        fontFamily: 'Golos',
        mimeType: 'font/ttf',
        byteLength: 8,
        base64: 'AAEAAAECAwQ=',
        sha256: '0'.repeat(64),
      },
    ],
    animation: {
      ...base.animation,
      slots: {
        ...base.animation.slots,
        size: { p: { a: 0, k: [100, 50] } },
        box: { p: { a: 0, k: [50, 25] } },
        text: { p: { a: 0, k: [12, 40] } },
        point: { p: { a: 0, k: [100, 50] } },
        scale: { p: { a: 0, k: [100, 100] } },
        rotation: { p: { a: 0, k: 0 } },
      },
    },
    objectLayout: {
      handles: [{ id: 'tip', label: { en: 'Tip' }, xControl: 'x', yControl: 'y', padding: 16 }],
      reflow: {
        kind: 'callout',
        textControl: 'title',
        fontResource: 'font.ttf',
        fontSizeControl: 'fontSize',
        widthControl: 'width',
        padding: 12,
        minFontSize: 8,
        lineHeight: 1.2,
        maxLines: 4,
        textSlot: 'title',
        boxSizeSlot: 'size',
        boxPositionSlot: 'box',
        textPositionSlot: 'text',
        tip: { xControl: 'x', yControl: 'y' },
        pointer: { positionSlot: 'point', scaleSlot: 'scale', rotationSlot: 'rotation', width: 16 },
      },
    },
  };
  expect(validateAnimationTemplate(template).ok).toBe(true);
  const reflow = template.objectLayout.reflow;
  for (const replacement of [
    { ...reflow, boxPositionSlot: 'missing' },
    { ...reflow, boxPositionSlot: 'size' },
    { ...reflow, tip: undefined },
    { ...reflow, pointer: { ...reflow.pointer, rotationSlot: 'point' } },
  ])
    expect(
      validateAnimationTemplate({
        ...template,
        objectLayout: { ...template.objectLayout, reflow: replacement },
      }).ok
    ).toBe(false);
  expect(
    validateAnimationTemplate({
      ...template,
      objectLayout: { ...template.objectLayout, handles: [] },
    }).ok
  ).toBe(false);
});

it('keeps arrow endpoints exact for horizontal, vertical, reversed and coincident handles', async () => {
  const { layoutAnimationArrow } = await import('./index.js');
  const start = { x: -50, y: 90 };
  for (const end of [{ x: 400, y: 90 }, { x: -50, y: -200 }, { x: -400, y: 200 }, start]) {
    const geometry = layoutAnimationArrow(start, end, 12);
    const distance = geometry.headPosition.y + geometry.headScale.y / 100;
    const angle = ((geometry.rotation + 90) * Math.PI) / 180;
    expect(geometry.position.x + Math.cos(angle) * distance).toBeCloseTo(end.x, 9);
    expect(geometry.position.y + Math.sin(angle) * distance).toBeCloseTo(end.y, 9);
    expect(geometry.shaftScale.y).toBeGreaterThanOrEqual(0);
  }
  expect(layoutAnimationArrow(start, start, 12).headScale).toEqual({ x: 0, y: 0 });
  expect(() => layoutAnimationArrow(start, { x: NaN, y: 0 }, 12)).toThrow('invalid');
});

it('admits only complete arrow slot ownership with bounded endpoints and enough head padding', () => {
  const base = fixture();
  const input = {
    ...base,
    controls: [
      ...base.controls,
      ...['sx', 'sy', 'ex', 'ey'].map((id) => ({
        id,
        kind: 'number',
        defaultValue: 0,
        min: -1000,
        max: 1000,
      })),
      { id: 'width', kind: 'number', defaultValue: 10, min: 1, max: 64 },
    ],
    animation: {
      ...base.animation,
      slots: {
        ...base.animation.slots,
        position: { p: { a: 0, k: [0, 0] } },
        rotation: { p: { a: 0, k: 0 } },
        shaft: { p: { a: 0, k: [1000, 10000] } },
        headPosition: { p: { a: 0, k: [0, 100] } },
        headScale: { p: { a: 0, k: [3000, 4000] } },
      },
    },
    objectLayout: {
      handles: [
        { id: 'start', label: { en: 'Start' }, xControl: 'sx', yControl: 'sy', padding: 96 },
        { id: 'end', label: { en: 'End' }, xControl: 'ex', yControl: 'ey', padding: 96 },
      ],
      arrow: {
        start: { xControl: 'sx', yControl: 'sy' },
        end: { xControl: 'ex', yControl: 'ey' },
        widthControl: 'width',
        positionSlot: 'position',
        rotationSlot: 'rotation',
        shaftScaleSlot: 'shaft',
        headPositionSlot: 'headPosition',
        headScaleSlot: 'headScale',
      },
    },
  };
  const admitted = validateAnimationTemplate(input);
  expect(admitted.ok).toBe(true);
  if (!admitted.ok) throw new Error('Arrow fixture refused');
  expect(
    listAnimationTemplateSlots(admitted.template).map((slot) => [slot.id, slot.unavailable])
  ).toEqual([
    ['title', 'bound'],
    ['position', 'layout'],
    ['rotation', 'layout'],
    ['shaft', 'layout'],
    ['headPosition', 'layout'],
    ['headScale', 'layout'],
  ]);
  expect(
    validateAnimationTemplate({
      ...input,
      objectLayout: { ...input.objectLayout, handles: input.objectLayout.handles.slice(0, 1) },
    }).ok
  ).toBe(false);
  expect(
    validateAnimationTemplate({
      ...input,
      objectLayout: {
        ...input.objectLayout,
        handles: input.objectLayout.handles.map((handle) => ({ ...handle, padding: 16 })),
      },
    }).ok
  ).toBe(false);
  expect(
    validateAnimationTemplate({
      ...input,
      objectLayout: {
        ...input.objectLayout,
        arrow: { ...input.objectLayout.arrow, rotationSlot: 'position' },
      },
    }).ok
  ).toBe(false);
  expect(
    validateAnimationTemplate({
      ...input,
      objectLayout: {
        ...input.objectLayout,
        arrow: { ...input.objectLayout.arrow, headScaleSlot: 'headPosition' },
      },
    }).ok
  ).toBe(false);
  expect(
    validateAnimationTemplate({
      ...input,
      bindings: [
        ...input.bindings,
        { kind: 'vector', slot: 'position', xControl: 'sx', yControl: 'sy' },
      ],
    }).ok
  ).toBe(false);
});

it('verifies package resource digests when WebCrypto is unavailable in an opaque-origin Worker', async () => {
  const bytes = Uint8Array.from([0, 1, 0, 0, 1, 2, 3, 4]);
  const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
  const resource = {
    path: 'fonts/proof.ttf',
    mimeType: 'font/ttf' as const,
    byteLength: 8,
    sha256,
    base64: 'AAEAAAECAwQ=',
  };
  vi.stubGlobal('crypto', {});
  try {
    expect(await verifyAnimationResource(resource)).toBe(true);
    expect(await verifyAnimationResource({ ...resource, sha256: '0'.repeat(64) })).toBe(false);
  } finally {
    vi.unstubAllGlobals();
  }
});

it('describes only checked static slots as editable and leaves animated or unsupported values explicit', () => {
  const input = fixture();
  const result = validateAnimationTemplate({
    ...input,
    animation: {
      ...input.animation,
      slots: {
        ...input.animation.slots,
        scalar: { p: { a: 0, k: 0.5 } },
        color: { p: { a: 0, k: [1, 0, 0] } },
        vector: { p: { a: 0, k: [20, 30] } },
        animated: { p: { a: 1, k: [{ t: 0, s: [0] }] } },
        unsupported: { p: { a: 0, k: 'arbitrary' } },
      },
    },
  });
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  const before = structuredClone(result.template);
  expect(listAnimationTemplateSlots(result.template)).toEqual([
    { id: 'title', kind: 'text', value: 'Текст', unavailable: 'bound' },
    { id: 'scalar', kind: 'scalar', value: 0.5, unavailable: null },
    { id: 'color', kind: 'color', value: [1, 0, 0], unavailable: null },
    { id: 'vector', kind: 'vector', value: [20, 30], unavailable: null },
    { id: 'animated', kind: null, value: null, unavailable: 'animated' },
    { id: 'unsupported', kind: null, value: null, unavailable: 'unsupported' },
  ]);
  expect(result.template).toEqual(before);
  expect(
    listAnimationTemplateSlots({
      ...result.template,
      animation: { ...result.template.animation, slots: undefined },
    })
  ).toEqual([]);
});
