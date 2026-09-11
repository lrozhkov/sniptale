// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
  createVideoProjectTrack,
} from '../../../../../features/video/project/factories/creation';
import {
  createSubtitleClip,
  createTextClip,
} from '../../../../../features/video/project/factories/overlay-clip';
import { createVideoClipFromAsset } from '../../../../../features/video/project/factories/clip';
import {
  VideoProjectAssetType,
  VideoProjectTrackRole,
  VideoTrackKind,
} from '../../../../../features/video/project/types';
import { VideoEditorSelectionKind } from '../../../../contracts/selection';
import { WorkspaceSidebarInspectPanel } from '../inspect';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';

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

function createSelectionHandlers() {
  return {
    onAddActionEvent: vi.fn(),
    onAddMotionRegion: vi.fn(),
    onClearCursorSampleSkinOverride: vi.fn(),
    onClearPlacementMode: vi.fn(),
    onDeleteActionEvent: vi.fn(),
    onDeleteCursorSample: vi.fn(),
    onDeleteMotionRegion: vi.fn(),
    onDetachClipGroup: vi.fn(),
    onEnableCursorTrack: vi.fn(),
    onInsertCursorSample: vi.fn(),
    onPreviewSceneBackground: vi.fn(),
    onRememberRecentColor: vi.fn(async () => undefined),
    onResetSceneBackgroundPreview: vi.fn(),
    onResizeProject: vi.fn(),
    onSetCursorCaptureMode: vi.fn(),
    onSetSceneBackground: vi.fn(),
    onStartActionPointPlacement: vi.fn(),
    onStartMotionAreaPlacement: vi.fn(),
    onStartMotionFocusPlacement: vi.fn(),
    onStartObjectTrackAnchorPlacement: vi.fn(),
    onUpdateActionEventDetails: vi.fn(),
    onUpdateAnnotationClipContent: vi.fn(),
    onUpdateAnnotationClipStyle: vi.fn(),
    onUpdateAnnotationClipTemplate: vi.fn(),
    onUpdateClipAudioEnvelope: vi.fn(),
    onUpdateClipFades: vi.fn(),
    onUpdateClipMuted: vi.fn(),
    onUpdateClipTransform: vi.fn(),
    onApplyCameraLayout: vi.fn(),
    onEditCameraPosition: vi.fn(),
    canAddCameraPosition: true,
    onUpdateClipVolume: vi.fn(),
    onUpdateCursorSampleInterpolation: vi.fn(),
    onUpdateCursorSampleSkinOverride: vi.fn(),
    onUpdateCursorSampleVisibility: vi.fn(),
    onUpdateCursorSkin: vi.fn(),
    onUpdateMediaClipFitMode: vi.fn(),
    onUpdateMotionRegion: vi.fn(),
    onUpdateShapeStyle: vi.fn(),
    onUpdateTextContent: vi.fn(),
    onUpdateTextStyle: vi.fn(),
    onUpdateTransitionDuration: vi.fn(),
    onUpdateTransitionEasing: vi.fn(),
    onUpdateTransitionTemplate: vi.fn(),
    onDuplicateEffectInstance: vi.fn(),
    onUpdateEffectInstance: vi.fn(),
    onUpsertObjectTrackCorrectionAnchor: vi.fn(),
  };
}

function createVideoProps(
  assetType: 'VIDEO' | 'IMAGE' = VideoProjectAssetType.VIDEO
): WorkspaceSidebarSelectionPanelProps {
  const project = createEmptyVideoProject('Video frame controls');
  const trackId = project.tracks.find((track) => track.kind === VideoTrackKind.PRIMARY)?.id;
  const asset = createVideoProjectAsset(
    'Video',
    assetType,
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
  const clip = createVideoClipFromAsset(
    trackId ?? 'video',
    asset,
    project.width,
    project.height,
    0
  );
  project.assets.push(asset);
  project.clips.push(clip);

  return {
    placementMode: null,
    project,
    recentColors: [],
    selectedActionOccurrence: null,
    selectedClip: clip,
    selectedCursorSample: null,
    selectedMotionRegion: null,
    selectedTrack: null,
    selectedTransition: null,
    selection: {
      clipId: clip.id,
      kind: VideoEditorSelectionKind.CLIP,
    },
    onConvertTextClipToAnnotation: vi.fn(),
    ...createSelectionHandlers(),
  };
}

function createProps(): WorkspaceSidebarSelectionPanelProps {
  const project = createEmptyVideoProject('Text template upgrade');
  project.tracks.push(createVideoProjectTrack('Overlay', 0, VideoTrackKind.PRIMARY));
  const overlayTrackId = project.tracks.find((track) => track.name === 'Overlay')?.id ?? 'overlay';
  const clip = createTextClip(overlayTrackId, project.width, project.height, 0);
  project.clips.push(clip);

  return {
    placementMode: null,
    project,
    recentColors: [],
    selectedActionOccurrence: null,
    selectedClip: clip,
    selectedCursorSample: null,
    selectedMotionRegion: null,
    selectedTrack: null,
    selectedTransition: null,
    selection: {
      clipId: clip.id,
      kind: VideoEditorSelectionKind.CLIP,
    },
    onConvertTextClipToAnnotation: vi.fn(),
    ...createSelectionHandlers(),
  };
}

describe('workspace-sidebar/selection/inspect-core', () => {
  it('opens editable clip content before file metadata', () => {
    renderInspectPanel(createProps());

    expect(container?.textContent).toContain('videoEditor.sidebar.textLabel');
    expect(
      container?.querySelector('[aria-label="videoEditor.sidebar.inspectorGroupFraming"]')
    ).toBeNull();
    expect(container?.textContent).not.toContain('videoEditor.sidebar.clipTypeText');
    clickGroup('videoEditor.sidebar.inspectorGroupSummary');
    expect(container?.textContent).toContain('videoEditor.sidebar.inspectorGroupSummary');
  });

  it('renders text-to-template upgrade controls for manual text overlays', () => {
    renderInspectPanel(createProps());
    clickGroup('videoEditor.sidebar.inspectorGroupStyle');

    expect(container?.textContent).toContain('videoEditor.sidebar.textTemplateUpgradeLabel');
    expect(container?.textContent).toContain('videoEditor.sidebar.textTemplateUpgradeDescription');
    expect(container?.textContent).toContain('videoEditor.sidebar.textTemplateUpgradeAction');
  });

  it('surfaces the locked-track state from the selected clip track when no track is selected', () => {
    const props = createProps();
    props.project.tracks = props.project.tracks.map((track) =>
      track.id === props.selectedClip?.trackId ? { ...track, locked: true } : track
    );

    renderInspectPanel(props);
    clickGroup('videoEditor.sidebar.inspectorGroupSummary');

    expect(container?.textContent).toContain('videoEditor.sidebar.lockedTrackTitle');
    expect(container?.textContent).toContain('videoEditor.sidebar.lockedTrackDescription');
  });

  it.each(['VIDEO', 'IMAGE'] as const)(
    'opens framing for %s and separates geometry and timing',
    (assetType) => {
      renderInspectPanel(createVideoProps(assetType));

      expect(container?.textContent).toContain('videoEditor.sidebar.fitModeLabel');
      expect(container?.textContent).not.toContain('videoEditor.sidebar.rotationLabel');
      expect(
        container?.querySelector('input[aria-label="videoEditor.sidebar.widthLabel"]')
      ).toBeNull();

      clickGroup('videoEditor.sidebar.inspectorGroupTiming');

      expect(container?.textContent).not.toContain('videoEditor.sidebar.fadeInLabel');
      if (assetType === VideoProjectAssetType.VIDEO) {
        expect(container?.textContent).toContain('videoEditor.sidebar.playbackRateLabel');
      } else {
        expect(container?.textContent).not.toContain('videoEditor.sidebar.playbackRateLabel');
      }
      expect(container?.textContent).not.toContain('videoEditor.sidebar.fitModeLabel');
      expect(container?.textContent).not.toContain('videoEditor.sidebar.fitScalePercentLabel');
      expect(container?.textContent).not.toContain('videoEditor.sidebar.mediaShadowIntensityLabel');

      clickGroup('videoEditor.sidebar.inspectorGroupAnimation');
      expect(container?.textContent).toContain('videoEditor.sidebar.fadeInLabel');
      clickGroup('videoEditor.sidebar.inspectorGroupTransform');
      expect(container?.textContent).toContain('videoEditor.sidebar.rotationLabel');
      expect(container?.textContent).not.toContain('videoEditor.sidebar.fitModeLabel');

      clickGroup('videoEditor.sidebar.inspectorGroupFraming');

      expect(container?.textContent).toContain('videoEditor.sidebar.fitModeLabel');
      expect(container?.textContent).toContain('videoEditor.sidebar.fitScalePercentLabel');
      expect(container?.textContent).toContain('videoEditor.sidebar.mediaShadowIntensityLabel');
    }
  );

  it.each(['VIDEO', 'IMAGE'] as const)(
    'opens framing after switching from text to %s',
    (assetType) => {
      renderInspectPanel(createProps());
      expect(container?.textContent).toContain('videoEditor.sidebar.textLabel');
      renderInspectPanel(createVideoProps(assetType));
      expect(container?.textContent).toContain('videoEditor.sidebar.fitModeLabel');
      expect(container?.textContent).not.toContain('videoEditor.sidebar.projectTitle');
    }
  );

  it('keeps cursor-recognition controls out of video clip inspection', () => {
    renderInspectPanel(createVideoProps());

    expect(container?.textContent).not.toContain('videoEditor.sidebar.inspectorGroupTracking');
    expect(container?.textContent).not.toContain('videoEditor.sidebar.cursorDetectionRun');
  });

  it('opens camera layout by default and sends the selected interval to the atomic layout command', () => {
    const props = createVideoProps();
    props.project.tracks = props.project.tracks.map((track) =>
      track.id === props.selectedClip?.trackId
        ? { ...track, role: VideoProjectTrackRole.CAMERA }
        : track
    );

    renderInspectPanel(props);

    expect(
      container?.querySelector('[data-ui="video-editor.camera-placement-controls"]')
    ).not.toBeNull();
    const bottomLeft = Array.from(container?.querySelectorAll('button') ?? []).find(
      (button) =>
        button.getAttribute('aria-label') === 'videoEditor.sidebar.cameraPlacementBottomLeft'
    );
    act(() => bottomLeft?.click());
    expect(props.onApplyCameraLayout).toHaveBeenCalledWith(
      props.selectedClip?.id,
      'OVERLAY',
      'BOTTOM_LEFT'
    );
    expect(props.onUpdateClipTransform).not.toHaveBeenCalled();
  });

  it('preserves a manual group within one clip context and resets when it becomes a camera', () => {
    const props = createVideoProps();

    renderInspectPanel(props);
    clickGroup('videoEditor.sidebar.inspectorGroupTransform');
    expect(container?.textContent).toContain('videoEditor.sidebar.rotationLabel');

    renderInspectPanel({ ...props });
    expect(container?.textContent).toContain('videoEditor.sidebar.rotationLabel');

    props.project.tracks = props.project.tracks.map((track) =>
      track.id === props.selectedClip?.trackId
        ? { ...track, role: VideoProjectTrackRole.CAMERA }
        : track
    );
    renderInspectPanel({ ...props });

    expect(
      container?.querySelector('[data-ui="video-editor.camera-placement-controls"]')
    ).not.toBeNull();
    expect(container?.textContent).toContain('videoEditor.sidebar.rotationLabel');
    expect(
      container?.querySelector('input[aria-label="videoEditor.sidebar.widthLabel"]')
    ).toBeNull();
  });

  it('groups camera dimensions with appearance and restores apply-to-track', () => {
    const props = createVideoProps();
    props.project.tracks = props.project.tracks.map((track) => ({
      ...track,
      role: VideoProjectTrackRole.CAMERA,
    }));
    const apply = vi.fn();
    renderInspectPanel({ ...props, onApplyMediaClipVisualsToTrack: apply });
    clickGroup('videoEditor.sidebar.inspectorGroupStyle');
    expect(
      container?.querySelector('input[aria-label="videoEditor.sidebar.widthLabel"]')
    ).not.toBeNull();
    expect(
      container?.querySelector('input[aria-label="videoEditor.sidebar.heightLabel"]')
    ).not.toBeNull();
    expect(container?.querySelector('input[aria-label="X"]')).toBeNull();
    const button = Array.from(container?.querySelectorAll('button') ?? []).find(
      (item) => item.textContent === 'videoEditor.sidebar.fitApplyToTrackLabel'
    );
    expect(button).toBeDefined();
    act(() => button!.click());
    expect(apply).toHaveBeenCalledExactlyOnceWith(props.selectedClip?.id);
  });

  it('keeps camera-specific controls out of ordinary video inspection', () => {
    renderInspectPanel(createVideoProps());

    expect(container?.textContent).not.toContain('videoEditor.sidebar.inspectorGroupCamera');
  });

  it('disables camera placement actions on a locked camera track', () => {
    const props = createVideoProps();
    props.project.tracks = props.project.tracks.map((track) =>
      track.id === props.selectedClip?.trackId
        ? { ...track, locked: true, role: VideoProjectTrackRole.CAMERA }
        : track
    );

    renderInspectPanel(props);
    clickGroup('videoEditor.sidebar.inspectorGroupCamera');

    const placementControls = container?.querySelector(
      '[data-ui="video-editor.camera-placement-controls"]'
    );
    expect(
      Array.from(placementControls?.querySelectorAll('button') ?? []).every(
        (button) => button.disabled
      )
    ).toBe(true);
  });

  it('keeps persisted subtitle clips out of clip inspection', () => {
    const props = createProps();
    const subtitleTrack = createVideoProjectTrack('Legacy subtitles', 4, VideoTrackKind.SUBTITLE);
    const subtitleClip = createSubtitleClip(
      subtitleTrack.id,
      props.project.width,
      props.project.height,
      0
    );
    props.project.tracks.push(subtitleTrack);
    props.project.clips.push(subtitleClip);
    props.selectedClip = subtitleClip;
    props.selection = { clipId: subtitleClip.id, kind: VideoEditorSelectionKind.CLIP };

    renderInspectPanel(props);

    expect(container?.textContent).toContain('videoEditor.sidebar.selectionEmpty');
    expect(container?.textContent).not.toContain('videoEditor.sidebar.inspectorGroupGeneral');
  });
});

function renderInspectPanel(props: WorkspaceSidebarSelectionPanelProps) {
  act(() => {
    root?.render(<WorkspaceSidebarInspectPanel {...props} />);
  });
}

function clickGroup(title: string) {
  const button = container?.querySelector<HTMLElement>(`nav button[title="${title}"]`);
  act(() => {
    if (!button?.parentElement?.hasAttribute('open'))
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}
