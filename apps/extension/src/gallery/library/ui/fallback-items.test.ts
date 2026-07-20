import { describe, expect, it } from 'vitest';
import { createMediaThumbFallbackItem } from './fallback-items';

describe('gallery thumbnail fallback item factory', () => {
  it('creates typed fallback items for media, scenario, export, and video project kinds', () => {
    expect(createMediaThumbFallbackItem('image', 'asset-1')).toMatchObject({
      id: 'asset-1',
      kind: 'image',
      source: { kind: 'screenshot' },
    });
    expect(createMediaThumbFallbackItem('scenario', 'scenario-1')).toMatchObject({
      kind: 'scenario',
      project: { id: 'scenario-1' },
      type: 'scenario',
    });
    expect(createMediaThumbFallbackItem('scenario-export', 'export-1')).toMatchObject({
      exportEntry: { id: 'export-1' },
      kind: 'scenario-export',
      type: 'scenario-export',
    });
    expect(createMediaThumbFallbackItem('video-project', 'video-1')).toMatchObject({
      kind: 'video-project',
      project: { id: 'video-1', thumbnailSourceMediaId: null },
      type: 'video-project',
    });
  });
});
