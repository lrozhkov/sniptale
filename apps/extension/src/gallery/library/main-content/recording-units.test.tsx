import { expect, it } from 'vitest';
import { createMediaItem } from '../test-support/items';
import { buildGalleryListUnits } from './recording-units';

it('groups interleaved recording members at their first rendered occurrence and orders tracks', () => {
  const webcam = createMediaItem({
    id: 'webcam',
    recordingGroupView: {
      groupId: 'group',
      memberCount: 2,
      order: 1,
      role: 'webcam',
      sourceLabel: 'Webcam',
      projectId: null,
    },
  });
  const display = createMediaItem({
    id: 'display',
    recordingGroupView: {
      groupId: 'group',
      memberCount: 2,
      order: 0,
      role: 'display',
      sourceLabel: 'Display',
      projectId: null,
    },
  });
  const middle = createMediaItem({ id: 'middle' });
  const units = buildGalleryListUnits([webcam, middle, display]);
  expect(units).toEqual([
    {
      kind: 'recording-group',
      representativeId: 'webcam',
      groupId: 'group',
      memberCount: 2,
      items: [display, webcam],
    },
    { kind: 'item', item: middle },
  ]);
});
