import { beforeEach, vi } from 'vitest';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
} from '../../../features/editor/document/constants';

export function createEditorPageController() {
  return {
    autosaveService: null,
    dispose: vi.fn(),
    exportDocument: vi.fn(() => ({ version: 1 })),
    loadDocument: vi.fn(async () => undefined),
    openImage: vi.fn(async () => undefined),
  };
}

export function createEditorPageAutosaveService() {
  return {
    activate: vi.fn(),
    dispose: vi.fn(),
    flushAutosave: vi.fn(async (produceDocument?: () => unknown) => {
      produceDocument?.();
    }),
    updateContext: vi.fn(),
  };
}

export function createEditorPageDocument() {
  return {
    version: 1 as const,
    sourceImageData: 'data:image/png;base64,doc',
    sourceName: null,
    sourceWidth: 320,
    sourceHeight: 180,
    canvasWidth: 320,
    canvasHeight: 180,
    sourceLeft: 0,
    sourceTop: 0,
    sourceDisplayWidth: 320,
    sourceDisplayHeight: 180,
    frame: DEFAULT_EDITOR_FRAME_SETTINGS,
    browserFrame: DEFAULT_BROWSER_FRAME_STATE,
    canvasJson: '{"version":"7.2.0","objects":[]}',
  };
}

export function createEditorPageRuntime(
  overrides: Partial<{ isCancelled: () => boolean; setPageTitle: (value: string) => void }> = {}
) {
  return {
    isCancelled: overrides.isCancelled ?? (() => false),
    setPageTitle: overrides.setPageTitle ?? vi.fn(),
  };
}

export function setupEditorPageRuntimeBootstrapTestScope(args: {
  ensureEditorPageSessionIdMock: ReturnType<typeof vi.fn>;
  readEditorPageLocationStateMock: ReturnType<typeof vi.fn>;
  waitForEditorControllerCanvasMock: ReturnType<typeof vi.fn>;
}) {
  beforeEach(() => {
    vi.clearAllMocks();
    args.readEditorPageLocationStateMock.mockReturnValue({ assetId: 'asset-1' });
    args.ensureEditorPageSessionIdMock.mockReturnValue('session-1');
    args.waitForEditorControllerCanvasMock.mockResolvedValue(undefined);
  });
}
