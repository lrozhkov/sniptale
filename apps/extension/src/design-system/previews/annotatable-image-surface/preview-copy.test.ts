import { describe, expect, it } from 'vitest';

import { getAnnotatableImageSurfacePreviewCopy } from './preview-copy';

describe('AnnotatableImageSurface preview copy', () => {
  it('returns localized preview copy for both supported locales', () => {
    expect(getAnnotatableImageSurfacePreviewCopy('ru')).toEqual({
      stageLabel: 'Canvas stage',
      toolbarLabel: 'Image toolbar',
      actionLabel: 'Добавить слой',
    });
    expect(getAnnotatableImageSurfacePreviewCopy('en')).toEqual({
      stageLabel: 'Canvas stage',
      toolbarLabel: 'Image toolbar',
      actionLabel: 'Add overlay',
    });
  });
});
