// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createQuickEditWebcam,
  moveQuickEditWebcamPosition,
} from '../../features/video/review/advanced/webcam';
import type { useReviewWebcamEditor } from './webcam-editor';
import { ReviewWebcamInspector } from './webcam-inspector';
import { ReviewWebcamTrack } from './webcam-track';
import { ReviewWebcamOverlay } from './webcam-overlay';
import { createTrackProjection } from './track-projection';
import { mountReviewWebcamPreview } from './webcam-preview';

vi.mock('../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));
vi.mock('./webcam-crop-preview', () => ({ ReviewWebcamCropPreview: () => null }));
vi.mock('./webcam-preview', () => ({ mountReviewWebcamPreview: vi.fn() }));
type Editor = ReturnType<typeof useReviewWebcamEditor>;
let host: HTMLDivElement;
let root: Root;
let editor: Editor;
let render: () => void;
const source = { width: 160, height: 90, duration: 12 };
const label = (name: string) => `gallery.videoReview.${name}`;
const field = (name: string) => host.querySelector<HTMLInputElement>(`[aria-label="${name}"]`)!;
const click = (name: string) => act(() => field(label(name)).click());

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const camera = createQuickEditWebcam('camera', source, source);
  editor = {
    camera,
    pending: false,
    failed: false,
    candidate: {
      id: 'camera',
      filename: 'camera.webm',
      originalFilename: 'camera.webm',
      kind: 'video',
      source: { kind: 'recording', recordingId: 'camera' },
      createdAt: 1,
      updatedAt: 1,
      size: 100,
      mimeType: 'video/webm',
      ...source,
      hasThumbnail: false,
      sourceUrl: null,
      sourceTitle: null,
      sourceFavicon: null,
      tags: [],
    },
    time: 3,
    duration: 12,
    available: true,
    retry: vi.fn(() => undefined),
    resourceAttempt: 0,
    toggle: vi.fn(async () => {}),
    selection: { kind: 'webcam' },
    selectedPosition: undefined,
    hidden: undefined,
    placement: camera.placement,
    scene: source,
    crop: {
      zoom: camera.appearance.zoom,
      panX: camera.appearance.panX,
      panY: camera.appearance.panY,
    },
    setCrop: vi.fn((crop) => {
      editor.crop = crop;
      editor.patch({ appearance: { ...editor.camera!.appearance, ...crop } });
    }),
    movePosition: vi.fn((id, time) =>
      editor.patch(moveQuickEditWebcamPosition(editor.camera!, id, time, editor.duration))
    ),
    select: vi.fn(),
    selectVisible: vi.fn(),
    patch: vi.fn((patch) => {
      editor.camera = { ...editor.camera!, ...patch };
      editor.selectedPosition = editor.camera!.positions.find(
        (item) => editor.selection.kind === 'webcam-position' && item.id === editor.selection.id
      );
      render();
    }),
    place: vi.fn((placement) => {
      editor.placement = placement;
      render();
    }),
    addPosition: vi.fn(),
    navigate: vi.fn(),
    canHide: vi.fn(() => true),
    hide: vi.fn(),
    remove: vi.fn(),
  };
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 1200, 600)
  );
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => true);
  HTMLElement.prototype.releasePointerCapture = vi.fn();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function enter(name: string, value: string) {
  const node = field(name);
  expect(node).not.toBeNull();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(node, value);
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
}
async function choose(name: string, option: string) {
  act(() => field(name).click());
  const node = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(
    (item) => item.textContent === option
  );
  expect(node).toBeDefined();
  await act(async () => node!.click());
}
function pointer(node: Element, type: string, x = 0, button = 0) {
  act(() =>
    node.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: 100, button }))
  );
}

it('edits camera placement, appearance and signed timing through inspector controls', async () => {
  render = () =>
    root.render(<ReviewWebcamInspector editor={editor} range={{ start: 4, end: 6 }} />);
  act(render);
  expect(host.textContent).toContain('camera.webm');
  for (const preset of ['full', 'top-left', 'top-right', 'bottom-left', 'bottom-right']) {
    await choose(label('webcamPlacement'), label(`webcamPlacement_${preset}`));
    expect(editor.placement?.x).toBeGreaterThanOrEqual(0);
    expect(editor.placement!.x + editor.placement!.width).toBeLessThanOrEqual(1);
  }
  await enter(label('webcam_x'), '20');
  await enter(label('webcam_y'), '25');
  await enter(label('webcam_width'), '90');
  await enter(label('webcam_height'), '80');
  expect(editor.placement).toMatchObject({ width: 0.9, height: 0.8 });
  expect(editor.placement!.x).toBeCloseTo(0.1);
  expect(editor.placement!.y).toBeCloseTo(0.2);
  await choose(label('webcamPlacement'), 'videoEditor.sidebar.cameraLayoutCustom');
  click('webcamAddPosition');
  expect(editor.addPosition).toHaveBeenCalledOnce();
  await choose('videoEditor.sidebar.cameraShape', 'videoEditor.sidebar.cameraShapeEllipse');
  expect(field('videoEditor.sidebar.cameraRoundness')).toBeNull();
  await choose('videoEditor.sidebar.cameraShape', label('webcamCircle'));
  expect(field('videoEditor.sidebar.cameraRoundness')).toBeNull();
  expect(field(label('webcam_height'))).toBeNull();
  await enter(label('webcamDiameter'), '30');
  expect(editor.placement!.width).toBe(0.3);
  await enter(label('webcamShadow'), '60');
  expect(editor.camera?.shadow).toEqual({ intensity: 60, color: '#000000ff' });
  await choose('videoEditor.sidebar.cameraShape', 'videoEditor.sidebar.cameraShapeSoft');
  await enter('videoEditor.sidebar.cameraRoundness', '35');
  await choose('videoEditor.sidebar.cameraShape', 'videoEditor.sidebar.cameraShapeRounded');
  await choose(label('webcamMirror'), label('webcamMirrorOn'));
  await enter('videoEditor.sidebar.cameraCropZoom', '2');
  await enter(label('webcamCropX'), '25');
  await enter(label('webcamCropY'), '-30');
  await enter(label('webcamOffset'), '-1.25');
  expect(editor.camera).toMatchObject({
    mirrored: true,
    offsetSeconds: -1.25,
    appearance: { shape: 'rounded', roundness: 35, zoom: 2, panX: 0.25, panY: -0.3 },
  });
  await choose(label('webcamMirror'), label('webcamMirrorOff'));
  click('webcamHideRange');
  expect(editor.hide).toHaveBeenCalledWith({ start: 4, end: 6 });
  click('webcamDisable');
  expect(editor.remove).toHaveBeenCalledOnce();
});

it('edits an authored position and respects neighboring time bounds and transition visibility', async () => {
  editor.camera!.positions = [
    {
      id: 'first',
      time: 2,
      placement: editor.placement!,
      transition: { type: 'none', duration: 0.5 },
    },
    {
      id: 'second',
      time: 8,
      placement: editor.placement!,
      transition: { type: 'ease-in-out', duration: 1 },
    },
  ];
  editor.selection = { kind: 'webcam-position', id: 'first' };
  editor.selectedPosition = editor.camera!.positions[0];
  render = () => root.render(<ReviewWebcamInspector editor={editor} />);
  act(render);
  expect(field(label('webcamTransitionDuration'))).toBeNull();
  await choose(label('webcamTransition'), label('webcamSmooth'));
  await enter(label('webcamTransitionDuration'), '2');
  await enter(label('webcamPositionTime'), '9');
  expect(editor.selectedPosition).toMatchObject({ time: 7.999, transition: { duration: 2 } });
  expect(editor.camera!.positions[1]!.time).toBe(8);
  await choose(label('webcamPosition'), '2 · 8.000 s');
  expect(editor.navigate).toHaveBeenLastCalledWith('second');
  await choose(label('webcamPosition'), label('webcamBasePosition'));
  expect(editor.navigate).toHaveBeenLastCalledWith(null);
  await choose(label('webcamTransition'), label('webcamInstant'));
  expect(field(label('webcamTransitionDuration'))).toBeNull();
  expect(field(label('webcamHideRange')).disabled).toBe(true);
  expect(field(label('webcamHideRange')).title).toBe(label('webcamSelectRange'));
  click('removeEdit');
  expect(editor.remove).toHaveBeenCalledOnce();
});

it('explains unavailable hide intervals and edits an existing hidden interval without exposing layout', async () => {
  editor.canHide = vi.fn(() => false);
  render = () =>
    root.render(<ReviewWebcamInspector editor={editor} range={{ start: 3, end: 5 }} />);
  act(render);
  expect(field(label('webcamHideRange')).disabled).toBe(true);
  expect(field(label('webcamHideRange')).title).toBe(label('webcamHideConflict'));
  editor.hidden = { id: 'hidden', start: 3, end: 5 };
  editor.selection = { kind: 'webcam-hidden', id: 'hidden' };
  editor.candidate = null;
  act(render);
  expect(field(label('webcamPlacement'))).toBeNull();
  await enter(label('rangeStart'), '2');
  expect(editor.hide).toHaveBeenLastCalledWith({ id: 'hidden', start: 2, end: 5 }, true);
  await enter(label('rangeEnd'), '6');
  expect(editor.hide).toHaveBeenLastCalledWith({ id: 'hidden', start: 3, end: 6 }, true);
  editor.camera = undefined;
  act(render);
  expect(host.textContent).toBe('');
});

it('keeps camera markers on the source axis and creates hide intervals through admitted drags', () => {
  editor.camera!.hiddenRanges = [{ id: 'hidden', start: 2, end: 3 }];
  editor.camera!.positions = [
    {
      id: 'position',
      time: 6,
      placement: editor.placement!,
      transition: { type: 'none', duration: 0 },
    },
  ];
  render = () =>
    root.render(<ReviewWebcamTrack editor={editor} projection={createTrackProjection(12, [])} />);
  act(render);
  const track = host.querySelector<HTMLDivElement>('[data-ui="gallery.videoReview.webcamTrack"]')!;
  expect(track.style.height).toBe('40px');
  click('webcamSettings');
  expect(editor.select).toHaveBeenCalledWith({ kind: 'webcam' });
  const markers = track.querySelectorAll<HTMLButtonElement>('button');
  act(() => markers[0]!.click());
  expect(editor.select).toHaveBeenLastCalledWith({ kind: 'webcam-hidden', id: 'hidden' });
  act(() => markers[1]!.click());
  expect(editor.navigate).toHaveBeenCalledWith('position');
  pointer(markers[1]!, 'pointerdown', 600);
  pointer(track, 'pointerup', 800);
  expect(editor.hide).not.toHaveBeenCalled();
  pointer(track, 'pointerdown', 400);
  pointer(track, 'pointermove', 700);
  pointer(track, 'pointerup', 700);
  expect(editor.hide).toHaveBeenCalledWith({ start: 4, end: 7 });
  pointer(track, 'pointerdown', 500);
  pointer(track, 'pointerup', 500);
  expect(editor.hide).toHaveBeenCalledTimes(1);
  expect(host.querySelector('[aria-label="gallery.videoReview.compactTrackHeight"]')).toBeNull();
  act(() =>
    root.render(
      <ReviewWebcamTrack compact editor={editor} projection={createTrackProjection(12, [])} />
    )
  );
  expect(track.style.height).toBe('28px');
  editor.selection = { kind: 'webcam-position', id: 'position' };
  act(render);
  editor.selection = { kind: 'webcam-hidden', id: 'hidden' };
  act(render);
  editor.camera!.enabled = false;
  act(render);
  expect(host.textContent).toBe('');
});

it('cancels camera range drags on Escape, pointer cancellation and blur without committing', () => {
  render = () =>
    root.render(<ReviewWebcamTrack editor={editor} projection={createTrackProjection(12, [])} />);
  act(render);
  const track = host.querySelector<HTMLDivElement>('[data-ui="gallery.videoReview.webcamTrack"]')!;
  editor.canHide = vi.fn(() => false);
  pointer(track, 'pointerdown', 200, 2);
  pointer(track, 'pointermove', 500);
  pointer(track, 'pointerup', 500);
  for (const cancel of ['pointercancel', 'blur', 'Escape']) {
    pointer(track, 'pointerdown', 200);
    pointer(track, 'pointermove', 500);
    if (cancel === 'Escape')
      act(() =>
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      );
    else if (cancel === 'blur') act(() => window.dispatchEvent(new Event('blur')));
    else pointer(track, cancel);
    pointer(track, 'pointerup', 500);
  }
  expect(editor.hide).not.toHaveBeenCalled();
});

it('binds preview resource recovery and canvas edits while hiding controls during export', () => {
  const dispose = vi.fn();
  vi.mocked(mountReviewWebcamPreview).mockReset().mockReturnValue(dispose);
  const main = { current: document.createElement('video') };
  const ready = vi.fn();
  let disabled = false;
  editor.selection = { kind: 'none' };
  render = () =>
    root.render(
      <ReviewWebcamOverlay
        main={main}
        output={source}
        binding={{ settings: editor.camera!, editor, disabled, onResourceReady: ready }}
      />
    );
  act(render);
  expect(host.querySelector('[role="status"]')).not.toBeNull();
  const args = () => vi.mocked(mountReviewWebcamPreview).mock.calls.at(-1)!;
  act(() => {
    args()[3].loaded(12);
    args()[3].ready(true);
  });
  expect(ready).toHaveBeenCalledOnce();
  expect(host.querySelector('[role="status"]')).toBeNull();
  const group = field(label('webcamSettings'));
  act(() => group.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })));
  expect(editor.selectVisible).toHaveBeenCalledOnce();
  expect(editor.place).toHaveBeenCalledOnce();
  editor.selection = { kind: 'webcam' };
  act(render);
  expect(args()[2]().placement).toEqual(editor.placement);
  pointer(field(label('webcamSettings')), 'pointerdown', 900);
  pointer(host.querySelector('[data-ui="gallery.videoReview.focusArea"]')!, 'pointermove', 800);
  expect(args()[2]().placement!.x).toBeLessThan(editor.placement!.x);
  pointer(host.querySelector('[data-ui="gallery.videoReview.focusArea"]')!, 'pointerup', 800);
  expect(editor.place).toHaveBeenCalledTimes(2);
  disabled = true;
  act(render);
  expect(field(label('webcamSettings'))).toBeNull();
  expect(args()[2]().placement).toBeUndefined();
  expect(host.querySelector('canvas')).not.toBeNull();
  act(() => args()[3].failed());
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  click('retry');
  expect(editor.retry).toHaveBeenCalledOnce();
  editor.resourceAttempt++;
  act(render);
  expect(dispose).toHaveBeenCalledOnce();
  expect(mountReviewWebcamPreview).toHaveBeenCalledTimes(2);
  expect(host.querySelector('[role="status"]')).not.toBeNull();
  act(() => {
    args()[3].loaded(12);
    args()[3].ready(false);
  });
  expect(field(label('webcamSettings'))).toBeNull();
  editor.resourceAttempt++;
  act(render);
  expect(mountReviewWebcamPreview).toHaveBeenCalledTimes(3);
  act(() => root.render(null));
  expect(dispose).toHaveBeenCalledTimes(3);
});

it('does not acquire camera resources before the main media element exists', () => {
  vi.mocked(mountReviewWebcamPreview).mockClear();
  act(() =>
    root.render(
      <ReviewWebcamOverlay
        main={{ current: null }}
        output={source}
        binding={{ settings: editor.camera!, editor, disabled: false }}
      />
    )
  );
  expect(mountReviewWebcamPreview).not.toHaveBeenCalled();
});

it('drags position markers once, cancels with Escape, and offers keyboard nudges', () => {
  editor.camera!.positions = [2, 8].map((time, index) => ({
    id: `p${index}`,
    time,
    placement: editor.camera!.placement,
    transition: { type: 'none', duration: 0 },
  }));
  render = () =>
    root.render(<ReviewWebcamTrack editor={editor} projection={createTrackProjection(12, [])} />);
  act(render);
  const marker = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.webcamPosition"]')!;
  pointer(marker, 'pointerdown', 200);
  pointer(marker, 'pointermove', 400);
  expect(editor.movePosition).not.toHaveBeenCalled();
  pointer(marker, 'pointerup', 400);
  expect(editor.movePosition).toHaveBeenCalledExactlyOnceWith('p0', 4);
  vi.mocked(editor.movePosition).mockClear();
  pointer(marker, 'pointerdown', 400);
  pointer(marker, 'pointermove', 700);
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  pointer(marker, 'pointerup', 700);
  expect(editor.movePosition).not.toHaveBeenCalled();
  act(() =>
    marker.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  );
  expect(editor.movePosition).toHaveBeenCalledExactlyOnceWith('p0', 4.1);
});
