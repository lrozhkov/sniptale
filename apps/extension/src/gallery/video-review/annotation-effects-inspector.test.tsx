// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  resolveEffectLocaleText,
  resolveEffectV1ControlDefault,
} from '@sniptale/runtime-contracts/effect-v1';
import { getCurrentLocale, translate } from '../../platform/i18n';
import type { ReviewAnnotationEffect } from '../../features/video/review/annotation-effects/types';
import { initializeReviewAnnotationEffectAnchors } from '../../features/video/review/annotation-effects/layout';
import { readReviewAnnotationEffectDocument } from '../../features/video/review/annotation-effects/validation';
import { createReviewAnnotationGeometry } from './annotation-effects-geometry';
import type { useReviewAnnotationEffects } from './annotation-effects-editor';
import { ReviewAnnotationInspector } from './annotation-effects-inspector';

let root: Root;
let host: HTMLDivElement;
const geometry = createReviewAnnotationGeometry({
  source: { width: 640, height: 360 },
  output: { width: 1280, height: 720 },
  camera: { scale: 1, centerX: 0.5, centerY: 0.5 },
  background: { enabled: false },
})!;
function fixture(name: string) {
  const source = readFileSync(
    `apps/extension/public/video-effects/effects/annotations/sniptale-${name}/effect.sniptale-effect.json`,
    'utf8'
  );
  const document = readReviewAnnotationEffectDocument(source);
  if (!document) throw new Error('Invalid document fixture');
  const controls = Object.fromEntries(
    document.controls.map((control) => [
      control.id,
      resolveEffectV1ControlDefault(control, getCurrentLocale()),
    ])
  );
  const bound = new Set(
    document.objectLayout?.handles?.flatMap((handle) => [handle.xControl, handle.yControl])
  );
  const transform = { x: 0.1, y: 0.1, width: 0.4, height: 0.2, rotation: 0 };
  const anchors = initializeReviewAnnotationEffectAnchors(
    document,
    transform,
    controls,
    geometry.content
  );
  const instance: ReviewAnnotationEffect = {
    id: 'selected',
    snapshotId: 'source',
    start: 0,
    end: 4,
    enabled: true,
    attachment: 'content',
    transform,
    controls: Object.fromEntries(Object.entries(controls).filter(([id]) => !bound.has(id))),
    ...(anchors ? { anchors } : {}),
    order: 0,
  };
  const lane = { enabled: true, instances: [instance] };
  const editor: ReturnType<typeof useReviewAnnotationEffects> = {
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
  };
  return { source, document, instance, editor };
}
function render(
  value: ReturnType<typeof fixture>,
  source: string | undefined = value.source,
  busy = false
) {
  act(() =>
    root.render(
      <ReviewAnnotationInspector
        editor={value.editor}
        id="selected"
        source={source}
        duration={4}
        busy={busy}
      />
    )
  );
}
function input(label: string) {
  const node = [...host.querySelectorAll<HTMLInputElement>('input')].find(
    (element) => element.getAttribute('aria-label') === label
  );
  if (!node) throw new Error(`Missing fixture field: ${label}`);
  return node;
}
function type(node: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (!setter) throw new Error('Missing native value setter');
    setter.call(node, value);
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each(['lower-third', 'title', 'chapters', 'callout', 'frame', 'corners'])(
  'renders every declared SDK control and group for %s',
  (name) => {
    const value = fixture(name);
    render(value);
    expect(host.textContent).toContain(
      resolveEffectLocaleText(value.document.label, getCurrentLocale())
    );
    for (const control of value.document.controls) {
      expect(
        host.querySelector(
          `[aria-label="${resolveEffectLocaleText(control.label, getCurrentLocale()) || control.id}"]`
        )
      ).not.toBeNull();
      if (control.kind === 'number' && !control.options?.length)
        expect(
          input(`${resolveEffectLocaleText(control.label, getCurrentLocale())} range`)
        ).not.toBeNull();
    }
    const expected = new Set(
      value.document.controls.map((control) => `sdk:${control.group ?? 'parameters'}`)
    );
    for (const group of expected)
      expect(host.querySelector(`[data-section="${group}"]`)).not.toBeNull();
    expect(value.editor.change).not.toHaveBeenCalled();
  }
);

it('previews text without history, commits once on Enter and cancels on Escape', () => {
  const value = fixture('title');
  render(value);
  const control = value.document.controls.find((item) => item.id === 'title')!;
  const node = input(resolveEffectLocaleText(control.label, getCurrentLocale()));
  type(node, 'Typed value');
  expect(value.editor.previewGesture).toHaveBeenLastCalledWith({
    controls: { ...value.instance.controls, title: 'Typed value' },
  });
  expect(value.editor.commitGesture).not.toHaveBeenCalled();
  act(() => node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(value.editor.commitGesture).toHaveBeenCalledOnce();
  vi.mocked(value.editor.commitGesture).mockClear();
  type(node, 'Cancelled value');
  act(() => node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(value.editor.cancelGesture).toHaveBeenCalledOnce();
  expect(value.editor.commitGesture).not.toHaveBeenCalled();
});

it('applies an SDK visual preset without changing text, geometry or fixed anchors', async () => {
  const value = fixture('callout');
  render(value);
  const trigger = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (node) => node.getAttribute('aria-label') === translate('gallery.videoReview.annotationPresets')
  )!;
  await act(async () => {
    trigger.click();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
  const option = document.body.querySelectorAll<HTMLButtonElement>('[role="option"]')[1];
  if (!option) throw new Error('Missing preset option');
  await act(async () => option.click());
  const patch = vi.mocked(value.editor.change).mock.lastCall?.[1];
  expect(patch?.controls?.['title']).toBe(value.instance.controls['title']);
  expect(patch?.controls?.['accent']).toBe(value.document.controlPresets?.[0]?.values['accent']);
  expect(patch?.transform).toBeUndefined();
  expect(patch?.anchors).toBeUndefined();
});

it('edits a bound numeric control through its anchor and preserves native aspect for scale bodies', () => {
  const value = fixture('callout');
  render(value);
  const handle = value.document.objectLayout?.handles?.[0];
  if (!handle) throw new Error('Missing handle fixture');
  const control = value.document.controls.find((item) => item.id === handle.xControl)!;
  const node = input(resolveEffectLocaleText(control.label, getCurrentLocale()));
  type(node, '123');
  act(() => node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  const patch = vi.mocked(value.editor.previewGesture).mock.lastCall?.[0];
  expect(patch?.anchors?.[handle.id]).toBeDefined();
  expect(patch?.controls).toBeUndefined();
  vi.mocked(value.editor.previewGesture).mockClear();
  const width = input(translate('gallery.videoReview.annotationWidth'));
  type(width, '50');
  act(() => width.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  const next = vi.mocked(value.editor.previewGesture).mock.lastCall?.[0]?.transform;
  const layout = value.document.objectLayout!;
  expect(
    (next!.width * geometry.content.width) / (next!.height * geometry.content.height)
  ).toBeCloseTo(layout.width / layout.height);
});

it('keeps reflow dimensions independent and displays explicit imported full-scene mode', () => {
  const value = fixture('frame');
  render(value);
  const width = input(translate('gallery.videoReview.annotationWidth'));
  type(width, '55');
  act(() => width.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(vi.mocked(value.editor.previewGesture).mock.lastCall?.[0]?.transform?.height).toBe(
    value.instance.transform.height
  );
  const { objectLayout: discarded, ...fullScene } = value.document;
  void discarded;
  render(value, JSON.stringify(fullScene));
  expect(host.textContent).toContain(translate('gallery.videoReview.annotationFullScene'));
});

it('shows unavailable immutable source and disables pending controls without repairing content', () => {
  const value = fixture('title');
  render(value, undefined, true);
  // Explicit undefined selects the fixture default; missing source is a separate reachable props state.
  act(() =>
    root.render(
      <ReviewAnnotationInspector
        editor={value.editor}
        id="selected"
        source={undefined}
        duration={4}
        busy={false}
      />
    )
  );
  expect(host.querySelector('[role="alert"]')?.textContent).toBe(
    translate('gallery.videoReview.annotationSourceMissing')
  );
  expect(value.editor.change).not.toHaveBeenCalled();
  render(value, value.source, true);
  expect([...host.querySelectorAll<HTMLInputElement>('input')].every((node) => node.disabled)).toBe(
    true
  );
});

it('disables reflected attachment conversion and restores it when valid geometry returns', async () => {
  const value = fixture('title');
  value.editor.geometry = {
    ...geometry,
    contentToViewport: [-2, 0.5, 0, 0, 2, 0, 0, 0, 1],
    viewportToContent: [-0.5, 0.125, 0, 0, 0.5, 0, 0, 0, 1],
  };
  render(value);
  expect(host.textContent).toContain(
    translate('gallery.videoReview.annotationAttachmentUnavailable')
  );
  const open = async () => {
    const trigger = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
      (node) =>
        node.getAttribute('aria-label') === translate('gallery.videoReview.annotationAttachment')
    )!;
    await act(async () => {
      trigger.click();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });
    return [...document.body.querySelectorAll<HTMLButtonElement>('[role="option"]')].find((node) =>
      node.textContent?.includes(translate('gallery.videoReview.annotationViewportAttachment'))
    )!;
  };
  expect((await open()).disabled).toBe(true);
  act(() => root.render(null));
  value.editor.geometry = geometry;
  render(value);
  expect(host.textContent).not.toContain(
    translate('gallery.videoReview.annotationAttachmentUnavailable')
  );
  const option = await open();
  expect(option.disabled).toBe(false);
  await act(async () => option.click());
  expect(value.editor.change).toHaveBeenLastCalledWith(
    value.instance.id,
    expect.objectContaining({ attachment: 'viewport' })
  );
});

it('retains the SDK type of numeric select options and their localized labels', async () => {
  const value = fixture('callout');
  render(value);
  const control = value.document.controls.find((item) => item.options?.length)!;
  const trigger = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (node) =>
      node.getAttribute('aria-label') === resolveEffectLocaleText(control.label, getCurrentLocale())
  )!;
  await act(async () => {
    trigger.click();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
  const options = [...document.body.querySelectorAll<HTMLButtonElement>('[role="option"]')];
  const option = control.options?.[1];
  if (!option || !options[1]) throw new Error('Missing numeric option fixture');
  expect(options[1].textContent).toContain(
    resolveEffectLocaleText(option.label, getCurrentLocale())
  );
  await act(async () => options[1]?.click());
  expect(value.editor.previewGesture).toHaveBeenLastCalledWith({
    controls: { ...value.instance.controls, [control.id]: option.value },
  });
  expect(typeof option.value).toBe('number');
  expect(value.editor.commitGesture).toHaveBeenCalledOnce();
});

it('explains unsupported acquisition without offering edit recovery', () => {
  const value = fixture('title');
  value.editor.failure = 'unsupported';
  render(value);
  const alert = host.querySelector('[role="alert"]');
  expect(alert?.textContent).toBe(translate('gallery.videoReview.annotationEffectsUnsupported'));
  expect(alert?.querySelector('button')).toBeNull();
});

it.each(['save', 'edit', 'acquisition'] as const)(
  'routes inspector Retry for completed %s failure through the command owner',
  async (failure) => {
    const value = fixture('title');
    value.editor.failure = failure;
    render(value);
    const retry = host.querySelector<HTMLButtonElement>('[role="alert"] button');
    if (!retry) throw new Error('Missing selected-annotation recovery action.');
    await act(async () => retry.click());
    expect(value.editor.retry).toHaveBeenCalledOnce();
    expect(value.editor.flush).not.toHaveBeenCalled();
  }
);

it('offers bounded scrub tracks in displayed units without changing authored values', () => {
  const value = fixture('callout');
  value.instance.transform.x = 5;
  render(value);
  const x = input(`${translate('gallery.videoReview.annotationX')} range`);
  expect([x.min, x.max, x.value]).toEqual(['-100', '500', '500']);
  const width = input(`${translate('gallery.videoReview.annotationWidth')} range`);
  expect([width.min, width.max, width.value]).toEqual(['0.01', '200', '40']);
  const start = input(`${translate('gallery.videoReview.annotationStart')} range`);
  expect([start.min, start.max, start.value]).toEqual(['0', '3.999', '0']);
  const handle = value.document.objectLayout!.handles![0]!;
  const control = value.document.controls.find((item) => item.id === handle.xControl)!;
  const anchor = input(`${resolveEffectLocaleText(control.label, getCurrentLocale())} range`);
  expect(Number(anchor.min)).toBe(
    Math.min(-value.document.objectLayout!.width, Number(anchor.value))
  );
  expect(Number(anchor.max)).toBe(2 * value.document.objectLayout!.width);
  expect(value.editor.beginGesture).not.toHaveBeenCalled();
  expect(value.editor.change).not.toHaveBeenCalled();
});

it.each(['pointerup', 'pointercancel', 'Escape'] as const)(
  'keeps scrub proposals in one annotation draft and handles %s',
  (ending) => {
    const value = fixture('callout');
    value.instance.transform.x = 5;
    render(value);
    const node = input(`${translate('gallery.videoReview.annotationX')} range`);
    act(() => node.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
    type(node, '420');
    value.instance.transform.x = 4.2;
    render(value);
    type(node, '410');
    expect(node.max).toBe('500');
    expect(value.editor.beginGesture).toHaveBeenCalledOnce();
    expect(value.editor.previewGesture).toHaveBeenLastCalledWith({
      transform: { ...value.instance.transform, x: 4.1 },
    });
    expect(value.editor.commitGesture).not.toHaveBeenCalled();
    if (ending === 'Escape') {
      act(() => node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
      act(() => node.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true })));
    } else act(() => node.dispatchEvent(new MouseEvent(ending, { bubbles: true })));
    if (ending === 'pointerup') expect(value.editor.commitGesture).toHaveBeenCalledOnce();
    else {
      expect(value.editor.cancelGesture).toHaveBeenCalledOnce();
      expect(value.editor.commitGesture).not.toHaveBeenCalled();
    }
  }
);

it('derives the preset label from accepted controls across rerender and reopening the menu', async () => {
  const value = fixture('callout');
  const preset = value.document.controlPresets![0]!;
  value.instance.controls = { ...value.instance.controls, ...preset.values };
  render(value);
  const trigger = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (node) => node.getAttribute('aria-label') === translate('gallery.videoReview.annotationPresets')
  )!;
  expect(trigger.textContent).toContain(resolveEffectLocaleText(preset.label, getCurrentLocale()));
  value.instance.controls['title'] = 'Changed text';
  value.instance.transform.x = 0.2;
  render(value);
  expect(trigger.textContent).toContain(resolveEffectLocaleText(preset.label, getCurrentLocale()));
  await act(async () => {
    trigger.click();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
  expect(
    document.body.querySelector('[role="option"][aria-selected="true"]')?.textContent
  ).toContain(resolveEffectLocaleText(preset.label, getCurrentLocale()));
  expect(value.editor.change).not.toHaveBeenCalled();
});

it('preserves admitted unbounded SDK fields without inventing a range', () => {
  const value = fixture('callout');
  const document = structuredClone(value.document);
  const control = document.controls.find((item) => item.id === 'font');
  if (!control || control.kind !== 'number') throw new Error('Missing numeric fixture');
  delete control.min;
  delete control.max;
  render(value, JSON.stringify(document));
  const label = resolveEffectLocaleText(control.label, getCurrentLocale());
  expect(input(label)).not.toBeNull();
  expect(host.querySelector(`input[aria-label="${label} range"]`)).toBeNull();
  expect(value.editor.beginGesture).not.toHaveBeenCalled();
});

it('keeps bound anchors and scale dimensions disabled without geometry, while plain SDK fields retain scrub', () => {
  const value = fixture('callout');
  value.editor.geometry = null;
  render(value);
  expect(input(translate('gallery.videoReview.annotationWidth')).disabled).toBe(true);
  const handle = value.document.objectLayout!.handles![0]!;
  const bound = value.document.controls.find((item) => item.id === handle.xControl)!;
  expect(input(resolveEffectLocaleText(bound.label, getCurrentLocale())).disabled).toBe(true);
  const font = value.document.controls.find((item) => item.id === 'font')!;
  expect(input(`${resolveEffectLocaleText(font.label, getCurrentLocale())} range`).disabled).toBe(
    false
  );
  render(value, value.source, true);
  expect(host.querySelectorAll('input[type="range"]')).toHaveLength(0);
});
