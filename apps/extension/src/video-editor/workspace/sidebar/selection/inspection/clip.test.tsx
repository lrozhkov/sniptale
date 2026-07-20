// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../../../features/video/project/factories/creation';
import { createTextClip } from '../../../../../features/video/project/factories/overlay-clip';
import { createVideoClipFromAsset } from '../../../../../features/video/project/factories/clip';
import { VideoProjectAssetType, VideoTrackKind } from '../../../../../features/video/project/types';
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

function createVideoProps(): WorkspaceSidebarSelectionPanelProps {
  const project = createEmptyVideoProject('Video frame controls');
  const trackId = project.tracks.find((track) => track.kind === VideoTrackKind.PRIMARY)?.id;
  const asset = createVideoProjectAsset(
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
    selectedActionEvent: null,
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
  const overlayTrackId = project.tracks.find((track) => track.kind === 'OVERLAY')?.id ?? 'overlay';
  const clip = createTextClip(overlayTrackId, project.width, project.height, 0);
  project.clips.push(clip);

  return {
    placementMode: null,
    project,
    recentColors: [],
    selectedActionEvent: null,
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
  it('opens the clip summary group by default', () => {
    renderInspectPanel(createProps());

    expect(container?.textContent).toContain('videoEditor.sidebar.clipTypeText');
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

  it('keeps media frame controls in the frame group instead of timing', () => {
    renderInspectPanel(createVideoProps());

    clickGroup('videoEditor.sidebar.inspectorGroupTiming');

    expect(container?.textContent).toContain('videoEditor.sidebar.fadeInLabel');
    expect(container?.textContent).toContain('videoEditor.sidebar.playbackRateLabel');
    expect(container?.textContent).not.toContain('videoEditor.sidebar.fitModeLabel');
    expect(container?.textContent).not.toContain('videoEditor.sidebar.fitScalePercentLabel');
    expect(container?.textContent).not.toContain('videoEditor.sidebar.mediaShadowIntensityLabel');

    clickGroup('videoEditor.sidebar.inspectorGroupTransform');

    expect(container?.textContent).toContain('videoEditor.sidebar.fitModeLabel');
    expect(container?.textContent).toContain('videoEditor.sidebar.fitScalePercentLabel');
    expect(container?.textContent).toContain('videoEditor.sidebar.mediaShadowIntensityLabel');
  });
});

function renderInspectPanel(props: WorkspaceSidebarSelectionPanelProps) {
  act(() => {
    root?.render(<WorkspaceSidebarInspectPanel {...props} />);
  });
}

function clickGroup(title: string) {
  const button = container?.querySelector<HTMLButtonElement>(`button[title="${title}"]`);
  act(() => {
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}
