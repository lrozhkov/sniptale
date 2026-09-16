import { expect, it } from 'vitest';
import { tourProject } from './tour.test-support';
import { parseScenarioProjectEntry, parseScenarioAssetEntry } from './read-guards';
import { createScenarioProjectEntry } from './projects/entry';
import { parseGuideProject } from '@sniptale/runtime-contracts/scenario/guide-parser';

it('keeps the independent tour in current and retained snapshots through metadata edits', () => {
  const project = tourProject();
  const first = createScenarioProjectEntry({ project, existing: undefined, updatedAt: 101 });
  const next = createScenarioProjectEntry({
    project: { ...first.project, name: 'Rename' },
    existing: first,
    updatedAt: 102,
  });
  const restored = parseScenarioProjectEntry(JSON.parse(JSON.stringify(next)));
  expect(restored?.project.tour).toEqual(project.tour);
  expect(restored?.history?.[0]?.project.tour).toEqual(project.tour);
});
it('refuses unsupported nested tours and tour-bearing step templates', () => {
  const project = tourProject();
  expect(parseGuideProject({ ...project, tour: { ...project.tour, version: 2 } })).toEqual({
    status: 'unsupported',
    version: 2,
    representation: 'tour',
  });
  expect(parseGuideProject({ ...project, purpose: 'step-template' }).status).toBe('invalid');
});
it('admits only dimensional images or bounded duration-bearing audio metadata', () => {
  const asset = {
    assetId: 'physical',
    id: 'audio',
    projectId: 'project',
    galleryAssetId: null,
    width: 0,
    height: 0,
    mimeType: 'audio/webm;codecs=opus',
    duration: 3,
    createdAt: 1,
    size: 100,
  };
  expect(parseScenarioAssetEntry(asset)).toEqual(asset);
  for (const patch of [
    { size: undefined },
    { size: 0 },
    { size: 257 * 1024 * 1024 },
    { duration: 0 },
    { duration: Infinity },
    { duration: 3601 },
    { width: 1 },
    { duration: undefined },
    { mimeType: 'image/png' },
    { mimeType: 'audio/custom' },
  ])
    expect(parseScenarioAssetEntry({ ...asset, ...patch })).toBeNull();
});
