// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AccessibleIframeReadyResult } from '../../../platform/frame';
import { waitForAccessibleIframeReady } from '../../../platform/frame';
import { buildVirtualDomSnapshot } from '../../dom-tree-parser/traversal';
import { buildPageSnapshot } from '.';

const iframeReadinessFixture: AccessibleIframeReadyResult = {
  pendingIframes: [],
  timedOut: false,
  totalIframes: 0,
};
let originalWindowDescriptor: PropertyDescriptor | undefined;

vi.mock('../../../platform/frame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/frame')>()),
  waitForAccessibleIframeReady: vi.fn(async () => iframeReadinessFixture),
}));

vi.mock('../../dom-tree-parser/traversal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../dom-tree-parser/traversal')>()),
  buildVirtualDomSnapshot: vi.fn(() => ({
    root: document.body.cloneNode(true) as HTMLElement,
    resolveOriginalElement: vi.fn(),
  })),
}));

function createPayloadScript(type: string, text: string, id = ''): HTMLScriptElement {
  const script = document.createElement('script');
  script.type = type;
  script.textContent = text;
  if (id) {
    script.id = id;
  }
  return script;
}

function resetSnapshotTestDom(): void {
  document.head.replaceChildren();
  document.body.replaceChildren();
  document.title = '';
  window.history.replaceState({}, '', '/');
}

function removeAmbientWindow(): void {
  originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Reflect.deleteProperty(globalThis, 'window');
}

function restoreAmbientWindow(): void {
  if (!originalWindowDescriptor) {
    return;
  }

  Object.defineProperty(globalThis, 'window', originalWindowDescriptor);
  originalWindowDescriptor = undefined;
}

function buildPortalSnapshotFixture(): HTMLElement {
  window.history.replaceState({}, '', '/portal/');
  document.title = 'Portal Home';
  document.head.append(
    createPayloadScript('application/json', '{"page":"/portal"}', '__NEXT_DATA__')
  );

  const chrome = document.createElement('div');
  chrome.textContent = 'Toolbar';

  const contentRoot = document.createElement('div');
  contentRoot.className = 'Main__root';
  contentRoot.textContent =
    'Portal landing page with enough text to be recognized as the preferred content root for snapshot parsing.';

  const portalMarker = document.createElement('div');
  portalMarker.className = 'SearchBlock__root';
  contentRoot.append(portalMarker);
  document.body.append(chrome, contentRoot);
  return contentRoot;
}

function buildGenericSnapshotFixture(): void {
  document.title = 'Generic article';
  document.head.append(
    createPayloadScript(
      'application/ld+json',
      JSON.stringify({
        '@type': 'Article',
        articleBody: 'A schema hint for the same generic parsing article.',
      })
    )
  );

  const article = document.createElement('article');
  const heading = document.createElement('h1');
  heading.textContent = 'Generic parsing article';
  const firstParagraph = document.createElement('p');
  firstParagraph.textContent =
    'This generic article contains enough content to satisfy the safe structured ' +
    'pipeline and should therefore become the preferred parsing root instead of ' +
    'the whole document body. The same content also verifies that profile-aware ' +
    'routing chooses a structured article pipeline before the unknown safe-minimal ' +
    'fallback can take over the page.';

  const secondParagraph = document.createElement('p');
  secondParagraph.textContent =
    'A second paragraph keeps the detector above the minimum confidence threshold.';
  article.append(heading, firstParagraph, secondParagraph);

  const sidebar = document.createElement('aside');
  sidebar.textContent = 'Sidebar';
  document.body.append(sidebar, article);
}

function createVirtualDomSnapshotWithoutResolver(): ReturnType<typeof buildVirtualDomSnapshot> {
  const snapshot = {
    root: document.body.cloneNode(true) as HTMLElement,
    resolveOriginalElement: vi.fn(),
  };
  Object.defineProperty(snapshot, 'resolveOriginalElement', {
    configurable: true,
    value: undefined,
  });
  return snapshot;
}

beforeEach(() => {
  resetSnapshotTestDom();
});

afterEach(() => {
  restoreAmbientWindow();
  resetSnapshotTestDom();
});

it('captures profile, payloads, preferred root and virtual root for portal pages', async () => {
  const contentRoot = buildPortalSnapshotFixture();
  const snapshot = await buildPageSnapshot('portal-home');

  expect(snapshot.pageProfile.vendor).toBe('naumen-portal');
  expect(snapshot.pageProfile.pageKind).toBe('homepage');
  expect(snapshot.pageProfile.pipelineId).toBe('naumen-portal');
  expect(snapshot.pageUrl).toContain('/portal/');
  expect(snapshot.pageTitle).toBe('Portal Home');
  expect(snapshot.pageHostname).toBe(window.location.hostname);
  expect(snapshot.schemaTextHint).toBeUndefined();
  expect(snapshot.payloads).toEqual([
    {
      id: '__NEXT_DATA__',
      kind: 'json',
      locator: 'script#__NEXT_DATA__',
      schemaTextHint: false,
      source: 'script-tag',
      textLength: 18,
    },
  ]);
  expect(snapshot.preferredRoot).toBe(contentRoot);
  expect(snapshot.rootSelectionTrace).toEqual(
    expect.objectContaining({
      candidateSelectors: ['.Main__root', '.CoreLayout__content', 'body'],
      selectedSelector: '.Main__root',
      selectedTagName: 'div',
      candidateEvaluations: [
        expect.objectContaining({
          source: 'preferred-root',
          selector: '.Main__root',
          selected: true,
        }),
      ],
    })
  );
  expect(snapshot.virtualRoot.textContent).toContain('Portal landing page');
  expect(snapshot.rootCandidates[0]).toBe('.Main__root');
});

it('keeps generic content roots narrow instead of defaulting to body', async () => {
  buildGenericSnapshotFixture();
  const snapshot = await buildPageSnapshot('generic-article');

  expect(snapshot.pageProfile.vendor).toBe('generic');
  expect(snapshot.pageProfile.pageKind).toBe('content');
  expect(snapshot.pageUrl).toBe(window.location.href);
  expect(snapshot.pageTitle).toBe('Generic article');
  expect(snapshot.pageHostname).toBe(window.location.hostname);
  expect(snapshot.preferredRoot?.tagName.toLowerCase()).toBe('article');
  expect(snapshot.preferredRoot?.textContent).toContain('Generic parsing article');
  expect(snapshot.schemaTextHint).toBe('A schema hint for the same generic parsing article.');
  expect(snapshot.rootSelectionTrace.selectedSelector).toBe('article:nth-of-type(1)');
  expect(snapshot.rootSelectionTrace.selectedTagName).toBe('article');
  expect(snapshot.rootSelectionTrace.candidateSelectors).toEqual(
    expect.arrayContaining([
      'main article',
      'article',
      '.content',
      '.markdown-body',
      'article:nth-of-type(1)',
    ])
  );
  expect(snapshot.rootSelectionTrace.candidateEvaluations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        source: 'preferred-root',
        selector: 'article:nth-of-type(1)',
        selected: true,
      }),
    ])
  );
  expect(snapshot.rootCandidates).toContain('article:nth-of-type(1)');
});

it('omits optional snapshot fields when schema hints and original-element mapping are absent', async () => {
  const pendingIframe = document.createElement('iframe');
  vi.mocked(waitForAccessibleIframeReady).mockResolvedValueOnce({
    pendingIframes: [pendingIframe],
    timedOut: true,
    totalIframes: 1,
  });
  vi.mocked(buildVirtualDomSnapshot).mockReturnValueOnce(createVirtualDomSnapshotWithoutResolver());

  document.title = 'Fallback page';
  const article = document.createElement('article');
  article.textContent =
    'Fallback snapshot content still needs a preferred parsing root even without schema hints.';
  document.body.append(article);

  const snapshot = await buildPageSnapshot('fallback-page');

  expect(snapshot.iframeReadiness).toEqual({
    pendingIframes: [pendingIframe],
    timedOut: true,
    totalIframes: 1,
  });
  expect(snapshot).not.toHaveProperty('resolveOriginalElement');
  expect(snapshot).not.toHaveProperty('schemaTextHint');
});

it('captures an injected iframe document with explicit source metadata', async () => {
  const iframe = document.createElement('iframe');
  document.body.append(iframe);
  const iframeDocument = iframe.contentDocument!;
  iframeDocument.title = 'Iframe fallback title';
  iframeDocument.body.innerHTML = '<main><h1>Snapshot iframe page</h1></main>';

  const snapshot = await buildPageSnapshot('snapshot-viewer', {
    document: iframeDocument,
    pageHostname: 'snapshot.example',
    pageTitle: 'Saved snapshot title',
    pageUrl: 'https://snapshot.example/path',
    root: iframeDocument.body,
  });

  expect(waitForAccessibleIframeReady).toHaveBeenLastCalledWith({
    contextLabel: 'snapshot-viewer',
    rootDocument: iframeDocument,
  });
  expect(buildVirtualDomSnapshot).toHaveBeenLastCalledWith({
    documentRoot: iframeDocument,
    root: iframeDocument.body,
  });
  expect(snapshot.liveRoot).toBe(iframeDocument.body);
  expect(snapshot.pageUrl).toBe('https://snapshot.example/path');
  expect(snapshot.pageTitle).toBe('Saved snapshot title');
  expect(snapshot.pageHostname).toBe('snapshot.example');
});

it('captures an explicit snapshot document without ambient window authority', async () => {
  const snapshotDocument = document.implementation.createHTMLDocument('Snapshot fallback title');
  snapshotDocument.body.innerHTML = '<main><h1>Saved snapshot page</h1></main>';

  removeAmbientWindow();

  const snapshot = await buildPageSnapshot('snapshot-viewer', {
    document: snapshotDocument,
    pageHostname: 'snapshot.example',
    pageTitle: 'Saved snapshot title',
    pageUrl: 'https://snapshot.example/path',
    root: snapshotDocument.body,
  });

  expect(snapshot.liveRoot).toBe(snapshotDocument.body);
  expect(snapshot.pageUrl).toBe('https://snapshot.example/path');
  expect(snapshot.pageTitle).toBe('Saved snapshot title');
  expect(snapshot.pageHostname).toBe('snapshot.example');
});
