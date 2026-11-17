// @vitest-environment jsdom
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseAnimationTemplateSource } from '@sniptale/runtime-contracts/animation-template';
import { DEFAULT_QUICK_PREVIEW_PREFERENCES } from '../../features/video/preview/quick-preferences';
import { createNewWorkspacePresentationSettings } from '../../features/video/review/advanced/presentation';
import { act, Suspense, useState, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  ReviewPreviewBinding as PreviewBinding,
  type ReviewPreviewInputs,
} from './preview-binding';
import { useReviewPreviewInputs } from './index';
import type { ReviewStageBinding } from './stage-binding';
import type { ReviewPreviewFrame } from './preview-frame';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { createReviewTimeMap } from '../../features/video/review/timeline';
import type { ReviewAnnotation, ReviewSource } from '../../features/video/review/types';
import { createQuickEditWatermark } from '../../features/video/project/scene/watermark';
import { createReviewCaptionSettings } from '../../features/video/review/text-document';
import { createVideoReviewSession } from '../../workflows/video-review/session';
import type { LoadedReview } from './use-session';

const FRAME_SOURCE = readFileSync(
  'apps/extension/public/video-effects/animations/frame.sniptale-animation.json',
  'utf8'
);
const FRAME_DOCUMENT = parseAnimationTemplateSource(FRAME_SOURCE);
if (!FRAME_DOCUMENT.ok) throw new Error('Expected valid shipped frame animation.');
const FRAME_HASH = createHash('sha256').update(FRAME_SOURCE).digest('hex');
const FRAME_SNAPSHOT = {
  id: `effect:${FRAME_HASH}`,
  schemaVersion: 'sniptale.animation.v1' as const,
  kind: 'standalone' as const,
  documentId: FRAME_DOCUMENT.template.id,
  sha256: FRAME_HASH,
  source: FRAME_SOURCE,
  retainedByteLength: Buffer.byteLength(FRAME_SOURCE),
  assets: [],
};
const io = vi.hoisted(() => ({
  inputs: vi.fn(),
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
function ReviewPreviewBinding({
  state,
  resource,
  ...props
}: {
  state: Parameters<typeof useReviewPreviewInputs>[1];
  resource: Parameters<typeof useReviewPreviewInputs>[0];
} & Omit<ComponentProps<typeof PreviewBinding>, keyof ReviewPreviewInputs>) {
  const inputs = useReviewPreviewInputs(resource, state);
  io.inputs(inputs);
  return <PreviewBinding {...inputs} {...props} />;
}

let root: Root;
let host: HTMLDivElement;
let state: ComponentProps<typeof ReviewPreviewBinding>['state'];
let active: import('../../features/video/review/types').ReviewSelection;
let selection: import('../../features/video/review/types').ReviewAnchor;
let session: LoadedReview['session'];
let mediaFile: File;
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
async function render(
  sceneActive = true,
  previewPreferences?: ComponentProps<typeof ReviewPreviewBinding>['previewPreferences']
) {
  await act(async () =>
    root.render(
      <ReviewPreviewBinding
        state={state}
        sceneActive={sceneActive}
        previewPreferences={previewPreferences}
        resource={{ file: mediaFile, url: 'blob:video', session }}
      />
    )
  );
}

it('forwards immutable session annotation sources and full clocks, reading local bytes without Save', async () => {
  state.features.annotationEffects = {
    enabled: true,
    instances: [
      {
        id: 'frame',
        snapshotId: FRAME_SNAPSHOT.id,
        enabled: true,
        start: 0,
        end: 14,
        attachment: 'content',
        transform: { x: 0, y: 0, width: 1, height: 1, rotation: 0 },
        controls: {},
        order: 0,
      },
    ],
  };
  const captured = session.getSnapshot();
  const effectSnapshots = [{ ...FRAME_SNAPSHOT }];
  vi.spyOn(session, 'getSnapshot').mockReturnValue({
    ...captured,
    snapshot: {
      ...captured.snapshot,
      workspace: { ...captured.snapshot.workspace, effectSnapshots },
    },
  });
  const bytes = new Blob(['protected local image'], { type: 'image/png' });
  const read = vi.spyOn(session, 'readAnnotationResource').mockResolvedValueOnce(bytes);
  await render();
  expect(stage().annotationEffects).toEqual({
    lane: state.features.annotationEffects,
    snapshots: effectSnapshots,
    segments: state.timeline.timeMap.getSegments(),
  });
  const controller = new AbortController();
  expect(await stage().readAsset!('project-asset:local', controller.signal)).toBe(bytes);
  expect(read).toHaveBeenCalledExactlyOnceWith('project-asset:local', controller.signal);
  expect(session.getSnapshot().snapshot.workspace.revision).toBe(1);
  controller.abort();
  await expect(stage().readAsset!('project-asset:other', controller.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(read).toHaveBeenCalledOnce();
  state.features.annotationEffects = undefined;
  await render();
  expect(stage().annotationEffects).toBeUndefined();
});

it('keeps scene, request and command ports stable across selection and feedback changes', async () => {
  await render();
  const first = io.inputs.mock.lastCall![0] as ReviewPreviewInputs;
  state = {
    ...state,
    activeSelection: { kind: 'annotation-effect', id: 'chosen' },
    message: 'changed',
    busy: true,
  };
  await render();
  const next = io.inputs.mock.lastCall![0] as ReviewPreviewInputs;
  expect(next.scene).toBe(first.scene);
  expect(next.request).toBe(first.request);
  expect(next.commands).toBe(first.commands);
  expect(next.overlays.selection).toEqual({ kind: 'annotation-effect', id: 'chosen' });
  expect(next.status.message).toBe('changed');
  expect(next.status.busy).toBe(true);
});

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
  mediaFile = new File(['video'], 'clip.webm');
  active = { kind: 'annotation', id: 'note' };
  selection = { kind: 'point', time: 0 };
  session = createVideoReviewSession({
    workspace: {
      aggregateId: 'recording:r',
      sourceAssetId: 'original',
      formatVersion: 1,
      source,
      revision: 1,
      cursor: 0,
      history: [],
      advanced: createQuickEditAdvancedState(),
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  });
  state = {
    readPosition: () => ({
      epoch: state.seekRevision,
      mapRevision: 0,
      resultTime:
        state.playheadClock.readResult?.() ??
        state.timeline.readOutputTime?.(state.playheadClock.read()) ??
        state.timeline.timeMap.sourceToTimeline(state.playheadClock.read()),
      source: {
        kind: 'video',
        sourceTime: state.playheadClock.read(),
        mediaTime: state.playheadClock.read(),
        segmentId: 'source',
      },
      media: { sourceId: 'blob:video', time: state.playheadClock.read() },
    }),
    text: { jump: vi.fn() },
    busy: false,
    playing: false,
    voiceoverSilent: false,
    time: 0,
    seekRevision: 0,
    playheadClock: {
      read: () => state.time,
      readResult: () => state.timeline.sceneOutputTime,
      isPlaying: () => state.playing,
      subscribe: () => () => {},
    },
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
      annotationEffects: undefined,
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
      sourceTime: 0,
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
      previewChanges: { read: () => null, subscribe: () => () => {} },
      previewRegion: (value) => value,
      preview: vi.fn(),
      change: vi.fn(),
      setSelection: vi.fn(),
    },
    onTime: () => 3,
    onMediaPlayback: vi.fn(),
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

it('routes native ended to transport without admitting a note-completion command', async () => {
  const beforeAction = vi.fn((action: () => void) => action());
  state.beforeAction = beforeAction;
  state.composer.annotation = {
    id: 'later-note',
    text: '',
    anchor: { kind: 'point', time: source.duration },
  };
  await render();
  stage().onEnded?.();
  expect(state.onEnded).toHaveBeenCalledOnce();
  expect(beforeAction).not.toHaveBeenCalled();
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
  expect(state.onMediaPlayback).toHaveBeenLastCalledWith(false);
  stage().onEnded?.();
  expect(state.onEnded).toHaveBeenCalledOnce();
  stage().onError();
  expect(state.onMediaError).toHaveBeenCalledOnce();
  vi.mocked(state.timeline.timeMap.timelineToSource).mockReturnValueOnce(null);
  vi.mocked(state.seek).mockClear();
  frame().onSeek(3);
  expect(state.seek).not.toHaveBeenCalled();
});

it('retains the point selection when native playback reports the same time again', async () => {
  selection = { kind: 'point', time: 3 };
  const previous = selection;
  await render();
  stage().onTime(2);
  expect(selection).toBe(previous);
});

it('keeps the displayed timeline available while a native playback observation prepares its next view', async () => {
  const pending = new Promise<void>(() => {});
  function TimelinePoint({ time }: { time: number }) {
    if (time > 0) throw pending;
    return <span>Displayed point</span>;
  }
  function Harness() {
    const [anchor, setAnchor] = useState<typeof selection>({ kind: 'point', time: 0 });
    const [observedTime, setObservedTime] = useState(0);
    return (
      <Suspense fallback={<span>Preparing timeline</span>}>
        <ReviewPreviewBinding
          state={{
            ...state,
            setSelection: setAnchor,
            onTime: () => {
              setObservedTime(1);
              return 1;
            },
          }}
          sceneActive
          resource={{ file: new File(['video'], 'clip.webm'), url: 'blob:video', session }}
        />
        <TimelinePoint time={Math.max(observedTime, anchor.kind === 'point' ? anchor.time : 0)} />
      </Suspense>
    );
  }
  await act(async () => root.render(<Harness />));
  expect(host.textContent).toContain('Displayed point');
  await act(async () => stage().onTime(1));
  expect(host.textContent).not.toContain('Preparing timeline');
  expect(host.querySelector('span')?.style.display).not.toBe('none');
});

it('keeps the authored text inspector mounted during recording playback', async () => {
  active = { kind: 'text', id: 'script' };
  state.voiceoverSilent = true;
  await render();
  stage().onPlaying(true);
  expect(active).toEqual({ kind: 'text', id: 'script' });
  expect(state.onMediaPlayback).toHaveBeenCalledWith(true);
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
  await render(true, DEFAULT_QUICK_PREVIEW_PREFERENCES);
  expect(host.querySelector('[role="status"]')).toBeNull();
  expect(stage().preview?.waitingReason).toContain('webcam');
  state.webcam.failed = true;
  await render(true, DEFAULT_QUICK_PREVIEW_PREFERENCES);
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
    renderer: 'gpu',
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
        resource={{ file: new File(['video'], 'clip.webm'), url: 'blob:video', session }}
        previewPreferences={preferences}
        onPreviewRaster={raster}
        onOpenPreviewSettings={open}
      />
    )
  );
  expect(stage().preview?.preferences).toBe(preferences);
  expect(stage().preview?.playing).toBe(state.playing);
  expect(stage().preview?.onPresentationActive).toBeUndefined();
  expect(stage().preview?.onPresentedTime).toBeUndefined();
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

it('uses effective preview controls and retains geometry while overlays are hidden', async () => {
  const instance: import('../../features/video/review/annotation-effects/types').ReviewAnnotationEffect =
    {
      id: 'selected',
      snapshotId: 'immutable',
      enabled: true,
      start: 0,
      end: 14,
      attachment: 'content',
      transform: { x: 0.1, y: 0.1, width: 0.4, height: 0.2, rotation: 0 },
      controls: { title: 'Authored' },
      order: 0,
    };
  const lane = { enabled: true, instances: [instance] };
  const previewLane = { ...lane, instances: [{ ...instance, controls: { title: 'Disposable' } }] };
  state.features.annotationEffects = lane;
  state.annotationEffects = {
    lane,
    previewLane,
    geometry: { read: () => null, subscribe: () => () => undefined },
    gestureId: instance.id,
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
  state.activeSelection = { kind: 'annotation-effect', id: instance.id };
  await render();
  expect(stage().annotationEffects?.lane).toBe(previewLane);
  expect(stage().annotationEditing?.selectedId).toBe(instance.id);
  expect(stage().annotationEditing?.time).toBe(state.timeline.sceneOutputTime);
  state.busy = true;
  state.annotationEffects.pending = true;
  await render();
  expect(stage().annotationEditing?.selectedId).toBe(instance.id);
  expect(stage().annotationEditing?.busy).toBe(true);
  expect(stage().annotationEditing?.editor).toBe(state.annotationEffects);
  state.busy = false;
  state.annotationEffects.pending = false;

  expect(stage().onAnnotationGeometry).toBe(state.annotationEffects?.setGeometry);
  const workspace = session.getSnapshot();
  vi.spyOn(session, 'getSnapshot').mockReturnValue({
    ...workspace,
    snapshot: {
      ...workspace.snapshot,
      workspace: { ...workspace.snapshot.workspace, effectSnapshots: [FRAME_SNAPSHOT] },
    },
  });
  state.features.annotationEffects = undefined;
  await render();
  expect(stage().annotationEffects).toBeUndefined();
  expect(stage().annotationEditing?.snapshots).toEqual([FRAME_SNAPSHOT]);
  state.features.annotationEffects = lane;
  state.features.overlaysVisible = false;
  await render();
  expect(stage().annotationEditing).toBeUndefined();
  expect(stage().annotationEffects?.lane).toBe(previewLane);
  expect(stage().onAnnotationGeometry).toBe(state.annotationEffects?.setGeometry);
  state.features.annotationEffects = undefined;
  state.advanced.ui.mode = 'basic';
  await render();
  expect(stage().annotationEffects).toBeUndefined();
  expect(stage().annotationEditing).toBeUndefined();
});

it('shows the cursor authoring overlay only for an explicitly selected key', async () => {
  state.setCursorFocusPath = vi.fn();
  state.cursorFocusPath = {
    version: 1,
    smoothing: 0.5,
    sensitivity: 0.5,
    mode: 'follow',
    gapPolicy: 'hold',
    segments: [],
  };
  state.activeSelection = { kind: 'none' };
  await render(true);
  expect(stage().cursorPath).toBeUndefined();
  state.activeSelection = { kind: 'cursor-focus', id: 'key', time: 1 };
  const recorded = {
    id: 'key',
    timelineId: 'key',
    segmentId: 'segment',
    sourceTime: 1,
    time: 1,
    x: 0.7,
    y: 0.4,
    anchor: 'movement' as const,
    interpolation: 'linear' as const,
    binding: { kind: 'project' as const },
  };
  state.cursorFocusKeys = [recorded];
  await render(false);
  expect(stage().cursorPath?.selectedKeyId).toBe('key');
  expect(stage().cursorPath?.recordedKey).toBe(recorded);
  state.playing = true;
  await render(false);
  expect(stage().cursorPath).toBeUndefined();
});

it('forwards inspector draft interaction to the preview and clears it after cancellation', async () => {
  let draft: ReturnType<typeof state.zoom.previewChanges.read> = null;
  const listeners = new Set<() => void>();
  state.zoom.previewChanges = {
    read: () => draft,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  await render(true, DEFAULT_QUICK_PREVIEW_PREFERENCES);
  expect(stage().preview?.interacting).toBe(false);
  act(() => {
    draft = { id: 'focus', patch: { scale: 2 }, base: 'revision' };
    for (const listener of listeners) listener();
  });
  expect(stage().preview?.interacting).toBe(true);
  act(() => {
    draft = null;
    for (const listener of listeners) listener();
  });
  expect(stage().preview?.interacting).toBe(false);
  expect(state.zoom.change).not.toHaveBeenCalled();
});

it('shows a retryable history failure while keeping the existing video transport available', async () => {
  const retry = vi.fn();
  state.history = {
    telemetry: null,
    pending: false,
    initialLoading: false,
    failed: true,
    incomplete: false,
    retry,
  };
  await render(true, DEFAULT_QUICK_PREVIEW_PREFERENCES);
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    'gallery.videoReview.recordingHistoryFailed'
  );
  const button = [...host.querySelectorAll('button')].find((node) =>
    node.textContent?.includes('gallery.videoReview.retry')
  );
  expect(button).toBeDefined();
  await act(async () => button!.click());
  expect(retry).toHaveBeenCalledOnce();
  const notices = host.querySelector('[data-ui="gallery.videoReview.previewNotices"]');
  expect(notices?.classList.contains('absolute')).toBe(true);
  expect(notices?.classList.contains('inset-x-0')).toBe(true);
  expect(notices?.contains(host.querySelector('[role="alert"]'))).toBe(true);
  expect(frame().disabled).toBe(false);
  state.history = { ...state.history, failed: false, pending: true, initialLoading: true };
  await render(true, DEFAULT_QUICK_PREVIEW_PREFERENCES);
  expect(stage().preview?.waitingReason).toContain('gallery.videoReview.recordingHistoryLoading');
  expect(host.querySelector('[role="status"]')).toBeNull();
  expect(host.querySelector('[role="alert"]')).toBeNull();
});

it('keeps background history refresh out of the stage layout', async () => {
  state.history = {
    telemetry: null,
    pending: true,
    initialLoading: false,
    failed: false,
    incomplete: false,
    retry: vi.fn(),
  };
  await render();
  expect(host.textContent).not.toContain('gallery.videoReview.recordingHistoryLoading');
  expect(frame().disabled).toBe(false);
});

it('keeps incomplete retained history silent without blocking video', async () => {
  state.history = {
    telemetry: null,
    failed: false,
    pending: false,
    initialLoading: false,
    incomplete: true,
    retry: vi.fn(),
  };
  await render();
  expect(host.textContent).not.toContain('gallery.videoReview.recordingHistoryIncomplete');
  expect(host.querySelector('[role="status"]')).toBeNull();
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(frame().disabled).toBe(false);
});

it.each([
  { local: true, inherited: false, suspended: true },
  { local: undefined, inherited: true, suspended: true },
  { local: false, inherited: true, suspended: false },
])(
  'keeps accepted scene identity during follow drafts (local=$local inherited=$inherited)',
  async ({ local, inherited, suspended }) => {
    const accepted = { ...region, ...(local === undefined ? {} : { followCursor: local }) };
    state.zoom.selected = () => accepted;
    state.advanced.cursorFocusPath = {
      version: 1,
      mode: inherited ? 'follow' : 'fixed',
      smoothing: 0.5,
      sensitivity: 0.5,
      gapPolicy: 'hold',
      segments: [],
    };
    let draft: ReturnType<typeof state.zoom.previewChanges.read> = null;
    const listeners = new Set<() => void>();
    state.zoom.previewChanges = {
      read: () => draft,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    };
    state.zoom.previewRegion = (value, snapshot = draft) =>
      snapshot
        ? {
            ...value,
            transform: { ...value.transform, scale: snapshot.patch.scale ?? value.transform.scale },
          }
        : value;
    await render(true, DEFAULT_QUICK_PREVIEW_PREFERENCES);
    for (const scale of [1.1, 1.2, 1.3]) {
      act(() => {
        draft = { id: accepted.id, patch: { scale }, base: 'revision' };
        listeners.forEach((listener) => listener());
      });
      expect(stage().preview?.interacting).toBe(true);
      if (suspended) expect(stage().zoomOverlay?.region).toBe(accepted);
      else expect(stage().zoomOverlay?.region.transform.scale).toBe(scale);
    }
    act(() => {
      draft = null;
      listeners.forEach((listener) => listener());
    });
    expect(stage().zoomOverlay?.region).toBe(accepted);
    expect(stage().preview?.interacting).toBe(false);
    expect(state.zoom.change).not.toHaveBeenCalled();
  }
);

it('routes audio preparation to the FPS waiting reason without disabling cancellation', async () => {
  state = { ...state, preparingPlayback: true };
  await render(true, DEFAULT_QUICK_PREVIEW_PREFERENCES);
  expect(stage().preview?.waitingReason).toContain('gallery.videoReview.audioPreparing');
  expect(frame().disabled).toBe(false);
  expect(host.querySelector('[role="alert"]')).toBeNull();
  state = { ...state, preparingPlayback: false };
  await render(true, DEFAULT_QUICK_PREVIEW_PREFERENCES);
  expect(stage().preview?.waitingReason).toBeUndefined();
});

function controlledPreviewClock(sourceTime: number, resultTime: number, playing: boolean) {
  const listeners = new Set<() => void>();
  return {
    read: () => sourceTime,
    readResult: () => resultTime,
    isPlaying: () => playing,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    publish(source: number, result: number, running: boolean) {
      sourceTime = source;
      resultTime = result;
      playing = running;
      for (const listener of listeners) listener();
    },
  };
}

it('keeps sampled updates outside PreviewBinding and the stage during a freeze', async () => {
  vi.useFakeTimers();
  try {
    const clock = controlledPreviewClock(1, 1.2, true);
    const freeze = {
      id: 'hold',
      kind: 'freeze' as const,
      start: 1,
      end: 1,
      requestedStart: 1,
      requestedEnd: 1,
      duration: 2,
      frameTime: 0.98,
      frameDuration: 0.04,
    };
    state = Object.assign(state, {
      playheadClock: clock,
      playing: true,
      time: 1,
      timeline: {
        ...state.timeline,
        sceneOutputTime: 1.2,
        timeMap: createReviewTimeMap(14, [freeze]),
      },
    });
    io.fullscreen = true;
    await render(true, { ...DEFAULT_QUICK_PREVIEW_PREFERENCES, renderer: 'legacy' });
    const initialRenders = io.stage.mock.calls.length;
    await act(async () => {
      for (let index = 0; index < 10; index++) clock.publish(1, 1.8, true);
    });
    expect(io.stage).toHaveBeenCalledTimes(initialRenders);
    await act(async () => vi.advanceTimersByTime(100));
    expect(io.stage).toHaveBeenCalledTimes(initialRenders);
    expect(stage().outputTime).toBe(1.2);
    expect(stage().time).toBe(freeze.frameTime);
    expect(stage().cutPreview?.time).toBe(1.2);
    expect(frame().time).toBe(1.2);
    expect(frame().clock).toBe(clock);
    expect(frame().readPosition?.().resultTime).toBe(1.8);
    expect(state.time).toBe(1);
    expect(state.timeline.sceneOutputTime).toBe(1.2);
  } finally {
    vi.useRealTimers();
  }
});

it('publishes paused seeks immediately and cancels an older pending playback sample', async () => {
  vi.useFakeTimers();
  try {
    const clock = controlledPreviewClock(10, 0, true);
    state = Object.assign(state, {
      playheadClock: { read: clock.read, isPlaying: clock.isPlaying, subscribe: clock.subscribe },
      playing: true,
    });
    await render();
    await act(async () => clock.publish(11, 1, true));
    await act(async () => clock.publish(12, 2, false));
    state = { ...state, playing: false };
    await render();
    expect(frame().time).toBe(2);
    expect(stage().time).toBe(12);
    const renders = io.stage.mock.calls.length;
    await act(async () => vi.advanceTimersByTime(100));
    expect(io.stage).toHaveBeenCalledTimes(renders);
  } finally {
    vi.useRealTimers();
  }
});

it('keeps transport observations live without changing the root point during playback', async () => {
  const setSelection = vi.fn(state.setSelection);
  const onTime = vi.fn(state.onTime);
  state = { ...state, playing: true, setSelection, onTime };
  await render();
  act(() => stage().onTime(2));
  expect(onTime).toHaveBeenCalledExactlyOnceWith();
  expect(setSelection).not.toHaveBeenCalled();
  state = { ...state, playing: false };
  await render();
  act(() => stage().onTime(2));
  expect(selection).toEqual({ kind: 'point', time: 3 });
});

it('leaves clock subscription to the fullscreen rail and admits explicit seeks immediately', async () => {
  vi.useFakeTimers();
  try {
    const clock = controlledPreviewClock(10, 0, true);
    const subscribe = vi.fn(clock.subscribe);
    clock.subscribe = subscribe;
    state = { ...state, playheadClock: clock, playing: true };
    Object.defineProperty(state, 'time', { get: clock.read });
    Object.defineProperty(state.timeline, 'sceneOutputTime', { get: clock.readResult });
    await render();
    await act(async () => clock.publish(11, 1, true));
    await act(async () => vi.advanceTimersByTime(100));
    expect(frame().time).toBe(0);
    expect(frame().readPosition?.().resultTime).toBe(1);
    expect(subscribe).not.toHaveBeenCalled();
    await act(async () => clock.publish(12, 2, true));
    state = Object.assign({}, state, { seekRevision: 1 });
    await render();
    expect(frame().time).toBe(2);
  } finally {
    vi.useRealTimers();
  }
});
