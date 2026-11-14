// @vitest-environment jsdom

import { act, Children, isValidElement, type ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { EditorDocument } from '../../../../apps/extension/src/features/editor/document/types';

const harnessMocks = vi.hoisted(() => {
  let resolveHarnessReady: () => void = () => undefined;
  return {
    controller: {
      applyBrowserFrame: vi.fn(),
      canvas: null,
      clearSelection: vi.fn(),
      exportDocument: vi.fn(() => ({ sourceName: 'retained source' })),
      getRasterRuntime: vi.fn(),
      loadDocument: vi.fn<(document: EditorDocument) => Promise<void>>(async () => {}),
    },
    createRootMock: vi.fn(() => ({ render: vi.fn<(node: ReactNode) => void>() })),
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

vi.mock('../browser-mocks/browser-mocks', () => ({
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
    useEditorController: () => harnessMocks.controller,
  })
);

vi.mock('../../../../apps/extension/src/editor/state/useEditorStore', () => ({
  useEditorStore: () => null,
}));

vi.mock('./scenarios/browser-frame-exact', () => ({
  createExactBrowserFrameHarnessPayload: harnessMocks.createPayloadMock,
}));

beforeEach(() => {
  harnessMocks.controller.applyBrowserFrame.mockClear();
  harnessMocks.controller.loadDocument.mockReset();
  harnessMocks.initializeAppThemeMock.mockClear();
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

function findBridge(node: ReactNode): ReactNode {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ children?: ReactNode; afterLayout?: ReactNode }>(child)) continue;
    if (typeof child.type === 'function' && child.type.name === 'HarnessEditorDebugBridge')
      return child;
    const found = findBridge(child.props.children) ?? findBridge(child.props.afterLayout);
    if (found) return found;
  }
  return null;
}

it('returns detached raster and document observations without publishing changes', async () => {
  const snapshot = { settings: { color: '#112233' }, busy: false };
  harnessMocks.controller.getRasterRuntime.mockReturnValue({ getSnapshot: () => snapshot });
  const { root, probe } = await mountHarnessBridge();
  expect(probe.getSceneProjection()).toBeNull();
  const observed = probe.getRasterSnapshot()!;
  Reflect.set(observed.settings, 'color', '#ffffff');
  expect(snapshot.settings.color).toBe('#112233');
  const exported = probe.exportDocument();
  exported.sourceName = 'changed observation';
  expect(harnessMocks.controller.exportDocument()).toEqual({ sourceName: 'retained source' });
  expect(harnessMocks.controller.applyBrowserFrame).not.toHaveBeenCalled();
  await act(async () => root.unmount());
  expect(window.__sniptaleEditorHarness).toBeUndefined();
});

async function mountHarnessBridge() {
  vi.useRealTimers();
  await import('./index');
  await harnessMocks.ready;
  await Promise.resolve();
  const render = harnessMocks.createRootMock.mock.results[0]!.value.render;
  const bridge = findBridge(render.mock.calls[0]![0]);
  expect(bridge).toBeTruthy();
  const { createRoot } =
    await vi.importActual<typeof import('react-dom/client')>('react-dom/client');
  const root = createRoot(document.getElementById('root')!);
  await act(async () => root.render(bridge));
  return { root, probe: window.__sniptaleEditorHarness! };
}

it('routes document loading through controller admission and retains its refusal', async () => {
  const { root, probe } = await mountHarnessBridge();
  try {
    const document = probe.exportDocument();
    await probe.loadDocument(document);
    expect(harnessMocks.controller.loadDocument).toHaveBeenCalledExactlyOnceWith(document);
    harnessMocks.controller.loadDocument.mockRejectedValueOnce(new Error('document refused'));
    await expect(probe.loadDocument(document)).rejects.toThrow('document refused');
  } finally {
    await act(async () => root.unmount());
  }
});
