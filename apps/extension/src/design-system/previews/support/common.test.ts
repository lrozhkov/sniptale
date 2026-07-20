import { describe, expect, it } from 'vitest';

import { getSharedPreviewCopy } from './common';
import { getProductPreviewCopy } from './product';

describe('shared preview copy', () => {
  it('localizes popup select preview copy through the shared preview source', () => {
    expect(getSharedPreviewCopy('ru').popupSelectAria).toBe('Компактный popup select');
    expect(getSharedPreviewCopy('en').popupSelectAria).toBe('Compact popup select');
  });

  it('localizes product preview copy through the product preview source', () => {
    expect(getProductPreviewCopy('ru').saveDialogPresetPathsLabel).toBe('Пути пресетов');
    expect(getProductPreviewCopy('en').saveDialogPresetPathsLabel).toBe('Preset paths');
  });
});
