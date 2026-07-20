// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { CONTENT_ROOT_ID } from '@sniptale/ui/branding';
import { initializeContentUiRoots } from '../../../platform/dom-host';
import { buildPreparedSnapshotDocument } from './builder';
import { SELECTED_SRCSET_CANDIDATE_ATTRIBUTE } from './responsive-assets';
import { PreparedSnapshotWarningKind } from './types';

function resetPreparedSnapshotDom(): void {
  document.head.replaceChildren();
  document.body.replaceChildren();
  document.title = '';
}

function attachIframeDocument(iframe: HTMLIFrameElement, iframeDocument: Document): void {
  Object.defineProperty(iframe, 'contentDocument', {
    configurable: true,
    value: iframeDocument,
  });
}

function createReadableIframe(id: string, bodyHtml: string): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  iframe.id = id;
  iframe.src = `${window.location.origin}/${id}`;
  const iframeDocument = document.implementation.createHTMLDocument(id);
  iframeDocument.body.innerHTML = bodyHtml;
  attachIframeDocument(iframe, iframeDocument);
  return iframe;
}

function createUnreadableIframe(): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  iframe.src = 'https://external.example/private?token=secret#fragment';
  Object.defineProperty(iframe, 'contentDocument', {
    configurable: true,
    get: () => {
      throw new Error('Cross-origin');
    },
  });
  Object.defineProperty(iframe, 'contentWindow', {
    configurable: true,
    get: () => {
      throw new Error('Cross-origin');
    },
  });
  return iframe;
}

function createContentOverlayRoot(): HTMLElement {
  const host = document.createElement('div');
  host.id = CONTENT_ROOT_ID;
  const shadowRoot = host.attachShadow({ mode: 'open' });
  const { overlayRoot } = initializeContentUiRoots(shadowRoot);
  document.body.append(host);
  return overlayRoot;
}

function appendFrameOverlayFixture(overlayRoot: HTMLElement): void {
  const framesContainer = document.createElement('div');
  framesContainer.className = 'sniptale-frames-container';
  framesContainer.innerHTML = `
    <div id="frame-container-1">
      <div class="sniptale-frame-container" style="position:absolute;left:10px;top:20px">
        <div class="sniptale-interactive-frame" style="border:2px solid red">
          <div class="sniptale-resize-handle">handle</div>
          <div class="sniptale-step-badge" style="background:red">1</div>
        </div>
      </div>
    </div>
  `;

  const blur = document.createElement('div');
  blur.className = 'sniptale-blur-overlay';
  blur.style.cssText = 'position:fixed;left:1px;top:2px;width:3px;height:4px';
  const focus = document.createElement('div');
  focus.className = 'sniptale-focus-overlay';
  focus.style.cssText = 'position:fixed;inset:0;background:rgb(0 0 0 / 0.4)';
  const callout = document.createElement('div');
  callout.className = 'sniptale-callout';
  callout.textContent = 'Prepared callout';
  const toolbar = document.createElement('div');
  toolbar.className = 'sniptale-toolbar-portal-wrapper';
  toolbar.textContent = 'Runtime toolbar';

  overlayRoot.append(framesContainer, blur, focus, callout, toolbar);
}

function setCurrentSrc(element: Element | null, value: string): void {
  if (!element) {
    throw new Error('Expected image element to set currentSrc.');
  }

  Object.defineProperty(element, 'currentSrc', {
    configurable: true,
    value,
  });
}

function registerIframeSnapshotTests(): void {
  it('serializes same-origin iframe bodies as inert virtual iframe content', async () => {
    document.body.append(createReadableIframe('same-origin-frame', '<p>Iframe body content</p>'));

    const result = await buildPreparedSnapshotDocument({ iframeTimeoutMs: 20 });

    expect(result.html).toContain('data-virtual-iframe="true"');
    expect(result.html).toContain('Iframe body content');
    expect(result.html).not.toContain('<iframe');
  });

  it('preserves nested accessible iframe content through the virtual DOM pipeline', async () => {
    const outer = createReadableIframe('outer-frame', '<iframe id="inner-frame"></iframe>');
    const outerDocument = outer.contentDocument!;
    const inner = outerDocument.getElementById('inner-frame') as HTMLIFrameElement;
    const innerDocument = document.implementation.createHTMLDocument('inner-frame');
    innerDocument.body.innerHTML = '<strong>Nested iframe body</strong>';
    attachIframeDocument(inner, innerDocument);
    document.body.append(outer);

    const result = await buildPreparedSnapshotDocument({ iframeTimeoutMs: 20 });

    expect(result.html).toContain('Nested iframe body');
    expect(result.html).toContain('data-iframe-source="inner-frame"');
  });

  it('keeps unreadable iframes as static placeholders with warnings', async () => {
    document.body.append(createUnreadableIframe());

    const result = await buildPreparedSnapshotDocument({ iframeTimeoutMs: 20 });

    expect(result.html).toContain('data-iframe-unreadable="true"');
    expect(result.html).not.toContain('<iframe');
    expect(result.html).not.toContain('token=secret');
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: PreparedSnapshotWarningKind.IframeUnreadable }),
      ])
    );
  });
}

function registerOverlaySnapshotTests(): void {
  it('preserves prepared overlays and iframe content without runtime controls', async () => {
    document.body.append(createReadableIframe('content-frame', '<p>Iframe with overlays</p>'));
    appendFrameOverlayFixture(createContentOverlayRoot());

    const result = await buildPreparedSnapshotDocument({ iframeTimeoutMs: 20 });

    expect(result.html).toContain('Iframe with overlays');
    expect(result.html).toContain('sniptale-frames-container');
    expect(result.html).toContain('sniptale-step-badge');
    expect(result.html).toContain('sniptale-blur-overlay');
    expect(result.html).toContain('sniptale-focus-overlay');
    expect(result.html).toContain('Prepared callout');
    expect(result.html).not.toContain('sniptale-resize-handle');
    expect(result.html).not.toContain('Runtime toolbar');
  });
}

function registerSanitizerSnapshotTests(): void {
  it('keeps static annotation markup and strips executable snapshot content', async () => {
    const refresh = document.createElement('meta');
    refresh.setAttribute('http-equiv', 'refresh');
    refresh.setAttribute('content', '0;url=javascript:alert(1)');
    document.head.append(refresh);
    document.body.innerHTML = `
      <main data-sniptale-static-annotation="true">Prepared annotation</main>
      <a href="javascript:alert(1)" onclick="alert(1)">bad link</a>
      <button formaction="https://tracker.example/post">submit</button>
      <svg><use xlink:href="javascript:alert(1)"></use></svg>
      <style>@import url("https://tracker.example/style.css"); body{color:red}</style>
      <section style="background:url(https://tracker.example/pixel.png); color: blue">styled</section>
      <img src="data:text/html,<script>alert(1)</script>">
      <iframe srcdoc="<script>window.bad = true</script>"></iframe>
      <script>window.bad = true</script>
    `;

    const result = await buildPreparedSnapshotDocument({ iframeTimeoutMs: 20 });

    expect(result.html).toContain('data-sniptale-static-annotation="true"');
    expect(result.html).toContain('Prepared annotation');
    expect(result.html).not.toContain('<script');
    expect(result.html).not.toContain('onclick=');
    expect(result.html).not.toContain('javascript:alert');
    expect(result.html).not.toContain('formaction=');
    expect(result.html).not.toContain('tracker.example');
    expect(result.html).not.toContain('data:text/html');
    expect(result.html).not.toContain('srcdoc=');
    expect(result.html).toContain('color:red');
    expect(result.html).toContain('color: blue');
    expect(result.document.querySelector('meta[http-equiv="refresh"]')).toBeNull();
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: PreparedSnapshotWarningKind.SanitizerDrop }),
      ])
    );
  });
}

function registerResponsiveAssetSnapshotTests(): void {
  it('materializes selected responsive image candidates into the prepared snapshot', async () => {
    document.body.innerHTML =
      '<img id="responsive" srcset="/small.png 1x, /large.png 2x" src="/fallback.png">';
    const image = document.querySelector('#responsive');
    setCurrentSrc(image, `${window.location.origin}/large.png`);

    const result = await buildPreparedSnapshotDocument({ iframeTimeoutMs: 20 });
    const preparedImage = result.document.querySelector('#responsive');

    expect(preparedImage?.getAttribute(SELECTED_SRCSET_CANDIDATE_ATTRIBUTE)).toBe(
      `${window.location.origin}/large.png`
    );
    expect(image?.hasAttribute(SELECTED_SRCSET_CANDIDATE_ATTRIBUTE)).toBe(false);
    expect(result.html).not.toContain(SELECTED_SRCSET_CANDIDATE_ATTRIBUTE);
    expect(result.html).not.toContain(`${window.location.origin}/large.png`);
  });
}

describe('buildPreparedSnapshotDocument', () => {
  afterEach(resetPreparedSnapshotDom);

  registerIframeSnapshotTests();
  registerOverlaySnapshotTests();
  registerSanitizerSnapshotTests();
  registerResponsiveAssetSnapshotTests();
});
