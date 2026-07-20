// @vitest-environment jsdom

import { useEffect } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createScenarioCaptureStep,
  createScenarioNoteStep,
} from '../../../features/scenario/project/public';

const { getScenarioAssetBlob } = vi.hoisted(() => ({
  getScenarioAssetBlob: vi.fn<(assetId: string) => Promise<Blob | null>>(),
}));

vi.mock('../../../composition/persistence/scenario/store/public', () => ({
  getScenarioAssetBlob,
}));

import { useScenarioNavigatorThumbnails } from './thumbnails';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function ThumbnailProbe(props: {
  onUrlsChange: (urls: Record<string, string>) => void;
  steps: Parameters<typeof useScenarioNavigatorThumbnails>[0];
}) {
  const urls = useScenarioNavigatorThumbnails(props.steps);

  useEffect(() => {
    props.onUrlsChange(urls);
  }, [props, urls]);

  return null;
}

async function renderProbe(props: Parameters<typeof ThumbnailProbe>[0]) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<ThumbnailProbe {...props} />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function runThumbnailLoadingSuite() {
  it('loads capture thumbnails and ignores non-capture steps', async () => {
    const onUrlsChange = vi.fn();
    const captureStep = createScenarioCaptureStep({ assetId: 'asset-1', title: 'Capture 1' });
    const createObjectUrl = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValueOnce('blob:capture-1')
      .mockReturnValueOnce('blob:capture-2');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    getScenarioAssetBlob.mockImplementation(async (assetId) =>
      assetId === 'asset-2' ? null : new Blob([assetId], { type: 'image/png' })
    );

    await renderProbe({
      onUrlsChange,
      steps: [
        captureStep,
        createScenarioNoteStep({ title: 'Note', body: 'Body' }),
        createScenarioCaptureStep({ assetId: 'asset-2', title: 'Capture 2' }),
      ],
    });

    expect(getScenarioAssetBlob).toHaveBeenCalledTimes(2);
    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    expect(onUrlsChange).toHaveBeenLastCalledWith({
      [captureStep.id]: 'blob:capture-1',
    });
  });

  it('revokes created object URLs when the hook unmounts', async () => {
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:capture-1');
    getScenarioAssetBlob.mockResolvedValue(new Blob(['asset'], { type: 'image/png' }));

    await renderProbe({
      onUrlsChange: vi.fn(),
      steps: [createScenarioCaptureStep({ assetId: 'asset-1', title: 'Capture 1' })],
    });

    await act(async () => {
      root?.unmount();
    });
    root = null;

    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:capture-1');
  });
}

function runThumbnailFailureSuite() {
  it('falls back to empty urls when asset loading fails', async () => {
    const onUrlsChange = vi.fn();
    getScenarioAssetBlob.mockRejectedValue(new Error('blob failed'));

    await renderProbe({
      onUrlsChange,
      steps: [createScenarioCaptureStep({ assetId: 'asset-1', title: 'Capture 1' })],
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(onUrlsChange).toHaveBeenLastCalledWith({});
  });
}

function runThumbnailSuite() {
  runThumbnailLoadingSuite();
  runThumbnailFailureSuite();
}

describe('useScenarioNavigatorThumbnails', runThumbnailSuite);
