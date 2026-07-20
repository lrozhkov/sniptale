// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const popupExportRuntimeHookMocks = vi.hoisted(() => ({
  createPopupExportRuntimeActionsMock: vi.fn(),
  usePopupExportCleanupMock: vi.fn(),
  usePopupExportMessageListenerMock: vi.fn(),
}));

vi.mock('./actions', () => ({
  createPopupExportRuntimeActions: (...args: unknown[]) =>
    popupExportRuntimeHookMocks.createPopupExportRuntimeActionsMock(...args),
}));

vi.mock('./cleanup', () => ({
  usePopupExportCleanup: (...args: unknown[]) =>
    popupExportRuntimeHookMocks.usePopupExportCleanupMock(...args),
}));

vi.mock('./message-listener', () => ({
  usePopupExportMessageListener: (...args: unknown[]) =>
    popupExportRuntimeHookMocks.usePopupExportMessageListenerMock(...args),
}));

import { usePopupExportRuntime } from './index';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestValue: ReturnType<typeof usePopupExportRuntime> | null = null;

function RuntimeHarness(props: { isActive: boolean; state: Record<string, unknown> }) {
  latestValue = usePopupExportRuntime(props as never);
  return null;
}

async function renderHarness(isActive: boolean, state: Record<string, unknown>) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<RuntimeHarness isActive={isActive} state={state} />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  popupExportRuntimeHookMocks.createPopupExportRuntimeActionsMock.mockReset();
  popupExportRuntimeHookMocks.usePopupExportCleanupMock.mockReset();
  popupExportRuntimeHookMocks.usePopupExportMessageListenerMock.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  latestValue = null;
  vi.unstubAllGlobals();
});

it('wires runtime effects before returning popup export runtime actions', async () => {
  const state = {
    copyResetTimeoutRef: { current: null },
  };
  const actions = {
    handleCancelExport: vi.fn(),
    handleCopyJson: vi.fn(),
  };
  popupExportRuntimeHookMocks.createPopupExportRuntimeActionsMock.mockReturnValue(actions);

  await renderHarness(true, state);

  expect(popupExportRuntimeHookMocks.usePopupExportCleanupMock).toHaveBeenCalledWith(
    state.copyResetTimeoutRef
  );
  expect(popupExportRuntimeHookMocks.usePopupExportMessageListenerMock).toHaveBeenCalledWith(state);
  expect(popupExportRuntimeHookMocks.createPopupExportRuntimeActionsMock).toHaveBeenCalledWith(
    state
  );
  expect(latestValue).toBe(actions);
});
