// @vitest-environment jsdom
import { VideoMotionOverlayZoomMode } from '../../../../features/video/project/types';
import { expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { PreviewStageRootSurfaceProps } from './types';
import { createPreviewEffectRuntimeFeedbackTestStub } from '../scene/test-support';
import { createVideoPreviewExactFrameCache } from '../../cache/exact-frame-cache';
import { usePreviewStageCanvasScene } from '../scene/index';
vi.mock('../scene/index', () => ({ usePreviewStageCanvasScene: vi.fn() }));
import { isValidElement } from 'react';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { createPreviewStageSelectionOverlay, PreviewStageRoot } from './root';
import { PreviewEffectEditorRegion } from './editor-region';
it('routes FX selection to its region instead of a source-clip transform, only in editor mode', () => {
  const props: Parameters<typeof createPreviewStageSelectionOverlay>[0] = {
    mode: 'editor',
    project: createEmptyVideoProject('region'),
    currentTime: 1,
    selectedEffectInstanceId: 'fx',
    selectedClip: null,
    selectedClipLocked: false,
    stageRef: { current: null },
    beginInteraction: () => {},
    camera: {
      scale: 1,
      viewportX: 0,
      viewportY: 0,
      viewportWidth: 1920,
      viewportHeight: 1080,
      focusPoint: { x: 960, y: 540 },
      motionBlurAmount: 0,
      regionId: null,
      overlayZoomMode: VideoMotionOverlayZoomMode.LOCK_OVERLAYS,
    },
  };
  props.project.effectInstances = [
    {
      id: 'fx',
      kind: 'targetEffect',
      target: { kind: 'video-group' },
      snapshotId: 'snapshot',
      startTime: 0,
      duration: 4,
      playbackRate: 1,
      controls: {},
      enabled: true,
    },
  ];
  const result = createPreviewStageSelectionOverlay(props);
  expect(isValidElement(result) && result.type).toBe(PreviewEffectEditorRegion);
  expect(createPreviewStageSelectionOverlay({ ...props, mode: 'player' })).toBeNull();
  props.project.effectInstances[0]!.kind = 'standalone';
  const annotation = createPreviewStageSelectionOverlay(props);
  expect(isValidElement(annotation) && annotation.type).not.toBe(PreviewEffectEditorRegion);
});

function createCamera(): PreviewStageRootSurfaceProps['camera'] {
  return {
    focusPoint: { x: 100, y: 50 },
    motionBlurAmount: 0,
    regionId: null,
    scale: 1,
    viewportHeight: 100,
    viewportWidth: 200,
    viewportX: 0,
    viewportY: 0,
  };
}

function rootProps(
  overrides: Partial<PreviewStageRootSurfaceProps> = {}
): PreviewStageRootSurfaceProps {
  const project = createEmptyVideoProject('Root insert', 200, 100);
  const stageRef = { current: null as HTMLDivElement | null };

  return {
    activeClips: [],
    activeInsertKind: 'shape',
    assetUrls: {},
    audioBankClips: [],
    audioRefs: { current: {} },
    beginInteraction: vi.fn(),
    cachedVideo: null,
    camera: createCamera(),
    canvasRef: { current: null },
    currentTime: 0,
    effectRuntimeFeedback: createPreviewEffectRuntimeFeedbackTestStub(),
    mode: 'editor',
    isPlaying: false,
    onAddShapeOverlay: vi.fn(() => 'shape-clip'),
    onAddTextOverlay: vi.fn(() => 'text-clip'),
    onClearActiveInsertKind: vi.fn(),
    onClearPlacementMode: vi.fn(),
    onGuideChange: vi.fn(),
    onSelectClip: vi.fn(),
    onUpdateActionEventDetails: vi.fn(),
    onUpdateAnnotationClipTemplate: vi.fn(),
    onUpdateClipTransform: vi.fn(),
    onUpdateMotionRegion: vi.fn(),
    placementMode: null,
    previewCacheBypass: false,
    previewExactFrameCache: createVideoPreviewExactFrameCache(1024),
    previewMode: 'live',
    previewRasterSize: { height: 100, width: 200 },
    project,
    selectedActionOccurrence: null,
    selectedClipId: null,
    selectedMotionRegion: null,
    selectionOverlay: null,
    stageRef,
    stageSizeStyle: { height: 100, width: 200 },
    targetOverlay: null,
    videoBankClips: [],
    videoRefs: { current: {} },
    ...overrides,
  };
}

it('forwards authored provenance separately from the hydrated scene into the mounted renderer', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const props = rootProps({ activeInsertKind: null, mode: 'player' });
  const authored = props.project;
  const hydrated = { ...authored };
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <PreviewStageRoot {...props} project={hydrated} effectPreparationProject={authored} />
      )
    );
    expect(vi.mocked(usePreviewStageCanvasScene).mock.lastCall![0]).toEqual(
      expect.objectContaining({ project: hydrated, effectPreparationProject: authored })
    );
    expect(vi.mocked(usePreviewStageCanvasScene).mock.lastCall![0].project).toBe(hydrated);
    expect(vi.mocked(usePreviewStageCanvasScene).mock.lastCall![0].effectPreparationProject).toBe(
      authored
    );
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
