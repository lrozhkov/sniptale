// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import {
  PAGE_STYLE_ASSET_KINDS,
  type PageStyleAssetReference,
  type PageStylePatch,
} from '@sniptale/runtime-contracts/page-style';
import type { PageStyleSelectionSnapshot } from '../runtime/properties';
import { usePageStyleAssetActions } from './actions';

const oldBackgroundAsset: PageStyleAssetReference = {
  assetId: 'asset-old-bg',
  kind: PAGE_STYLE_ASSET_KINDS.BACKGROUND_IMAGE,
};
const oldImageAsset: PageStyleAssetReference = {
  assetId: 'asset-old-image',
  kind: PAGE_STYLE_ASSET_KINDS.IMAGE_REPLACEMENT,
};
const newImageAsset: PageStyleAssetReference = {
  assetId: 'asset-new-image',
  kind: PAGE_STYLE_ASSET_KINDS.IMAGE_REPLACEMENT,
};
const newBackgroundAsset: PageStyleAssetReference = {
  assetId: 'asset-new-bg',
  kind: PAGE_STYLE_ASSET_KINDS.BACKGROUND_IMAGE,
};

const mocks = vi.hoisted(() => ({
  applyPageStylePatchWithHistory: vi.fn(),
  cleanupPageStyleAssetsIfUnreferenced: vi.fn(),
  refreshSelection: vi.fn(),
  savePageStyleImageAsset: vi.fn(),
  setAssetPatch: vi.fn(),
}));

vi.mock('../../../../composition/persistence/page-style', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/page-style')>()),
  cleanupPageStyleAssetsIfUnreferenced: mocks.cleanupPageStyleAssetsIfUnreferenced,
}));

vi.mock('../runtime/actions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../runtime/actions')>();
  return {
    ...actual,
    applyPageStylePatchWithHistory: mocks.applyPageStylePatchWithHistory,
    savePageStyleImageAsset: mocks.savePageStyleImageAsset,
  };
});

let host: HTMLDivElement | null = null;
let root: Root | null = null;
let latest: ReturnType<typeof usePageStyleAssetActions> | null = null;

function createSelection(): PageStyleSelectionSnapshot {
  const element = document.createElement('div');
  return {
    domPath: '#target',
    element,
    kind: 'block',
    patch: { assets: [], declarations: [] },
    selector: { locator: '#target' },
    selectorLabel: '#target',
    tagName: 'div',
    textPreview: '',
  };
}

function renderHarness(draftPatch: PageStylePatch) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);

  function Harness() {
    latest = usePageStyleAssetActions({
      draftPatch,
      refreshSelection: mocks.refreshSelection,
      selection: createSelection(),
      setAssetPatch: mocks.setAssetPatch,
    });
    return null;
  }

  act(() => {
    root?.render(<Harness />);
  });
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  host?.remove();
  host = null;
  latest = null;
  document.body.replaceChildren();
  vi.clearAllMocks();
});

it('cleans replaced draft assets after the new patch is applied', async () => {
  mocks.applyPageStylePatchWithHistory.mockResolvedValueOnce(undefined);
  mocks.cleanupPageStyleAssetsIfUnreferenced.mockResolvedValueOnce({ cleanupFailedAssetIds: [] });
  renderHarness({ assets: [oldImageAsset], declarations: [] });

  await act(async () => {
    await latest?.updateAssetPatch(newImageAsset);
  });

  expect(mocks.setAssetPatch).toHaveBeenCalledWith({
    assets: [newImageAsset],
    declarations: [],
  });
  expect(mocks.cleanupPageStyleAssetsIfUnreferenced).toHaveBeenCalledWith(['asset-old-image']);
});

it('cleans cleared background assets after applying the clear patch', async () => {
  mocks.applyPageStylePatchWithHistory.mockResolvedValueOnce(undefined);
  mocks.cleanupPageStyleAssetsIfUnreferenced.mockResolvedValueOnce({ cleanupFailedAssetIds: [] });
  renderHarness({
    assets: [oldBackgroundAsset],
    declarations: [{ property: 'background-image', value: null }],
  });

  await act(async () => {
    await latest?.clearBackgroundAsset();
  });

  expect(mocks.setAssetPatch).toHaveBeenCalledWith({
    assets: [],
    declarations: [{ property: 'background-image', value: 'none' }],
  });
  expect(mocks.cleanupPageStyleAssetsIfUnreferenced).toHaveBeenCalledWith(['asset-old-bg']);
});

it('cleans newly saved assets when applying the replacement patch fails', async () => {
  mocks.savePageStyleImageAsset.mockResolvedValueOnce(newImageAsset);
  mocks.applyPageStylePatchWithHistory.mockRejectedValueOnce(new Error('apply failed'));
  mocks.cleanupPageStyleAssetsIfUnreferenced.mockResolvedValueOnce({ cleanupFailedAssetIds: [] });
  renderHarness({ assets: [], declarations: [] });

  await expect(
    act(async () => {
      await latest?.saveImageReplacement(new File(['image'], 'hero.png', { type: 'image/png' }));
    })
  ).rejects.toThrow('apply failed');

  expect(mocks.cleanupPageStyleAssetsIfUnreferenced).toHaveBeenCalledWith(['asset-new-image']);
  expect(mocks.setAssetPatch).not.toHaveBeenCalled();
});

it('does not commit background draft state when applying the replacement patch fails', async () => {
  mocks.savePageStyleImageAsset.mockResolvedValueOnce(newBackgroundAsset);
  mocks.applyPageStylePatchWithHistory.mockRejectedValueOnce(new Error('apply failed'));
  mocks.cleanupPageStyleAssetsIfUnreferenced.mockResolvedValueOnce({ cleanupFailedAssetIds: [] });
  renderHarness({ assets: [oldBackgroundAsset], declarations: [] });

  await expect(
    act(async () => {
      await latest?.saveBackgroundAsset(new File(['image'], 'bg.png', { type: 'image/png' }));
    })
  ).rejects.toThrow('apply failed');

  expect(mocks.cleanupPageStyleAssetsIfUnreferenced).toHaveBeenCalledWith(['asset-new-bg']);
  expect(mocks.setAssetPatch).not.toHaveBeenCalled();
});

it('does not commit clear background draft state when applying the clear patch fails', async () => {
  mocks.applyPageStylePatchWithHistory.mockRejectedValueOnce(new Error('apply failed'));
  renderHarness({
    assets: [oldBackgroundAsset],
    declarations: [{ property: 'background-image', value: null }],
  });

  await expect(
    act(async () => {
      await latest?.clearBackgroundAsset();
    })
  ).rejects.toThrow('apply failed');

  expect(mocks.cleanupPageStyleAssetsIfUnreferenced).not.toHaveBeenCalled();
  expect(mocks.setAssetPatch).not.toHaveBeenCalled();
});

it('keeps newly saved assets when replaced asset cleanup fails after successful apply', async () => {
  mocks.savePageStyleImageAsset.mockResolvedValueOnce(newImageAsset);
  mocks.applyPageStylePatchWithHistory.mockResolvedValueOnce(undefined);
  mocks.cleanupPageStyleAssetsIfUnreferenced.mockResolvedValueOnce({
    cleanupFailedAssetIds: ['asset-old-image'],
  });
  renderHarness({ assets: [oldImageAsset], declarations: [] });

  let outcome: Awaited<ReturnType<NonNullable<typeof latest>['saveImageReplacement']>> | undefined;
  await act(async () => {
    outcome = await latest?.saveImageReplacement(
      new File(['image'], 'hero.png', { type: 'image/png' })
    );
  });

  expect(outcome).toEqual({
    message: 'Действие выполнено, но часть файлов не удалось очистить',
    state: 'warning',
  });
  expect(mocks.cleanupPageStyleAssetsIfUnreferenced).toHaveBeenCalledTimes(1);
  expect(mocks.cleanupPageStyleAssetsIfUnreferenced).toHaveBeenCalledWith(['asset-old-image']);
});

it('surfaces image replacement compensation cleanup failures after apply failure', async () => {
  mocks.savePageStyleImageAsset.mockResolvedValueOnce(newImageAsset);
  mocks.applyPageStylePatchWithHistory.mockRejectedValueOnce(new Error('apply failed'));
  mocks.cleanupPageStyleAssetsIfUnreferenced.mockResolvedValueOnce({
    cleanupFailedAssetIds: ['asset-new-image'],
  });
  renderHarness({ assets: [], declarations: [] });

  await expect(
    act(async () => {
      await latest?.saveImageReplacement(new File(['image'], 'hero.png', { type: 'image/png' }));
    })
  ).rejects.toThrow('Не удалось применить файл и очистить временную копию');
  expect(mocks.cleanupPageStyleAssetsIfUnreferenced).toHaveBeenCalledWith(['asset-new-image']);
});

it('surfaces background upload compensation cleanup failures after apply failure', async () => {
  mocks.savePageStyleImageAsset.mockResolvedValueOnce(newBackgroundAsset);
  mocks.applyPageStylePatchWithHistory.mockRejectedValueOnce(new Error('apply failed'));
  mocks.cleanupPageStyleAssetsIfUnreferenced.mockResolvedValueOnce({
    cleanupFailedAssetIds: ['asset-new-bg'],
  });
  renderHarness({ assets: [], declarations: [] });

  await expect(
    act(async () => {
      await latest?.saveBackgroundAsset(new File(['image'], 'bg.png', { type: 'image/png' }));
    })
  ).rejects.toThrow('Не удалось применить файл и очистить временную копию');
  expect(mocks.cleanupPageStyleAssetsIfUnreferenced).toHaveBeenCalledWith(['asset-new-bg']);
});
