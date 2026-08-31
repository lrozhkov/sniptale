// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import DOMPurify from 'dompurify';

import { sanitizeHtmlFragment, writeSanitizedInnerHtml } from './html';

describe('html-sanitizer', () => {
  it('sanitizes fragments through the canonical shared seam', () => {
    expect(
      sanitizeHtmlFragment('<strong onclick="alert(1)">bold</strong><script>bad()</script>', {
        allowedAttributes: [],
        allowedTags: ['strong'],
      })
    ).toBe('<strong>bold</strong>');
  });

  it('fails closed when the purifier throws', () => {
    expect(
      sanitizeHtmlFragment(
        '<div>unsafe</div>',
        {},
        {
          sanitize: () => {
            throw new Error('boom');
          },
        }
      )
    ).toBe('');
  });

  it('writes sanitized HTML through the canonical sink helper', () => {
    const element = document.createElement('div');
    element.innerHTML = '<span>stale</span>';

    const written = writeSanitizedInnerHtml(
      element,
      '<strong onclick="alert(1)">safe</strong><script>bad()</script>',
      { allowedAttributes: [], allowedTags: ['strong'] }
    );

    expect(written).toBe('<strong>safe</strong>');
    expect(element.innerHTML).toBe('<strong>safe</strong>');
  });

  it('removes case-preserved event attributes from DOM-node input', () => {
    const image = document.createElement('img');
    image.setAttribute('src', 'x');
    image.setAttributeNS(null, 'ONERROR', 'alert(1)');
    const wrapper = document.createElement('div');
    wrapper.appendChild(image);

    expect(String(DOMPurify.sanitize(wrapper))).not.toMatch(/onerror/iu);
  });
});
