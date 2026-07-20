// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { AUTO_BLUR_CATEGORIES } from '../../../features/highlighter/contracts/auto-blur';
import type { AutoBlurMatch } from './types';
import { countSelectedAutoBlurMatches, isAutoBlurMatchSelected } from './match-selection';

function createMatch(overrides: Partial<AutoBlurMatch> = {}): AutoBlurMatch {
  return {
    alreadyBlurred: false,
    category: AUTO_BLUR_CATEGORIES.email,
    confidence: 0.95,
    element: document.createElement('span'),
    id: 'email-match',
    rect: { height: 12, width: 80, x: 10, y: 20 },
    value: 'john.doe@example.com',
    ...overrides,
  };
}

describe('auto-blur selection', () => {
  it('treats row ids as exclusions when the parent category is selected', () => {
    const match = createMatch();

    expect(
      isAutoBlurMatchSelected({
        match,
        selectedCategories: new Set([AUTO_BLUR_CATEGORIES.email]),
        selectedMatchIds: new Set(),
      })
    ).toBe(true);
    expect(
      isAutoBlurMatchSelected({
        match,
        selectedCategories: new Set([AUTO_BLUR_CATEGORIES.email]),
        selectedMatchIds: new Set([match.id]),
      })
    ).toBe(false);
  });

  it('treats row ids as inclusions when the parent category is not selected', () => {
    const match = createMatch();

    expect(
      isAutoBlurMatchSelected({
        match,
        selectedCategories: new Set(),
        selectedMatchIds: new Set(),
      })
    ).toBe(false);
    expect(
      isAutoBlurMatchSelected({
        match,
        selectedCategories: new Set(),
        selectedMatchIds: new Set([match.id]),
      })
    ).toBe(true);
  });

  it('counts only applyable selected matches', () => {
    expect(
      countSelectedAutoBlurMatches({
        matches: [createMatch(), createMatch({ alreadyBlurred: true, id: 'blurred-match' })],
        selectedCategories: new Set([AUTO_BLUR_CATEGORIES.email]),
        selectedMatchIds: new Set(),
      })
    ).toBe(1);
  });
});
