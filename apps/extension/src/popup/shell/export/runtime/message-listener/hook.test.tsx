// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

const mocks = vi.hoisted(() => ({
  actualApply: null as ((args: unknown) => boolean) | null,
  applyPopupExportRuntimeMessage: vi.fn(),
  parsePopupExportRuntimeMessage: vi.fn(),
  sendGetJobStatusMessage: vi.fn(),
  subscribeToMessages: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  browserRuntime: {
    subscribeToMessages: mocks.subscribeToMessages,
  },
}));

vi.mock('./apply', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./apply')>();
  mocks.actualApply = actual.applyPopupExportRuntimeMessage as (args: unknown) => boolean;
  return { ...actual, applyPopupExportRuntimeMessage: mocks.applyPopupExportRuntimeMessage };
});

vi.mock('./parse', () => ({
  parsePopupExportRuntimeMessage: mocks.parsePopupExportRuntimeMessage,
}));

vi.mock('../default-deps', () => ({
  getDefaultPopupExportRuntimeDeps: () => ({
    sendGetJobStatusMessage: mocks.sendGetJobStatusMessage,
  }),
}));

import { usePopupExportMessageListener } from './hook';

function createState() {
  return {
    cancelRetryRef: {
      current: { exportRunId: 'req-1', owner: 'job', tabIds: [42] } as {
        exportRunId: string;
        owner: 'job' | 'snapshot';
        tabIds: number[];
      } | null,
    },
    requestIdRef: { current: 'req-1' as string | null },
    setProgress: vi.fn(),
    setResult: vi.fn(),
  };
}

function createStatus(jobId = 'job-reconnected', revision = 4) {
  return {
    jobId,
    revision,
    phase: 'running' as const,
    orderedTabs: [{ tabId: 42, title: 'Page' }],
    effectiveOptions: {},
    progress: { current: 1, total: 2, errors: [], message: 'Running', phase: 'scanning' },
    warnings: [],
    originalActiveTabs: [],
    activatedTabIds: [42],
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
  mocks.applyPopupExportRuntimeMessage.mockImplementation((args) => mocks.actualApply?.(args));
  mocks.parsePopupExportRuntimeMessage.mockReset();
  mocks.subscribeToMessages.mockReset();
  mocks.sendGetJobStatusMessage.mockReset();
  mocks.unsubscribe.mockReset();
  mocks.subscribeToMessages.mockReturnValue(mocks.unsubscribe);
  mocks.sendGetJobStatusMessage.mockResolvedValue({ success: true, status: null });
});

it('reconnects to a running background job after the popup is reopened', async () => {
  const state = createState();
  state.requestIdRef.current = null;
  state.cancelRetryRef.current = null;
  const status = createStatus();
  mocks.sendGetJobStatusMessage.mockResolvedValue({ success: true, status });

  await renderNode(<MessageListenerHarness state={state} />);

  expect(mocks.sendGetJobStatusMessage).toHaveBeenCalledWith({
    type: 'GET_PAGE_PACKAGE_JOB_STATUS',
  });
  expect(state.requestIdRef.current).toBe('job-reconnected');
  expect(state.cancelRetryRef.current).toEqual({
    exportRunId: 'job-reconnected',
    owner: 'job',
    tabIds: [42],
  });
  expect(mocks.applyPopupExportRuntimeMessage).toHaveBeenCalledWith(
    expect.objectContaining({ message: expect.objectContaining({ status }) })
  );
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
  const parsedMessage = {
    status: createStatus('req-1'),
    type: MessageType.PAGE_PACKAGE_JOB_STATUS_UPDATED,
  } as const;
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
  expect(state.cancelRetryRef.current).toBeNull();
  expect(state.requestIdRef.current).toBeNull();
});

it('keeps a newer broadcast when an older reconnect response resolves afterward', async () => {
  const state = createState();
  const handlerRef: { current: ((message: unknown) => void) | null } = { current: null };
  let resolveStatus!: (value: unknown) => void;
  mocks.subscribeToMessages.mockImplementation((handler) => {
    handlerRef.current = handler;
    return mocks.unsubscribe;
  });
  mocks.sendGetJobStatusMessage.mockReturnValue(
    new Promise((resolve) => {
      resolveStatus = resolve;
    })
  );
  const newerStatus = createStatus('req-1', 6);
  const olderStatus = createStatus('req-1', 5);
  mocks.parsePopupExportRuntimeMessage.mockReturnValue({
    status: newerStatus,
    type: MessageType.PAGE_PACKAGE_JOB_STATUS_UPDATED,
  });

  await renderNode(<MessageListenerHarness state={state} />);
  act(() => handlerRef.current?.({ type: MessageType.PAGE_PACKAGE_JOB_STATUS_UPDATED }));
  await act(async () => {
    resolveStatus({ success: true, status: olderStatus });
    await Promise.resolve();
  });

  expect(state.setProgress).toHaveBeenCalledTimes(1);
  expect(state.setProgress).toHaveBeenCalledWith(
    expect.objectContaining({ current: newerStatus.progress.current })
  );
});
