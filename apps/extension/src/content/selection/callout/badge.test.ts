import { describe, expect, it } from 'vitest';
import { resolveCalloutBadgeText } from './badge';

describe('resolveCalloutBadgeText', () => {
  it('uses explicit text before the title and body fallbacks', () => {
    expect(
      resolveCalloutBadgeText({
        badgeText: 'A',
        bodyHtml: '<p>Body</p>',
        titleEnabled: true,
        titleText: 'Title',
      })
    ).toBe('A');
  });

  it('falls back to an enabled title and then plain body text', () => {
    expect(
      resolveCalloutBadgeText({
        badgeText: '',
        bodyHtml: '<p>Body <strong>text</strong></p>',
        titleEnabled: true,
        titleText: 'Title',
      })
    ).toBe('Title');
    expect(
      resolveCalloutBadgeText({
        badgeText: ' ',
        bodyHtml: '<p>Body <strong>text</strong></p>',
        titleEnabled: false,
        titleText: 'Hidden title',
      })
    ).toBe('Body text');
  });
});
