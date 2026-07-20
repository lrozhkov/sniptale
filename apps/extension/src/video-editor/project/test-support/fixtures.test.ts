import { expect, it } from 'vitest';
import {
  VideoProjectSourceKind,
  VideoTimelinePlacementMode,
} from '../../../features/video/project/types';
import { createProjectAssetEntry, createVideoProject } from './fixtures';

it('creates video editor project fixtures with stable defaults and overrides', () => {
  const project = createVideoProject({ height: 360, id: 'custom-project', width: 640 });

  expect(project).toEqual(
    expect.objectContaining({
      height: 360,
      id: 'custom-project',
      source: { kind: VideoProjectSourceKind.MANUAL },
      timelinePlacementMode: VideoTimelinePlacementMode.RIPPLE_PUSH,
      width: 640,
    })
  );
});

it('creates project asset entries with stable defaults and overrides', () => {
  expect(createProjectAssetEntry({ id: 'custom-asset' })).toEqual(
    expect.objectContaining({
      id: 'custom-asset',
      mimeType: 'image/png',
      size: 12,
    })
  );
});
