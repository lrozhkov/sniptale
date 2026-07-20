import { describe, expect, it } from 'vitest';
import {
  createMediaLibraryEntry,
  createProjectAssetEntry,
  createProjectExportEntry,
  createVideoProject,
  createVideoProjectEntry,
} from './index.test-support.ts';

describe('projects-db test support', () => {
  it('creates video project fixtures with source, cursor, and action defaults', () => {
    expect(createVideoProject()).toEqual(
      expect.objectContaining({
        actionEvents: [],
        cursorTrack: null,
        source: { kind: 'manual' },
        version: 2,
      })
    );
    expect(createVideoProjectEntry().project).toEqual(expect.objectContaining({ id: 'project-1' }));
  });

  it('creates related asset, export, and media fixtures', () => {
    expect(createProjectAssetEntry()).toEqual(expect.objectContaining({ id: 'asset-1' }));
    expect(createProjectExportEntry()).toEqual(expect.objectContaining({ projectId: 'project-1' }));
    expect(createMediaLibraryEntry()).toEqual(
      expect.objectContaining({
        id: 'project-asset:asset-1',
        source: { kind: 'project-asset', projectAssetId: 'asset-1' },
      })
    );
  });
});
