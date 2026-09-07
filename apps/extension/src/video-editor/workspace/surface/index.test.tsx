import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VideoEditorWorkspace } from './';

const overlaysSpy = vi.fn();
const mainSpy = vi.fn();

vi.mock('../../runtime/controller/composition/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../runtime/controller/composition/hooks')>()),
  useVideoEditorLayoutController: () => ({ previewPaneHeight: 300 }),
  useVideoEditorOverlaysController: () => ({
    exportDialog: {},
    exportProgress: {},
  }),
}));

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

  it('passes narrowed overlay and workspace slices without diagnostics content', () => {
    const markup = renderToStaticMarkup(<VideoEditorWorkspace />);

    expect(markup).toContain('data-ui="video-editor.workspace.root"');
    expect(markup).toContain('data-ui="video-editor.workspace.backdrop"');
    expect(overlaysSpy).toHaveBeenCalledTimes(1);
    expect(mainSpy).toHaveBeenCalledTimes(1);
    expect(mainSpy.mock.calls[0]?.[0]).not.toHaveProperty('diagnosticsContent');
    expect(mainSpy.mock.calls[0]?.[0]).toMatchObject({
      previewHeightStyle: { height: '300px' },
    });
  });
});
