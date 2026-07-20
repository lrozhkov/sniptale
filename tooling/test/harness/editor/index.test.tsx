// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const harnessMocks = vi.hoisted(() => {
  let resolveHarnessReady: () => void = () => undefined;
  return {
    createRootMock: vi.fn(() => ({ render: vi.fn() })),
    createPayloadMock: vi.fn(() => ({ title: 'Harness capture' })),
    initializeAppThemeMock: vi.fn(),
    normalizeBrowserFrameStateMock: vi.fn((value: unknown) => value),
    ready: new Promise<void>((resolve) => {
      resolveHarnessReady = resolve;
    }),
    resolveHarnessReady: () => resolveHarnessReady(),
  };
});

vi.mock('react-dom/client', () => ({
  createRoot: harnessMocks.createRootMock,
}));

vi.mock('../browser-mocks', () => ({
  harnessReady: harnessMocks.ready,
}));

vi.mock('../../../../apps/extension/src/ui/theme/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../apps/extension/src/ui/theme/index')>()),
  initializeAppTheme: harnessMocks.initializeAppThemeMock,
}));

vi.mock(
  '../../../../apps/extension/src/features/editor/document/constants',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../apps/extension/src/features/editor/document/constants')
    >()),
    normalizeBrowserFrameState: harnessMocks.normalizeBrowserFrameStateMock,
  })
);

vi.mock('../../../../apps/extension/src/editor/shell/page', () => ({
  EditorPage: () => null,
}));

vi.mock(
  '../../../../apps/extension/src/editor/application/controller-context',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../apps/extension/src/editor/application/controller-context')
    >()),
    useEditorController: () => ({
      applyBrowserFrame: vi.fn(),
      canvas: null,
      clearSelection: vi.fn(),
    }),
  })
);

vi.mock('../../../../apps/extension/src/editor/state/useEditorStore', () => ({
  useEditorStore: () => null,
}));

vi.mock('./scenarios/browser-frame-exact', () => ({
  createExactBrowserFrameHarnessPayload: harnessMocks.createPayloadMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  document.body.innerHTML = '<div id="root"></div>';
});

afterEach(() => {
  vi.useRealTimers();
});

it('initializes the app theme only after harness bootstrap storage is ready', async () => {
  await import('./index');

  expect(harnessMocks.initializeAppThemeMock).not.toHaveBeenCalled();

  harnessMocks.resolveHarnessReady();
  await harnessMocks.ready;
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(50);

  expect(harnessMocks.initializeAppThemeMock).toHaveBeenCalledTimes(1);
  expect(harnessMocks.createRootMock).toHaveBeenCalledWith(document.getElementById('root'));
});
