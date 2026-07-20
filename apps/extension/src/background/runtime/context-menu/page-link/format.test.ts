import { describe, expect, it } from 'vitest';

import { PageLinkCopyFormat } from './constants';
import { formatPageLinkClipboardPayload } from './format';

describe('context menu page-link formatting', () => {
  it('escapes rich HTML links and keeps plain text readable', () => {
    expect(
      formatPageLinkClipboardPayload(
        {
          title: 'A <B> & "C"',
          url: 'https://example.test/?q=a&b=1',
        },
        PageLinkCopyFormat.RICH
      )
    ).toEqual({
      html: '<a href="https://example.test/?q=a&amp;b=1">A &lt;B&gt; &amp; &quot;C&quot;</a>',
      text: 'A <B> & "C"\nhttps://example.test/?q=a&b=1',
    });
  });

  it('escapes Markdown labels and URL closing parens', () => {
    expect(
      formatPageLinkClipboardPayload(
        {
          title: 'A [B]',
          url: 'https://example.test/a)',
        },
        PageLinkCopyFormat.MARKDOWN
      )
    ).toEqual({
      text: '[A \\[B\\]](https://example.test/a%29)',
    });
  });

  it('formats plain text as title and URL on separate lines', () => {
    expect(
      formatPageLinkClipboardPayload(
        {
          title: 'Example',
          url: 'https://example.test',
        },
        PageLinkCopyFormat.PLAIN
      )
    ).toEqual({
      text: 'Example\nhttps://example.test',
    });
  });
});
