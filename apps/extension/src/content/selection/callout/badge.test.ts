import { describe, expect, it } from 'vitest';
import { resolveFrameCalloutBadgeText as resolveCalloutBadgeText } from '../../../features/highlighter/frame-annotation/callout-badge';

describe('resolveCalloutBadgeText', () => {
  it('uses the explicit badge text', () => {
    expect(
      resolveCalloutBadgeText({
        badgeText: 'A',
        bodyHtml: '<p>Body</p>',
        titleEnabled: true,
        titleText: 'Title',
      })
    ).toBe('A');
  });

  it('keeps an empty badge empty instead of copying the heading or body', () => {
    expect(
      resolveCalloutBadgeText({
        badgeText: '',
        bodyHtml: '<p>Body <strong>text</strong></p>',
        titleEnabled: true,
        titleText: 'Title',
      })
    ).toBe('');
    expect(
      resolveCalloutBadgeText({
        badgeText: ' ',
        bodyHtml: '<p>Body <strong>text</strong></p>',
        titleEnabled: false,
        titleText: 'Hidden title',
      })
    ).toBe('');
  });
});
