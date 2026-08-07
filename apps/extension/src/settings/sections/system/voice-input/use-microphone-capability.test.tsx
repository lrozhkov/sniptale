// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listDevices: vi.fn(),
  readAccess: vi.fn(),
  requestAccess: vi.fn(),
  subscribe: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/user-media', () => ({
  listMicrophoneInputDevices: mocks.listDevices,
  readMicrophoneAccessState: mocks.readAccess,
  requestMicrophoneAccess: mocks.requestAccess,
  subscribeToMicrophoneDeviceChanges: mocks.subscribe,
}));

import { useMicrophoneCapability } from './use-microphone-capability';

type Capability = ReturnType<typeof useMicrophoneCapability>;

let capability: Capability | null;
let container: HTMLDivElement;
let root: Root;
let deviceChangeListener: (() => void) | undefined;
const unsubscribe = vi.fn();

function Harness() {
  capability = useMicrophoneCapability();
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  capability = null;
  deviceChangeListener = undefined;
  mocks.listDevices.mockResolvedValue([{ deviceId: 'microphone-1', label: 'Desk microphone' }]);
  mocks.readAccess.mockResolvedValue('prompt');
  mocks.requestAccess.mockResolvedValue('granted');
  mocks.subscribe.mockImplementation((listener: () => void) => {
    deviceChangeListener = listener;
    return unsubscribe;
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<Harness />));
});

afterEach(() => {
  act(() => root.unmount());
  expect(unsubscribe).toHaveBeenCalledOnce();
  container.remove();
  vi.unstubAllGlobals();
});

describe('microphone capability hook', () => {
  it('refreshes access and devices and responds to device changes', async () => {
    await act(async () => capability?.actions.refresh());
    expect(capability?.state).toMatchObject({
      access: 'prompt',
      devices: [{ deviceId: 'microphone-1', label: 'Desk microphone' }],
      loading: false,
    });

    mocks.listDevices.mockResolvedValueOnce([{ deviceId: 'microphone-2', label: 'Headset' }]);
    await act(async () => {
      deviceChangeListener?.();
      await Promise.resolve();
    });
    expect(capability?.state.devices).toEqual([{ deviceId: 'microphone-2', label: 'Headset' }]);
  });

  it('contains refresh and permission API failures', async () => {
    mocks.readAccess.mockRejectedValueOnce(new Error('private permission detail'));
    await act(async () => capability?.actions.refresh());
    expect(capability?.state).toMatchObject({ access: 'unknown', devices: [] });

    mocks.listDevices.mockRejectedValueOnce(new Error('private device detail'));
    await act(async () => capability?.actions.refreshDevices());
    expect(capability?.state).toMatchObject({ devices: [], loading: false });

    mocks.readAccess.mockRejectedValueOnce(new Error('private read detail'));
    let readResult = 'prompt';
    await act(async () => {
      readResult = (await capability?.actions.read()) ?? 'prompt';
    });
    expect(readResult).toBe('unknown');
    mocks.requestAccess.mockRejectedValueOnce(new Error('private request detail'));
    let requestResult = 'prompt';
    await act(async () => {
      requestResult = (await capability?.actions.request(null)) ?? 'prompt';
    });
    expect(requestResult).toBe('unknown');
  });

  it('refreshes labels after grant and does not enumerate after denial', async () => {
    await act(async () => capability?.actions.request('microphone-1'));
    expect(mocks.requestAccess).toHaveBeenCalledWith('microphone-1');
    expect(capability?.state.access).toBe('granted');
    expect(mocks.listDevices).toHaveBeenCalledOnce();

    mocks.requestAccess.mockResolvedValueOnce('denied');
    await act(async () => capability?.actions.request(null));
    expect(capability?.state.access).toBe('denied');
    expect(mocks.listDevices).toHaveBeenCalledOnce();
  });

  it('ignores stale device completion after invalidation and clears loading', async () => {
    let resolveDevices: ((devices: []) => void) | undefined;
    mocks.listDevices.mockReturnValueOnce(
      new Promise<[]>((resolve) => {
        resolveDevices = resolve;
      })
    );
    let refresh: Promise<void> | undefined;
    act(() => {
      refresh = capability?.actions.refreshDevices();
    });
    expect(capability?.state.loading).toBe(true);
    act(() => capability?.actions.invalidate());
    resolveDevices?.([]);
    await act(async () => refresh);
    expect(capability?.state).toMatchObject({ devices: [], loading: false });
  });
});
