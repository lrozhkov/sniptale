import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VideoEditorCommandPalette } from './index';

const commandPaletteSpy = vi.fn();

vi.mock('../../../ui/command-palette', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../ui/command-palette')>()),
  CommandPalette: (props: unknown) => {
    commandPaletteSpy(props);
    return <div data-testid="command-palette" />;
  },
}));

describe('VideoEditorCommandPalette', () => {
  afterEach(() => {
    commandPaletteSpy.mockReset();
  });

  it('passes the narrow palette controller actions into the shared palette shell', () => {
    renderToStaticMarkup(
      <VideoEditorCommandPalette
        controller={{
          diagnosticsOpen: false,
          isPlaying: false,
          leftSidebarCollapsed: false,
          onAddShapeOverlay: vi.fn(),
          onAddTextOverlay: vi.fn(),
          onDeleteSelectedClip: vi.fn(),
          onDuplicateSelectedClip: vi.fn(),
          onOpenExportDialog: vi.fn(),
          onSplitSelectedClip: vi.fn(),
          selectedClipId: null,
          toggleDiagnostics: vi.fn(),
          togglePlaying: vi.fn(),
          toggleSidebarCollapsed: vi.fn(),
        }}
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    expect(commandPaletteSpy).toHaveBeenCalledTimes(1);
    expect(commandPaletteSpy.mock.calls[0]?.[0]).toMatchObject({
      dataUi: 'video-editor.command-palette',
      isOpen: true,
      storageKey: 'sniptale.video-editor.command-palette',
    });
  });
});
