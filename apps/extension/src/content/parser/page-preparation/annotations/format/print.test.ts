// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderReviewPrintReport, printReviewReport } from './print';
import { BROWSER_ANNOTATION_SCHEMA_VERSION, type BrowserAnnotationSessionSnapshot } from '../types';

const append = vi.hoisted(() => vi.fn<(element: HTMLElement) => void>());
vi.mock('../../../../platform/dom-host', () => ({ appendToContentOverlayRoot: append }));

let privateRoot: ShadowRoot;
let printDocument: Document;
beforeEach(() => {
  vi.useFakeTimers();
  append.mockReset();
  const attach = Element.prototype.attachShadow;
  vi.spyOn(Element.prototype, 'attachShadow').mockImplementation(function (this: Element, options) {
    privateRoot = attach.call(this, options);
    return privateRoot;
  });
  printDocument = document.implementation.createHTMLDocument();
  // jsdom does not create browsing contexts for shadow-tree frames. Only the test owns these refs.
  vi.spyOn(HTMLIFrameElement.prototype, 'contentDocument', 'get').mockReturnValue(printDocument);
  vi.spyOn(HTMLIFrameElement.prototype, 'contentWindow', 'get').mockReturnValue(window);
});
afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function mountPrintHost(event: 'load' | 'error' = 'load') {
  append.mockImplementation((host) => {
    document.body.append(host);
    privateRoot.querySelector('iframe')!.dispatchEvent(new Event(event));
  });
}

it('prints inside a private tree and releases the host after print or timeout', async () => {
  const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
  mountPrintHost();
  await printReviewReport('Review');
  expect(print).toHaveBeenCalledOnce();
  expect(printDocument.title).toBe('Review');
  const host = append.mock.calls[0]![0];
  expect(host.shadowRoot).toBeNull();
  expect(host.cloneNode(true).textContent).toBe('');
  expect(Element.prototype.attachShadow).toHaveBeenCalledWith({
    mode: 'closed',
    clonable: false,
    serializable: false,
  });
  expect(document.querySelector('iframe')).toBeNull();
  expect(privateRoot.querySelector('iframe')?.getAttribute('sandbox')).toBe(
    'allow-same-origin allow-modals'
  );
  window.dispatchEvent(new Event('afterprint'));
  expect(host.isConnected).toBe(false);
  await printReviewReport('Again');
  await vi.advanceTimersByTimeAsync(60000);
  expect(append.mock.calls[1]![0].isConnected).toBe(false);
});

it('cleans up after load failure and preserves the caller-visible refusal', async () => {
  mountPrintHost('error');
  await expect(printReviewReport('Review')).rejects.toThrow('did not load');
  expect(append.mock.calls[0]![0].isConnected).toBe(false);
});

it('releases a frame that never finishes loading', async () => {
  append.mockImplementation((host) => {
    privateRoot.querySelector('iframe')!.onload = null;
    document.body.append(host);
  });
  const pending = expect(printReviewReport('Review')).rejects.toThrow('did not load');
  await vi.advanceTimersByTimeAsync(10000);
  await pending;
  expect(append.mock.calls[0]![0].isConnected).toBe(false);
});

it('refuses a missing print document without leaking its host', async () => {
  mountPrintHost();
  vi.spyOn(HTMLIFrameElement.prototype, 'contentDocument', 'get').mockReturnValue(null);
  await expect(printReviewReport('Review')).rejects.toThrow('unavailable');
  expect(append.mock.calls[0]![0].isConnected).toBe(false);
});

it('renders an inert report including movement, source context and authored text', () => {
  const snapshot: BrowserAnnotationSessionSnapshot = {
    schemaVersion: BROWSER_ANNOTATION_SCHEMA_VERSION,
    nextAnnotationId: 2,
    nextCreationOrder: 2,
    nextMarkerNumber: 2,
    frameOrders: [],
    domRecords: [
      {
        annotationId: 1,
        creationOrder: 1,
        markerNumber: 1,
        comment: '<img src=x onerror=alert(1)>',
        evidence: {
          fileLabel: 'Example',
          frame: { kind: 'top-document' },
          locator: 'private',
          nodePosition: { x: 10, y: 20 },
          pageUrl: 'https://example.test/',
          targetPath: 'p',
          targetSelector: 'p',
          targetText: 'Before',
          viewport: { width: 1280, height: 560 },
        },
        propertyChanges: [
          {
            property: 'translate',
            before: { value: 'none', priority: '' },
            after: { value: '12px 3px', priority: '' },
            order: 1,
          },
        ],
        textChange: { before: 'Before', after: 'After' },
      },
    ],
  };
  const doc = document.implementation.createHTMLDocument();
  renderReviewPrintReport(doc, snapshot, 'Design review');
  expect(doc.querySelector('img,script,iframe,a')).toBeNull();
  expect(doc.body.textContent).toContain('translate');
  expect(doc.body.textContent).toContain('12px 3px');
  expect(doc.body.textContent).toContain('https://example.test/');
  expect(doc.body.textContent).toContain('After');
  expect(doc.body.textContent).not.toContain('private');
  expect(doc.title).toBe('Design review');
  expect(doc.querySelector('pre')).toBeNull();
  expect(doc.querySelectorAll('article')).toHaveLength(1);
  expect(doc.querySelector('table')?.textContent).toContain('translate');
  renderReviewPrintReport(doc, snapshot, 'Design review', {
    previews: new Map([
      [1, { dataUrl: 'data:image/png;base64,aGVsbG8=', width: 120.4, height: 40.6 }],
    ]),
    pageTitle: 'Current source title',
    pageUrl: 'https://example.test/current',
  });
  expect(doc.querySelector('.source')?.textContent).toBe('Current source title');
  expect(doc.querySelector('.cover')?.textContent).toContain('https://example.test/current');
  const image = doc.querySelector('img');
  expect(image?.src).toBe('data:image/png;base64,aGVsbG8=');
  expect(image?.alt).toBe('Before');
  expect(image?.width).toBe(120);
  expect(image?.height).toBe(41);
  renderReviewPrintReport(doc, snapshot, 'Design review', {
    previews: new Map([
      [1, { dataUrl: 'https://example.test/private-image', width: 120, height: 40 }],
    ]),
  });
  expect(doc.querySelector('img')).toBeNull();
  expect(doc.querySelector('.unavailable')).not.toBeNull();
});

it('renders frame evidence as inert cards with its recorded geometry and empty fallback', () => {
  const snapshot: BrowserAnnotationSessionSnapshot = {
    schemaVersion: BROWSER_ANNOTATION_SCHEMA_VERSION,
    nextAnnotationId: 1,
    nextCreationOrder: 2,
    nextMarkerNumber: 1,
    domRecords: [],
    frameOrders: [
      {
        creationOrder: 1,
        frameId: 'frame-1',
        frameName: '<script>Frame</script>',
        kind: 'linked',
        comment: '<img src=x> Frame note',
        linkedElementSelector: '#action',
        pageUrl: 'https://example.test/frame',
        rect: { x: 10, y: 20, width: 200, height: 80 },
        viewport: { width: 1280, height: 560 },
      },
    ],
  };
  const doc = document.implementation.createHTMLDocument();
  renderReviewPrintReport(doc, snapshot, 'Frames');
  expect(doc.querySelectorAll('article')).toHaveLength(1);
  expect(doc.querySelector('article')?.textContent).toContain('<script>Frame</script>');
  expect(doc.querySelector('article')?.textContent).toContain('<img src=x> Frame note');
  expect(doc.querySelector('article')?.textContent).toContain(
    '200 × 80 px · (10, 20) · 1280 × 560 px'
  );
  expect(doc.querySelector('article')?.textContent).toContain('#action');
  expect(doc.querySelector('article')?.textContent).toContain('https://example.test/frame');
  expect(doc.querySelector('script,img,a')).toBeNull();
  renderReviewPrintReport(doc, { ...snapshot, frameOrders: [] }, 'Empty');
  expect(doc.querySelector('article')).toBeNull();
  expect(doc.querySelector('main')?.textContent).not.toBe('');
});
