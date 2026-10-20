// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  subscribe: vi.fn(),
  requestMicrophone: vi.fn(),
  requestCamera: vi.fn(),
  openSettings: vi.fn(),
}));
vi.mock('../../../../../platform/navigation/extension-pages', () => ({
  openSettingsPage: mocks.openSettings,
}));
vi.mock('../../../media-devices', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../media-devices')>()),
  readPopupMediaAccessState: mocks.read,
  subscribeToPopupMediaAccessChanges: mocks.subscribe,
}));
vi.mock('../../../microphone', () => ({ requestMicrophonePermission: mocks.requestMicrophone }));
vi.mock('../../../webcam', () => ({ requestWebcamPermission: mocks.requestCamera }));
import { MediaAccessBoundary } from './media-access';
import type { PopupMediaAccessState } from '../../../media-devices';

let root: Root;
let container: HTMLDivElement;
let change: (state: PopupMediaAccessState) => void;
let unsubscribe: () => void;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.resetAllMocks();
  unsubscribe = vi.fn();
  mocks.read.mockResolvedValue('prompt');
  mocks.subscribe.mockImplementation(async (_kind, listener) => {
    change = listener;
    return unsubscribe;
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function render(node: ReactNode) {
  await act(async () => root.render(node));
}
function boundary(permissionName: 'microphone' | 'camera', onGranted = vi.fn(), enabled = true) {
  return (
    <MediaAccessBoundary permissionName={permissionName} enabled={enabled} onGranted={onGranted}>
      <span data-ready>Selected device</span>
    </MediaAccessBoundary>
  );
}

it.each(['microphone', 'camera'] as const)(
  'renders no permission notice or recovery action for %s',
  async (permissionName) => {
    for (const enabled of [false, true]) {
      for (const access of [
        'prompt',
        'denied',
        'unknown',
        'no-device',
        'device-busy',
        'unavailable',
      ]) {
        mocks.read.mockResolvedValue(access);
        await render(
          <div key={`${enabled}-${access}`}>{boundary(permissionName, vi.fn(), enabled)}</div>
        );
        expect(container.textContent).toBe('');
        expect(
          container.querySelector('button, [role="status"], [role="alert"], [data-ui]')
        ).toBeNull();
      }
    }
    expect(mocks.openSettings).not.toHaveBeenCalled();
    expect(mocks.requestMicrophone).not.toHaveBeenCalled();
    expect(mocks.requestCamera).not.toHaveBeenCalled();
  }
);
it.each(['microphone', 'camera'] as const)(
  'keeps disabled %s invisible even with granted access',
  async (permissionName) => {
    mocks.read.mockResolvedValue('granted');
    await render(boundary(permissionName, vi.fn(), false));
    expect(container.childElementCount).toBe(0);
  }
);
it('keeps disabled devices off after an external grant', async () => {
  mocks.read.mockResolvedValue('denied');
  const refresh = vi.fn().mockResolvedValue(undefined);
  await render(boundary('microphone', refresh, false));
  await act(async () => change('granted'));
  expect(refresh).toHaveBeenCalledOnce();
  expect(container.childElementCount).toBe(0);
  expect(mocks.requestMicrophone).not.toHaveBeenCalled();
});
it('renders nothing while the initial permission query is unresolved', async () => {
  mocks.read.mockReturnValue(new Promise(() => undefined));
  await render(boundary('camera'));
  expect(container.childElementCount).toBe(0);
  expect(mocks.openSettings).not.toHaveBeenCalled();
});
it('refreshes on browser permission changes and focus without starting a request', async () => {
  mocks.read.mockResolvedValue('granted');
  await render(boundary('microphone'));
  expect(container.querySelector('[data-ready]')).not.toBeNull();
  act(() => change('denied'));
  expect(container.childElementCount).toBe(0);
  mocks.read.mockResolvedValue('granted');
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(container.querySelector('[data-ready]')).not.toBeNull();
  expect(mocks.requestMicrophone).not.toHaveBeenCalled();
});
it('refreshes existing inventory once when permission is granted externally without capture', async () => {
  mocks.read.mockResolvedValue('denied');
  const refresh = vi.fn().mockResolvedValue(undefined);
  await render(boundary('microphone', refresh));
  expect(refresh).not.toHaveBeenCalled();
  await act(async () => change('granted'));
  expect(refresh).toHaveBeenCalledOnce();
  expect(container.querySelector('[data-ready]')).not.toBeNull();
  expect(mocks.requestMicrophone).not.toHaveBeenCalled();
  await act(async () => change('granted'));
  expect(refresh).toHaveBeenCalledOnce();
});
it('does not report recovery for an initially granted permission', async () => {
  mocks.read.mockResolvedValue('granted');
  const recovery = vi.fn().mockResolvedValue(undefined);
  await render(boundary('microphone', recovery));
  expect(container.querySelector('[data-ready]')).not.toBeNull();
  expect(recovery).not.toHaveBeenCalled();
});
it('retains an external grant when advisory inventory refresh fails', async () => {
  const refresh = vi.fn().mockRejectedValue(new Error('inventory unavailable'));
  await render(boundary('camera', refresh));
  await act(async () => change('granted'));
  expect(container.querySelector('[data-ready]')).not.toBeNull();
  expect(refresh).toHaveBeenCalledOnce();
});
it('retains granted access when a later advisory read is unknown', async () => {
  mocks.read.mockResolvedValue('granted');
  await render(boundary('camera'));
  mocks.read.mockResolvedValue('unknown');
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(container.querySelector('[data-ready]')).not.toBeNull();
});
it('ignores an older permission query that finishes after a permission change', async () => {
  let finishRead!: (state: string) => void;
  mocks.read.mockReturnValue(
    new Promise<string>((resolve) => {
      finishRead = resolve;
    })
  );
  await render(boundary('camera'));
  await act(async () => change('granted'));
  await act(async () => finishRead('denied'));
  expect(container.querySelector('[data-ready]')).not.toBeNull();
});
it('retires delayed subscriptions and ignores permission changes after unmount', async () => {
  let finishSubscription!: (stop: () => void) => void;
  mocks.subscribe.mockImplementation((_kind, listener) => {
    change = listener;
    return new Promise<() => void>((resolve) => {
      finishSubscription = resolve;
    });
  });
  const refresh = vi.fn();
  await render(boundary('microphone', refresh));
  act(() => root.unmount());
  root = createRoot(container);
  await act(async () => {
    finishSubscription(unsubscribe);
    change('granted');
    window.dispatchEvent(new Event('focus'));
  });
  expect(unsubscribe).toHaveBeenCalledOnce();
  expect(refresh).not.toHaveBeenCalled();
  expect(mocks.read).toHaveBeenCalledOnce();
});
