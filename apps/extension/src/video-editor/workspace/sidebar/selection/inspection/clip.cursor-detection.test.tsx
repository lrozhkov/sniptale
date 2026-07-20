// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVideoClipFromAsset } from '../../../../../features/video/project/factories/clip';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../../../features/video/project/factories/creation';
import type { VideoObjectTrack } from '../../../../../features/video/project/object-tracks';
import { VideoProjectAssetType, VideoTrackKind } from '../../../../../features/video/project/types';
import { VideoEditorSelectionKind } from '../../../../contracts/selection';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';
import { WorkspaceSidebarInspectPanel } from '../inspect';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  getCurrentLocale: () => 'en',
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));

vi.stubGlobal('HTMLElement', class HTMLElement {});
vi.stubGlobal('ShadowRoot', class ShadowRoot {});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

function createNoopHandler() {
  return vi.fn((..._args: unknown[]) => undefined);
}

function createHandlers() {
  return {
    onAddActionEvent: createNoopHandler(),
    onAddMotionRegion: createNoopHandler(),
    onClearCursorSampleSkinOverride: createNoopHandler(),
    onClearPlacementMode: createNoopHandler(),
    onConvertTextClipToAnnotation: createNoopHandler(),
    onDeleteActionEvent: createNoopHandler(),
    onDeleteCursorSample: createNoopHandler(),
    onDeleteMotionRegion: createNoopHandler(),
    onDetachClipGroup: createNoopHandler(),
    onEnableCursorTrack: createNoopHandler(),
    onInsertCursorSample: createNoopHandler(),
    onPreviewSceneBackground: createNoopHandler(),
    onRememberRecentColor: vi.fn(async (..._args: unknown[]) => undefined),
    onResetSceneBackgroundPreview: createNoopHandler(),
    onResizeProject: createNoopHandler(),
    onSetCursorCaptureMode: createNoopHandler(),
    onSetSceneBackground: createNoopHandler(),
    onStartActionPointPlacement: createNoopHandler(),
    onStartMotionAreaPlacement: createNoopHandler(),
    onStartMotionFocusPlacement: createNoopHandler(),
    onStartObjectTrackAnchorPlacement: createNoopHandler(),
    onUpdateActionEventDetails: createNoopHandler(),
    onUpdateAnnotationClipContent: createNoopHandler(),
    onUpdateAnnotationClipStyle: createNoopHandler(),
    onUpdateAnnotationClipTemplate: createNoopHandler(),
    onUpdateClipAudioEnvelope: createNoopHandler(),
    onUpdateClipFades: createNoopHandler(),
    onUpdateClipMuted: createNoopHandler(),
    onUpdateClipTransform: createNoopHandler(),
    onUpdateClipVolume: createNoopHandler(),
    onUpdateCursorSampleInterpolation: createNoopHandler(),
    onUpdateCursorSampleSkinOverride: createNoopHandler(),
    onUpdateCursorSampleVisibility: createNoopHandler(),
    onUpdateCursorSkin: createNoopHandler(),
    onUpdateMediaClipFitMode: createNoopHandler(),
    onUpdateMotionRegion: createNoopHandler(),
    onUpdateShapeStyle: createNoopHandler(),
    onUpdateTextContent: createNoopHandler(),
    onUpdateTextStyle: createNoopHandler(),
    onUpdateTransitionDuration: createNoopHandler(),
    onUpdateTransitionEasing: createNoopHandler(),
    onUpdateTransitionTemplate: createNoopHandler(),
    onUpdateEffectInstance: createNoopHandler(),
    onUpsertObjectTrackCorrectionAnchor: createNoopHandler(),
  } satisfies Partial<WorkspaceSidebarSelectionPanelProps>;
}

function createVideoClipProps(): WorkspaceSidebarSelectionPanelProps {
  const project = createEmptyVideoProject('Cursor detection');
  const trackId = project.tracks.find((track) => track.kind === VideoTrackKind.PRIMARY)?.id;
  const asset = createVideoAsset();
  const clip = createVideoClipFromAsset(
    trackId ?? 'video',
    asset,
    project.width,
    project.height,
    0
  );
  project.assets.push(asset);
  project.clips.push(clip);

  const props = {
    ...createHandlers(),
    cursorDetection: createCursorDetectionController(),
    placementMode: null,
    project,
    recentColors: [],
    selectedActionEvent: null,
    selectedClip: clip,
    selectedCursorSample: null,
    selectedMotionRegion: null,
    selectedTrack: null,
    selectedTransition: null,
    selection: { clipId: clip.id, kind: VideoEditorSelectionKind.CLIP },
  } satisfies WorkspaceSidebarSelectionPanelProps;

  return props;
}

function createVideoAsset() {
  return createVideoProjectAsset(
    'Video',
    VideoProjectAssetType.VIDEO,
    { kind: 'project-asset', projectAssetId: 'asset-video' },
    {
      audioPeaks: null,
      duration: 5,
      hasAudio: false,
      height: 1080,
      mimeType: 'video/mp4',
      size: 100,
      width: 1920,
    }
  );
}

function createCursorDetectionController() {
  return {
    cancel: vi.fn(),
    runForClip: vi.fn(),
    runForSelectedClip: vi.fn(),
    runLocalRecalculation: vi.fn(),
    selectedClipAvailability: { canRun: true, reason: null },
    state: {
      clipId: null,
      error: null,
      processedFrames: 0,
      progress: 0,
      status: 'idle',
      totalFrames: 0,
      trackId: null,
    },
  } satisfies NonNullable<WorkspaceSidebarSelectionPanelProps['cursorDetection']>;
}

function renderInspectPanel(props: WorkspaceSidebarSelectionPanelProps) {
  act(() => {
    root?.render(<WorkspaceSidebarInspectPanel {...props} />);
  });
}

function clickObjectTrackingGroup() {
  const button = container?.querySelector<HTMLButtonElement>(
    'button[title="videoEditor.sidebar.inspectorGroupTracking"]'
  );
  act(() => {
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

function getRunButton() {
  return container?.querySelector<HTMLButtonElement>(
    '[data-ui="video-editor.cursor-detection.run"]'
  );
}

describe('workspace-sidebar/selection/clip cursor detection', () => {
  it('runs cursor detection for selected video clips', () => {
    const props = createVideoClipProps();
    renderInspectPanel(props);
    clickObjectTrackingGroup();

    act(() => {
      getRunButton()?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(props.cursorDetection?.runForClip).toHaveBeenCalledWith(props.selectedClip?.id);
    expect(props.cursorDetection?.runForSelectedClip).not.toHaveBeenCalled();
  });

  it('uses the inspected video clip when the controller selected-clip availability is stale', () => {
    const props = createVideoClipProps();
    props.cursorDetection!.selectedClipAvailability = { canRun: false, reason: 'not-video' };
    renderInspectPanel(props);
    clickObjectTrackingGroup();

    expect(getRunButton()?.disabled).toBe(false);

    act(() => {
      getRunButton()?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(props.cursorDetection?.runForClip).toHaveBeenCalledWith(props.selectedClip?.id);
    expect(props.cursorDetection?.runForSelectedClip).not.toHaveBeenCalled();
  });

  it('stays actionable while a selected video asset URL is pending', () => {
    const props = createVideoClipProps();
    props.cursorDetection!.selectedClipAvailability = { canRun: false, reason: 'missing-url' };
    renderInspectPanel(props);
    clickObjectTrackingGroup();

    expect(getRunButton()?.disabled).toBe(false);
    expect(container?.textContent).toContain('videoEditor.sidebar.cursorDetectionAssetMissing');
  });
});

it('shows the detected hidden cursor track state for the inspected video clip', () => {
  const props = createVideoClipProps();
  props.project.objectTracks = [createCameraCursorTrack(props.selectedClip!.id)];
  renderInspectPanel(props);
  clickObjectTrackingGroup();

  expect(container?.textContent).toContain('videoEditor.sidebar.cursorDetectionReadyForZoom');
  expect(container?.textContent).toContain('videoEditor.sidebar.cursorDetectionVisibleSamples');
  expect(getRunButton()?.textContent).toBe('videoEditor.sidebar.cursorDetectionRunAgain');
});

function createCameraCursorTrack(clipId: string): VideoObjectTrack {
  return {
    analysis: {
      mode: 'coarseKeyframes',
      projectEndTime: 2,
      projectStartTime: 0,
      quality: {
        coverageRatio: 0.5,
        jumpCount: 1,
        medianConfidence: 0.55,
        status: 'needsAnchor',
        visibleSamples: 2,
      },
      sampleFps: 1,
      sourceAssetId: 'asset-video',
      sourceClipId: clipId,
    },
    hidden: true,
    id: 'visual-cursor',
    kind: 'visualCursor',
    role: 'cameraCursor',
    samples: [
      { confidence: 0.55, time: 0, visible: true, x: 120, y: 90 },
      { confidence: 0.58, time: 1, visible: true, x: 360, y: 240 },
    ],
    source: 'visualDetection',
  };
}
