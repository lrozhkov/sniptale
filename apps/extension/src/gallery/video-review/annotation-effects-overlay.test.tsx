// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { resolveEffectV1ControlDefault } from '@sniptale/runtime-contracts/effect-v1';
import { readReviewAnnotationEffectDocument } from '../../features/video/review/annotation-effects/validation';
import { initializeReviewAnnotationEffectAnchors } from '../../features/video/review/annotation-effects/layout';
import type { ReviewAnnotationEffect } from '../../features/video/review/annotation-effects/types';
import {
  createReviewAnnotationGeometry,
  reviewAnnotationBodyGeometry,
} from './annotation-effects-geometry';
import {
  ReviewAnnotationOverlay,
  type ReviewAnnotationEditing,
} from './annotation-effects-overlay';

let root: Root;
let host: HTMLDivElement;
const source = { width: 640, height: 360 };
const geometry = createReviewAnnotationGeometry({
  source,
  output: { width: 1280, height: 720 },
  background: { enabled: false },
  camera: { scale: 2, centerX: 0.5, centerY: 0.5 },
})!;
function fixture(name = 'callout', attachment: ReviewAnnotationEffect['attachment'] = 'content') {
  const text = readFileSync(
    `apps/extension/public/video-effects/effects/annotations/sniptale-${name}/effect.sniptale-effect.json`,
    'utf8'
  );
  const document = readReviewAnnotationEffectDocument(text)!;
  const transform = { x: 0.3, y: 0.3, width: 0.4, height: 0.2, rotation: 0 };
  const controls = Object.fromEntries(
    document.controls.map((control) => [control.id, resolveEffectV1ControlDefault(control, 'en')])
  );
  const anchors = initializeReviewAnnotationEffectAnchors(
    document,
    transform,
    controls,
    geometry[attachment]
  );
  const bound = new Set(
    document.objectLayout?.handles?.flatMap((item) => [item.xControl, item.yControl])
  );
  const instance: ReviewAnnotationEffect = {
    id: 'selected',
    snapshotId: 'immutable',
    start: 0,
    end: 4,
    enabled: false,
    attachment,
    transform,
    controls: Object.fromEntries(Object.entries(controls).filter(([id]) => !bound.has(id))),
    ...(anchors ? { anchors } : {}),
    order: 0,
  };
  const lane = { enabled: false, instances: [instance] };
  const binding: ReviewAnnotationEditing = {
    editor: {
      lane,
      previewLane: lane,
      geometry,
      gestureId: null,
      setGeometry: vi.fn(),
      pending: false,
      failure: null,
      add: vi.fn(),
      change: vi.fn(),
      enabled: vi.fn(),
      remove: vi.fn(),
      duplicate: vi.fn(),
      beginGesture: vi.fn(() => true),
      previewGesture: vi.fn(),
      cancelGesture: vi.fn(),
      commitGesture: vi.fn(async () => true),
      hasPending: vi.fn(() => false),
      flush: vi.fn(async () => undefined),
      retry: vi.fn(),
    },
    selectedId: instance.id,
    snapshots: [
      {
        id: 'immutable',
        schemaVersion: 'sniptale.effect.v1',
        kind: 'standalone',
        documentId: document.id,
        sha256: '0'.repeat(64),
        retainedByteLength: new TextEncoder().encode(text).length,
        source: text,
        assets: [],
      },
    ],
    segments: [
      { kind: 'keep', sourceStart: 0, sourceEnd: 4, resultStart: 0, resultEnd: 4, rate: 1 },
    ],
    time: 1,
    busy: false,
    onSelect: vi.fn(),
  };
  return { binding, instance, document };
}
function render(binding: ReviewAnnotationEditing) {
  act(() =>
    root.render(
      <ReviewAnnotationOverlay
        binding={binding}
        geometry={geometry}
        size={{ width: 320, height: 100 }}
      />
    )
  );
  const svg = host.querySelector('svg')!;
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    width: 320,
    height: 100,
    right: 320,
    bottom: 100,
    toJSON: () => ({}),
  });
  return svg;
}
function pointer(node: Element, type: string, x: number, y: number) {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y });
  Object.defineProperty(event, 'pointerId', { value: 7 });
  act(() => node.dispatchEvent(event));
}
function move(
  binding: ReviewAnnotationEditing,
  selector = '[data-annotation-id]',
  dx = 20,
  dy = 20
) {
  const svg = render(binding);
  const target = host.querySelector(selector)!;
  pointer(target, 'pointerdown', 100, 30);
  pointer(svg, 'pointermove', 100 + dx, 30 + dy);
  pointer(svg, 'pointerup', 100 + dx, 30 + dy);
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('PointerEvent', MouseEvent);
  Object.defineProperties(Element.prototype, {
    setPointerCapture: { configurable: true, value: vi.fn() },
    hasPointerCapture: { configurable: true, value: () => true },
    releasePointerCapture: { configurable: true, value: vi.fn() },
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  Reflect.deleteProperty(Element.prototype, 'setPointerCapture');
  Reflect.deleteProperty(Element.prototype, 'hasPointerCapture');
  Reflect.deleteProperty(Element.prototype, 'releasePointerCapture');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('moves muted content through the inverse zoom using both actual CSS dimensions, preserving fixed anchors', () => {
  const { binding, instance } = fixture();
  move(binding);
  const patch = vi.mocked(binding.editor.previewGesture).mock.lastCall?.[0];
  expect(patch?.transform?.x).toBeCloseTo(instance.transform.x + 20 / 640);
  expect(patch?.transform?.y).toBeCloseTo(instance.transform.y + 36 / 360);
  expect(patch?.anchors).toBeUndefined();
  expect(binding.editor.commitGesture).toHaveBeenCalledOnce();
  expect(binding.editor.change).not.toHaveBeenCalled();
  expect(host.querySelector('g[clip-path]')).not.toBeNull();
});

it('keeps viewport move independent of camera zoom and window clipping', () => {
  const { binding, instance } = fixture('title', 'viewport');
  move(binding);
  const patch = vi.mocked(binding.editor.previewGesture).mock.lastCall?.[0];
  expect(patch?.transform?.x).toBeCloseTo(instance.transform.x + 20 / 320);
  expect(patch?.transform?.y).toBeCloseTo(instance.transform.y + 20 / 100);
  expect(host.querySelector('g[clip-path]')).toBeNull();
});

it('holds completed pointer motion behind note admission and ignores normal capture release', () => {
  const { binding } = fixture();
  let admitted: (() => void) | undefined;
  binding.beforeAction = (action) => {
    admitted = action;
  };
  const svg = render(binding);
  const target = host.querySelector('[data-annotation-id]')!;
  pointer(target, 'pointerdown', 100, 30);
  pointer(svg, 'pointermove', 120, 50);
  pointer(svg, 'pointerup', 120, 50);
  pointer(svg, 'lostpointercapture', 120, 50);
  expect(binding.editor.beginGesture).not.toHaveBeenCalled();
  expect(binding.editor.previewGesture).not.toHaveBeenCalled();
  expect(binding.editor.commitGesture).not.toHaveBeenCalled();
  act(() => admitted?.());
  expect(binding.editor.beginGesture).toHaveBeenCalledOnce();
  expect(binding.editor.commitGesture).toHaveBeenCalledOnce();
});

it.each(['Escape', 'pointercancel', 'lostpointercapture'])(
  'cancels %s without a history command',
  (reason) => {
    const { binding } = fixture();
    const svg = render(binding);
    pointer(host.querySelector('[data-annotation-id]')!, 'pointerdown', 100, 30);
    pointer(svg, 'pointermove', 110, 35);
    if (reason === 'Escape')
      act(() =>
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      );
    else pointer(svg, reason, 110, 35);
    pointer(svg, 'pointerup', 110, 35);
    expect(binding.editor.cancelGesture).toHaveBeenCalledOnce();
    expect(binding.editor.commitGesture).not.toHaveBeenCalled();
  }
);

it('cancels held admission on unmount and rejects late completion', () => {
  const { binding } = fixture();
  let admitted: (() => void) | undefined;
  binding.beforeAction = (action) => {
    admitted = action;
  };
  const svg = render(binding);
  pointer(host.querySelector('[data-annotation-id]')!, 'pointerdown', 100, 30);
  pointer(svg, 'pointerup', 110, 35);
  act(() => root.render(null));
  act(() => admitted?.());
  expect(binding.editor.beginGesture).not.toHaveBeenCalled();
  expect(binding.editor.commitGesture).not.toHaveBeenCalled();
});

it('moves only a fixed tip and supports keyboard body, resize and rotation commands', () => {
  const { binding, instance, document } = fixture();
  const id = document.objectLayout!.handles![0]!.id;
  move(binding, `[data-handle="${id}"]`);
  const patch = vi.mocked(binding.editor.previewGesture).mock.lastCall?.[0];
  expect(patch?.anchors?.[id]).not.toEqual(instance.anchors?.[id]);
  expect(patch?.transform).toBeUndefined();
  vi.mocked(binding.editor.commitGesture).mockClear();
  const body = host.querySelector('[data-annotation-id]')!;
  act(() => body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
  expect(vi.mocked(binding.editor.previewGesture).mock.lastCall?.[0]?.transform?.x).toBeCloseTo(
    instance.transform.x + 1 / source.width
  );
  const resize = host.querySelector('[data-handle="resize"]')!;
  act(() =>
    resize.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  );
  const resized = vi.mocked(binding.editor.previewGesture).mock.lastCall?.[0]?.transform;
  if (!resized) throw new Error('Resize gesture did not preview a transform.');
  expect((resized.width * source.width) / (resized.height * source.height)).toBeCloseTo(
    document.objectLayout!.width / document.objectLayout!.height
  );
  const rotate = host.querySelector('[data-handle="rotate"]')!;
  act(() =>
    rotate.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  );
  expect(
    vi.mocked(binding.editor.previewGesture).mock.lastCall?.[0]?.transform?.rotation
  ).toBeCloseTo(Math.PI / 180);
  expect(binding.editor.commitGesture).toHaveBeenCalledTimes(3);
  expect(reviewAnnotationBodyGeometry(instance, document, geometry)?.handles).toHaveLength(1);
});

it('uses the shared source/result clock, suppresses out-of-interval hits and blocks busy input', () => {
  const { binding } = fixture();
  binding.time = 5;
  render(binding);
  expect(host.querySelector('[data-annotation-id]')).toBeNull();
  binding.time = 1;
  binding.busy = true;
  move(binding);
  expect(binding.editor.beginGesture).not.toHaveBeenCalled();
  expect(binding.editor.commitGesture).not.toHaveBeenCalled();
});

it.each(['resize', 'rotate', 'tip'])(
  'does not preview a changed body or anchor on a stationary %s press',
  (kind) => {
    const { binding, document } = fixture();
    const id = kind === 'tip' ? document.objectLayout!.handles![0]!.id : kind;
    const svg = render(binding);
    const target = host.querySelector(`[data-handle="${id}"]`)!;
    pointer(target, 'pointerdown', 100, 30);
    pointer(svg, 'pointerup', 100, 30);
    expect(binding.editor.previewGesture).not.toHaveBeenCalled();
  }
);
