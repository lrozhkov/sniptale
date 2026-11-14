import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  resolveAnimationObjectRenderBounds,
  validateAnimationTemplate,
} from '@sniptale/runtime-contracts/animation-template';
import {
  parseEffectControlValues,
  resolveEffectControlDefault,
} from '@sniptale/runtime-contracts/effect-controls';
import { quickEditPlaneProjection } from '../../composition/motion/spatial-geometry';
import {
  initializeReviewAnnotationEffectAnchors,
  mapReviewAnnotationEffectPoint,
  resolveReviewAnnotationEffectBox,
  resolveReviewAnnotationEffectControls,
  transformReviewAnnotationEffectAttachment,
  transformReviewAnnotationAnchors,
} from './layout';
import type { ReviewAnnotationEffect } from './types';

const plane = { width: 1920, height: 1080 };
const transform = { x: 0.2, y: 0.3, width: 0.3, height: 0.12, rotation: 0.1 };
function builtin(name: string) {
  const raw: unknown = JSON.parse(
    readFileSync(
      name === 'callout'
        ? 'apps/extension/src/features/video/project/effect-bundle/fixtures/retained/callout.sniptale-animation.json'
        : resolve(
            'apps/extension/public/video-effects/animations',
            `${name}.sniptale-animation.json`
          ),
      'utf8'
    )
  );
  const result = validateAnimationTemplate(raw);
  if (!result.ok || !result.template) throw Error('Invalid test fixture');
  return result.template;
}

describe('annotation canonical geometry', () => {
  it.each(['lower-third', 'title', 'chapters', 'callout', 'frame', 'corners', 'arrow'])(
    'uses the declared geometry and controls for %s',
    (name) => {
      const document = builtin(name);
      const controls = Object.fromEntries(
        document.controls.map((c) => [c.id, resolveEffectControlDefault(c, 'ru')])
      );
      const anchors = initializeReviewAnnotationEffectAnchors(document, transform, controls, plane);
      const annotation: ReviewAnnotationEffect = {
        id: 'object',
        snapshotId: 'snapshot',
        enabled: true,
        start: 0,
        end: 4,
        attachment: 'content',
        transform,
        controls,
        ...(anchors ? { anchors } : {}),
        order: 0,
      };
      const resolved = resolveReviewAnnotationEffectControls(document, annotation, plane);
      expect(Object.keys(resolved)).toHaveLength(document.controls.length);
      for (const h of document.objectLayout?.handles ?? []) {
        expect(resolved[h.xControl]).toBeCloseTo(Number(controls[h.xControl]));
        expect(resolved[h.yControl]).toBeCloseTo(Number(controls[h.yControl]));
      }
      expect(resolveAnimationObjectRenderBounds(document, resolved).width).toBeGreaterThan(0);
      expect(resolveReviewAnnotationEffectBox(transform, plane)).toMatchObject({
        x: 384,
        y: 324,
        width: 576,
      });
    }
  );

  it('keeps an external callout tip fixed when the body moves and expands bitmap bounds', () => {
    const document = builtin('callout'),
      h = document.objectLayout!.handles![0]!;
    const controls = Object.fromEntries(
      document.controls.map((c) => [c.id, resolveEffectControlDefault(c, 'en')])
    );
    controls[h.xControl] = document.animation.w * 2;
    controls[h.yControl] = -document.animation.h;
    const anchors = initializeReviewAnnotationEffectAnchors(document, transform, controls, plane)!;
    const instance: ReviewAnnotationEffect = {
      id: 'callout',
      snapshotId: 'snapshot',
      enabled: true,
      start: 0,
      end: 4,
      attachment: 'content',
      transform,
      controls,
      anchors,
      order: 0,
    };
    const moved = { ...instance, transform: { ...transform, x: transform.x + 0.1 } };
    const resolved = resolveReviewAnnotationEffectControls(document, moved, plane);
    expect(moved.anchors).toBe(anchors);
    expect(resolved[h.xControl]).not.toBe(controls[h.xControl]);
    expect(resolveAnimationObjectRenderBounds(document, resolved).width).toBeGreaterThan(
      document.animation.w
    );
    const { anchors: _anchors, ...withoutAnchors } = instance;
    expect(() => resolveReviewAnnotationEffectControls(document, withoutAnchors, plane)).toThrow(
      'Missing annotation anchor'
    );
  });

  it('preserves the body under reversible zoom/translation attachment switching', () => {
    const mapping = [1.5, 0, -100, 0, 1.5, -80, 0, 0, 1] as const;
    const changed = transformReviewAnnotationEffectAttachment(transform, plane, plane, mapping)!;
    const inverse = [2 / 3, 0, 100 / 1.5, 0, 2 / 3, 80 / 1.5, 0, 0, 1] as const;
    const restored = transformReviewAnnotationEffectAttachment(changed, plane, plane, inverse)!;
    for (const key of ['x', 'y', 'width', 'height', 'rotation'] as const)
      expect(restored[key]).toBeCloseTo(transform[key], 10);
    expect(mapReviewAnnotationEffectPoint({ x: 20, y: 30 }, mapping)).toEqual({ x: -70, y: -35 });
    expect(mapReviewAnnotationEffectPoint({ x: -70, y: -35 }, mapping, true)?.x).toBeCloseTo(20);
  });

  it('flattens a projective body while refusing a degenerate mapping', () => {
    const base = { x: 0, y: 0, ...plane };
    const matrix = quickEditPlaneProjection(base, base, {
      rotation: [0, Math.sin(0.2), 0, Math.cos(0.2)],
      perspective: 0.7,
      windowMotion: 1,
      lockBackground: false,
      focus: [],
    });
    expect(
      transformReviewAnnotationEffectAttachment(transform, plane, plane, matrix)
    ).not.toBeNull();
    expect(
      mapReviewAnnotationEffectPoint({ x: 10, y: 10 }, [0, 0, 0, 0, 0, 0, 0, 0, 0], true)
    ).toBeNull();
  });
});

it('preserves projected center and finite-difference local axes rather than a corner midpoint', async () => {
  const { projectQuickEditPoint } = await import('../../composition/motion/spatial-geometry');
  const mapping = [1, 0.2, 70, 0.1, 1, -30, 0.0006, 0.0002, 1] as const;
  const output = { width: 1024, height: 768 };
  const changed = transformReviewAnnotationEffectAttachment(transform, plane, output, mapping)!;
  const box = resolveReviewAnnotationEffectBox(transform, plane);
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const projected = projectQuickEditPoint(mapping, center)!;
  expect((changed.x + changed.width / 2) * output.width).toBeCloseTo(projected.x, 8);
  expect((changed.y + changed.height / 2) * output.height).toBeCloseTo(projected.y, 8);
  const axis = (angle: number, length: number) => {
    const step = 0.001;
    const a = projectQuickEditPoint(mapping, {
      x: center.x - Math.cos(angle) * step,
      y: center.y - Math.sin(angle) * step,
    })!;
    const b = projectQuickEditPoint(mapping, {
      x: center.x + Math.cos(angle) * step,
      y: center.y + Math.sin(angle) * step,
    })!;
    return { x: ((b.x - a.x) * length) / (2 * step), y: ((b.y - a.y) * length) / (2 * step) };
  };
  const u = axis(box.rotation, box.width),
    v = axis(box.rotation + Math.PI / 2, box.height);
  expect(changed.width * output.width).toBeCloseTo(Math.hypot(u.x, u.y), 5);
  expect(changed.height * output.height).toBeCloseTo(Math.hypot(v.x, v.y), 5);
  expect(changed.rotation).toBeCloseTo(Math.atan2(u.y, u.x), 8);
  const corner = (sign: number) =>
    projectQuickEditPoint(mapping, {
      x:
        center.x +
        (sign * (box.width * Math.cos(box.rotation) - box.height * Math.sin(box.rotation))) / 2,
      y:
        center.y +
        (sign * (box.width * Math.sin(box.rotation) + box.height * Math.cos(box.rotation))) / 2,
    })!;
  const a = corner(-1),
    b = corner(1);
  expect(Math.hypot((a.x + b.x) / 2 - projected.x, (a.y + b.y) / 2 - projected.y)).toBeGreaterThan(
    1
  );
});

it.each([
  ['singular', [0, 0, 0, 0, 0, 0, 0, 0, 1]],
  ['reflected', [-1, 0, 0, 0, 1, 0, 0, 0, 1]],
  ['behind-camera', [1, 0, 0, 0, 1, 0, 0, 0, -1]],
  ['non-finite', [NaN, 0, 0, 0, 1, 0, 0, 0, 1]],
  ['outside-bounds', [1e9, 0, 0, 0, 1e9, 0, 0, 0, 1]],
] as const)('rejects %s without clamping or manufacturing a flattened body', (_reason, mapping) => {
  expect(transformReviewAnnotationEffectAttachment(transform, plane, plane, mapping)).toBeNull();
});

it('carries all arrow anchors through whole-object transforms without changing local controls', () => {
  const document = builtin('arrow');
  const controls = Object.fromEntries(
    document.controls.map((control) => [control.id, resolveEffectControlDefault(control, 'en')])
  );
  const anchors = initializeReviewAnnotationEffectAnchors(document, transform, controls, plane);
  if (!anchors) throw new Error('Arrow anchors unavailable');
  const original: ReviewAnnotationEffect = {
    id: 'arrow',
    snapshotId: 'source',
    enabled: true,
    start: 0,
    end: 5,
    order: 0,
    attachment: 'content',
    transform,
    controls,
    anchors,
  };
  const serialized = JSON.stringify(original);
  const before = resolveReviewAnnotationEffectControls(document, original, plane);
  for (const next of [
    { ...transform, x: transform.x + 0.1, y: transform.y - 0.05 },
    { ...transform, width: transform.width * 1.4, height: transform.height * 1.4 },
    { ...transform, rotation: transform.rotation + 0.8 },
  ]) {
    const moved = transformReviewAnnotationAnchors(original, next, plane);
    if (!moved) throw new Error('Transformed anchors unavailable');
    const values = resolveReviewAnnotationEffectControls(
      document,
      { ...original, transform: next, anchors: moved },
      plane
    );
    for (const handle of document.objectLayout?.handles ?? []) {
      expect(values[handle.xControl]).toBeCloseTo(Number(before[handle.xControl]), 8);
      expect(values[handle.yControl]).toBeCloseTo(Number(before[handle.yControl]), 8);
    }
  }
  expect(JSON.stringify(original)).toBe(serialized);
});

it.each(['leader-labels', 'arrow'])(
  'keeps the attached %s label outside the authored artboard',
  (name) => {
    const document = builtin(name);
    const controls = Object.fromEntries(
      document.controls.map((c) => [c.id, resolveEffectControlDefault(c, 'ru')])
    );
    const binding = document.bindings.find(
      (b) => b.kind === 'vector' && b.slot === 'labelPosition'
    );
    if (binding?.kind !== 'vector') throw new Error('Missing label fixture binding');
    controls[binding.xControl] = 950;
    controls[binding.yControl] = -400;
    controls['title'] = 'Подпись полностью за пределами исходного холста';
    const bounds = resolveAnimationObjectRenderBounds(document, controls);
    // The old fixed 96px handle padding cuts both this text and the arrow label panel.
    expect(bounds.x + bounds.width).toBeGreaterThan(1200);
    expect(bounds.y).toBeLessThan(-420);
    expect(bounds.y + bounds.height).toBeGreaterThanOrEqual(document.animation.h);
    const unchanged = resolveAnimationObjectRenderBounds(document, { ...controls });
    expect(unchanged).toEqual(bounds);
  }
);

it('recovers persisted arrow anchors outside template controls without rewriting them', () => {
  const document = builtin('arrow'),
    controls = Object.fromEntries(
      document.controls.map((c) => [c.id, resolveEffectControlDefault(c, 'en')])
    );
  const anchors = initializeReviewAnnotationEffectAnchors(document, transform, controls, plane)!;
  const instance: ReviewAnnotationEffect = {
    id: 'legacy-arrow',
    snapshotId: 'snapshot',
    enabled: true,
    start: 130,
    end: 140,
    attachment: 'content',
    transform,
    controls,
    anchors: { ...anchors, start: { x: 8, y: -8 } },
    order: 0,
  };
  const before = structuredClone(instance);
  const resolved = resolveReviewAnnotationEffectControls(document, instance, plane);
  expect(parseEffectControlValues(document, resolved)).not.toBeNull();
  expect(instance).toEqual(before);
});
