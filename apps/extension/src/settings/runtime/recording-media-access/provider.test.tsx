// @vitest-environment jsdom

import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  dispose: vi.fn(),
  readState: vi.fn(),
  subscribeState: vi.fn(),
  retainDevice: vi.fn(),
}));
vi.mock('./session', () => ({ createRecordingMediaAccessSession: mocks.createSession }));
vi.mock('./browser', () => ({
  readRecordingMediaAccessState: mocks.readState,
  subscribeRecordingMediaAccessState: mocks.subscribeState,
  retainRecordingMediaDevice: mocks.retainDevice,
}));
import { RecordingMediaAccessProvider, useRecordingMediaAccess } from './provider';

let container: HTMLDivElement;
let root: Root | null;

function Consumer({ label }: { label: string }) {
  const access = useRecordingMediaAccess();
  return (
    <button onClick={access.activate} data-failed={access.failed}>
      {label}
    </button>
  );
}

async function render(label = 'first section') {
  await act(async () =>
    root?.render(
      <StrictMode>
        <RecordingMediaAccessProvider>
          <Consumer label={label} />
        </RecordingMediaAccessProvider>
      </StrictMode>
    )
  );
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  mocks.createSession.mockReturnValue({ dispose: mocks.dispose });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  vi.unstubAllGlobals();
});

it('does not observe or acquire recording devices before targeted activation', async () => {
  await render();
  expect(mocks.createSession).not.toHaveBeenCalled();
  expect(mocks.retainDevice).not.toHaveBeenCalled();
});

it('activates one page owner and retains it across Settings section changes', async () => {
  await render();
  await act(async () => container.querySelector('button')?.click());
  expect(mocks.createSession).toHaveBeenCalledExactlyOnceWith({
    readState: mocks.readState,
    subscribeState: mocks.subscribeState,
    retainDevice: mocks.retainDevice,
    onFailure: expect.any(Function),
    onIdle: expect.any(Function),
  });
  await render('another section');
  await act(async () => container.querySelector('button')?.click());
  expect(mocks.createSession).toHaveBeenCalledTimes(1);
  expect(mocks.dispose).not.toHaveBeenCalled();
});

it('reports local failure and clears it after the recording ends', async () => {
  await render();
  await act(async () => container.querySelector('button')?.click());
  const callbacks = mocks.createSession.mock.calls[0]![0];
  act(() => callbacks.onFailure());
  expect(container.querySelector('button')?.dataset['failed']).toBe('true');
  act(() => callbacks.onIdle());
  expect(container.querySelector('button')?.dataset['failed']).toBe('false');
});

it('disposes on pagehide and ignores later callbacks', async () => {
  await render();
  await act(async () => container.querySelector('button')?.click());
  const callbacks = mocks.createSession.mock.calls[0]![0];
  act(() => window.dispatchEvent(new Event('pagehide')));
  expect(mocks.dispose).toHaveBeenCalledOnce();
  act(() => callbacks.onFailure());
  expect(container.querySelector('button')?.dataset['failed']).toBe('false');
  act(() => root?.unmount());
  root = null;
  expect(mocks.dispose).toHaveBeenCalledOnce();
});
