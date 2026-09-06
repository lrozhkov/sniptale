// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectTrack,
} from '../../../../../features/video/project/factories/creation';
import { VideoTrackKind } from '../../../../../features/video/project/types';
import { VideoEditorSelectionKind } from '../../../../contracts/selection';
import { WorkspaceSidebarInspectPanel } from '../inspect';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));

function createSharedCallbacks() {
  return {
    onAddActionEvent: vi.fn(),
    onAddMotionRegion: vi.fn(),
    onClearCursorSampleSkinOverride: vi.fn(),
    onClearPlacementMode: vi.fn(),
    onDeleteActionEvent: vi.fn(),
    onDeleteCursorSample: vi.fn(),
    onDeleteMotionRegion: vi.fn(),
    onDeleteTrack: vi.fn(),
    onDetachClipGroup: vi.fn(),
    onEnableCursorTrack: vi.fn(),
    onInsertCursorSample: vi.fn(),
    onPreviewSceneBackground: vi.fn(),
    onRememberRecentColor: vi.fn(async () => undefined),
    onRenameTrack: vi.fn(),
    onResetSceneBackgroundPreview: vi.fn(),
    onResizeProject: vi.fn(),
    onSetCursorCaptureMode: vi.fn(),
    onSetSceneBackground: vi.fn(),
    onStartActionPointPlacement: vi.fn(),
    onStartMotionAreaPlacement: vi.fn(),
    onStartMotionFocusPlacement: vi.fn(),
    onToggleTrackLock: vi.fn(),
    onToggleTrackVisibility: vi.fn(),
    onUpdateActionEventDetails: vi.fn(),
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
    onUpdateSubtitleTrackStyle: vi.fn(),
    onUpdateTextContent: vi.fn(),
    onUpdateTextStyle: vi.fn(),
    onUpdateTransitionDuration: vi.fn(),
    onUpdateTransitionEasing: vi.fn(),
    onUpdateTransitionTemplate: vi.fn(),
  };
}

function createProps(kind: VideoTrackKind = VideoTrackKind.SUBTITLE, isRoot = false) {
  const project = createEmptyVideoProject('Track');
  const selectedTrack = createVideoProjectTrack('Subtitles', 3, kind);
  selectedTrack.isRoot = isRoot;
  project.tracks.push(selectedTrack);

  return {
    project,
    selection: {
      kind: VideoEditorSelectionKind.TRACK,
      trackId: selectedTrack.id,
    },
    selectedClip: null,
    selectedTransition: null,
    selectedCursorSample: null,
    selectedActionEvent: null,
    selectedMotionRegion: null,
    selectedTrack,
    placementMode: null,
    recentColors: [] as string[],
    ...createSharedCallbacks(),
  } as const;
}

describe('workspace-sidebar/selection/inspect-track', () => {
  it('does not render controls for persisted subtitle tracks', () => {
    const markup = renderToStaticMarkup(<WorkspaceSidebarInspectPanel {...createProps()} />);

    expect(markup).not.toContain('videoEditor.sidebar.inspectorGroupGeneral');
    expect(markup).not.toContain('videoEditor.sidebar.subtitlePlacementLabel');
    expect(markup).not.toContain('videoEditor.timeline.deleteTrackTitle');
  });

  it('renders deletable tracks with the shared danger action style', () => {
    const markup = renderToStaticMarkup(
      <WorkspaceSidebarInspectPanel {...createProps(VideoTrackKind.OVERLAY)} />
    );

    expect(markup).not.toContain('videoEditor.sidebar.inspectorGroupInfo');
    expect(markup).not.toContain('videoEditor.sidebar.inspectorGroupGeneral');
    expect(markup).toContain('videoEditor.timeline.deleteTrackTitle');
    expect(markup).toContain('hover:text-[var(--sniptale-color-danger)]');
    expect(markup).toContain('rounded-[12px]');
  });

  it('keeps non-subtitle root tracks on a single general group without delete action', () => {
    const markup = renderToStaticMarkup(
      <WorkspaceSidebarInspectPanel {...createProps(VideoTrackKind.PRIMARY, true)} />
    );

    expect(markup).toContain('videoEditor.sidebar.trackNameLabel');
    expect(markup).not.toContain('videoEditor.sidebar.inspectorGroupLayout');
    expect(markup).not.toContain('videoEditor.sidebar.inspectorGroupStyle');
    expect(markup).not.toContain('videoEditor.timeline.deleteTrackTitle');
  });

  it('commits a localized track name without exposing the internal kind enum', () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const props = createProps(VideoTrackKind.OVERLAY);
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(<WorkspaceSidebarInspectPanel {...props} />);
    });

    expect(container.textContent).toContain('videoEditor.timeline.trackKindOverlay');
    expect(container.textContent).not.toContain(VideoTrackKind.OVERLAY);
    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="videoEditor.sidebar.trackNameLabel"]'
    );
    expect(input).not.toBeNull();
    const visibilityToggle = container.querySelector<HTMLButtonElement>(
      'button[aria-label="videoEditor.sidebar.trackVisibilityLabel"]'
    );
    const lockToggle = container.querySelector<HTMLButtonElement>(
      'button[aria-label="videoEditor.sidebar.trackLockLabel"]'
    );
    expect(visibilityToggle?.getAttribute('aria-pressed')).toBe('true');
    expect(lockToggle?.getAttribute('aria-pressed')).toBe('false');

    act(() => {
      visibilityToggle?.click();
      lockToggle?.click();
    });
    expect(props.onToggleTrackVisibility).toHaveBeenCalledWith(props.selectedTrack.id);
    expect(props.onToggleTrackLock).toHaveBeenCalledWith(props.selectedTrack.id);

    if (input) {
      input.value = 'Callouts';
      act(() => {
        input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
      });
    }

    expect(props.onRenameTrack).toHaveBeenCalledWith(props.selectedTrack.id, 'Callouts');

    const restoredProps = {
      ...props,
      selectedTrack: {
        ...props.selectedTrack,
        locked: true,
        name: 'Restored overlays',
        visible: false,
      },
    };
    act(() => {
      root.render(<WorkspaceSidebarInspectPanel {...restoredProps} />);
    });
    expect(
      container.querySelector<HTMLInputElement>(
        'input[aria-label="videoEditor.sidebar.trackNameLabel"]'
      )?.value
    ).toBe('Restored overlays');
    expect(visibilityToggle?.getAttribute('aria-pressed')).toBe('false');
    expect(lockToggle?.getAttribute('aria-pressed')).toBe('true');

    act(() => root.unmount());
    vi.unstubAllGlobals();
  });
});
