import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createToolbarEditingHandlers } from './editing';

const toolbarEditingMocks = vi.hoisted(() => ({
  disableAiPickModeMock: vi.fn(),
  disableHighlighterModeMock: vi.fn(),
  disableQuickEditDocumentModeMock: vi.fn(),
  disableQuickEditModeMock: vi.fn(),
  enableQuickEditDocumentModeMock: vi.fn(),
  isQuickEditDocumentModeEnabledMock: vi.fn(() => false),
  loggerErrorMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  preloadSelectionModeMock: vi.fn(async () => undefined),
  showToastMock: vi.fn(),
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => key,
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal()),
  createLogger: () => ({
    error: toolbarEditingMocks.loggerErrorMock,
    log: vi.fn(),
    warn: toolbarEditingMocks.loggerWarnMock,
  }),
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal()),
  showToast: toolbarEditingMocks.showToastMock,
}));

vi.mock('../../../selection/highlighter', async (importOriginal) => ({
  ...(await importOriginal()),
  disableHighlighterMode: toolbarEditingMocks.disableHighlighterModeMock,
  enableHighlighterMode: vi.fn(),
}));

vi.mock('../../../selection/quick-edit', () => ({
  disableQuickEditDocumentMode: toolbarEditingMocks.disableQuickEditDocumentModeMock,
  disableQuickEditMode: toolbarEditingMocks.disableQuickEditModeMock,
  enableQuickEditDocumentMode: toolbarEditingMocks.enableQuickEditDocumentModeMock,
  enableQuickEditMode: vi.fn(),
  isQuickEditDocumentModeEnabled: toolbarEditingMocks.isQuickEditDocumentModeEnabledMock,
}));

vi.mock('../../../selection/selection-mode/lazy', async (importOriginal) => ({
  ...(await importOriginal()),
  preloadSelectionMode: toolbarEditingMocks.preloadSelectionModeMock,
}));

function createParams() {
  return {
    aiPickMode: false,
    disableAiPickMode: toolbarEditingMocks.disableAiPickModeMock,
    highlighterMode: false,
    quickEditMode: false,
    setAiPickMode: vi.fn(),
    setHighlighterMode: vi.fn(),
    setIsToolbarVisible: vi.fn(),
    setNavigationLockEnabled: vi.fn(),
    setQuickEditDocumentMode: vi.fn(),
    setQuickEditMode: vi.fn(),
    setScreenshotMode: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('toolbar-mode-controller screenshot preload', () => {
  it('preloads selection mode when screenshot mode is enabled', () => {
    const params = createParams();
    const handlers = createToolbarEditingHandlers(params);

    handlers.handleToggleScreenshotMode(true);

    expect(toolbarEditingMocks.preloadSelectionModeMock).toHaveBeenCalledTimes(1);
    expect(params.setScreenshotMode).toHaveBeenCalledWith(true);
    expect(params.setIsToolbarVisible).toHaveBeenCalledWith(true);
    expect(toolbarEditingMocks.showToastMock).not.toHaveBeenCalled();
  });

  it('does not preload selection mode when screenshot mode is disabled', () => {
    const params = createParams();
    const handlers = createToolbarEditingHandlers(params);

    handlers.handleToggleScreenshotMode(false);

    expect(toolbarEditingMocks.preloadSelectionModeMock).not.toHaveBeenCalled();
    expect(params.setScreenshotMode).toHaveBeenCalledWith(false);
    expect(params.setIsToolbarVisible).toHaveBeenCalledWith(false);
    expect(toolbarEditingMocks.showToastMock).not.toHaveBeenCalled();
  });

  it('swallows selection preload failures and logs a warning', async () => {
    const params = createParams();
    const handlers = createToolbarEditingHandlers(params);
    toolbarEditingMocks.preloadSelectionModeMock.mockRejectedValueOnce(new Error('chunk failed'));

    expect(() => handlers.handleToggleScreenshotMode(true)).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();

    expect(toolbarEditingMocks.loggerWarnMock).toHaveBeenCalledWith(
      'Failed to preload selection mode chunk',
      expect.any(Error)
    );
  });
});

describe('toolbar-mode-controller manual editing transitions', () => {
  it('keeps manual highlighter and quick-edit mode transitions silent', () => {
    const params = createParams();
    const handlers = createToolbarEditingHandlers(params);

    handlers.handleToggleHighlighterMode(true);
    handlers.handleToggleHighlighterMode(false);
    handlers.handleToggleQuickEditMode(true);
    handlers.handleToggleQuickEditMode(false);

    expect(toolbarEditingMocks.showToastMock).not.toHaveBeenCalled();
  });
});

function registerQuickEditDocumentToggleTests() {
  it('resets document mode when quick edit is disabled', () => {
    const params = createParams();
    const handlers = createToolbarEditingHandlers(params);

    handlers.handleToggleQuickEditMode(true);
    handlers.handleToggleQuickEditMode(false);

    expect(params.setQuickEditDocumentMode).toHaveBeenCalledWith(false);
    expect(toolbarEditingMocks.disableQuickEditDocumentModeMock).toHaveBeenCalledTimes(1);
  });

  it('toggles quick edit document mode after runtime success', () => {
    const params = createParams();
    const handlers = createToolbarEditingHandlers(params);
    toolbarEditingMocks.isQuickEditDocumentModeEnabledMock
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);

    handlers.handleToggleQuickEditDocumentMode(true);
    handlers.handleToggleQuickEditDocumentMode(false);

    expect(toolbarEditingMocks.enableQuickEditDocumentModeMock).toHaveBeenCalledTimes(1);
    expect(toolbarEditingMocks.disableQuickEditDocumentModeMock).toHaveBeenCalledTimes(1);
    expect(params.setQuickEditDocumentMode).toHaveBeenNthCalledWith(1, true);
    expect(params.setQuickEditDocumentMode).toHaveBeenNthCalledWith(2, false);
  });
}

function registerQuickEditDocumentFailureTests() {
  it('leaves document mode UI disabled when the runtime toggle fails', () => {
    const params = createParams();
    const handlers = createToolbarEditingHandlers(params);
    toolbarEditingMocks.enableQuickEditDocumentModeMock.mockImplementationOnce(() => {
      throw new Error('designMode failed');
    });

    handlers.handleToggleQuickEditDocumentMode(true);

    expect(params.setQuickEditDocumentMode).toHaveBeenCalledWith(false);
    expect(toolbarEditingMocks.loggerErrorMock).toHaveBeenCalledWith(
      'Failed to toggle quick edit document mode',
      expect.any(Error)
    );
  });

  it('keeps document mode UI active when runtime disable fails and owner remains active', () => {
    const params = createParams();
    const handlers = createToolbarEditingHandlers(params);
    toolbarEditingMocks.disableQuickEditDocumentModeMock.mockImplementationOnce(() => {
      throw new Error('restore failed');
    });
    toolbarEditingMocks.isQuickEditDocumentModeEnabledMock.mockReturnValueOnce(true);

    handlers.handleToggleQuickEditDocumentMode(false);

    expect(params.setQuickEditDocumentMode).toHaveBeenCalledWith(true);
    expect(toolbarEditingMocks.loggerErrorMock).toHaveBeenCalledWith(
      'Failed to toggle quick edit document mode',
      expect.any(Error)
    );
  });
}

function registerQuickEditDocumentTransitionTests() {
  it('switches from quick-edit document mode to cursor by disabling both quick-edit states', () => {
    const params = { ...createParams(), quickEditMode: true };
    const handlers = createToolbarEditingHandlers(params);

    handlers.handleEnableCursorMode();

    expect(toolbarEditingMocks.disableQuickEditDocumentModeMock).toHaveBeenCalledOnce();
    expect(toolbarEditingMocks.disableQuickEditModeMock).toHaveBeenCalledOnce();
    expect(params.setQuickEditDocumentMode).toHaveBeenCalledWith(false);
    expect(params.setQuickEditMode).toHaveBeenCalledWith(false);
  });

  it('does not leave quick edit UI disabled when document-mode cleanup fails', () => {
    const params = { ...createParams(), quickEditMode: true };
    const handlers = createToolbarEditingHandlers(params);
    toolbarEditingMocks.disableQuickEditDocumentModeMock.mockImplementationOnce(() => {
      throw new Error('restore failed');
    });
    toolbarEditingMocks.isQuickEditDocumentModeEnabledMock.mockReturnValueOnce(true);

    handlers.handleEnableCursorMode();

    expect(toolbarEditingMocks.disableQuickEditModeMock).not.toHaveBeenCalled();
    expect(params.setQuickEditDocumentMode).toHaveBeenCalledWith(true);
    expect(params.setQuickEditMode).not.toHaveBeenCalledWith(false);
  });

  it('disables quick-edit document mode before enabling highlighter mode', () => {
    const params = { ...createParams(), quickEditMode: true };
    const handlers = createToolbarEditingHandlers(params);

    handlers.handleToggleHighlighterMode(true);

    expect(toolbarEditingMocks.disableQuickEditDocumentModeMock).toHaveBeenCalledOnce();
    expect(toolbarEditingMocks.disableQuickEditModeMock).toHaveBeenCalledOnce();
    expect(params.setQuickEditDocumentMode).toHaveBeenCalledWith(false);
    expect(params.setQuickEditMode).toHaveBeenCalledWith(false);
    expect(params.setHighlighterMode).toHaveBeenCalledWith(true);
  });
}

function runQuickEditDocumentModeSuite() {
  registerQuickEditDocumentToggleTests();
  registerQuickEditDocumentFailureTests();
  registerQuickEditDocumentTransitionTests();
}

describe('toolbar-mode-controller quick edit document mode', runQuickEditDocumentModeSuite);
