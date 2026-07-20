// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyPopupExportRuntimeMessage: vi.fn(),
  parsePopupExportRuntimeMessage: vi.fn(),
  subscribeToMessages: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  browserRuntime: {
    subscribeToMessages: mocks.subscribeToMessages,
  },
}));

vi.mock('./apply', () => ({
  applyPopupExportRuntimeMessage: mocks.applyPopupExportRuntimeMessage,
}));

vi.mock('./parse', () => ({
  parsePopupExportRuntimeMessage: mocks.parsePopupExportRuntimeMessage,
}));

import { usePopupExportMessageListener } from './hook';

function createState() {
  return {
    requestIdRef: { current: 'req-1' as string | null },
    setProgress: vi.fn(),
    setResult: vi.fn(),
  };
}

function MessageListenerHarness(props: { state: ReturnType<typeof createState> }) {
  usePopupExportMessageListener(props.state as never);
  return null;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderNode(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(node);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.applyPopupExportRuntimeMessage.mockReset();
  mocks.parsePopupExportRuntimeMessage.mockReset();
  mocks.subscribeToMessages.mockReset();
  mocks.unsubscribe.mockReset();
  mocks.subscribeToMessages.mockReturnValue(mocks.unsubscribe);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('ignores runtime messages that do not parse into popup export messages', async () => {
  const state = createState();
  const handlerRef: { current: ((message: unknown) => void) | null } = { current: null };
  mocks.subscribeToMessages.mockImplementation((handler) => {
    handlerRef.current = handler;
    return mocks.unsubscribe;
  });
  mocks.parsePopupExportRuntimeMessage.mockReturnValue(null);

  await renderNode(<MessageListenerHarness state={state} />);

  handlerRef.current?.({ type: 'UNRELATED' });

  expect(mocks.applyPopupExportRuntimeMessage).not.toHaveBeenCalled();
});

it('passes parsed runtime messages to the apply seam and exposes request clearing', async () => {
  const state = createState();
  const handlerRef: { current: ((message: unknown) => void) | null } = { current: null };
  const parsedMessage = { requestId: 'req-1', type: 'popup-result' } as const;
  mocks.subscribeToMessages.mockImplementation((handler) => {
    handlerRef.current = handler;
    return mocks.unsubscribe;
  });
  mocks.parsePopupExportRuntimeMessage.mockReturnValue(parsedMessage);

  await renderNode(<MessageListenerHarness state={state} />);

  handlerRef.current?.({ type: 'RESULT' });

  expect(mocks.applyPopupExportRuntimeMessage).toHaveBeenCalledTimes(1);
  expect(mocks.applyPopupExportRuntimeMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      message: parsedMessage,
      requestId: 'req-1',
      setProgress: state.setProgress,
      setResult: state.setResult,
    })
  );

  const [{ clearRequestId }] = mocks.applyPopupExportRuntimeMessage.mock.calls[0] as [
    { clearRequestId: () => void },
  ];
  clearRequestId();
  expect(state.requestIdRef.current).toBeNull();
});
