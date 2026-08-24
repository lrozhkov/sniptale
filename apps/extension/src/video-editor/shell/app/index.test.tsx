import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './index';

const useAppLocaleMock = vi.fn();
const useCommandPaletteHotkeyMock = vi.fn();
const shellControllerMock = vi.fn();
const paletteControllerMock = vi.fn();
const historyControllerMock = vi.fn();
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
vi.mock('../../runtime/controller/composition/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../runtime/controller/composition/hooks')>()),
  useVideoEditorCommandPaletteController: () => paletteControllerMock(),
  useVideoEditorHistoryController: () => historyControllerMock(),
  useVideoEditorShellController: () => shellControllerMock(),
}));
vi.mock('../../runtime/controller/composition/provider', () => ({
  VideoEditorCompositionProvider: ({ children }: { children: ReactNode }) => children,
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

interface AppControllerFixture {
  palette: Record<string, unknown>;
  shell: {
    error: string | null;
    isReady: boolean;
    project: { id: string } | null;
  };
}

function renderAppWithController(controller: AppControllerFixture) {
  shellControllerMock.mockReturnValue(controller.shell);
  paletteControllerMock.mockReturnValue(controller.palette);
  historyControllerMock.mockReturnValue({
    canUndo: false,
    canRedo: false,
    error: null,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
  });
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
