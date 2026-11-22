import { beforeEach, describe, expect, it, vi } from 'vitest';

const translationState = vi.hoisted(() => ({ locale: 'en', ready: false }));

vi.mock('../../../../../platform/i18n', () => ({
  translate: (key: string) => {
    if (!translationState.ready) throw new Error('Catalog preparation is incomplete');
    return `${translationState.locale}:${key}`;
  },
}));

import {
  afterCaptureLabels,
  delayOptions,
  qualityOptions,
  screenshotModeLabels,
} from './constants';

describe('quick-actions section constants', () => {
  beforeEach(() => {
    translationState.locale = 'en';
    translationState.ready = true;
  });

  it('exposes translated capture labels and editor options', () => {
    expect(screenshotModeLabels['visible']).toBeTruthy();
    expect(afterCaptureLabels.download_default).toBeTruthy();
    expect(delayOptions.length).toBeGreaterThan(0);
    expect(qualityOptions.length).toBeGreaterThan(0);
  });

  it('resolves labels after preparation and follows later locale changes', () => {
    expect(screenshotModeLabels['visible']).toBe('en:settings.quickActions.screenshotModeVisible');
    expect(afterCaptureLabels.copy).toBe('en:settings.quickActions.afterCaptureCopy');
    expect(delayOptions[1]?.label).toBe('3 en:settings.quickActions.delayShortSuffix');

    translationState.locale = 'ru';

    expect(screenshotModeLabels['visible']).toBe('ru:settings.quickActions.screenshotModeVisible');
    expect(afterCaptureLabels.copy).toBe('ru:settings.quickActions.afterCaptureCopy');
    expect(delayOptions[1]?.label).toBe('3 ru:settings.quickActions.delayShortSuffix');
  });
});
