// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const iframeCoreMocks = vi.hoisted(() => ({
  getAccessibleIframesMock: vi.fn(),
  getIframeDocumentMock: vi.fn(),
  isIframeAccessibleMock: vi.fn(),
}));

vi.mock('./core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./core')>()),
  getAccessibleIframes: iframeCoreMocks.getAccessibleIframesMock,
  getIframeDocument: iframeCoreMocks.getIframeDocumentMock,
  isIframeAccessible: iframeCoreMocks.isIframeAccessibleMock,
}));

function createIframeDocument(markup: string): Document {
  const doc = document.implementation.createHTMLDocument('');
  const parsed = new DOMParser().parseFromString(markup, 'text/html');
  doc.body.replaceChildren(
    ...Array.from(parsed.body.childNodes).map((node) => doc.importNode(node, true))
  );
  return doc;
}

beforeEach(() => {
  document.body.replaceChildren();
  iframeCoreMocks.getAccessibleIframesMock.mockReset();
  iframeCoreMocks.getIframeDocumentMock.mockReset();
  iframeCoreMocks.isIframeAccessibleMock.mockReset();
});

describe('iframe-utils-sniptale top-level and nested lookup flow', () => {
  it('finds sniptale elements in the top document and nested accessible iframes', async () => {
    const row = document.createElement('tr');
    row.dataset['sniptaleId'] = 'top-row';
    document.body.append(row);

    const outerIframe = document.createElement('iframe');
    const nestedIframe = document.createElement('iframe');
    const outerDoc = createIframeDocument('');
    const nestedDoc = createIframeDocument(
      '<table><tr data-sniptale-id="nested-row"><td>Cell A</td><td>Cell B</td></tr></table>'
    );
    outerDoc.body.append(nestedIframe);

    iframeCoreMocks.getAccessibleIframesMock.mockImplementation((rootDoc?: Document) => {
      if (!rootDoc || rootDoc === document) {
        return [outerIframe];
      }

      return [];
    });
    iframeCoreMocks.getIframeDocumentMock.mockImplementation((iframe: HTMLIFrameElement) => {
      if (iframe === outerIframe) {
        return outerDoc;
      }
      if (iframe === nestedIframe) {
        return nestedDoc;
      }
      return null;
    });
    iframeCoreMocks.isIframeAccessibleMock.mockReturnValue(true);

    const { findElementBySniptaleId } = await import('./sniptale');

    expect(findElementBySniptaleId('top-row')).toEqual({ element: row });

    const nestedLookup = findElementBySniptaleId('nested-row');
    expect(nestedLookup).toEqual({
      element: nestedDoc.querySelector('[data-sniptale-id="nested-row"]'),
      iframe: nestedIframe,
    });
  });
});

describe('iframe-utils-sniptale invalid lookup flow', () => {
  it('returns null for missing sniptale elements', async () => {
    const nonRow = document.createElement('div');
    nonRow.dataset['sniptaleId'] = 'not-row';
    document.body.append(nonRow);
    iframeCoreMocks.getAccessibleIframesMock.mockReturnValue([]);

    const { findElementBySniptaleId } = await import('./sniptale');

    expect(findElementBySniptaleId('missing')).toBeNull();
    expect(findElementBySniptaleId('not-row')).toEqual({ element: nonRow });
  });

  it('escapes sniptale ids before building attribute selectors', async () => {
    const specialId = 'row-"] [data-sniptale-id="other';
    const target = document.createElement('div');
    target.dataset['sniptaleId'] = specialId;
    document.body.append(target);
    iframeCoreMocks.getAccessibleIframesMock.mockReturnValue([]);

    const { findElementBySniptaleId } = await import('./sniptale');

    expect(findElementBySniptaleId(specialId)).toEqual({ element: target });
  });
});

describe('iframe-utils-sniptale cleanup flow', () => {
  it('clears sniptale ids in the top document and nested accessible iframe documents', async () => {
    const topNode = document.createElement('div');
    topNode.dataset['sniptaleId'] = 'top';
    document.body.append(topNode);

    const outerIframe = document.createElement('iframe');
    const nestedIframe = document.createElement('iframe');
    const outerDoc = createIframeDocument('<div data-sniptale-id="outer"></div>');
    const nestedDoc = createIframeDocument('<div data-sniptale-id="nested"></div>');
    outerDoc.body.append(nestedIframe);

    iframeCoreMocks.getAccessibleIframesMock.mockReturnValue([outerIframe]);
    iframeCoreMocks.getIframeDocumentMock.mockImplementation((iframe: HTMLIFrameElement) => {
      if (iframe === outerIframe) {
        return outerDoc;
      }
      if (iframe === nestedIframe) {
        return nestedDoc;
      }
      return null;
    });
    iframeCoreMocks.isIframeAccessibleMock.mockReturnValue(true);

    const { clearAllSniptaleIds } = await import('./sniptale');
    clearAllSniptaleIds();

    expect(topNode.dataset['sniptaleId']).toBeUndefined();
    expect(
      (outerDoc.querySelector('[data-sniptale-id]') as HTMLElement | null)?.dataset['sniptaleId']
    ).toBeUndefined();
    expect(
      (nestedDoc.querySelector('[data-sniptale-id]') as HTMLElement | null)?.dataset['sniptaleId']
    ).toBeUndefined();
  });
});
