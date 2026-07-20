import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../features/video/project/factories/creation';
import { VideoTrackKind } from '../../features/video/project/types/index';
import { buildScenarioAssets, buildScenarioClips } from './assets';

function createEntry(assetId: string, stepId: string, start: number, end: number, title = '') {
  return {
    end,
    start,
    step: {
      id: stepId,
      assetId,
      body: '',
      title,
    },
  } as never;
}

it('deduplicates scenario assets and skips missing metadata', () => {
  const entries = [
    createEntry('asset-1', 'capture-1', 0, 4),
    createEntry('asset-1', 'capture-2', 4, 8),
    createEntry('asset-2', 'capture-3', 8, 12),
  ];

  expect(
    buildScenarioAssets(entries, {
      'asset-1': {
        createdAt: 1,
        height: 720,
        mimeType: 'image/png',
        name: 'Dashboard',
        size: 100,
        width: 1280,
      },
    })
  ).toEqual([
    expect.objectContaining({
      id: 'asset-1',
      name: 'Dashboard',
      source: { kind: 'scenario-asset', scenarioAssetId: 'asset-1' },
    }),
  ]);
});

it('builds clips from known assets and bails out without a primary track', () => {
  const project = createEmptyVideoProject('Scenario assets');
  const asset = buildScenarioAssets([createEntry('asset-1', 'capture-1', 0, 4)], {
    'asset-1': {
      createdAt: 1,
      height: 720,
      mimeType: 'image/png',
      name: 'Dashboard',
      size: 100,
      width: 1280,
    },
  })[0]!;
  const assetsById = new Map([[asset.id, asset]]);

  expect(
    buildScenarioClips({
      assetsById,
      entries: [createEntry('asset-1', 'capture-1', 0, 4, '')],
      project,
    })
  ).toEqual([
    expect.objectContaining({
      assetId: 'asset-1',
      duration: 4,
      name: 'Dashboard',
      trackId: project.tracks.find((track) => track.kind === VideoTrackKind.PRIMARY)?.id,
    }),
  ]);
  expect(
    buildScenarioClips({
      assetsById,
      entries: [createEntry('missing-asset', 'capture-2', 0, 4)],
      project: { ...project, tracks: [] },
    })
  ).toEqual([]);
});
