// @vitest-environment jsdom
import { createNewWorkspacePresentationSettings } from '../../features/video/review/advanced/presentation';
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
import { createReviewCaptionSettings } from '../../features/video/review/text-document';

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

it('forwards caption clocks and guards conflict navigation', async () => {
  const fragment = {
    id: 'caption',
    text: 'Caption',
    originalText: 'Caption',
    start: 1,
    end: 3,
    timeDomain: 'source' as const,
    alignment: 'manual' as const,
    revision: 0,
    timingRevision: 0,
    showInVideo: true,
  };
  state.advanced.text = { version: 1, fragments: [fragment] };
  state.advanced.captions = { ...createReviewCaptionSettings(), enabled: true };
  await render();
  expect(stage().captions).toMatchObject({
    document: state.advanced.text,
    settings: state.advanced.captions,
  });
  expect(stage().captions!.segments.at(-1)!.sourceEnd).toBe(14);
  act(() => stage().onCaptionSelect!('caption'));
  expect(state.text.jump).toHaveBeenCalledExactlyOnceWith(fragment, true);
  act(() => stage().onCaptionSelect!('deleted'));
  expect(state.text.jump).toHaveBeenCalledOnce();
  state.advanced.ui.mode = 'basic';
  await render();
  expect(stage().captions).toBeUndefined();
});
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  active = { kind: 'annotation', id: 'note' };
  selection = { kind: 'point', time: 0 };
  state = {
    text: { jump: vi.fn() },
    busy: false,
    playing: false,
    voiceoverSilent: false,
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
    presentation: { settings: createNewWorkspacePresentationSettings() },
    exporter: {
      retryAssetAvailability: vi.fn(),
      index: {
        duration: 14,
        boundaries: [0, 14],
        videoCodec: 'vp9',
        audioCodec: null,
        container: 'webm',
        rotation: 0,
        width: 1280,
        height: 720,
        frameRate: 30000 / 1001,
      },
      renderSettings: { quality: 'HIGH', frameRate: 0 },
    },
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
    onMediaError: vi.fn(),
    recovering: false,
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
  expect(state.onMediaError).toHaveBeenCalledOnce();
  vi.mocked(state.timeline.timeMap.timelineToSource).mockReturnValueOnce(null);
  vi.mocked(state.seek).mockClear();
  frame().onSeek(3);
  expect(state.seek).not.toHaveBeenCalled();
});

it('keeps the authored text inspector mounted during recording playback', async () => {
  active = { kind: 'text', id: 'script' };
  state.voiceoverSilent = true;
  await render();
  stage().onPlaying(true);
  expect(active).toEqual({ kind: 'text', id: 'script' });
  expect(state.setPlaying).toHaveBeenCalledWith(true);
  stage().onPlaying(false);
  expect(active).toEqual({ kind: 'text', id: 'script' });
  state.voiceoverSilent = false;
  await render();
  stage().onPlaying(true);
  expect(active.kind).toBe('none');
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

it('routes local preview preferences and inspector entry without changing editing or transport', async () => {
  const preferences = {
    rasterPreset: '720p',
    frameRate: '30',
    pausedQuality: 'detailed',
    showFrameRate: true,
  } as const;
  const open = vi.fn();
  const raster = vi.fn();
  const before = active;
  await act(async () =>
    root.render(
      <ReviewPreviewBinding
        state={state}
        sceneActive={false}
        resource={{ file: new File(['video'], 'clip.webm'), url: 'blob:video' }}
        previewPreferences={preferences}
        onPreviewRaster={raster}
        onOpenPreviewSettings={open}
      />
    )
  );
  expect(stage().preview?.preferences).toBe(preferences);
  expect(stage().preview?.playing).toBe(state.playing);
  expect(stage().preview?.sourceToResult(1)).toBe(state.timeline.timeMap.sourceToTimeline(1));
  stage().preview?.onRaster?.({ width: 1280, height: 720 });
  expect(raster).toHaveBeenCalledWith({ width: 1280, height: 720 });
  const trigger = document.createElement('button');
  frame().onOpenPreviewSettings?.(trigger);
  expect(open).toHaveBeenCalledWith(trigger);
  expect(active).toBe(before);
  expect(state.play).not.toHaveBeenCalled();
  expect(state.seek).not.toHaveBeenCalled();
});

it('keeps one full-sequence draft plan across frame updates and uses the resolved fractional output rate', async () => {
  await render();
  const plan = stage().outerFadePlan!;
  expect(plan.rate).toEqual({ numerator: 30000, denominator: 1001 });
  state = { ...state, time: 2, timeline: { ...state.timeline, sceneOutputTime: 2 } };
  await render();
  expect(stage().outerFadePlan).toBe(plan);
  state.presentation = { settings: { ...state.presentation.settings, color: '#ffffffff' } };
  await render();
  expect(stage().outerFadePlan).not.toBe(plan);
  expect(stage().outerFadePlan?.color).toBe('#ffffffff');
  state.advanced = { ...state.advanced, ui: { ...state.advanced.ui, mode: 'basic' } };
  await render();
  expect(stage().outerFadePlan).toBeUndefined();
});
it('does not substitute a fallback cadence when the output profile is invalid', async () => {
  state.exporter.index = { ...state.exporter.index!, frameRate: NaN };
  await render();
  expect(stage().outerFadePlan).toBeUndefined();
});

it('keeps decoder recovery busy without moving the restored frame to an annotation anchor', async () => {
  state.recovering = true;
  state.composer.annotation = { id: 'note', text: 'Draft', anchor: { kind: 'point', time: 2 } };
  await render();
  expect(frame().disabled).toBe(true);
  expect(host.querySelector('main')?.getAttribute('aria-busy')).toBe('true');
  stage().onReady();
  expect(state.seek).not.toHaveBeenCalled();
});
