import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../factories/creation';
import { hydrateVideoProject } from './index';

it('hydrates track-owned logical lanes from legacy clip lane ids and persisted empty lanes', () => {
  const project = createEmptyVideoProject('Logical lanes');
  const trackId = project.tracks[0]!.id;
  project.tracks[0] = {
    ...project.tracks[0]!,
    logicalLanes: [{ id: 'line-2' }],
  };
  project.clips = [
    {
      assetId: 'asset-1',
      duration: 1,
      fadeInMs: 0,
      fadeOutMs: 0,
      fitMode: 'CONTAIN',
      groupId: null,
      id: 'clip-1',
      linkMode: 'DETACHED',
      muted: false,
      name: 'Clip',
      startTime: 0,
      timelineLaneId: 'line-3',
      trackId,
      transform: { height: 100, opacity: 1, rotation: 0, width: 100, x: 0, y: 0 },
      transitionIn: 'NONE',
      transitionOut: 'NONE',
      type: 'IMAGE',
      volume: 1,
    },
  ];

  expect(hydrateVideoProject(project).tracks[0]?.logicalLanes).toEqual([
    { id: 'line-1' },
    { id: 'line-2' },
    { id: 'line-3' },
  ]);
});
