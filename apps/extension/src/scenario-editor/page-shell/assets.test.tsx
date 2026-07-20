// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createScenarioImageElement,
  createScenarioProjectV3,
} from '../../features/scenario/project/v3';
import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';
import { useScenarioV3RenderAssetState, useScenarioV3RenderAssets } from './assets';

const assetMocks = vi.hoisted(() => ({
  blobToDataUrl: vi.fn<(blob: Blob) => Promise<string>>(),
  getScenarioAssetBlob: vi.fn<(assetId: string) => Promise<Blob | undefined>>(),
  getScenarioAssetEntry:
    vi.fn<(assetId: string) => Promise<{ height: number; width: number } | undefined>>(),
  measureImageBlob: vi.fn<(blob: Blob) => Promise<{ height: number; width: number }>>(),
}));

vi.mock('../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/media-utils/data-url')>()),
  blobToDataUrl: assetMocks.blobToDataUrl,
}));

vi.mock('@sniptale/platform/browser/media/image-dimensions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/media/image-dimensions')>()),
  measureImageBlob: assetMocks.measureImageBlob,
}));

vi.mock('../../composition/persistence/scenario/store/public', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/scenario/store/public')>()),
  getScenarioAssetBlob: assetMocks.getScenarioAssetBlob,
  getScenarioAssetEntry: assetMocks.getScenarioAssetEntry,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let renderedAssetIds: string[][] = [];
let renderedAssetSizes: Array<Array<{ height: number | null; width: number | null }>> = [];
let renderedLoadingStates: boolean[] = [];

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  assetMocks.blobToDataUrl.mockImplementation(async (blob) => `data:${blob.type};base64,asset`);
  assetMocks.getScenarioAssetBlob.mockResolvedValue(new Blob(['asset'], { type: 'image/png' }));
  assetMocks.getScenarioAssetEntry.mockResolvedValue({ height: 720, width: 1280 });
  assetMocks.measureImageBlob.mockResolvedValue({ height: 720, width: 1280 });
  renderedAssetIds = [];
  renderedAssetSizes = [];
  renderedLoadingStates = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it('keeps older asset loads from overwriting newer project assets', async () => {
  const oldAsset = createDeferredBlob();
  const newAsset = createDeferredBlob();
  assetMocks.getScenarioAssetBlob.mockImplementation(async (assetId) =>
    assetId === 'asset-old' ? oldAsset.promise : newAsset.promise
  );

  renderHarness(createProjectWithAsset('asset-old'));
  renderHarness(createProjectWithAsset('asset-new'));

  await resolveAsset(newAsset, 'new');
  expect(renderedAssetIds.at(-1)).toEqual(['asset-new']);

  await resolveAsset(oldAsset, 'old');
  expect(renderedAssetIds.at(-1)).toEqual(['asset-new']);
});

it('leaves missing and failed image assets absent from the render map', async () => {
  assetMocks.getScenarioAssetBlob
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error('asset read failed'));

  renderHarness(createProjectWithAssets(['asset-missing', 'asset-failed']));
  await flushAssets();

  expect(renderedAssetIds.at(-1)).toEqual([]);
});

it('surfaces loading state while render assets are pending', async () => {
  const pendingAsset = createDeferredBlob();
  assetMocks.getScenarioAssetBlob.mockReturnValue(pendingAsset.promise);

  act(() => {
    root?.render(<AssetStateHarness project={createProjectWithAsset('asset-loading')} />);
  });
  expect(renderedLoadingStates).toContain(true);

  await resolveAsset(pendingAsset, 'loaded');
  expect(renderedLoadingStates.at(-1)).toBe(false);
  expect(renderedAssetIds.at(-1)).toEqual(['asset-loading']);
});

it('uses stored dimensions when browser image measurement cannot decode the blob', async () => {
  assetMocks.measureImageBlob.mockRejectedValue(new Error('decode failed'));
  assetMocks.getScenarioAssetEntry.mockResolvedValue({ height: 900, width: 1440 });

  renderHarness(createProjectWithAsset('asset-svg'));
  await flushAssets();

  expect(renderedAssetIds.at(-1)).toEqual(['asset-svg']);
  expect(renderedAssetSizes.at(-1)).toEqual([{ height: 900, width: 1440 }]);
  expect(assetMocks.blobToDataUrl).toHaveBeenCalled();
});

function renderHarness(project: ScenarioProjectV3) {
  act(() => {
    root?.render(<AssetsHarness project={project} />);
  });
}

function AssetsHarness(props: { project: ScenarioProjectV3 }) {
  const assets = useScenarioV3RenderAssets(props.project);
  renderedAssetIds.push(Array.from(assets instanceof Map ? assets.keys() : Object.keys(assets)));
  renderedAssetSizes.push(
    Array.from(assets instanceof Map ? assets.values() : Object.values(assets)).map((asset) => ({
      height: asset.height,
      width: asset.width,
    }))
  );
  return null;
}

function AssetStateHarness(props: { project: ScenarioProjectV3 }) {
  const state = useScenarioV3RenderAssetState(props.project);
  renderedLoadingStates.push(state.loading);
  renderedAssetIds.push(Array.from(state.assets instanceof Map ? state.assets.keys() : []));
  return null;
}

function createProjectWithAsset(assetId: string): ScenarioProjectV3 {
  return createProjectWithAssets([assetId]);
}

function createProjectWithAssets(assetIds: readonly string[]): ScenarioProjectV3 {
  const project = createScenarioProjectV3('Assets');
  return {
    ...project,
    slides: [
      {
        ...project.slides[0]!,
        elements: assetIds.map((assetId) =>
          createScenarioImageElement({
            assetRef: { assetId, galleryAssetId: null },
          })
        ),
      },
    ],
  };
}

function createDeferredBlob() {
  let resolve: (blob: Blob) => void = () => undefined;
  const promise = new Promise<Blob>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

async function resolveAsset(deferred: ReturnType<typeof createDeferredBlob>, label: string) {
  await act(async () => {
    deferred.resolve(new Blob([label], { type: 'image/png' }));
    await Promise.resolve();
  });
}

async function flushAssets() {
  await act(async () => {
    await Promise.resolve();
  });
}
