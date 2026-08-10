import { describe, expect, it } from 'vitest';

import {
  afterCaptureLabels,
  allowedQuickActionIcons,
  delayOptions,
  qualityOptions,
  quickActionIconMap,
  screenshotModeLabels,
} from './constants';

describe('quick-actions section constants', () => {
  it('keeps icon allowlist and icon map aligned', () => {
    expect(allowedQuickActionIcons.every((icon) => quickActionIconMap[icon])).toBe(true);
  });

  it('exposes translated capture labels and editor options', () => {
    expect(screenshotModeLabels['visible']).toBeTruthy();
    expect(afterCaptureLabels.download_default).toBeTruthy();
    expect(delayOptions.length).toBeGreaterThan(0);
    expect(qualityOptions.length).toBeGreaterThan(0);
  });
});
