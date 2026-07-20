// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { shouldDropLinkedElement } from './linked-elements';

describe('frame-scroll-sync-linked-elements', () => {
  it('keeps same-document iframe elements', () => {
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentDocument!;
    const element = iframeDoc.createElement('div');
    iframeDoc.body.appendChild(element);

    expect(shouldDropLinkedElement(element)).toBe(false);
  });

  it('drops iframe elements from an outdated iframe document after navigation', () => {
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);

    const staleDoc = iframe.contentDocument!;
    const element = staleDoc.createElement('div');
    staleDoc.body.appendChild(element);

    vi.spyOn(iframe, 'contentDocument', 'get').mockReturnValue(
      document.implementation.createHTMLDocument('fresh')
    );

    expect(shouldDropLinkedElement(element)).toBe(true);
  });
});
