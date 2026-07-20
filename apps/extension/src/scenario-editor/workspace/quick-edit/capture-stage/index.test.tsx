// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { blobToDataUrlMock, measureImageBlobMock } = vi.hoisted(() => ({
  blobToDataUrlMock: vi.fn(),
  measureImageBlobMock: vi.fn(),
}));
const { getScenarioAssetBlobMock } = vi.hoisted(() => ({
  getScenarioAssetBlobMock: vi.fn(),
}));

vi.mock('../../../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/media-utils/data-url')>()),
  blobToDataUrl: blobToDataUrlMock,
}));

vi.mock('@sniptale/platform/browser/media/image-dimensions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/media/image-dimensions')>()),
  measureImageBlob: measureImageBlobMock,
}));

vi.mock('../../../../composition/persistence/scenario/store/public', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../composition/persistence/scenario/store/public')
  >()),
  getScenarioAssetBlob: getScenarioAssetBlobMock,
}));

import { createScenarioCaptureStep } from '../../../../features/scenario/project/public';

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function renderStage(
  options: {
    altLabel?: string;
    assetBlob?: Blob;
    missingLabel?: string;
    selectedOverlayId?: string | null;
    title?: string;
  } = {}
) {
  const { ScenarioCaptureStage } = await import('./index');

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <ScenarioCaptureStage
        step={createScenarioCaptureStep({
          assetId: 'asset-1',
          title: options.title ?? 'Open export menu',
        })}
        {...(options.assetBlob === undefined ? {} : { assetBlob: options.assetBlob })}
        {...(options.altLabel === undefined ? {} : { altLabel: options.altLabel })}
        {...(options.missingLabel === undefined ? {} : { missingLabel: options.missingLabel })}
        {...(options.selectedOverlayId === undefined
          ? {}
          : { selectedOverlayId: options.selectedOverlayId })}
      />
    );
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  blobToDataUrlMock.mockResolvedValue('data:image/png;base64,cGl4ZWw=');
  measureImageBlobMock.mockResolvedValue({ width: 1440, height: 900 });
  getScenarioAssetBlobMock.mockResolvedValue(undefined);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:scenario-stage');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
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

describe('ScenarioCaptureStage basic rendering', () => {
  it('renders the canonical svg preview for a scenario capture step', async () => {
    await renderStage({ assetBlob: new Blob(['pixel'], { type: 'image/png' }) });
    await act(async () => {
      await Promise.resolve();
    });

    const image = container?.querySelector('img');
    expect(image?.getAttribute('alt')).toBe('Open export menu');
    expect(image?.getAttribute('src')).toBe('blob:scenario-stage');
    expect(blobToDataUrlMock).toHaveBeenCalled();
    expect(measureImageBlobMock).toHaveBeenCalled();
  });

  it('renders a missing-asset fallback when no scenario asset is available', async () => {
    await renderStage();
    await act(async () => {
      await Promise.resolve();
    });

    const image = container?.querySelector('img');
    expect(image?.getAttribute('src')).toBe('blob:scenario-stage');
    expect(blobToDataUrlMock).not.toHaveBeenCalled();
    expect(measureImageBlobMock).not.toHaveBeenCalled();
  });
});

describe('ScenarioCaptureStage asset loading fallbacks', () => {
  it('loads the asset through the scenario store when no asset blob is passed directly', async () => {
    getScenarioAssetBlobMock.mockResolvedValueOnce(new Blob(['pixel'], { type: 'image/png' }));

    await renderStage();
    await act(async () => {
      await Promise.resolve();
    });

    expect(getScenarioAssetBlobMock).toHaveBeenCalledWith('asset-1');
    expect(blobToDataUrlMock).toHaveBeenCalled();
    expect(measureImageBlobMock).toHaveBeenCalled();
  });

  it('falls back to a safe preview when asset decoding fails', async () => {
    measureImageBlobMock.mockRejectedValueOnce(new Error('decode failed'));

    await renderStage({ assetBlob: new Blob(['pixel'], { type: 'image/png' }) });
    await act(async () => {
      await Promise.resolve();
    });

    const image = container?.querySelector('img');
    expect(image?.getAttribute('src')).toBe('blob:scenario-stage');
  });
});

describe('ScenarioCaptureStage explicit render props', () => {
  it('uses fallback rendering props when title and overlay metadata are provided explicitly', async () => {
    await renderStage({
      altLabel: 'Scenario preview fallback',
      missingLabel: 'Missing capture',
      selectedOverlayId: 'overlay-1',
      title: '',
    });
    await act(async () => {
      await Promise.resolve();
    });

    const image = container?.querySelector('img');
    expect(image?.getAttribute('alt')).toBe('Scenario preview fallback');
    expect(image?.getAttribute('src')).toBe('blob:scenario-stage');
  });
});
