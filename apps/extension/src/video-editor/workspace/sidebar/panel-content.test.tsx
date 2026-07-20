import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import type { WorkspaceSidebarPanelContentSharedProps } from './contracts/panel-content';

const selectionBodyMock = vi.fn();

vi.mock('./selection/inspection/body', () => ({
  WorkspaceSidebarSelectionBody: (props: unknown) => {
    selectionBodyMock(props);
    return <div data-ui="workspace-selection-body" />;
  },
}));

import { WorkspaceSidebarPanelContent } from './panel-content/index';

function createProps(): WorkspaceSidebarPanelContentSharedProps {
  return {
    ...createPanelStateProps(),
    ...createPanelActionProps(),
  };
}

function createPanelStateProps() {
  return {
    inspectorMode: 'selection' as const,
    project: createEmptyVideoProject('Panel content'),
    activeProjectId: 'project-1',
    diagnosticsMeta: 'Diagnostics',
    diagnosticsContent: null,
    projectsOpen: false,
    recordingsOpen: false,
    diagnosticsSectionOpen: false,
    projects: [],
    recordings: [],
    recordingId: null,
    selectedClip: null,
    selectedTrack: null,
    gridSettings: {
      color: '#94a3b8',
      enabled: false,
      size: 80,
      snapEnabled: true,
      onSetColor: vi.fn(),
      onSetEnabled: vi.fn(),
      onSetSize: vi.fn(),
      onSetSnapEnabled: vi.fn(),
    },
    inputRefs: {
      imageInputRef: { current: null },
      videoInputRef: { current: null },
      audioInputRef: { current: null },
    },
  };
}

function createPanelActionProps() {
  return {
    onOpenProject: vi.fn(),
    onCreateProject: vi.fn(),
    onDeleteProject: vi.fn(),
    onAddRecording: vi.fn(),
    onSetSceneBackground: vi.fn(),
    onResizeProject: vi.fn(),
    onEnableCursorTrack: vi.fn(),
    onSetCursorCaptureMode: vi.fn(),
    onUpdateCursorSkin: vi.fn(),
    onAddActionEvent: vi.fn(),
    onDetachClipGroup: vi.fn(),
    onUpdateClipTransform: vi.fn(),
    onUpdateClipMuted: vi.fn(),
    onUpdateClipVolume: vi.fn(),
    onUpdateClipAudioEnvelope: vi.fn(),
    onUpdateClipFades: vi.fn(),
    onUpdateClipPlaybackRate: vi.fn(),
    onUpdateMediaClipFitMode: vi.fn(),
    onUpdateMediaClipFitScalePercent: vi.fn(),
    onUpdateMediaClipShadowIntensity: vi.fn(),
    onApplyMediaClipVisualsToTrack: vi.fn(),
    onRenameTrack: vi.fn(),
    onUpdateTextContent: vi.fn(),
    onUpdateTextStyle: vi.fn(),
    onUpdateSubtitleTrackStyle: vi.fn(),
    onUpdateShapeStyle: vi.fn(),
    onToggleProjectsOpen: vi.fn(),
    onToggleRecordingsOpen: vi.fn(),
    onToggleDiagnosticsSection: vi.fn(),
  };
}

describe('workspace-sidebar/panel-content', () => {
  beforeEach(() => {
    selectionBodyMock.mockClear();
  });

  it('keeps the selection body inside a flex-column surface so inner scroll owners can grow', () => {
    const markup = renderToStaticMarkup(
      <WorkspaceSidebarPanelContent {...createProps()} onSetInspectorHeaderSlot={vi.fn()} />
    );

    expect(markup).toContain('flex min-h-0 flex-1 flex-col overflow-hidden');
    expect(selectionBodyMock).toHaveBeenCalledOnce();
  });

  it('forwards active clip, fit, subtitle, and track handlers to the selection body seam', () => {
    const props = createProps();
    props.onConvertTextClipToAnnotation = vi.fn();

    renderToStaticMarkup(
      <WorkspaceSidebarPanelContent {...props} onSetInspectorHeaderSlot={vi.fn()} />
    );

    expect(selectionBodyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        onApplyMediaClipVisualsToTrack: props.onApplyMediaClipVisualsToTrack,
        onConvertTextClipToAnnotation: props.onConvertTextClipToAnnotation,
        onRenameTrack: props.onRenameTrack,
        onUpdateClipPlaybackRate: props.onUpdateClipPlaybackRate,
        onUpdateMediaClipFitScalePercent: props.onUpdateMediaClipFitScalePercent,
        onUpdateMediaClipShadowIntensity: props.onUpdateMediaClipShadowIntensity,
        onUpdateSubtitleTrackStyle: props.onUpdateSubtitleTrackStyle,
      })
    );
  });
});

describe('workspace-sidebar/panel-content alternate modes', () => {
  beforeEach(() => {
    selectionBodyMock.mockClear();
  });

  it('renders grid settings mode inside the sidebar surface', () => {
    const gridMarkup = renderToStaticMarkup(
      <WorkspaceSidebarPanelContent
        {...createProps()}
        inspectorMode="grid"
        onSetInspectorHeaderSlot={vi.fn()}
      />
    );
    expect(gridMarkup).toContain('Сетка помогает выравнивать');
    expect(gridMarkup).toContain('Привязка к сетке');
  });
});
