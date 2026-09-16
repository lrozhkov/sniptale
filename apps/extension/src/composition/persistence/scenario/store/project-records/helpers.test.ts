import { expect, it } from 'vitest';
import { createScenarioAssetId, mapScenarioAssetEntry, mapScenarioExportEntry } from './helpers';

it('creates scenario asset ids and maps asset entries', () => {
  expect(createScenarioAssetId()).toEqual(expect.any(String));
  expect(
    mapScenarioAssetEntry({
      assetId: 'opfs-asset-1',
      id: 'asset-1',
      projectId: 'project-1',
      galleryAssetId: null,
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

it('exposes narration duration without exposing physical storage identity', () => {
  const entry = mapScenarioAssetEntry({
    assetId: 'physical-audio',
    id: 'narration',
    projectId: 'project',
    galleryAssetId: null,
    mimeType: 'audio/webm',
    width: 0,
    height: 0,
    duration: 3.5,
    createdAt: 10,
    size: 200,
  });
  expect(entry.duration).toBe(3.5);
  expect(entry).not.toHaveProperty('assetId');
  expect(entry).toMatchObject({ id: 'narration', width: 0, height: 0, mimeType: 'audio/webm' });
});
