import { describe, expect, it } from 'vitest';

import {
  afterCaptureLabels,
  delayOptions,
  qualityOptions,
  screenshotModeLabels,
} from './constants';

describe('quick-actions section constants', () => {
  it('exposes translated capture labels and editor options', () => {
    expect(screenshotModeLabels['visible']).toBeTruthy();
    expect(afterCaptureLabels.download_default).toBeTruthy();
    expect(delayOptions.length).toBeGreaterThan(0);
    expect(qualityOptions.length).toBeGreaterThan(0);
  });
});
