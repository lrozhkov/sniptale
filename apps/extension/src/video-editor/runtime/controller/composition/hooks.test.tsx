// @vitest-environment jsdom
import { act, type ContextType } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import {
  ExportCommandContext,
  WorkspaceDialogsContext,
  WorkspacePlaybackRangeContext,
} from './contexts';
import { useVideoEditorOverlaysController } from './hooks';
import type { VideoEditorPlaybackRange } from '../../../interaction/playback/range';

it('keeps export range availability synchronized with timeline selection', () => {
  const node = document.createElement('div');
  const root = createRoot(node);
  const noop = vi.fn();
  const dialogs: NonNullable<ContextType<typeof WorkspaceDialogsContext>> = {
    setProjectDialogOpen: noop,
    setAutoProcessingModalOpen: noop,
    audioRecordingDialogOpen: false,
    audioRecordingTarget: null,
    openTrackAudioRecordingDialog: noop,
    closeAudioRecordingDialog: noop,
    closeLibraryPanel: noop,
    confirm: { dialog: null, onCancel: noop, onConfirm: noop, request: noop },
    libraryPanelOpen: false,
    openAudioRecordingDialog: noop,
    openLibraryPanel: noop,
    toggleLibraryPanel: noop,
  };
  function Probe() {
    const controller = useVideoEditorOverlaysController();
    return <span>{String(controller.exportDialog.selectedRangeAvailable)}</span>;
  }
  function render(playbackRange: VideoEditorPlaybackRange | null) {
    act(() =>
      root.render(
        <WorkspaceDialogsContext.Provider value={dialogs}>
          <WorkspacePlaybackRangeContext.Provider
            value={{ playbackRange, clearPlaybackRange: noop, setPlaybackRange: noop }}
          >
            <ExportCommandContext.Provider
              value={{ handleStartExport: noop, handleCancelExport: noop }}
            >
              <Probe />
            </ExportCommandContext.Provider>
          </WorkspacePlaybackRangeContext.Provider>
        </WorkspaceDialogsContext.Provider>
      )
    );
  }
  try {
    render(null);
    expect(node.textContent).toBe('false');
    render({ start: 1, end: 3 });
    expect(node.textContent).toBe('true');
    render(null);
    expect(node.textContent).toBe('false');
  } finally {
    act(() => root.unmount());
  }
});
