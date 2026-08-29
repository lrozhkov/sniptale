// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadSettings: vi.fn(),
  patchSettings: vi.fn(),
}));

vi.mock('../../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/settings')>()),
  loadSettings: mocks.loadSettings,
  patchSettings: mocks.patchSettings,
}));

import {
  useWebCopyResourcePreferences,
  type WebCopyResourcePreferences,
} from './snapshot-availability';

let container: HTMLDivElement;
let latest: WebCopyResourcePreferences | null = null;
let root: Root;

function Harness() {
  latest = useWebCopyResourcePreferences();
  return null;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  container = document.createElement('div');
  root = createRoot(container);
  mocks.loadSettings.mockResolvedValue({
    anonymousCrossOriginSnapshotAssetsEnabled: false,
    authenticatedSnapshotAssetsEnabled: true,
    externalSnapshotAssetRedirectsEnabled: true,
    externalSnapshotLinksEnabled: false,
  });
});

afterEach(() => {
  act(() => root.unmount());
  latest = null;
  vi.unstubAllGlobals();
});

it('loads the current Page Web copy resource policy', async () => {
  await act(async () => root.render(<Harness />));
  await flush();

  expect(latest).toMatchObject({
    anonymousCrossOriginAssetsEnabled: false,
    authenticatedSameOriginAssetsEnabled: true,
    externalAssetRedirectsEnabled: true,
    externalLinksEnabled: false,
    error: null,
    pending: null,
  });
});

it('persists each resource switch and adopts the normalized settings result', async () => {
  mocks.patchSettings.mockResolvedValue({
    anonymousCrossOriginSnapshotAssetsEnabled: true,
    authenticatedSnapshotAssetsEnabled: false,
    externalSnapshotAssetRedirectsEnabled: true,
    externalSnapshotLinksEnabled: true,
  });
  await act(async () => root.render(<Harness />));
  await flush();

  await act(async () => latest?.setAuthenticatedSameOriginAssetsEnabled(false));

  expect(mocks.patchSettings).toHaveBeenCalledWith({
    authenticatedSnapshotAssetsEnabled: false,
  });
  expect(latest).toMatchObject({
    anonymousCrossOriginAssetsEnabled: true,
    authenticatedSameOriginAssetsEnabled: false,
    externalAssetRedirectsEnabled: true,
    externalLinksEnabled: true,
    error: null,
    pending: null,
  });
});

it('persists the external-link opt-in independently from resource loading', async () => {
  mocks.patchSettings.mockResolvedValue({
    anonymousCrossOriginSnapshotAssetsEnabled: false,
    authenticatedSnapshotAssetsEnabled: true,
    externalSnapshotAssetRedirectsEnabled: true,
    externalSnapshotLinksEnabled: true,
  });
  await act(async () => root.render(<Harness />));
  await flush();

  await act(async () => latest?.setExternalLinksEnabled(true));

  expect(mocks.patchSettings).toHaveBeenCalledWith({ externalSnapshotLinksEnabled: true });
  expect(latest?.externalLinksEnabled).toBe(true);
});

it('persists the external redirect policy from the popup resource controls', async () => {
  mocks.patchSettings.mockResolvedValue({
    anonymousCrossOriginSnapshotAssetsEnabled: true,
    authenticatedSnapshotAssetsEnabled: true,
    externalSnapshotAssetRedirectsEnabled: false,
    externalSnapshotLinksEnabled: false,
  });
  await act(async () => root.render(<Harness />));
  await flush();

  await act(async () => latest?.setExternalAssetRedirectsEnabled(false));

  expect(mocks.patchSettings).toHaveBeenCalledWith({
    externalSnapshotAssetRedirectsEnabled: false,
  });
  expect(latest?.externalAssetRedirectsEnabled).toBe(false);
});

it('surfaces load and update failures without leaving a pending switch', async () => {
  mocks.loadSettings.mockRejectedValueOnce(new Error('load failed'));
  mocks.patchSettings.mockRejectedValueOnce(new Error('write failed'));
  await act(async () => root.render(<Harness />));
  await flush();
  expect(latest?.error).toContain('load failed');

  await act(async () => latest?.setAnonymousCrossOriginAssetsEnabled(false));

  expect(mocks.patchSettings).toHaveBeenCalledWith({
    anonymousCrossOriginSnapshotAssetsEnabled: false,
  });
  expect(latest?.error).toContain('write failed');
  expect(latest?.pending).toBeNull();
});

it.each(['resolve', 'reject'] as const)(
  'ignores a late settings %s after the popup owner unmounts',
  async (outcome) => {
    let resolveLoad!: (value: {
      anonymousCrossOriginSnapshotAssetsEnabled: boolean;
      authenticatedSnapshotAssetsEnabled: boolean;
      externalSnapshotAssetRedirectsEnabled: boolean;
      externalSnapshotLinksEnabled: boolean;
    }) => void;
    let rejectLoad!: (reason: Error) => void;
    mocks.loadSettings.mockReturnValueOnce(
      new Promise((resolve, reject) => {
        resolveLoad = resolve;
        rejectLoad = reject;
      })
    );

    await act(async () => root.render(<Harness />));
    act(() => root.unmount());

    await act(async () => {
      if (outcome === 'resolve') {
        resolveLoad({
          anonymousCrossOriginSnapshotAssetsEnabled: false,
          authenticatedSnapshotAssetsEnabled: false,
          externalSnapshotAssetRedirectsEnabled: true,
          externalSnapshotLinksEnabled: false,
        });
      } else {
        rejectLoad(new Error('late load failure'));
      }
      await Promise.resolve();
    });

    expect(mocks.patchSettings).not.toHaveBeenCalled();
  }
);
