// @vitest-environment jsdom

import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { VideoProjectAssetType } from '../../../features/video/project/types';
import { createProjectAssetEntry, createVideoProject } from '../../project/test-support/fixtures';

const assetUrlMocks = vi.hoisted(() => ({
  getProjectAssetMock: vi.fn(),
  getRecordingMock: vi.fn(),
  getScenarioAssetMock: vi.fn(),
}));

vi.mock('../../../composition/persistence/projects/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/projects/index')>()),
  getProjectAsset: assetUrlMocks.getProjectAssetMock,
}));

vi.mock('../../../composition/persistence/recordings/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/recordings/index')>()),
  getRecording: assetUrlMocks.getRecordingMock,
}));

vi.mock('../../../composition/persistence/scenario/projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/scenario/projects')>()),
  getScenarioAsset: assetUrlMocks.getScenarioAssetMock,
}));

import { useVideoEditorAssetUrls } from './asset-urls';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createProjectWithSingleAsset() {
  return createVideoProject({
    assets: [
      {
        createdAt: 100,
        id: 'asset-1',
        metadata: {
          audioPeaks: null,
          duration: null,
          hasAudio: false,
          height: 720,
          mimeType: 'image/png',
          size: 12,
          width: 1280,
        },
        name: 'Asset',
        source: {
          kind: 'project-asset',
          projectAssetId: 'project-asset-1',
        },
        type: VideoProjectAssetType.IMAGE,
      },
    ],
  });
}

function AssetUrlsHarness(props: {
  onUrlsChange: (urls: Record<string, string>) => void;
  project: ReturnType<typeof createProjectWithSingleAsset> | null;
}) {
  const assetUrls = useVideoEditorAssetUrls(props.project);
  const { onUrlsChange } = props;

  useEffect(() => {
    onUrlsChange(assetUrls);
  }, [assetUrls, onUrlsChange]);

  return null;
}

async function renderHarness(props: Parameters<typeof AssetUrlsHarness>[0]) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<AssetUrlsHarness {...props} />);
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:asset-1'),
    revokeObjectURL: vi.fn(),
  });
  assetUrlMocks.getProjectAssetMock.mockReset();
  assetUrlMocks.getRecordingMock.mockReset();
  assetUrlMocks.getScenarioAssetMock.mockReset();
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

it('keeps existing asset urls when the project rerenders without asset-list changes', async () => {
  const onUrlsChange = vi.fn();
  const project = createProjectWithSingleAsset();

  assetUrlMocks.getProjectAssetMock.mockResolvedValue(createProjectAssetEntry());

  await renderHarness({
    onUrlsChange,
    project,
  });

  expect(assetUrlMocks.getProjectAssetMock).toHaveBeenCalledTimes(1);
  expect(onUrlsChange).toHaveBeenLastCalledWith({ 'asset-1': 'blob:asset-1' });

  await renderHarness({
    onUrlsChange,
    project: {
      ...project,
      duration: 90,
      name: 'Renamed project',
      updatedAt: 200,
    },
  });

  expect(assetUrlMocks.getProjectAssetMock).toHaveBeenCalledTimes(1);
  expect(onUrlsChange).toHaveBeenLastCalledWith({ 'asset-1': 'blob:asset-1' });
});
