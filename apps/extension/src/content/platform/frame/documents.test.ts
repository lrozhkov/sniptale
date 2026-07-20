// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { mountStyleInAccessibleDocuments } from './documents';

function createIframeDocument() {
  const iframe = document.createElement('iframe');
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument;
  const iframeWindow = iframe.contentWindow;

  if (!iframeDoc || !iframeWindow) {
    throw new Error('Expected jsdom iframe document');
  }

  Object.defineProperty(iframeWindow, 'frameElement', {
    configurable: true,
    value: iframe,
  });

  return { iframe, iframeDoc };
}

describe('mountStyleInAccessibleDocuments', () => {
  it('mirrors the style element into accessible iframe documents and removes it on cleanup', () => {
    const { iframeDoc } = createIframeDocument();
    const cleanup = mountStyleInAccessibleDocuments({
      styleId: 'sniptale-test-style',
      textContent: '.sniptale-test { color: red; }',
    });

    expect(document.getElementById('sniptale-test-style')).not.toBeNull();
    expect(iframeDoc.getElementById('sniptale-test-style')).not.toBeNull();

    cleanup();

    expect(document.getElementById('sniptale-test-style')).toBeNull();
    expect(iframeDoc.getElementById('sniptale-test-style')).toBeNull();
  });

  it('does not duplicate a style element that is already mounted in the top document', () => {
    const existingStyle = document.createElement('style');
    existingStyle.id = 'sniptale-test-style';
    existingStyle.textContent = '.existing { color: blue; }';
    document.head.append(existingStyle);

    const cleanup = mountStyleInAccessibleDocuments({
      styleId: 'sniptale-test-style',
      textContent: '.sniptale-test { color: red; }',
    });

    expect(document.querySelectorAll('#sniptale-test-style')).toHaveLength(1);
    expect(existingStyle.textContent).toBe('.existing { color: blue; }');

    cleanup();
  });
});
