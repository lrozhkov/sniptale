import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './index';

const useAppLocaleMock = vi.fn();
const useCommandPaletteHotkeyMock = vi.fn();
const useVideoEditorControllerMock = vi.fn();
const workspaceSpy = vi.fn();
const paletteSpy = vi.fn();
const statusSpy = vi.fn();

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  useAppLocale: () => useAppLocaleMock(),
  usePageLocaleMetadata: () => useAppLocaleMock(),
}));
vi.mock('../../../ui/command-palette/hotkey', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../ui/command-palette/hotkey')>()),
  useCommandPaletteHotkey: (params: unknown) => useCommandPaletteHotkeyMock(params),
}));
vi.mock('../../runtime/controller', () => ({
  useVideoEditorController: () => useVideoEditorControllerMock(),
}));
vi.mock('../../workspace/surface', () => ({
  VideoEditorWorkspace: (props: unknown) => {
    workspaceSpy(props);
    return <div data-testid="workspace" />;
  },
}));
vi.mock('../command-palette', () => ({
  VideoEditorCommandPalette: (props: unknown) => {
    paletteSpy(props);
    return <div data-testid="palette" />;
  },
}));
vi.mock('../status-screen', () => ({
  VideoEditorStatusScreen: (props: unknown) => {
    statusSpy(props);
    return <div data-testid="status" />;
  },
}));

function renderAppWithController(controller: unknown) {
  useVideoEditorControllerMock.mockReturnValue(controller);
  renderToStaticMarkup(<App />);
}

function createReadyController() {
  return {
    palette: { selectedClipId: null },
    shell: {
      error: null,
      isReady: true,
      project: { id: 'project-1' },
    },
    workspace: {
      diagnostics: {
        isOpen: false,
        onClose: vi.fn(),
        recordingId: null,
      },
      layout: {
        handleStartVerticalResize: vi.fn(),
        leftSidebarCollapsed: false,
        previewPaneHeight: 320,
        toggleSidebarCollapsed: vi.fn(),
        workspaceSplitRef: { current: null },
      },
    },
  };
}

function verifyWorkspaceBranch() {
  renderAppWithController(createReadyController());

  expect(useAppLocaleMock).toHaveBeenCalledTimes(1);
  expect(useCommandPaletteHotkeyMock.mock.calls[0]?.[0]).toMatchObject({
    enabled: true,
    isOpen: false,
  });
  expect(workspaceSpy).toHaveBeenCalledTimes(1);
  expect(paletteSpy.mock.calls[0]?.[0]).toMatchObject({
    controller: { selectedClipId: null },
    isOpen: false,
  });
}

function verifyStatusBranches() {
  renderAppWithController({
    palette: {},
    shell: {
      error: null,
      isReady: false,
      project: null,
    },
  });

  expect(statusSpy.mock.calls[0]?.[0]).toMatchObject({ mode: 'loading' });

  renderAppWithController({
    palette: {},
    shell: {
      error: 'broken',
      isReady: true,
      project: null,
    },
  });

  expect(statusSpy.mock.calls[1]?.[0]).toMatchObject({
    error: 'broken',
    mode: 'error',
  });
}

describe('video editor app', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it(
    'renders the workspace branch when the shell is ready and passes the narrow palette slice',
    verifyWorkspaceBranch
  );

  it('renders loading and error branches from shell state', verifyStatusBranches);
});
