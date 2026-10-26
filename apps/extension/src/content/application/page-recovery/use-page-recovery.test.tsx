// @vitest-environment jsdom
import { beginPageRecoveryTeardown } from './lifecycle';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRuntimePortFixture } from '../../../../../../tooling/test/support/chrome-runtime-port';
import type { PageRecoveryRequest } from '../../../contracts/page-recovery';
import { usePageRecovery } from './use-page-recovery';
const history = vi.hoisted(() => ({
  token: {} as object,
  capture: null as unknown,
  listener: null as (() => void) | null,
  apply: vi.fn(() => true),
  connect: vi.fn(),
}));
vi.mock('@sniptale/platform/browser/runtime', () => ({
  browserRuntime: { connect: history.connect, getLastError: () => undefined },
}));
vi.mock('../../parser/page-preparation/history', () => ({
  pagePreparationHistory: {
    getRecoveryToken: () => history.token,
    hasChanges: () => history.capture !== null,
    captureRecovery: () => history.capture,
    restoreRecovery: history.apply,
    subscribe: (listener: () => void) => {
      history.listener = listener;
      return () => {
        history.listener = null;
      };
    },
  },
}));
vi.mock('../../parser/page-preparation/history/recovery-parser', () => ({
  parsePagePreparationRecovery: (value: unknown) => value,
}));
vi.mock('@sniptale/ui/product-feedback/toast-service', () => ({ showToast: vi.fn() }));
let root: Root | null = null;
let host: HTMLDivElement;
let current: ReturnType<typeof usePageRecovery>;
function Harness({ finalize }: { finalize: () => void }) {
  current = usePageRecovery(finalize, true);
  return <output>{current.state.available ? 'Restore available' : 'No restore'}</output>;
}
beforeEach(() => {
  history.token = {};
  history.capture = null;
  history.listener = null;
  vi.clearAllMocks();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
function backend() {
  const port = createRuntimePortFixture();
  history.connect.mockReturnValue(port.port);
  const lease = crypto.randomUUID();
  let defer = false;
  let rejectDiscard = false;
  port.postMessage.mockImplementation((message: PageRecoveryRequest) => {
    if ((message.kind === 'save' || message.kind === 'save-final') && defer) return;
    port.onMessage.emit({
      kind: 'result',
      requestId: message.requestId,
      status: message.kind === 'discard' && rejectDiscard ? 'failed' : 'ready',
      lease,
      available: message.kind === 'peek',
      ...(message.kind === 'load' ? { payload: '{"restored":true}' } : {}),
    });
  });
  return {
    port,
    lease,
    defer: () => {
      defer = true;
    },
    refuseDiscard: () => {
      rejectDiscard = true;
    },
  };
}
it('opens without an authored write and applies a set only after explicit Restore', async () => {
  const f = backend();
  const finalize = vi.fn();
  await act(async () => root!.render(<Harness finalize={finalize} />));
  expect(host.textContent).toBe('Restore available');
  expect(f.port.postMessage.mock.calls.map(([message]) => message.kind)).toEqual(['peek']);
  await act(async () => {
    expect(await current.restore()).toBe(true);
  });
  expect(finalize).toHaveBeenCalledOnce();
  expect(history.apply).toHaveBeenCalledWith({ restored: true });
  expect(host.textContent).toBe('No restore');
});
it.each(['beforeunload', 'pagehide'])(
  'posts the last %s edit before an older reply arrives',
  async (event) => {
    const f = backend();
    const finalize = () => {
      history.capture = { text: 'last edit' };
      history.token = {};
      history.listener!();
    };
    await act(async () => root!.render(<Harness finalize={finalize} />));
    f.defer();
    await act(async () => {
      history.capture = { text: 'earlier' };
      history.token = {};
      history.listener!();
    });
    expect(f.port.postMessage.mock.calls.at(-1)![0]).toMatchObject({
      kind: 'save',
      payload: '{"text":"earlier"}',
    });
    await act(async () => {
      window.dispatchEvent(new Event(event));
    });
    expect(f.port.postMessage.mock.calls.at(-1)![0]).toMatchObject({
      kind: 'save-final',
      payload: '{"text":"last edit"}',
    });
  }
);
it('does not run a destructive local action when acknowledged deletion fails', async () => {
  const f = backend();
  await act(async () => root!.render(<Harness finalize={vi.fn()} />));
  f.refuseDiscard();
  const clear = vi.fn();
  await act(async () => {
    expect(await current.discard(clear)).toBe(false);
  });
  expect(clear).not.toHaveBeenCalled();
  expect(current.state.error).toBe(true);
});
it('does not mount recovery on extension pages', async () => {
  backend();
  vi.stubGlobal('location', { protocol: 'chrome-extension:' });
  await act(async () => root!.render(<Harness finalize={vi.fn()} />));
  expect(history.connect).not.toHaveBeenCalled();
  expect(host.textContent).toBe('No restore');
});

it('does not discard the recovery set when service teardown restores and clears live history', async () => {
  const f = backend();
  await act(async () => root!.render(<Harness finalize={vi.fn()} />));
  await act(async () => {
    history.capture = { text: 'authored' };
    history.token = {};
    history.listener!();
  });
  expect(f.port.postMessage.mock.calls.map(([message]) => message.kind)).toEqual(['peek', 'save']);
  await act(async () => {
    const finish = beginPageRecoveryTeardown();
    history.capture = null;
    history.token = {};
    history.listener!();
    finish();
  });
  expect(f.port.postMessage.mock.calls.map(([message]) => message.kind)).toEqual(['peek', 'save']);
});

it('preserves local commands and finalization on excluded snapshot viewer surfaces', async () => {
  backend();
  vi.stubGlobal('location', { protocol: 'chrome-extension:' });
  const finalize = vi.fn();
  const action = vi.fn();
  await act(async () => root!.render(<Harness finalize={finalize} />));
  await act(async () => expect(await current.discard(action)).toBe(true));
  expect(finalize).toHaveBeenCalledOnce();
  expect(action).toHaveBeenCalledOnce();
  expect(history.connect).not.toHaveBeenCalled();
});
