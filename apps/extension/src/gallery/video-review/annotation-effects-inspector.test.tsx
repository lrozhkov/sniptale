// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { validateAnimationTemplate } from '@sniptale/runtime-contracts/animation-template';
import {
  resolveEffectLocaleText,
  resolveEffectControlGroup,
  resolveEffectControlDefault,
} from '@sniptale/runtime-contracts/effect-controls';
import { getCurrentLocale, translate } from '../../platform/i18n';
import type { ReviewAnnotationEffect } from '../../features/video/review/annotation-effects/types';
import {
  initializeReviewAnnotationEffectAnchors,
  resolveReviewAnnotationEffectControls,
} from '../../features/video/review/annotation-effects/layout';
import { readReviewAnnotationEffectDocument } from '../../features/video/review/annotation-effects/validation';
import {
  createReviewAnnotationGeometry,
  reviewAnnotationBodyMeasurementKey,
} from './annotation-effects-geometry';
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
    name === 'callout'
      ? 'apps/extension/src/features/video/project/effect-bundle/fixtures/retained/callout.sniptale-animation.json'
      : `apps/extension/public/video-effects/animations/${name}.sniptale-animation.json`,
    'utf8'
  );
  const document = readReviewAnnotationEffectDocument(source);
  if (!document) throw new Error('Invalid document fixture');
  const controls = Object.fromEntries(
    document.controls.map((control) => [
      control.id,
      resolveEffectControlDefault(control, getCurrentLocale()),
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
    bodyMeasurements: new Map(),
    refreshBodyGeometry: vi.fn(),
    movement: { subscribe: vi.fn(() => () => undefined) },
    previewMovement: vi.fn(() => false),
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
  openSection('placement');
}
function openSection(id: string) {
  const tab = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((node) =>
    node.getAttribute('aria-controls')?.endsWith(`-${id}`)
  );
  if (tab) act(() => tab.click());
}
function reveal(selector: string): Element | null {
  let found = host.querySelector(selector);
  if (found) return found;
  for (const tab of host.querySelectorAll<HTMLButtonElement>('[role="tab"]')) {
    act(() => tab.click());
    found = host.querySelector(selector);
    if (found) return found;
  }
  return null;
}
function input(label: string) {
  const node = reveal(`input[aria-label="${label}"]`) as HTMLInputElement | null;
  if (!node) throw new Error(`Missing fixture field: ${label}`);
  return node;
}
function type(node: HTMLInputElement | HTMLTextAreaElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      node instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      'value'
    )?.set;
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

it.each(['lower-third', 'title', 'chapters', 'callout', 'frame', 'corners', 'arrow'])(
  'renders every declared SDK control and group for %s',
  (name) => {
    const value = fixture(name);
    render(value);
    for (const control of value.document.controls) {
      expect(
        reveal(
          `[aria-label="${resolveEffectLocaleText(control.label, getCurrentLocale()) || control.id}"]:not([role="tab"])`
        )
      ).not.toBeNull();
      if (control.kind === 'number' && !control.options?.length)
        expect(
          input(`${resolveEffectLocaleText(control.label, getCurrentLocale())} range`)
        ).not.toBeNull();
    }
    const expected = new Set(
      value.document.controls.map(
        (control) =>
          `sdk:${resolveEffectControlGroup(control.group, value.document.controlGroups) ?? 'advanced'}`
      )
    );
    for (const group of expected) {
      openSection(group);
      expect(host.querySelector(`[data-section="${group}"]`)).not.toBeNull();
    }
    expect(value.editor.change).not.toHaveBeenCalled();
  }
);

it('previews multiline text without history, commits once on Ctrl+Enter and cancels on Escape', () => {
  const value = fixture('title');
  render(value);
  const control = value.document.controls.find((item) => item.id === 'title')!;
  const node = reveal(
    `textarea[aria-label="${resolveEffectLocaleText(control.label, getCurrentLocale())}"]`
  ) as HTMLTextAreaElement;
  type(node, 'Typed value');
  expect(value.editor.previewGesture).toHaveBeenLastCalledWith({
    controls: { ...value.instance.controls, title: 'Typed value' },
  });
  expect(value.editor.commitGesture).not.toHaveBeenCalled();
  act(() =>
    node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }))
  );
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
  expect(host.querySelector('[role="tab"][aria-controls$="-presets"]')).toBeNull();
  openSection('sdk:appearance');
  const trigger = [...host.querySelectorAll<HTMLButtonElement>('button:not([role="tab"])')].find(
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
  expect(
    (next!.width * geometry.content.width) / (next!.height * geometry.content.height)
  ).toBeCloseTo(value.document.animation.w / value.document.animation.h);
});

it('keeps intrinsic aspect when metadata is absent and never mislabels Lottie as full-scene', () => {
  const value = fixture('frame');
  render(value);
  const width = input(translate('gallery.videoReview.annotationWidth'));
  type(width, '55');
  act(() => width.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  const resized = vi.mocked(value.editor.previewGesture).mock.lastCall?.[0]?.transform;
  expect(
    (resized!.width * geometry.content.width) / (resized!.height * geometry.content.height)
  ).toBeCloseTo(value.document.animation.w / value.document.animation.h);
  const { objectLayout: discarded, ...fullScene } = value.document;
  void discarded;
  render(value, JSON.stringify(fullScene));
  expect(host.textContent).not.toContain(translate('gallery.videoReview.annotationFullScene'));
  expect(input(translate('gallery.videoReview.annotationWidth')).disabled).toBe(false);
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
  const value = fixture('chapters');
  const control = value.document.controls.find((item) => item.id === 'opacity')!;
  if (control.kind !== 'number') throw new Error('Missing scalar fixture');
  control.defaultValue = 25;
  control.options = [
    { value: 25, label: { en: 'Soft', ru: 'Мягко' } },
    { value: 75, label: { en: 'Strong', ru: 'Сильно' } },
  ];
  control.presentation = 'dropdown';
  value.instance.controls[control.id] = 25;
  expect(validateAnimationTemplate(value.document).ok).toBe(true);
  render(value, JSON.stringify(value.document));
  reveal(
    `button:not([role="tab"])[aria-label="${resolveEffectLocaleText(control.label, getCurrentLocale())}"]`
  );
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
  const handle = value.document.objectLayout!.handles![0]!;
  const control = value.document.controls.find((item) => item.id === handle.xControl)!;
  const anchor = input(`${resolveEffectLocaleText(control.label, getCurrentLocale())} range`);
  expect(Number(anchor.min)).toBe(Math.min(-value.document.animation.w, Number(anchor.value)));
  expect(Number(anchor.max)).toBe(2 * value.document.animation.w);
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
  openSection('sdk:appearance');
  let trigger = [...host.querySelectorAll<HTMLButtonElement>('button:not([role="tab"])')].find(
    (node) => node.getAttribute('aria-label') === translate('gallery.videoReview.annotationPresets')
  )!;
  expect(trigger.textContent).toContain(resolveEffectLocaleText(preset.label, getCurrentLocale()));
  value.instance.controls['title'] = 'Changed text';
  value.instance.transform.x = 0.2;
  render(value);
  openSection('sdk:appearance');
  trigger = host.querySelector<HTMLButtonElement>(
    'button:not([role="tab"])[aria-label="gallery.videoReview.annotationPresets"]'
  )!;
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

it('preserves admitted unbounded auto fields without inventing a range', () => {
  const value = fixture('callout');
  const document = structuredClone(value.document);
  const control = document.controls.find((item) => item.id === 'fontSize');
  if (!control || control.kind !== 'number') throw new Error('Missing numeric fixture');
  delete control.min;
  delete control.max;
  control.presentation = 'auto';
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
  const font = value.document.controls.find((item) => item.id === 'fontSize')!;
  expect(input(`${resolveEffectLocaleText(font.label, getCurrentLocale())} range`).disabled).toBe(
    false
  );
  render(value, value.source, true);
  expect(host.querySelectorAll('input[type="range"]')).toHaveLength(0);
});

const explicitSliderCases: Array<{
  bounds: { min?: number; max?: number };
  value: number;
  low: string;
  high: string;
}> = [
  { bounds: {}, value: 50, low: '0', high: '100' },
  { bounds: { min: 500 }, value: 550, low: '500', high: '600' },
  { bounds: { max: -500 }, value: -550, low: '-600', high: '-500' },
];
function rangeFixture(
  bounds: { min?: number; max?: number },
  value: number,
  presentation: 'slider' | 'auto'
) {
  const fixtureValue = fixture('frame');
  const document = structuredClone(fixtureValue.document);
  const control = document.controls.find((item) => item.id === 'stroke');
  if (!control || control.kind !== 'number') throw new Error('Missing numeric fixture');
  delete document.controlPresets;
  delete document.defaultControlPresetId;
  delete control.min;
  delete control.max;
  control.label = { en: 'Custom range' };
  control.defaultValue = value;
  control.presentation = presentation;
  Object.assign(control, bounds);
  fixtureValue.instance.controls['stroke'] = value;
  const source = JSON.stringify(document);
  expect(validateAnimationTemplate(document).diagnostics).toEqual([]);
  expect(readReviewAnnotationEffectDocument(source)).not.toBeNull();
  return { fixtureValue, source };
}
it.each(explicitSliderCases)(
  'honors explicit imported sliders with partial bounds $bounds',
  ({ bounds, value, low, high }) => {
    const fixture = rangeFixture(bounds, value, 'slider');
    render(fixture.fixtureValue, fixture.source);
    const slider = input('Custom range range');
    expect([slider.min, slider.max, slider.value]).toEqual([low, high, String(value)]);
    expect(input('Custom range').value).toBe(String(value));
    expect(fixture.fixtureValue.editor.change).not.toHaveBeenCalled();
  }
);
it('keeps an unbounded auto number as an ordinary field without forcing a slider', () => {
  const fixture = rangeFixture({}, 50, 'auto');
  render(fixture.fixtureValue, fixture.source);
  expect(input('Custom range').value).toBe('50');
  expect(host.querySelector('input[aria-label="Custom range range"]')).toBeNull();
});

it('keeps a custom group from repeating the host placement icon', () => {
  const value = fixture('callout');
  value.document.controlGroups = [
    {
      id: 'tracing',
      parentId: 'geometry',
      label: { en: 'Pointer', ru: 'Указатель' },
      icon: 'move',
    },
  ];
  for (const control of value.document.controls)
    if (control.group === 'geometry') control.group = 'tracing';
  const source = JSON.stringify(value.document);
  expect(validateAnimationTemplate(value.document).ok).toBe(true);
  render(value, source);
  expect(host.querySelectorAll('[role="tab"] svg.lucide-move')).toHaveLength(1);
  openSection('sdk:geometry');
  expect(host.querySelector('[data-effect-control-group="tracing"] input')).not.toBeNull();
});

it('uses measured visible bounds even when inspector metadata is a different parsed document', () => {
  const value = fixture('frame');
  const controls = resolveReviewAnnotationEffectControls(
    value.document,
    value.instance,
    geometry.content
  );
  const key = reviewAnnotationBodyMeasurementKey(value.instance, controls);
  value.editor.bodyMeasurements.set(key, {
    x: value.document.animation.w / 4,
    y: value.document.animation.h / 4,
    width: value.document.animation.w / 2,
    height: value.document.animation.h / 2,
  });
  render(value);
  expect(Number(input(translate('gallery.videoReview.annotationWidth')).value)).toBeCloseTo(20, 6);
  expect(Number(input(translate('gallery.videoReview.annotationHeight')).value)).toBeCloseTo(10, 6);
});

it('keeps presets under Appearance when a template has no appearance control group', () => {
  const value = fixture('callout');
  for (const control of value.document.controls) {
    if (resolveEffectControlGroup(control.group, value.document.controlGroups) === 'appearance')
      control.group = 'typography';
  }
  expect(validateAnimationTemplate(value.document).ok).toBe(true);
  render(value, JSON.stringify(value.document));
  expect(host.querySelector('[role="tab"][aria-controls$="-presets"]')).toBeNull();
  openSection('sdk:appearance');
  expect(
    host.querySelector(
      '[data-section="sdk:appearance"] button[aria-label="gallery.videoReview.annotationPresets"]'
    )
  ).not.toBeNull();
});

it('starts with SDK text and omits identity, timing, and proportional-scale hints', () => {
  const value = fixture('callout');
  render(value);
  const tabs = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  expect(tabs[0]?.getAttribute('aria-controls')).toContain('-sdk:content');
  expect(tabs.some((tab) => tab.getAttribute('aria-controls')?.endsWith('-timing'))).toBe(false);
  expect(host.textContent).not.toContain(translate('gallery.videoReview.annotationScaleHint'));
  expect(host.textContent).not.toContain(translate('gallery.videoReview.annotationName'));
  openSection('sdk:appearance');
  const enabled = host.querySelector<HTMLButtonElement>(
    `[aria-label="${translate('gallery.videoReview.annotationEnabled')}"]`
  )!;
  expect(enabled).not.toBeNull();
  act(() => enabled.click());
  expect(value.editor.change).toHaveBeenCalledWith(value.instance.id, { enabled: false });
});
