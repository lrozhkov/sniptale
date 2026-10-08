// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewPreviewBinding } from './preview-binding';
import type { ReviewStageBinding } from './stage-binding';
import type { ReviewPreviewFrame } from './preview-frame';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { createReviewTimeMap } from '../../features/video/review/timeline';
import type { ReviewAnnotation, ReviewSource } from '../../features/video/review/types';
import { createQuickEditWatermark } from '../../features/video/review/advanced/watermark';

const io = vi.hoisted(() => ({
  stage: vi.fn(),
  frame: vi.fn(),
  feedback: vi.fn(),
  fullscreen: false,
}));
vi.mock('../../platform/i18n', () => ({ translate: (key: string) => key }));
vi.mock('./stage-binding', () => ({
  ReviewStageBinding: (props: unknown) => {
    io.stage(props);
    return null;
  },
}));
vi.mock('./preview-frame', () => ({
  ReviewPreviewFrame: (props: ComponentProps<typeof ReviewPreviewFrame>) => {
    io.frame(props);
    return props.children(io.fullscreen);
  },
}));
vi.mock('./feedback', () => ({
  ReviewFeedback: (props: unknown) => {
    io.feedback(props);
    return null;
  },
}));
let root: Root;
let host: HTMLDivElement;
let state: ComponentProps<typeof ReviewPreviewBinding>['state'];
let active: import('../../features/video/review/types').ReviewSelection;
let selection: import('../../features/video/review/types').ReviewAnchor;
const region = createQuickEditZoomRegion({ id: 'focus', at: 0, duration: 2, endMax: 4 });
const source: ReviewSource = {
  duration: 14,
  width: 1280,
  height: 720,
  mimeType: 'video/webm',
  size: 5,
};
const stage = () => io.stage.mock.lastCall![0] as ComponentProps<typeof ReviewStageBinding>;
const frame = () => io.frame.mock.lastCall![0] as ComponentProps<typeof ReviewPreviewFrame>;
async function render(sceneActive = true) {
  await act(async () =>
    root.render(
      <ReviewPreviewBinding
        state={state}
        sceneActive={sceneActive}
        resource={{ file: new File(['video'], 'clip.webm'), url: 'blob:video' }}
      />
    )
  );
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  active = { kind: 'annotation', id: 'note' };
  selection = { kind: 'point', time: 0 };
  state = {
    busy: false,
    playing: false,
    time: 0,
    message: 'notice',
    clickCues: [],
    keyCues: [],
    displayRegion: undefined,
    features: {
      webcam: undefined,
      canvas: undefined,
      windowHeader: undefined,
      background: { enabled: false },
      zoomApplied: true,
      zoomTrackVisible: true,
      zoomRegions: [],
      overlaysVisible: true,
    },
    composer: { annotation: null, change: vi.fn() },
    snapshot: { document: { edits: [], canvasComments: [], annotations: [] } },
    canvasComments: {
      selectedId: null,
      setGeometry: vi.fn(),
      onSelect: vi.fn(),
      onPatch: vi.fn(async () => undefined),
    },
    audio: { originalFeedback: null, dismissOriginalFeedback: vi.fn() },
    webcam: {
      failed: false,
      pending: false,
      retry: vi.fn(),
      crop: undefined,
      placement: undefined,
      resourceAttempt: 0,
      selection: { kind: 'none' },
      time: 0,
      place: vi.fn(),
      selectVisible: vi.fn(),
    },
    timeline: {
      sceneOutputTime: 1,
      resultDuration: 4,
      timeMap: {
        ...createReviewTimeMap(14, [
          { id: 'cut', kind: 'cut', start: 0, end: 10, requestedStart: 0, requestedEnd: 10 },
        ]),
        timelineToSource: vi.fn(
          createReviewTimeMap(14, [
            { id: 'cut', kind: 'cut', start: 0, end: 10, requestedStart: 0, requestedEnd: 10 },
          ]).timelineToSource
        ),
      },
    },
    editing: { exporter: { phase: 'idle' } },
    beforeAction: (action: () => void) => action(),
    play: vi.fn(),
    seek: vi.fn(),
    setActiveSelection: (value: typeof active | ((previous: typeof active) => typeof active)) => {
      active = typeof value === 'function' ? value(active) : value;
    },
    setSelection: (update) => {
      selection = typeof update === 'function' ? update(selection) : update;
    },
    advanced: {
      ...createQuickEditAdvancedState(),
      ui: { ...createQuickEditAdvancedState().ui, mode: 'advanced' },
      zoom: { enabled: true, regions: [region] },
    },
    watermark: {
      settings: { ...createQuickEditWatermark('Draft'), mode: 'text' },
      pending: false,
      preview: vi.fn(),
      change: vi.fn(),
      onResourceError: vi.fn(),
      resourceRetryGeneration: 2,
    },
    exporter: { retryAssetAvailability: vi.fn() },
    source,
    backgroundImport: { pending: false },
    video: { current: null },
    zoom: {
      selected: () => region,
      previewRegion: (value) => value,
      preview: vi.fn(),
      change: vi.fn(),
      setSelection: vi.fn(),
    },
    onTime: (time: number) => time + 1,
    setPlaying: vi.fn(),
    onEnded: vi.fn(),
    setMessage: vi.fn(),
  };
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.clearAllMocks();
  io.fullscreen = false;
  vi.unstubAllGlobals();
});

it('maps transport seeks and playback events while preserving non-point selections', async () => {
  await render();
  frame().onSeek(2);
  expect(state.seek).toHaveBeenCalledWith(12, false);
  expect(active.kind).toBe('none');
  frame().onPlay();
  expect(state.play).toHaveBeenCalledOnce();
  stage().onTime(2);
  expect(selection).toEqual({ kind: 'point', time: 3 });
  selection = { kind: 'range', start: 0, end: 1 };
  stage().onTime(3);
  expect(selection).toEqual({ kind: 'range', start: 0, end: 1 });
  active = { kind: 'annotation', id: 'note' };
  stage().onPlaying(true);
  expect(active.kind).toBe('none');
  stage().onPlaying(false);
  expect(state.setPlaying).toHaveBeenLastCalledWith(false);
  stage().onEnded?.();
  expect(state.onEnded).toHaveBeenCalledOnce();
  stage().onError();
  expect(state.setMessage).toHaveBeenCalledWith('gallery.videoReview.playbackFailed');
  vi.mocked(state.timeline.timeMap.timelineToSource).mockReturnValueOnce(null);
  vi.mocked(state.seek).mockClear();
  frame().onSeek(3);
  expect(state.seek).not.toHaveBeenCalled();
});

it('admits scene gestures only while idle and reconnects resource recovery to export readiness', async () => {
  await render();
  expect(stage().watermark?.editable).toBe(true);
  stage().watermark?.onError?.('Unavailable');
  expect(state.watermark.onResourceError).toHaveBeenCalledWith('Unavailable');
  stage().watermark?.onReady?.();
  expect(state.exporter.retryAssetAvailability).toHaveBeenCalledOnce();
  await render(false);
  expect(stage().watermark?.editable).toBe(false);
  state.playing = true;
  await render();
  expect(stage().watermark?.editable).toBe(false);
  state.playing = false;
  state.watermark.pending = true;
  await render();
  expect(stage().watermark?.editable).toBe(false);
  state.advanced.ui.mode = 'basic';
  await render();
  expect(stage().watermark).toBeUndefined();
});

it('selects fullscreen focus through the cut map and commits its overlay gesture by id', async () => {
  io.fullscreen = true;
  await render();
  stage().focusPicker?.onSelect('missing');
  expect(state.zoom.setSelection).not.toHaveBeenCalled();
  stage().focusPicker?.onSelect('focus');
  expect(state.zoom.setSelection).toHaveBeenCalledWith('focus');
  expect(state.seek).toHaveBeenCalledWith(11, false);
  stage().zoomOverlay?.onPreview({ scale: 2 });
  stage().zoomOverlay?.onChange({ scale: 2 });
  expect(state.zoom.change).toHaveBeenCalledWith('focus', { scale: 2 });
  stage().zoomOverlay?.onInteract?.();
  expect(state.seek).toHaveBeenLastCalledWith(11, false);
  state.busy = true;
  await render();
  expect(stage().focusPicker).toBeUndefined();
  expect(stage().zoomOverlay).toBeUndefined();
});

it('shows webcam recovery and dismisses both feedback owners', async () => {
  state.webcam.pending = true;
  await render();
  expect(host.querySelector('[role="status"]')).not.toBeNull();
  state.webcam.failed = true;
  await render();
  act(() => host.querySelector<HTMLButtonElement>('button')!.click());
  expect(state.webcam.retry).toHaveBeenCalledOnce();
  (io.feedback.mock.lastCall![0] as { onDismiss(): void }).onDismiss();
  expect(state.setMessage).toHaveBeenCalledWith(null);
  expect(state.audio.dismissOriginalFeedback).toHaveBeenCalledOnce();
});

it('restores annotation anchors on media readiness and restricts drawing to an idle composer', async () => {
  const annotation: ReviewAnnotation = {
    id: 'note',
    text: 'Note',
    anchor: { kind: 'point', time: 2 },
  };
  state.composer.annotation = annotation;
  await render();
  stage().onReady();
  expect(state.seek).toHaveBeenLastCalledWith(2);
  const region = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };
  stage().onRegion(region);
  expect(state.composer.change).toHaveBeenCalledWith({ ...annotation, region });
  expect(stage().watermark?.editable).toBe(false);
  state.composer.annotation = {
    ...annotation,
    anchor: { kind: 'range', start: 1, end: 3 },
  };
  state.busy = true;
  await render();
  stage().onReady();
  expect(state.seek).toHaveBeenLastCalledWith(1);
  vi.mocked(state.composer.change).mockClear();
  stage().onRegion(region);
  expect(state.composer.change).not.toHaveBeenCalled();
});
