import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VideoEditorWorkspace } from './';

const overlaysSpy = vi.fn();
const mainSpy = vi.fn();

vi.mock('./overlays', () => ({
  VideoEditorWorkspaceOverlays: (props: unknown) => {
    overlaysSpy(props);
    return <div data-testid="overlays" />;
  },
}));

vi.mock('./main', () => ({
  VideoEditorWorkspaceMain: (props: unknown) => {
    mainSpy(props);
    return <div data-testid="main" />;
  },
}));

describe('VideoEditorWorkspace', () => {
  afterEach(() => {
    overlaysSpy.mockReset();
    mainSpy.mockReset();
  });

  it('passes narrowed overlay and workspace slices plus diagnostics content', () => {
    const markup = renderToStaticMarkup(
      <VideoEditorWorkspace
        controller={{
          overlays: { exportDialog: {}, exportProgress: {} } as never,
          palette: {} as never,
          shell: {} as never,
          workspace: {
            diagnostics: {
              isOpen: false,
              onClose: vi.fn(),
              recordingId: null,
            },
            header: {} as never,
            layout: {
              audioRecordingDialogOpen: false,
              closeAudioRecordingDialog: vi.fn(),
              handleStartVerticalResize: vi.fn(),
              leftSidebarCollapsed: false,
              openAudioRecordingDialog: vi.fn(),
              previewPaneHeight: 300,
              toggleSidebarCollapsed: vi.fn(),
              workspaceSplitRef: { current: null },
            },
            preview: {} as never,
            sidebar: {
              diagnosticsContent: null,
            } as never,
            timeline: {} as never,
          },
        }}
      />
    );

    expect(markup).toContain('data-ui="video-editor.workspace.root"');
    expect(markup).toContain('data-ui="video-editor.workspace.backdrop"');
    expect(overlaysSpy).toHaveBeenCalledTimes(1);
    expect(mainSpy).toHaveBeenCalledTimes(1);
    expect(mainSpy.mock.calls[0]?.[0]).toMatchObject({
      previewHeightStyle: { height: '300px' },
    });
  });
});
