// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FrameData } from '../../../../features/highlighter/contracts';
import type { FrameHostLayoutService, FrameHostLayoutSnapshot } from '../host-layout/service';
import { useFrameUIStore } from '../state/frame-ui.store';

const toastMocks = vi.hoisted(() => ({ showToast: vi.fn() }));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),
  showToast: toastMocks.showToast,
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import { useFrameHostLayoutSync } from './useFrameHostLayoutSync';

const snapshot: FrameHostLayoutSnapshot = {
  presentations: new Map(),
  recoveries: [],
  version: 0,
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createServiceHarness() {
  let runtime: Parameters<FrameHostLayoutService['start']>[0] | null = null;
  const service = {
    clear: vi.fn(),
    dispose: vi.fn(),
    getLastGoodPagePlacement: vi.fn(() => null),
    getNode: vi.fn(() => null),
    getSnapshot: vi.fn(() => snapshot),
    hasElement: vi.fn(() => false),
    invalidate: vi.fn(),
    link: vi.fn(),
    recordManualPlacement: vi.fn(() => null),
    restoreFrames: vi.fn(),
    retireHistoryBindings: vi.fn(),
    start: vi.fn((nextRuntime) => {
      runtime = nextRuntime;
      return vi.fn();
    }),
    subscribe: vi.fn(() => vi.fn()),
    unlink: vi.fn(),
  } satisfies FrameHostLayoutService;
  return {
    get runtime() {
      if (!runtime) throw new Error('Host-layout runtime has not started');
      return runtime;
    },
    service,
  };
}

function Harness({ service }: { service: FrameHostLayoutService }) {
  const frames: FrameData[] = [
    {
      id: 'frame-1',
      linkedElementSelector: '#target',
      x: 10,
      y: 20,
      width: 100,
      height: 40,
    },
  ];
  useFrameHostLayoutSync({
    frameStatesRef: { current: new Map([['frame-1', 'editing']]) },
    framesRef: { current: frames },
    hostLayoutService: service,
    setFrames: vi.fn(),
    setFrameStates: vi.fn(),
  });
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  useFrameUIStore.getState().reset();
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  useFrameUIStore.getState().reset();
  vi.unstubAllGlobals();
});

describe('frame host-layout React adapter', () => {
  it('dismisses offscreen UI silently and shows the suspension notice only once', async () => {
    const harness = createServiceHarness();
    await act(async () => root?.render(<Harness service={harness.service} />));

    useFrameUIStore.getState().selectFrame('frame-1');
    act(() => harness.runtime.onAnchorUnavailable('frame-1', 'offscreen'));

    expect(useFrameUIStore.getState().selectedFrameId).toBeNull();
    expect(toastMocks.showToast).not.toHaveBeenCalled();

    useFrameUIStore.getState().selectFrame('frame-1');
    act(() => harness.runtime.onAnchorUnavailable('frame-1', 'suspended'));
    expect(toastMocks.showToast).toHaveBeenCalledWith(
      'content.interactiveFrame.anchorTemporarilyHidden',
      'info'
    );

    useFrameUIStore.getState().selectFrame('frame-1');
    act(() => harness.runtime.onAnchorUnavailable('frame-1', 'suspended'));
    expect(toastMocks.showToast).toHaveBeenCalledTimes(1);
  });
});
