// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';

import { CONTENT_ROOT_ID, PRODUCT_BRAND_NAME } from '@sniptale/ui/branding';

const runtimeMocks = vi.hoisted(() => ({
  getManifest: vi.fn(() => ({ version: '9.9.9-test' })),
}));

const traversalMocks = vi.hoisted(() => ({
  buildVirtualDomSnapshot: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: runtimeMocks,
}));

vi.mock('../../../parser/dom-tree-parser/traversal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../parser/dom-tree-parser/traversal')>()),
  buildVirtualDomSnapshot: traversalMocks.buildVirtualDomSnapshot,
}));

import {
  buildDomSnapshotHtml,
  buildPageSummaryFile,
  buildVirtualDomSnapshotHtml,
  createHarLikeSnapshot,
} from './page-snapshot';

function appendElement(
  parent: ParentNode,
  tagName: string,
  attributes: Record<string, string> = {}
) {
  const element = document.createElement(tagName);

  for (const [name, value] of Object.entries(attributes)) {
    if (name === 'textContent') {
      element.textContent = value;
      continue;
    }

    element.setAttribute(name, value);
  }

  parent.append(element);
  return element;
}

function resetDocumentTree() {
  document.documentElement.replaceChildren(
    document.createElement('head'),
    document.createElement('body')
  );
}

function createVirtualBody() {
  const body = document.createElement('body');
  body.dataset['virtual'] = 'true';
  appendElement(body, 'main', { id: 'virtual-main', textContent: 'Virtual Body' });
  appendElement(body, 'div', { id: CONTENT_ROOT_ID, textContent: 'Extension Root' });
  appendElement(body, 'input', { type: 'password', value: 'virtual-secret' });

  return body;
}

function createResourceEntry(overrides: Partial<PerformanceResourceTiming> = {}) {
  return {
    duration: 10,
    initiatorType: 'img',
    name: 'https://example.test/image.png',
    startTime: 50,
    transferSize: 25,
    ...overrides,
  } as PerformanceResourceTiming;
}

function appendPageSummaryFixture() {
  document.title = 'Snapshot Page';
  appendElement(document.body, 'form');
  appendElement(document.body, 'iframe');
  appendElement(document.body, 'img', { src: 'image.png' });
  appendElement(document.body, 'a', {
    href: 'https://example.test/link',
    textContent: 'Link',
  });
  appendElement(document.body, 'script');
  appendElement(document.body, 'style');
  appendElement(document.body, 'link', { href: 'styles.css', rel: 'stylesheet' });
}

function createSummaryExpectation() {
  return {
    document: {
      characterSet: 'UTF-8',
      doctype: 'html',
      readyState: document.readyState,
      title: 'Snapshot Page',
      visibilityState: document.visibilityState,
    },
    counts: {
      forms: 1,
      iframes: 1,
      images: 1,
      links: 1,
      scripts: 1,
      stylesheets: 2,
    },
    resourceTiming: {
      totalResources: 2,
      transferSize: 120,
      byInitiatorType: {
        other: 1,
        script: 1,
      },
      slowest: [
        {
          duration: 45,
          initiatorType: 'script',
          name: 'https://example.test/app.js',
          transferSize: 120,
        },
        {
          duration: 4,
          initiatorType: 'other',
          name: 'https://example.test/other',
          transferSize: 0,
        },
      ],
    },
  };
}

function createExpectedHarEntry() {
  return {
    _from: 'performance-resource-timing',
    _initiatorType: 'other',
    cache: {},
    pageref: 'resource_timing_page',
    request: {
      bodySize: -1,
      cookies: [],
      headers: [],
      headersSize: -1,
      httpVersion: '',
      method: 'GET',
      queryString: [],
      url: 'https://example.test/fallback',
    },
    response: {
      bodySize: -1,
      content: {
        mimeType: '',
        size: 0,
      },
      cookies: [],
      headers: [],
      headersSize: -1,
      httpVersion: '',
      redirectURL: '',
      status: 0,
      statusText: '',
    },
    startedDateTime: new Date(performance.timeOrigin + 25).toISOString(),
    time: -2,
    timings: {
      blocked: -1,
      connect: -1,
      dns: -1,
      receive: 0,
      send: 0,
      ssl: -1,
      wait: 0,
    },
  };
}

afterEach(() => {
  resetDocumentTree();
  document.title = '';
  vi.restoreAllMocks();
  runtimeMocks.getManifest.mockReset();
  runtimeMocks.getManifest.mockReturnValue({ version: '9.9.9-test' });
  traversalMocks.buildVirtualDomSnapshot.mockReset();
});

it('redacts DOM snapshots and keeps the stable facade path', () => {
  resetDocumentTree();
  appendElement(document.body, 'main', { textContent: 'Visible Content' });
  appendElement(document.body, 'div', { id: CONTENT_ROOT_ID, textContent: 'Extension Root' });
  appendElement(document.body, 'input', {
    onerror: 'send(secret)',
    onclick: 'token=secret',
    type: 'password',
    value: 'top-secret',
  });

  const snapshot = buildDomSnapshotHtml();

  expect(snapshot.startsWith('<!DOCTYPE html>')).toBe(true);
  expect(snapshot).toContain('[text:15]');
  expect(snapshot).not.toContain(`id="${CONTENT_ROOT_ID}"`);
  expect(snapshot).toContain('type="password"');
  expect(snapshot).toContain('value=""');
  expect(snapshot).not.toContain('onclick=');
  expect(snapshot).not.toContain('onerror=');
  expect(snapshot).not.toContain('top-secret');
});

it('falls back to the default doctype label when the document doctype is unavailable', () => {
  vi.spyOn(document, 'doctype', 'get').mockReturnValue(null);

  expect(buildDomSnapshotHtml().startsWith('<!DOCTYPE html>')).toBe(true);
});

it('replaces or appends virtual body snapshots and redacts the replacement content', () => {
  resetDocumentTree();
  appendElement(document.body, 'main', { id: 'original-main', textContent: 'Original Body' });
  appendElement(document.body, 'div', { id: CONTENT_ROOT_ID, textContent: 'Extension Root' });
  traversalMocks.buildVirtualDomSnapshot.mockReturnValue({ root: createVirtualBody() });

  const snapshot = buildVirtualDomSnapshotHtml();

  expect(snapshot).toContain('virtual-main');
  expect(snapshot).not.toContain('original-main');
  expect(snapshot).not.toContain(`id="${CONTENT_ROOT_ID}"`);
  expect(snapshot).toContain('value=""');
  expect(snapshot).not.toContain('Virtual Body');
  expect(snapshot).toContain('[text:12]');

  const htmlWithoutBody = document.createElement('html');
  htmlWithoutBody.append(document.createElement('head'));

  vi.spyOn(document.documentElement, 'cloneNode').mockReturnValue(htmlWithoutBody);
  const appendedSnapshot = buildVirtualDomSnapshotHtml();

  expect(appendedSnapshot).toContain('virtual-main');
  expect(appendedSnapshot).toContain('data-virtual="true"');
});

it('summarizes resource timing rollups with stable fallback labels', () => {
  appendPageSummaryFixture();

  vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
    createResourceEntry({
      duration: 44.6,
      initiatorType: 'script',
      name: 'https://example.test/app.js',
      transferSize: 120,
    }),
    createResourceEntry({
      duration: 4.2,
      initiatorType: '',
      name: 'https://example.test/other',
      transferSize: 0,
    }),
  ]);

  expect(buildPageSummaryFile({ pageTitle: 'Snapshot Page' })).toEqual(createSummaryExpectation());
});

it('creates HAR-like snapshots from resource timing entries', () => {
  runtimeMocks.getManifest.mockReturnValue({ version: '1.2.3-test' });
  document.title = 'Snapshot Page';
  vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
    createResourceEntry({
      duration: -2.4,
      initiatorType: '',
      name: 'https://example.test/fallback',
      startTime: 25,
      transferSize: 0,
    }),
  ]);

  const snapshot = createHarLikeSnapshot({
    pageTitle: 'Snapshot Page',
    pageUrl: 'https://example.test/snapshot-page',
  });

  expect(snapshot.log.browser.name).toBe(navigator.userAgent);
  expect(snapshot.log.creator).toEqual({
    name: `${PRODUCT_BRAND_NAME} resource-timing snapshot`,
    version: '1.2.3-test',
  });
  expect(snapshot.log.pages[0]?.id).toBe('resource_timing_page');
  expect(snapshot.log.pages[0]?.title).toBe('Snapshot Page');
  expect(snapshot.log.entries).toEqual([createExpectedHarEntry()]);
});
