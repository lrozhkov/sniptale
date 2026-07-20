// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  AUTO_BLUR_CATEGORIES,
  type AutoBlurCategory,
  type AutoBlurTextSource,
} from '../../../../features/highlighter/contracts/auto-blur';
import { ruleAutoBlurDetector } from './rule-detector';

function createSource(text: string): AutoBlurTextSource {
  return {
    element: document.createElement('div'),
    text,
  };
}

function detectCategories(text: string): Set<AutoBlurCategory> {
  const detections = ruleAutoBlurDetector.detect({ sources: [createSource(text)] });
  return new Set(detections.map((detection) => detection.category));
}

describe('ruleAutoBlurDetector', () => {
  it('detects v1 local PII categories with conservative validators', () => {
    const categories = detectCategories(
      [
        'mail john.doe@example.com',
        'phone +7 (999) 123-45-67',
        'site https://example.com/login',
        'ip 192.168.0.1',
        'card 4111 1111 1111 1111',
        'snils 112-233-445 95',
        'inn 7707083893',
        'passport 4510 123456',
      ].join(' ')
    );

    expect(categories.has(AUTO_BLUR_CATEGORIES.email)).toBe(true);
    expect(categories.has(AUTO_BLUR_CATEGORIES.phone)).toBe(true);
    expect(categories.has(AUTO_BLUR_CATEGORIES.urlOrLogin)).toBe(true);
    expect(categories.has(AUTO_BLUR_CATEGORIES.ipAddress)).toBe(true);
    expect(categories.has(AUTO_BLUR_CATEGORIES.bankCard)).toBe(true);
    expect(categories.has(AUTO_BLUR_CATEGORIES.documentNumber)).toBe(true);
  });

  it('rejects repeated bank-card candidates even when the length matches', () => {
    const categories = detectCategories('card 1111 1111 1111 1111');

    expect(categories.has(AUTO_BLUR_CATEGORIES.bankCard)).toBe(false);
  });

  it('does not classify unprefixed RU document-like values as phones', () => {
    const categories = detectCategories('inn 7707083893 passport 4510 123456');

    expect(categories.has(AUTO_BLUR_CATEGORIES.documentNumber)).toBe(true);
    expect(categories.has(AUTO_BLUR_CATEGORIES.phone)).toBe(false);
  });
});
