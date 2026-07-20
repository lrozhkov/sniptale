// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createVideoClipFromAsset } from '../../../../features/video/project/factories/clip';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../../features/video/project/factories/creation';
import { VideoProjectAssetType, VideoTrackKind } from '../../../../features/video/project/types';
import { VideoEditorSelectionKind } from '../../../contracts/selection';
import type { WorkspaceSidebarPanelContentSharedProps } from '../contracts/panel-content';
import {
  createSelectionPanelProps as createResolvedSelectionPanelProps,
  WorkspaceSidebarSelectionPanel,
} from './selection-panel';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  getCurrentLocale: () => 'en',
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

it('keeps cursor detection wired through the real selection-panel adapter', () => {
  const props = createSelectionPanelSourceProps();
  renderSelectionPanel(props);
  clickObjectTrackingGroup();

  expect(getRunButton()?.disabled).toBe(false);

  act(() => {
    getRunButton()?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  expect(props.cursorDetection?.runForClip).toHaveBeenCalledWith(props.selectedClip?.id);
});

function renderSelectionPanel(props: WorkspaceSidebarPanelContentSharedProps) {
  act(() => {
    root?.render(<WorkspaceSidebarSelectionPanel {...createResolvedSelectionPanelProps(props)} />);
  });
}

function createSelectionPanelSourceProps(): WorkspaceSidebarPanelContentSharedProps {
  const project = createEmptyVideoProject('Cursor detection');
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
    ...createPanelHarnessProps(),
    cursorDetection: createCursorDetectionController(),
    project,
    selectedClip: clip,
    selection: { clipId: clip.id, kind: VideoEditorSelectionKind.CLIP },
  };
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
  } satisfies NonNullable<WorkspaceSidebarPanelContentSharedProps['cursorDetection']>;
}

type SelectionPanelHarnessBaseProps = Omit<
  WorkspaceSidebarPanelContentSharedProps,
  'cursorDetection' | 'project' | 'selectedClip' | 'selection'
>;

function createPanelHarnessProps(): SelectionPanelHarnessBaseProps {
  return {
    ...createPanelHarnessStateProps(),
    ...createPanelHarnessActionProps(),
  };
}

function createPanelHarnessStateProps() {
  return {
    activeProjectId: 'project-1',
    diagnosticsContent: null,
    diagnosticsMeta: '',
    diagnosticsSectionOpen: false,
    gridSettings: {
      color: '#94a3b8',
      enabled: false,
      onSetColor: vi.fn(),
      onSetEnabled: vi.fn(),
      onSetSize: vi.fn(),
      onSetSnapEnabled: vi.fn(),
      size: 80,
      snapEnabled: true,
    },
    inputRefs: {
      audioInputRef: { current: null },
      imageInputRef: { current: null },
      videoInputRef: { current: null },
    },
    inspectorMode: 'selection' as const,
    placementMode: null,
    projects: [],
    projectsOpen: false,
    recentColors: [],
    recordingId: null,
    recordings: [],
    recordingsOpen: false,
    selectedActionEvent: null,
    selectedCursorSample: null,
    selectedMotionRegion: null,
    selectedTrack: null,
    selectedTransition: null,
  };
}

function createPanelHarnessActionProps() {
  return {
    onAddActionEvent: vi.fn(),
    onAddRecording: vi.fn(),
    onCreateProject: vi.fn(),
    onDeleteProject: vi.fn(),
    onDetachClipGroup: vi.fn(),
    onEnableCursorTrack: vi.fn(),
    onImportAudio: vi.fn(),
    onImportImage: vi.fn(),
    onImportVideo: vi.fn(),
    onOpenProject: vi.fn(),
    onResizeProject: vi.fn(),
    onSetCursorCaptureMode: vi.fn(),
    onSetSceneBackground: vi.fn(),
    onToggleDiagnosticsSection: vi.fn(),
    onToggleProjectsOpen: vi.fn(),
    onToggleRecordingsOpen: vi.fn(),
    onUpdateClipAudioEnvelope: vi.fn(),
    onUpdateClipFades: vi.fn(),
    onUpdateClipMuted: vi.fn(),
    onUpdateClipTransform: vi.fn(),
    onUpdateClipVolume: vi.fn(),
    onUpdateCursorSkin: vi.fn(),
    onUpdateMediaClipFitMode: vi.fn(),
    onUpdateShapeStyle: vi.fn(),
    onUpdateTextContent: vi.fn(),
    onUpdateTextStyle: vi.fn(),
  };
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
