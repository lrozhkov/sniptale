// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createReviewAnnotationTextClip } from '../../features/video/review/annotation-effects/text-animation';
import { translate } from '../../platform/i18n';
import type { ReviewAnnotationEditing } from './annotation-effects-overlay';
import { ReviewAnnotationTextInspector } from './annotation-text-inspector';
import { ReviewAnnotationTextOverlay } from './annotation-text-overlay';
import { ReviewInspectorPresentation } from './inspector-sections';

let root: Root;
let host: HTMLDivElement;
const size = { width: 640, height: 360 };
const labels = (name: Parameters<typeof translate>[0]) => translate(name);
const title = createReviewAnnotationTextClip('title', 'Title', 1, 4, 0);
function fixture() {
  const lane = { enabled: true, instances: [], textClips: [title] };
  const editor = {
    lane,
    previewLane: lane,
    pending: false,
    failure: null,
    gestureId: null,
    geometry: { read: () => null, subscribe: () => () => undefined },
    refreshBodyGeometry: vi.fn(),
    bodyMeasurements: new Map(),
    placementGestureActive: false,
    movement: { subscribe: vi.fn(() => () => undefined) },
    setGeometry: vi.fn(),
    add: vi.fn(),
    addText: vi.fn(),
    change: vi.fn(),
    changeText: vi.fn<ReviewAnnotationEditing['editor']['changeText']>(),
    enabled: vi.fn(),
    remove: vi.fn(),
    duplicate: vi.fn(),
    beginGesture: vi.fn(() => true),
    previewMovement: vi.fn(() => false),
    previewGesture: vi.fn(),
    cancelGesture: vi.fn(),
    commitGesture: vi.fn(async () => true),
    hasPending: vi.fn(() => false),
    flush: vi.fn(async () => undefined),
    retry: vi.fn(),
  } satisfies ReviewAnnotationEditing['editor'];
  const binding = {
    editor,
    snapshots: [],
    segments: [],
    time: 2,
    selectedId: title.id,
    busy: false,
    onSelect: vi.fn(),
  } satisfies ReviewAnnotationEditing;
  return { binding, editor };
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
  vi.unstubAllGlobals();
});

function input(field: HTMLInputElement | HTMLTextAreaElement, text: string) {
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value')?.set?.call(field, text);
  field.dispatchEvent(new Event('input', { bubbles: true }));
}
function key(node: EventTarget, name: string, shiftKey = false) {
  node.dispatchEvent(new KeyboardEvent('keydown', { key: name, shiftKey, bubbles: true }));
}
function field(name: Parameters<typeof translate>[0], index = 0) {
  const node = host.querySelectorAll<HTMLInputElement>(`input[aria-label="${labels(name)}"]`)[
    index
  ];
  if (!node) throw new Error(`Missing numeric parameter ${name}`);
  return node;
}
function setValue(name: Parameters<typeof translate>[0], text: string, index = 0) {
  const node = field(name, index);
  act(() => {
    node.focus();
    input(node, text);
    key(node, 'Enter');
  });
}

async function choose(
  control: Parameters<typeof translate>[0],
  option: Parameters<typeof translate>[0]
) {
  const button = host.querySelector<HTMLButtonElement>(
    `button[aria-haspopup="listbox"][aria-label="${labels(control)}"]`
  );
  if (!button) throw new Error(`Missing selector ${control}`);
  await act(async () => button.click());
  const target = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
    (node) => node.textContent?.trim() === labels(option)
  );
  if (!target) throw new Error(`Missing choice ${option}`);
  await act(async () => target.click());
}

it('applies independent phase options and exposes only the settings each active preset uses', async () => {
  const { editor } = fixture();
  let value = title;
  function Harness() {
    const [clip, setClip] = useState(title);
    value = clip;
    const lane = { ...editor.lane, textClips: [clip] };
    return (
      <ReviewInspectorPresentation value="all">
        <ReviewAnnotationTextInspector
          clip={clip}
          busy={false}
          editor={{
            ...editor,
            lane,
            previewLane: lane,
            changeText: (_id, edit) => setClip(edit),
          }}
        />
      </ReviewInspectorPresentation>
    );
  }
  act(() => root.render(<Harness />));
  expect(
    host.querySelector(`[aria-label="${labels('gallery.videoReview.annotationTextPeriod')}"]`)
  ).toBeNull();
  await choose(
    'gallery.videoReview.annotationTextEntrance',
    'gallery.videoReview.annotationTextPreset_slide'
  );
  await choose(
    'gallery.videoReview.annotationTextDirection',
    'gallery.videoReview.annotationTextDirection_left'
  );
  await choose(
    'gallery.videoReview.annotationTextLoop',
    'gallery.videoReview.annotationTextPreset_shine'
  );
  await choose(
    'gallery.videoReview.annotationTextExit',
    'gallery.videoReview.annotationTextPreset_cascade'
  );
  setValue('gallery.videoReview.annotationTextPhaseTime', '0.6');
  setValue('gallery.videoReview.annotationTextPhaseTime', '0.9', 1);
  setValue('gallery.videoReview.annotationTextDistance', '24');
  setValue('gallery.videoReview.annotationTextStagger', '70');
  setValue('gallery.videoReview.annotationTextPeriod', '2.5');
  setValue('gallery.videoReview.annotationTextAmount', '60');
  setValue('gallery.videoReview.annotationTextFontSize', '11');
  expect(value).toMatchObject({
    entrance: { preset: 'slide', direction: 'left', duration: 0.6, distance: 0.24 },
    loop: { preset: 'shine', period: 2.5, amount: 0.6 },
    exit: { preset: 'cascade', duration: 0.9, stagger: 0.7 },
    fontSize: 0.11,
  });
  await choose(
    'gallery.videoReview.annotationTextLoop',
    'gallery.videoReview.annotationTextPreset_none'
  );
  expect(value.loop).toEqual({ preset: 'none', period: 2.5, amount: 0.6 });
});

it('cancels or confirms a text draft and routes retry through the editor', () => {
  const { editor } = fixture();
  const render = (overrides: Partial<ReviewAnnotationEditing['editor']> = {}) =>
    act(() =>
      root.render(
        <ReviewAnnotationTextInspector
          clip={title}
          editor={{ ...editor, ...overrides }}
          busy={false}
        />
      )
    );
  render();
  const text = host.querySelector('textarea')!;
  act(() => {
    text.focus();
    input(text, 'Unconfirmed');
    key(text, 'Escape');
  });
  expect(editor.beginGesture).toHaveBeenCalledWith(title.id, 'field');
  expect(editor.previewGesture).toHaveBeenCalledWith({ text: 'Unconfirmed' });
  expect(editor.cancelGesture).toHaveBeenCalledOnce();
  expect(editor.commitGesture).not.toHaveBeenCalled();
  render({ gestureId: title.id, previewLane: undefined });
  act(() => {
    text.focus();
    input(text, 'Confirmed');
    text.blur();
  });
  expect(editor.beginGesture).toHaveBeenCalledOnce();
  expect(editor.previewGesture).toHaveBeenCalledWith({ text: 'Confirmed' });
  expect(editor.commitGesture).toHaveBeenCalledOnce();
  render({ failure: 'save', pending: true });
  const retry = host.querySelector<HTMLButtonElement>(
    `button[aria-label="${labels('gallery.videoReview.retry')}"]`
  )!;
  expect(retry.disabled).toBe(true);
  render({ failure: 'save' });
  act(() => retry.click());
  expect(editor.retry).toHaveBeenCalledOnce();
});

function renderOverlay(binding: ReviewAnnotationEditing) {
  act(() => root.render(<ReviewAnnotationTextOverlay binding={binding} size={size} />));
  const view = host.querySelector('svg');
  const target = view?.querySelector('rect');
  if (!view || !target) return null;
  vi.spyOn(view, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 640, 360));
  Object.assign(target, {
    setPointerCapture: vi.fn(),
    hasPointerCapture: vi.fn(() => true),
    releasePointerCapture: vi.fn(),
  });
  return target;
}
function pointer(node: SVGRectElement, type: string, x: number, y: number, id = 1, button = 0) {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button });
  Object.defineProperty(event, 'pointerId', { value: id });
  act(() => node.dispatchEvent(event));
}

it('commits one viewport move per drag and cancels click, escape or lost capture', () => {
  const { binding, editor } = fixture();
  const rect = renderOverlay(binding)!;
  pointer(rect, 'pointerdown', 610, 250, 1, 2);
  expect(editor.beginGesture).not.toHaveBeenCalled();
  pointer(rect, 'pointerdown', 10, 10);
  pointer(rect, 'pointermove', 74, 46, 2);
  expect(editor.previewGesture).not.toHaveBeenCalled();
  pointer(rect, 'pointermove', 74, 46);
  expect(editor.previewGesture).toHaveBeenLastCalledWith({
    transform: { ...title.transform, x: 0.25, y: 0.48 },
  });
  expect(editor.commitGesture).not.toHaveBeenCalled();
  pointer(rect, 'pointerup', 74, 46);
  expect(editor.commitGesture).toHaveBeenCalledOnce();
  pointer(rect, 'pointerdown', 10, 10);
  pointer(rect, 'pointerup', 10, 10);
  pointer(rect, 'pointerdown', 10, 10);
  pointer(rect, 'pointermove', 74, 46);
  act(() => key(window, 'Escape'));
  pointer(rect, 'pointerdown', 10, 10);
  pointer(rect, 'lostpointercapture', 74, 46);
  expect(editor.cancelGesture).toHaveBeenCalledTimes(3);
  expect(editor.commitGesture).toHaveBeenCalledOnce();
});

it('moves with the keyboard after admission and hides the handle outside its half-open range', () => {
  const { binding, editor } = fixture();
  const admit = vi.fn<(action: () => void) => void>();
  const rect = renderOverlay({ ...binding, beforeAction: admit })!;
  act(() => key(rect, 'Enter'));
  act(() => key(rect, 'ArrowRight', true));
  expect(admit).toHaveBeenCalledOnce();
  expect(editor.commitGesture).not.toHaveBeenCalled();
  act(() => admit.mock.calls[0]![0]());
  expect(editor.previewGesture).toHaveBeenCalledWith({
    transform: { ...title.transform, x: title.transform.x + 10 / size.width },
  });
  expect(editor.commitGesture).toHaveBeenCalledOnce();
  expect(renderOverlay({ ...binding, busy: true })?.getAttribute('aria-disabled')).toBe('true');
  expect(renderOverlay({ ...binding, time: 0.99 })).toBeNull();
  expect(renderOverlay({ ...binding, time: 4 })).toBeNull();
  expect(renderOverlay({ ...binding, selectedId: null })).toBeNull();
});

it('publishes the final drag point after delayed admission even when the pointer was released', () => {
  const { binding, editor } = fixture();
  const admit = vi.fn<(action: () => void) => void>();
  const rect = renderOverlay({ ...binding, beforeAction: admit })!;
  pointer(rect, 'pointerdown', 10, 10);
  pointer(rect, 'pointermove', 42, 10);
  pointer(rect, 'pointerup', 74, 46);
  pointer(rect, 'lostpointercapture', 74, 46);
  expect(editor.previewGesture).not.toHaveBeenCalled();
  act(() => admit.mock.calls[0]![0]());
  expect(editor.previewGesture).toHaveBeenCalledExactlyOnceWith({
    transform: { ...title.transform, x: 0.25, y: 0.48 },
  });
  expect(editor.commitGesture).toHaveBeenCalledOnce();
});

it('cancels a released drag before delayed admission when the editor closes the selection', () => {
  const { binding, editor } = fixture();
  const admit = vi.fn<(action: () => void) => void>();
  const rect = renderOverlay({ ...binding, beforeAction: admit })!;
  pointer(rect, 'pointerdown', 10, 10);
  pointer(rect, 'pointerup', 74, 46);
  renderOverlay({ ...binding, selectedId: null });
  act(() => admit.mock.calls[0]![0]());
  expect(editor.beginGesture).not.toHaveBeenCalled();
  expect(editor.commitGesture).not.toHaveBeenCalled();
});

it('starts a fresh drag after admission refused the released drag on the same title', () => {
  const { binding, editor } = fixture();
  const admit = vi.fn<(action: () => void) => void>();
  const rect = renderOverlay({ ...binding, beforeAction: admit })!;
  pointer(rect, 'pointerdown', 10, 10);
  pointer(rect, 'pointerup', 80, 10);
  pointer(rect, 'pointerdown', 10, 10);
  pointer(rect, 'pointerup', 74, 46);
  expect(admit).toHaveBeenCalledTimes(2);
  act(() => admit.mock.calls[0]![0]());
  expect(editor.commitGesture).not.toHaveBeenCalled();
  act(() => admit.mock.calls[1]![0]());
  expect(editor.previewGesture).toHaveBeenCalledExactlyOnceWith({
    transform: { ...title.transform, x: 0.25, y: 0.48 },
  });
  expect(editor.commitGesture).toHaveBeenCalledOnce();
});

it.each([false, true])(
  'cancels a title drag on window blur with admission pending=%s',
  (pending) => {
    const { binding, editor } = fixture();
    const admit = vi.fn<(action: () => void) => void>();
    const rect = renderOverlay(pending ? { ...binding, beforeAction: admit } : binding)!;
    pointer(rect, 'pointerdown', 10, 10);
    pointer(rect, 'pointermove', 74, 46);
    act(() => window.dispatchEvent(new Event('blur')));
    pointer(rect, 'pointerup', 74, 46);
    if (pending) act(() => admit.mock.calls[0]![0]());
    expect(editor.commitGesture).not.toHaveBeenCalled();
    expect(editor.cancelGesture).toHaveBeenCalledTimes(pending ? 0 : 1);
    pointer(rect, 'pointerdown', 10, 10);
    pointer(rect, 'pointerup', 74, 46);
    if (pending) act(() => admit.mock.calls[1]![0]());
    expect(editor.commitGesture).toHaveBeenCalledOnce();
  }
);
