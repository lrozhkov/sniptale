// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import {
  buildVirtualDOM,
  buildVirtualDomSnapshot,
  initContext,
  postProcessResult,
  treeWalkerFilter,
} from '.';

function resetTraversalDom(): void {
  document.body.replaceChildren();
  document.title = '';
}

function getTreeWalkerDecision(node: Node): number {
  if (typeof treeWalkerFilter === 'function') {
    return treeWalkerFilter(node);
  }

  return treeWalkerFilter.acceptNode(node);
}

function registerVirtualDomTransformTests() {
  it('flattens open shadow roots into the virtual body and preserves original mapping', () => {
    const host = document.createElement('section');
    host.id = 'shadow-host';
    const shadowRoot = host.attachShadow({ mode: 'open' });
    const shadowParagraph = document.createElement('p');
    shadowParagraph.textContent = 'Shadow-root article content';
    shadowRoot.append(shadowParagraph);
    document.body.append(host);

    const virtualSnapshot = buildVirtualDomSnapshot();
    const virtualBody = virtualSnapshot.root;
    const virtualParagraph = Array.from(virtualBody.querySelectorAll('p')).find((element) => {
      return element.textContent === 'Shadow-root article content';
    });

    expect(virtualParagraph).toBeTruthy();
    expect(virtualSnapshot.resolveOriginalElement(virtualParagraph!)).toBe(shadowParagraph);
  });

  it('replaces streamed SSR placeholders with their resolved content in the virtual body', () => {
    const placeholder = document.createElement('template');
    placeholder.id = 'B:0';

    const streamedContainer = document.createElement('div');
    streamedContainer.id = 'S:0';
    streamedContainer.hidden = true;
    const article = document.createElement('article');
    article.textContent = 'Streamed article body';
    streamedContainer.append(article);

    document.body.append(placeholder, streamedContainer);

    const virtualBody = buildVirtualDOM();

    expect(virtualBody.querySelector('template[id="B:0"]')).toBeNull();
    expect(virtualBody.textContent).toContain('Streamed article body');
  });
}

function registerVirtualIframeSourceTests() {
  registerSameOriginIframeTest();
  registerNestedIframeTest();
  registerInjectedRootSnapshotTest();
}

function registerSameOriginIframeTest() {
  it('embeds same-origin iframe body into the virtual tree', () => {
    const iframe = document.createElement('iframe');
    iframe.id = 'iframe$demo';
    iframe.src = `${window.location.origin}/richText`;
    const iframeDocument = document.implementation.createHTMLDocument('iframe');
    iframeDocument.body.innerHTML = '<p>Iframe body content</p>';
    Object.defineProperty(iframe, 'contentDocument', { configurable: true, value: iframeDocument });
    document.body.append(iframe);

    const virtualBody = buildVirtualDOM();
    const virtualIframe = virtualBody.querySelector('[data-virtual-iframe="true"]');

    expect(virtualIframe).toBeInstanceOf(HTMLDivElement);
    expect(virtualIframe?.getAttribute('data-iframe-source')).toBe('iframe$demo');
    expect(virtualIframe?.textContent).toContain('Iframe body content');
  });
}

function registerNestedIframeTest() {
  it('embeds nested same-origin iframe bodies into the virtual tree', () => {
    const iframe = document.createElement('iframe');
    iframe.id = 'outer-frame';
    const iframeDocument = document.implementation.createHTMLDocument('outer');
    iframeDocument.body.innerHTML = '<section><iframe id="inner-frame"></iframe></section>';
    Object.defineProperty(iframe, 'contentDocument', { configurable: true, value: iframeDocument });
    const nestedIframe = iframeDocument.getElementById('inner-frame') as HTMLIFrameElement;
    const nestedDocument = document.implementation.createHTMLDocument('inner');
    nestedDocument.body.innerHTML = '<p>Nested iframe content</p>';
    Object.defineProperty(nestedIframe, 'contentDocument', {
      configurable: true,
      value: nestedDocument,
    });
    document.body.append(iframe);

    const virtualBody = buildVirtualDOM();

    expect(virtualBody.textContent).toContain('Nested iframe content');
    expect(virtualBody.querySelector('[data-iframe-source="inner-frame"]')).toBeTruthy();
  });
}

function registerInjectedRootSnapshotTest() {
  it('builds a virtual snapshot from an injected document root', () => {
    const iframe = document.createElement('iframe');
    document.body.append(iframe);
    const iframeDocument = iframe.contentDocument!;
    const root = iframeDocument.createElement('main');
    root.innerHTML = '<article>Snapshot iframe content</article>';
    iframeDocument.body.append(root);

    const virtualSnapshot = buildVirtualDomSnapshot({
      documentRoot: iframeDocument,
      root,
    });

    expect(virtualSnapshot.root.textContent).toContain('Snapshot iframe content');
    expect(virtualSnapshot.root.querySelector('article')?.ownerDocument).toBe(iframeDocument);
    expect(virtualSnapshot.resolveOriginalElement(virtualSnapshot.root)).toBe(root);
  });
}

function registerTraversalContextTests() {
  registerExplicitMetadataContextTest();
  registerPostProcessNormalizationTest();
  registerProfileTraceMetadataTest();
}

function registerExplicitMetadataContextTest() {
  it('initializes traversal context with explicit page metadata', () => {
    const context = initContext(undefined, undefined, {
      pageHostname: 'snapshot.example',
      pageTitle: 'Snapshot Title',
      pageUrl: 'https://snapshot.example/path',
    });

    expect(context.result.context).toBe('snapshot.example');
    expect(context.result.title).toBe('Snapshot Title');
    expect(context.result.meta?.url).toBe('https://snapshot.example/path');
  });
}

function registerPostProcessNormalizationTest() {
  it('post-processes parsed results into normalized sections', () => {
    const result = postProcessResult({
      context: 'example',
      sections: [],
      structure: [
        { children: [{ children: [], id: 'child', label: 'Field', value: 'Value' }], id: 'root' },
      ],
      title: 'Title',
    } as never);

    expect(result.structure).toEqual([]);
    expect(result.sections).toBe(result.structure);
  });
}

function registerProfileTraceMetadataTest() {
  it('initializes traversal context with profile and pipeline trace metadata', () => {
    const context = initContext(
      {
        appFamily: 'generic-web',
        confidence: 0.5,
        matchedSignals: [],
        pageKind: 'content',
        pipelineId: 'generic-structured',
        preferredRoots: [],
        vendor: 'generic',
      },
      { pipelineId: 'generic-structured', rootStrategy: 'profile-preferred' } as never,
      {
        pageHostname: 'example.test',
        pageTitle: 'Profiled',
        pageUrl: 'https://example.test/profiled',
      }
    );

    expect(context.pageProfile?.pipelineId).toBe('generic-structured');
    expect(context.result.meta?.pipelineTrace).toEqual(
      expect.objectContaining({ pipelineId: 'generic-structured' })
    );
  });
}

function registerTreeWalkerFilterTests() {
  it('rejects script elements from traversal snapshots', () => {
    const script = document.createElement('script');

    expect(getTreeWalkerDecision(script)).toBe(NodeFilter.FILTER_REJECT);
  });

  it('accepts normal content elements and skips generic virtual iframe wrappers', () => {
    const article = document.createElement('article');
    const virtualIframe = document.createElement('div');
    virtualIframe.dataset['virtualIframe'] = 'true';

    expect(getTreeWalkerDecision(article)).toBe(NodeFilter.FILTER_ACCEPT);
    expect(getTreeWalkerDecision(virtualIframe)).toBe(NodeFilter.FILTER_SKIP);
  });
}

describe('buildVirtualDOM', () => {
  afterEach(() => {
    resetTraversalDom();
  });

  registerVirtualDomTransformTests();
  registerVirtualIframeSourceTests();
  registerTraversalContextTests();
  registerTreeWalkerFilterTests();
});
