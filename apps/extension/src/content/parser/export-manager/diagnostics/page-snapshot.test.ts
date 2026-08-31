// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';

import { CONTENT_ROOT_ID } from '@sniptale/ui/branding';

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
  createResourceTimingSnapshot,
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
  body.dataset['virtualIframe'] = 'true';
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

function createExpectedResourceTimingEntry() {
  return {
    decodedBodySize: 0,
    duration: -2,
    encodedBodySize: 0,
    initiatorType: 'other',
    name: 'https://example.test/fallback',
    nextHopProtocol: '',
    startTime: 25,
    transferSize: 0,
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
  expect(snapshot).not.toContain('value=');
  expect(snapshot).not.toContain('onclick=');
  expect(snapshot).not.toContain('onerror=');
  expect(snapshot).not.toContain('top-secret');
});

it('falls back to the default doctype label when the document doctype is unavailable', () => {
  vi.spyOn(document, 'doctype', 'get').mockReturnValue(null);

  expect(buildDomSnapshotHtml().startsWith('<!DOCTYPE html>')).toBe(true);
});

it('uses valid redacted dimensions for detached SVG diagnostics', () => {
  resetDocumentTree();
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '24');
  svg.setAttribute('height', '16');
  document.body.append(svg);

  const snapshot = buildDomSnapshotHtml();

  expect(snapshot).toContain('<svg width="0" height="0"');
  expect(snapshot).not.toContain('width="[present]"');
  expect(snapshot).not.toContain('height="[present]"');
});

it('replaces or appends virtual body snapshots and redacts the replacement content', () => {
  resetDocumentTree();
  appendElement(document.body, 'main', { id: 'original-main', textContent: 'Original Body' });
  appendElement(document.body, 'div', { id: CONTENT_ROOT_ID, textContent: 'Extension Root' });
  traversalMocks.buildVirtualDomSnapshot.mockReturnValue({ root: createVirtualBody() });

  const snapshot = buildVirtualDomSnapshotHtml();

  expect(snapshot).not.toContain('virtual-main');
  expect(snapshot).not.toContain('original-main');
  expect(snapshot).toContain('id="[present]"');
  expect(snapshot).not.toContain(`id="${CONTENT_ROOT_ID}"`);
  expect(snapshot).not.toContain('value=');
  expect(snapshot).not.toContain('Virtual Body');
  expect(snapshot).toContain('[text:12]');

  const htmlWithoutBody = document.createElement('html');
  htmlWithoutBody.append(document.createElement('head'));

  vi.spyOn(document.documentElement, 'cloneNode').mockReturnValue(htmlWithoutBody);
  const appendedSnapshot = buildVirtualDomSnapshotHtml();

  expect(appendedSnapshot).not.toContain('virtual-main');
  expect(appendedSnapshot).toContain('data-virtual-iframe="true"');
});

function appendPrivacyAttributeFixture(parent: ParentNode): HTMLElement {
  return appendElement(parent, 'button', {
    'aria-description': 'Account owner private@example.test',
    'aria-expanded': 'true',
    'aria-label': 'Private account',
    class: 'account owner-card',
    'data-account': 'raw-account-secret',
    'data-application-code': 'tenant-private-app',
    'data-auth-token': 'auth-token-secret',
    'data-email': 'private@example.test',
    disabled: 'disabled',
    href: '/accounts/account-48291?token=query-secret#private',
    id: 'private@example.test',
    name: 'private-account-name',
    onclick: 'send(authToken)',
    role: 'button',
    title: 'Private title',
  });
}

function expectPrivacyAttributesSanitized(snapshot: string): void {
  expect(snapshot).not.toContain('auth-token-secret');
  expect(snapshot).not.toContain('private@example.test');
  expect(snapshot).not.toContain('raw-account-secret');
  expect(snapshot).not.toContain('tenant-private-app');
  expect(snapshot).not.toContain('private-account-name');
  expect(snapshot).not.toContain('onclick=');
  expect(snapshot).not.toContain('data-account=');
  expect(snapshot).not.toContain('data-application-code=');
  expect(snapshot).not.toContain('data-auth-token=');
  expect(snapshot).not.toContain('data-email=');
  expect(snapshot).toContain('href="/accounts/account-48291"');
  expect(snapshot).toContain('aria-description=""');
  expect(snapshot).toContain('aria-label=""');
  expect(snapshot).toContain('aria-expanded="true"');
  expect(snapshot).toContain('class="[tokens:2]"');
  expect(snapshot).toContain('disabled=""');
  expect(snapshot).toContain('id="[present]"');
  expect(snapshot).toContain('name="[present]"');
  expect(snapshot).toContain('role="button"');
  expect(snapshot).toContain('title=""');
}

it('retains only minimized structural attributes in DOM snapshots', () => {
  resetDocumentTree();
  appendPrivacyAttributeFixture(document.body);

  expectPrivacyAttributesSanitized(buildDomSnapshotHtml());
});

it('keeps only bounded language and numeric structural attribute values', () => {
  resetDocumentTree();
  appendElement(document.body, 'section', { lang: 'EN-us2' });
  appendElement(document.body, 'section', { lang: '' });
  appendElement(document.body, 'section', { lang: 'e1' });
  appendElement(document.body, 'section', { lang: 'en-u' });
  appendElement(document.body, 'section', { lang: 'en-us-posix-extra' });
  appendElement(document.body, 'td', { colspan: '-123.45' });
  appendElement(document.body, 'td', { colspan: '1234567' });
  appendElement(document.body, 'td', { colspan: '1.2.3' });
  appendElement(document.body, 'td', { colspan: '12x' });

  const snapshot = buildDomSnapshotHtml();

  expect(snapshot).toContain('lang="EN-us2"');
  expect(snapshot).toContain('colspan="-123.45"');
  expect(snapshot.match(/lang=""/g)).toHaveLength(4);
  expect(snapshot.match(/colspan=""/g)).toHaveLength(3);
});

it('applies the same structural attribute policy to virtual DOM snapshots', () => {
  resetDocumentTree();
  const virtualBody = document.createElement('body');
  appendPrivacyAttributeFixture(virtualBody);
  traversalMocks.buildVirtualDomSnapshot.mockReturnValue({ root: virtualBody });

  expectPrivacyAttributesSanitized(buildVirtualDomSnapshotHtml());
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

it('creates simple sanitized Resource Timing snapshots', () => {
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

  const snapshot = createResourceTimingSnapshot({
    pageTitle: 'Snapshot Page',
    pageUrl: 'https://example.test/snapshot-page?token=secret#fragment',
  });

  expect(snapshot.pageTitle).toBe('Snapshot Page');
  expect(snapshot.pageUrl).toBe('https://example.test/snapshot-page');
  expect(snapshot.timeOrigin).toBe(performance.timeOrigin);
  expect(snapshot.entries).toEqual([createExpectedResourceTimingEntry()]);
});
