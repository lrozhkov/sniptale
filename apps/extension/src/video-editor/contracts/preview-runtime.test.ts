import { describe, expect, it } from 'vitest';

import {
  VideoEditorPreviewMode,
  VideoEditorPreviewRasterPreset,
  VideoEditorPreviewZoom,
} from './preview-runtime';

describe('video editor preview runtime contract', () => {
  it('keeps the shipped defaults representable by closed literal contracts', () => {
    expect(VideoEditorPreviewMode.LIVE).toBe('live');
    expect(VideoEditorPreviewRasterPreset.P720).toBe('720p');
    expect(VideoEditorPreviewZoom.FIT).toBe('fit');
  });
});
