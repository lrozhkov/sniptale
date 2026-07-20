import { describe, expect, it } from 'vitest';
import { createExportSettings, createProject } from './test-support';

describe('offscreen runtime test support', () => {
  it('creates a minimal project fixture with the new video-project fields', () => {
    expect(createProject()).toEqual(
      expect.objectContaining({
        actionEvents: [],
        cursorTrack: null,
        source: { kind: 'manual' },
        version: 2,
      })
    );
  });

  it('creates balanced mp4 export settings by default', () => {
    expect(createExportSettings()).toEqual(
      expect.objectContaining({
        downloadAfterExport: true,
        format: 'MP4',
        quality: 'BALANCED',
      })
    );
  });
});
