import { beforeEach, expect, it, vi } from 'vitest';

const contentModeEventsMocks = vi.hoisted(() => ({
  dispatchHighlighterModeChangedMock: vi.fn(),
}));

const runtimeModuleMocks = vi.hoisted(() => ({
  applyHighlighterDocumentModeMock: vi.fn(),
  mountHighlighterCursorStyleMock: vi.fn(),
  registerHighlighterRuntimeListenersMock: vi.fn(),
  removeHighlighterCursorStyleMock: vi.fn(),
}));

vi.mock('../../platform/page-context/mode-events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/page-context/mode-events')>()),
  dispatchHighlighterModeChanged: contentModeEventsMocks.dispatchHighlighterModeChangedMock,
}));

vi.mock('./runtime-document-mode', () => ({
  applyHighlighterDocumentMode: runtimeModuleMocks.applyHighlighterDocumentModeMock,
}));

vi.mock('./runtime-cursor-style', () => ({
  mountHighlighterCursorStyle: runtimeModuleMocks.mountHighlighterCursorStyleMock,
  removeHighlighterCursorStyle: runtimeModuleMocks.removeHighlighterCursorStyleMock,
}));

vi.mock('./runtime-listeners', () => ({
  registerHighlighterRuntimeListeners: runtimeModuleMocks.registerHighlighterRuntimeListenersMock,
}));

import {
  applyHighlighterDocumentMode,
  dispatchHighlighterModeChanged,
  mountHighlighterCursorStyle,
  removeHighlighterCursorStyle,
  registerHighlighterRuntimeListeners,
} from './runtime.helpers';

beforeEach(() => {
  contentModeEventsMocks.dispatchHighlighterModeChangedMock.mockClear();
  runtimeModuleMocks.applyHighlighterDocumentModeMock.mockClear();
  runtimeModuleMocks.mountHighlighterCursorStyleMock.mockClear();
  runtimeModuleMocks.removeHighlighterCursorStyleMock.mockClear();
  runtimeModuleMocks.registerHighlighterRuntimeListenersMock.mockClear();
});

it('dispatches shared highlighter-mode changes through the facade', () => {
  dispatchHighlighterModeChanged(true);

  expect(contentModeEventsMocks.dispatchHighlighterModeChangedMock).toHaveBeenCalledWith({
    enabled: true,
  });
});

it('re-exports the owner-local runtime helpers without wrapping them', () => {
  applyHighlighterDocumentMode(true);
  mountHighlighterCursorStyle();
  removeHighlighterCursorStyle();
  registerHighlighterRuntimeListeners({
    disableHighlighterMode: vi.fn(),
    hoverController: {} as never,
    isAnyFrameEditing: () => false,
  });

  expect(runtimeModuleMocks.applyHighlighterDocumentModeMock).toHaveBeenCalledWith(true);
  expect(runtimeModuleMocks.mountHighlighterCursorStyleMock).toHaveBeenCalledTimes(1);
  expect(runtimeModuleMocks.removeHighlighterCursorStyleMock).toHaveBeenCalledTimes(1);
  expect(runtimeModuleMocks.registerHighlighterRuntimeListenersMock).toHaveBeenCalledWith({
    disableHighlighterMode: expect.any(Function),
    hoverController: {},
    isAnyFrameEditing: expect.any(Function),
  });
});
