import { expect, it } from 'vitest';
import { createScenarioAssetId, mapScenarioAssetEntry, mapScenarioExportEntry } from './helpers';

it('creates scenario asset ids and maps asset entries', () => {
  expect(createScenarioAssetId()).toEqual(expect.any(String));
  expect(
    mapScenarioAssetEntry({
      id: 'asset-1',
      projectId: 'project-1',
      galleryAssetId: null,
      blob: new Blob(['asset']),
      mimeType: 'image/png',
      width: 100,
      height: 50,
      createdAt: 10,
      size: 200,
    })
  ).toEqual({
    id: 'asset-1',
    projectId: 'project-1',
    galleryAssetId: null,
    mimeType: 'image/png',
    width: 100,
    height: 50,
    createdAt: 10,
    size: 200,
  });
});

it('maps export entries into public facades', () => {
  expect(
    mapScenarioExportEntry({
      id: 'export-1',
      projectId: 'project-1',
      format: 'html',
      filename: 'guide.html',
      createdAt: 20,
      size: 300,
    })
  ).toEqual({
    id: 'export-1',
    projectId: 'project-1',
    format: 'html',
    filename: 'guide.html',
    createdAt: 20,
    size: 300,
  });
});
