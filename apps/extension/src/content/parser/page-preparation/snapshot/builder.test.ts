// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONTENT_ROOT_ID } from '@sniptale/ui/branding';
import { initializeContentUiRoots } from '../../../platform/dom-host';
import { buildPreparedSnapshotDocument } from './builder';
import { IFRAME_RASTER_RECT_ATTRIBUTES } from './sanitizer';
import { SELECTED_SRCSET_CANDIDATE_ATTRIBUTE } from './responsive-assets';
import { PreparedSnapshotWarningKind } from './types';
import { CONTENT_RUNTIME_MARKER_ATTRIBUTE } from '../../../runtime/entrypoint/markers';
import { materializeUnreadableIframeRasters } from '../../web-snapshot/iframe-raster';
import type { FullPageCaptureGeometry } from '../../../../contracts/full-page-capture';

function resetPreparedSnapshotDom(): void {
  document.head.replaceChildren();
  document.body.replaceChildren();
  document.title = '';
  vi.restoreAllMocks();
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
  iframe.getBoundingClientRect = () => new DOMRect(120, 240, 640, 360);
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
  const trigger = document.createElement('button');
  trigger.className = 'sniptale-frame-toolbar-trigger';
  trigger.textContent = 'Runtime frame trigger';
  const triggerBridge = document.createElement('div');
  triggerBridge.className = 'sniptale-frame-toolbar-bridge';
  triggerBridge.textContent = 'Runtime trigger bridge';
  const calloutHandle = document.createElement('button');
  calloutHandle.className = 'sniptale-callout-drag-handle';
  calloutHandle.textContent = 'Runtime callout handle';
  const calloutAdjacentControls = document.createElement('div');
  calloutAdjacentControls.className = 'sniptale-callout-adjacent-controls';
  calloutAdjacentControls.textContent = 'Runtime adjacent callout controls';
  const calloutSettingsHandle = document.createElement('button');
  calloutSettingsHandle.className = 'sniptale-callout-settings-handle';
  calloutSettingsHandle.textContent = 'Runtime callout settings';
  const stepBadgeControls = document.createElement('div');
  stepBadgeControls.className = 'sniptale-step-badge-controls';
  stepBadgeControls.textContent = 'Runtime step badge controls';
  const freeDraft = document.createElement('div');
  freeDraft.className = 'sniptale-free-frame-draft-portal';
  freeDraft.textContent = 'Runtime free-frame draft';

  overlayRoot.append(
    framesContainer,
    blur,
    focus,
    callout,
    toolbar,
    trigger,
    triggerBridge,
    calloutHandle,
    calloutAdjacentControls,
    calloutSettingsHandle,
    stepBadgeControls,
    freeDraft
  );
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
    expect(result.html).toContain('data-sniptale-iframe-raster-x="120"');
    expect(result.html).toContain('data-sniptale-iframe-raster-y="240"');
    expect(result.html).toContain('data-sniptale-iframe-raster-coordinate-space="viewport"');
    expect(result.html).toContain('data-sniptale-iframe-raster-width="640"');
    expect(result.html).toContain('data-sniptale-iframe-raster-height="360"');
    expect(result.html).not.toContain('<iframe');
    expect(result.html).not.toContain('token=secret');
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: PreparedSnapshotWarningKind.IframeUnreadable }),
      ])
    );
  });

  it('records iframe coordinates in the dominant internal scroller content space', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(800);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(600);
    const scroller = document.createElement('main');
    scroller.style.overflowY = 'auto';
    Object.defineProperties(scroller, {
      clientHeight: { configurable: true, value: 400 },
      clientLeft: { configurable: true, value: 2 },
      clientTop: { configurable: true, value: 2 },
      clientWidth: { configurable: true, value: 700 },
      scrollHeight: { configurable: true, value: 1600 },
      scrollLeft: { configurable: true, value: 0 },
      scrollTop: { configurable: true, value: 500 },
      scrollWidth: { configurable: true, value: 700 },
    });
    scroller.getBoundingClientRect = () => new DOMRect(48, 98, 704, 404);
    scroller.append(createUnreadableIframe());
    document.body.append(scroller);

    const result = await buildPreparedSnapshotDocument({ iframeTimeoutMs: 20 });

    expect(result.html).toContain('data-sniptale-iframe-raster-coordinate-space="root-content"');
    expect(result.html).toContain('data-sniptale-iframe-raster-x="70"');
    expect(result.html).toContain('data-sniptale-iframe-raster-y="640"');
  });

  it('projects an unreadable nested iframe through its readable parent and internal scroll root', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(800);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(600);
    const scroller = document.createElement('main');
    scroller.style.overflowY = 'auto';
    Object.defineProperties(scroller, {
      clientHeight: { configurable: true, value: 400 },
      clientLeft: { configurable: true, value: 2 },
      clientTop: { configurable: true, value: 2 },
      clientWidth: { configurable: true, value: 700 },
      scrollHeight: { configurable: true, value: 1600 },
      scrollLeft: { configurable: true, value: 0 },
      scrollTop: { configurable: true, value: 500 },
      scrollWidth: { configurable: true, value: 700 },
    });
    scroller.getBoundingClientRect = () => new DOMRect(48, 98, 704, 404);
    const readableParent = document.createElement('iframe');
    readableParent.id = 'readable-parent';
    readableParent.getBoundingClientRect = () => new DOMRect(100, 200, 500, 300);
    Object.defineProperties(readableParent, {
      clientLeft: { configurable: true, value: 2 },
      clientTop: { configurable: true, value: 2 },
      offsetHeight: { configurable: true, value: 300 },
      offsetWidth: { configurable: true, value: 500 },
    });
    scroller.append(readableParent);
    document.body.append(scroller);
    const childDocument = readableParent.contentDocument;
    const childWindow = readableParent.contentWindow;
    if (!childDocument || !childWindow) throw new Error('Expected readable parent iframe');
    Object.defineProperty(childWindow, 'frameElement', {
      configurable: true,
      value: readableParent,
    });
    const unreadableChild = childDocument.createElement('iframe');
    unreadableChild.src = 'https://external.example/nested';
    unreadableChild.getBoundingClientRect = () => new DOMRect(10, 20, 300, 200);
    Object.defineProperty(unreadableChild, 'contentDocument', {
      configurable: true,
      get: () => {
        throw new Error('Cross-origin');
      },
    });
    childDocument.body.append(unreadableChild);

    const prepared = await buildPreparedSnapshotDocument({ iframeTimeoutMs: 20 });
    const cropIframeRaster = vi.fn(async () => new Blob(['png'], { type: 'image/png' }));
    const captureGeometry: FullPageCaptureGeometry = {
      devicePixelRatio: 1,
      extentHeight: 1600,
      extentWidth: 700,
      outputHeight: 1800,
      outputWidth: 800,
      rootKind: 'element',
      rootViewport: { height: 400, width: 700, x: 50, y: 100 },
      viewportHeight: 600,
      viewportWidth: 800,
    };
    const rasterized = await materializeUnreadableIframeRasters(
      prepared.document,
      new Blob(['full-page'], { type: 'image/png' }),
      captureGeometry,
      { cropIframeRaster }
    );

    expect(cropIframeRaster).toHaveBeenCalledWith({
      height: 200,
      width: 300,
      x: 112,
      y: 722,
    });
    expect(rasterized.assets).toHaveLength(1);
  });

  it('drops forged iframe geometry when top-document ancestry exceeds the supported depth', async () => {
    let ownerDocument = document;
    for (let depth = 0; depth < 11; depth += 1) {
      const readableFrame = ownerDocument.createElement('iframe');
      readableFrame.id = `readable-depth-${depth}`;
      readableFrame.getBoundingClientRect = () => new DOMRect(0, 0, 640, 480);
      Object.defineProperties(readableFrame, {
        offsetHeight: { configurable: true, value: 480 },
        offsetWidth: { configurable: true, value: 640 },
      });
      ownerDocument.body.append(readableFrame);
      const childDocument = readableFrame.contentDocument;
      const childWindow = readableFrame.contentWindow;
      if (!childDocument || !childWindow) throw new Error('Expected readable iframe chain');
      Object.defineProperty(childWindow, 'frameElement', {
        configurable: true,
        value: readableFrame,
      });
      ownerDocument = childDocument;
    }
    const unreadableChild = ownerDocument.createElement('iframe');
    unreadableChild.src = 'https://external.example/deeply-nested';
    unreadableChild.setAttribute(IFRAME_RASTER_RECT_ATTRIBUTES.coordinateSpace, 'viewport');
    unreadableChild.setAttribute(IFRAME_RASTER_RECT_ATTRIBUTES.x, '999');
    unreadableChild.setAttribute(IFRAME_RASTER_RECT_ATTRIBUTES.y, '999');
    unreadableChild.setAttribute(IFRAME_RASTER_RECT_ATTRIBUTES.width, '500');
    unreadableChild.setAttribute(IFRAME_RASTER_RECT_ATTRIBUTES.height, '500');
    Object.defineProperty(unreadableChild, 'contentDocument', {
      configurable: true,
      get: () => {
        throw new Error('Cross-origin');
      },
    });
    ownerDocument.body.append(unreadableChild);

    const prepared = await buildPreparedSnapshotDocument({ iframeTimeoutMs: 20 });
    const cropIframeRaster = vi.fn(async () => new Blob(['png'], { type: 'image/png' }));
    const rasterized = await materializeUnreadableIframeRasters(
      prepared.document,
      new Blob(['full-page'], { type: 'image/png' }),
      {
        devicePixelRatio: 1,
        extentHeight: 600,
        extentWidth: 800,
        outputHeight: 600,
        outputWidth: 800,
        rootKind: 'viewport',
        rootViewport: { height: 600, width: 800, x: 0, y: 0 },
        viewportHeight: 600,
        viewportWidth: 800,
      },
      { cropIframeRaster }
    );

    expect(prepared.html).not.toContain('data-sniptale-iframe-raster-x="999"');
    expect(cropIframeRaster).not.toHaveBeenCalled();
    expect(rasterized.assets).toEqual([]);
  });

  it('drops forged iframe geometry inside inert declarative shadow template content', async () => {
    const boundary = document.createElement('template');
    boundary.setAttribute('shadowrootmode', 'open');
    const unreadableChild = document.createElement('iframe');
    unreadableChild.src = 'https://external.example/declarative-shadow';
    unreadableChild.setAttribute(IFRAME_RASTER_RECT_ATTRIBUTES.coordinateSpace, 'document');
    unreadableChild.setAttribute(IFRAME_RASTER_RECT_ATTRIBUTES.x, '999');
    unreadableChild.setAttribute(IFRAME_RASTER_RECT_ATTRIBUTES.y, '999');
    unreadableChild.setAttribute(IFRAME_RASTER_RECT_ATTRIBUTES.width, '999');
    unreadableChild.setAttribute(IFRAME_RASTER_RECT_ATTRIBUTES.height, '999');
    unreadableChild.getBoundingClientRect = () => new DOMRect(10, 20, 300, 200);
    Object.defineProperty(unreadableChild, 'contentDocument', {
      configurable: true,
      get: () => {
        throw new Error('Cross-origin');
      },
    });
    boundary.content.append(unreadableChild);
    document.body.append(boundary);

    const prepared = await buildPreparedSnapshotDocument({ iframeTimeoutMs: 20 });

    expect(prepared.html).toContain('data-sniptale-iframe-raster-x="0"');
    expect(prepared.html).toContain('data-sniptale-iframe-raster-width="0"');
    expect(prepared.html).not.toContain('data-sniptale-iframe-raster-x="999"');
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
    expect(result.html).not.toContain('Runtime frame trigger');
    expect(result.html).not.toContain('Runtime trigger bridge');
    expect(result.html).not.toContain('Runtime callout handle');
    expect(result.html).not.toContain('Runtime callout settings');
    expect(result.html).not.toContain('Runtime step badge controls');
    expect(result.html).not.toContain('Runtime free-frame draft');
  });
}

function registerRuntimeHostSnapshotTests(): void {
  it('removes a marked runtime host when snapshotting runs in a separate module realm', async () => {
    const pageLookalike = document.createElement('section');
    pageLookalike.id = CONTENT_ROOT_ID;
    pageLookalike.textContent = 'Page-owned lookalike';
    const runtimeHost = document.createElement('div');
    runtimeHost.id = CONTENT_ROOT_ID;
    runtimeHost.setAttribute(CONTENT_RUNTIME_MARKER_ATTRIBUTE, 'dynamic-smoke-build');
    runtimeHost.attachShadow({ mode: 'open' }).textContent = 'Extension runtime chrome';
    document.body.append(pageLookalike, runtimeHost);

    const result = await buildPreparedSnapshotDocument({ iframeTimeoutMs: 20 });

    expect(result.html).toContain('Page-owned lookalike');
    expect(result.html).not.toContain('Extension runtime chrome');
    expect(result.html).not.toContain(CONTENT_RUNTIME_MARKER_ATTRIBUTE);
  });
}

function registerScrollStateSnapshotTests(): void {
  it('retains frozen internal scroll state through sanitization and serialization', async () => {
    document.body.innerHTML = '<aside id="scrolled"><nav>Captured navigation</nav></aside>';
    const source = document.querySelector<HTMLElement>('#scrolled');
    if (!source) throw new Error('Expected scroll container');
    Object.defineProperty(source, 'scrollTop', { configurable: true, value: 1259 });

    const result = await buildPreparedSnapshotDocument({ iframeTimeoutMs: 20 });

    expect(result.html).toContain('data-sniptale-scroll-state="scroll-1"');
    expect(result.html).toContain('data-sniptale-captured-scroll-state="true"');
    expect(result.html).toContain('translate:0px -1259px!important');
    expect(result.html).not.toContain('<script');
  });
}

function registerSanitizerSnapshotTests(): void {
  it('preserves ordinary and adopted styles from flattened open shadow roots', async () => {
    const host = document.createElement('section');
    const shadowRoot = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = '.ordinary-shadow { color: rgb(1, 2, 3); }';
    const content = document.createElement('p');
    content.className = 'ordinary-shadow adopted-shadow';
    content.textContent = 'Styled shadow content';
    shadowRoot.append(style, content);
    const adoptedStyleSheet = new CSSStyleSheet();
    adoptedStyleSheet.insertRule('.adopted-shadow { background: rgb(4, 5, 6); }');
    Object.defineProperty(shadowRoot, 'adoptedStyleSheets', {
      configurable: true,
      value: [adoptedStyleSheet],
    });
    document.body.append(host);

    const result = await buildPreparedSnapshotDocument({ iframeTimeoutMs: 20 });

    expect(result.html).toContain('Styled shadow content');
    expect(result.html).toContain('.ordinary-shadow');
    expect(result.html).toContain('.adopted-shadow');
    expect(result.html).toContain('rgb(4, 5, 6)');
    expect(result.html).toContain('<template shadowrootmode="open">');
    expect(result.html).not.toContain('data-sniptale-shadow-style-host');
    expect(result.html).not.toContain('data-sniptale-shadow-boundary');
    expect(host.hasAttribute('data-sniptale-shadow-style-host')).toBe(false);
  });

  it('preserves nested accessible shadow content as nested declarative roots', async () => {
    const outerHost = document.createElement('section');
    outerHost.id = CONTENT_ROOT_ID;
    const outerRoot = outerHost.attachShadow({ mode: 'open' });
    const innerHost = document.createElement('article');
    const innerRoot = innerHost.attachShadow({ mode: 'open' });
    outerRoot.innerHTML = '<style>:host { display: block; }</style>';
    innerRoot.innerHTML = [
      '<style>:host { color: rgb(7, 8, 9); }</style>',
      '<strong>Nested declarative shadow content</strong>',
      '<input value="stale shadow value">',
      '<img srcset="/small-shadow.png 1x, /large-shadow.png 2x">',
    ].join('');
    const shadowInput = innerRoot.querySelector('input');
    const shadowImage = innerRoot.querySelector('img');
    if (!shadowInput || !shadowImage) throw new Error('Expected nested shadow state');
    shadowInput.value = 'current shadow value';
    setCurrentSrc(shadowImage, `${window.location.origin}/large-shadow.png`);
    outerRoot.append(innerHost);
    const pageLookalike = document.createElement('div');
    pageLookalike.className = 'sniptale-action-toolbar';
    pageLookalike.textContent = 'Page-owned lookalike content';
    document.body.append(outerHost, pageLookalike);

    const result = await buildPreparedSnapshotDocument({ iframeTimeoutMs: 20 });

    expect(result.html.match(/<template shadowrootmode="open">/g)).toHaveLength(2);
    expect(result.html).toContain('Nested declarative shadow content');
    expect(result.html).toContain('Page-owned lookalike content');
    expect(result.html).toContain('rgb(7, 8, 9)');
    expect(result.html).toContain('value="current shadow value"');
    expect(result.html).not.toContain(SELECTED_SRCSET_CANDIDATE_ATTRIBUTE);
    const outerTemplate = result.document.querySelector<HTMLTemplateElement>(
      'template[shadowrootmode="open"]'
    );
    const innerTemplate = outerTemplate?.content.querySelector<HTMLTemplateElement>(
      'template[shadowrootmode="open"]'
    );
    expect(
      innerTemplate?.content.querySelector('img')?.getAttribute(SELECTED_SRCSET_CANDIDATE_ATTRIBUTE)
    ).toBe(`${window.location.origin}/large-shadow.png`);
  });

  it('sanitizes credentials and active content inside pre-existing declarative templates', async () => {
    document.body.innerHTML = [
      '<section><template shadowrootmode="open">',
      '<script>window.retained = true</script>',
      '<input type="hidden" value="template-token">',
      '<textarea autocomplete="one-time-code" value="template-text-attribute-code">template-text-code</textarea>',
      '<input type="checkbox" autocomplete="one-time-code" checked>',
      '<select autocomplete="cc-number" value="template-select-card">',
      '<option label="template-card-label" value="4111111111111111" selected>',
      'template-card-number</option></select>',
      '<img src="javascript:alert(1)" onerror="alert(1)">',
      '<template shadowrootmode="open"><input autocomplete="section-login one-time-code" value="654321"></template>',
      '</template></section>',
    ].join('');

    const result = await buildPreparedSnapshotDocument({ iframeTimeoutMs: 20 });

    expect(result.html).toContain('shadowrootmode="open"');
    expect(result.html).not.toContain('window.retained');
    expect(result.html).not.toContain('template-token');
    expect(result.html).not.toContain('template-text-code');
    expect(result.html).not.toContain('template-text-attribute-code');
    expect(result.html).not.toContain('template-select-card');
    expect(result.html).not.toContain('template-card-number');
    expect(result.html).not.toContain('template-card-label');
    expect(result.html).not.toContain('4111111111111111');
    expect(result.html).not.toContain('654321');
    expect(result.html).not.toContain('javascript:');
    expect(result.html).not.toContain('onerror');
    const template = result.document.querySelector<HTMLTemplateElement>(
      'template[shadowrootmode="open"]'
    );
    expect(template?.content.querySelector('textarea')?.textContent).toBe('');
    expect(template?.content.querySelector('select option')).toBeNull();
    expect(template?.content.querySelector('input[type="checkbox"]')?.hasAttribute('checked')).toBe(
      false
    );
  });

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
      <style>
        @import url("https://tracker.example/style.css");
        :root { --snapshot-color: red; }
        body { color: var(--snapshot-color); }
        .unsafe-rule { width: expression(alert(1)); }
      </style>
      <section style="background:url(https://tracker.example/pixel.png); color: blue">styled</section>
      <img src="data:text/html,<script>alert(1)</script>">
      <iframe srcdoc="<script>window.bad = true</script>"></iframe>
      <script>window.bad = true</script>
    `;
    document.body.insertAdjacentHTML(
      'afterbegin',
      [
        '<input type="hidden" value="prepared-csrf-secret">',
        '<input autocomplete="section-login current-password webauthn" value="prepared-password">',
        '<input autocomplete="billing cc-number" value="4111111111111111">',
      ].join('')
    );

    const result = await buildPreparedSnapshotDocument({ iframeTimeoutMs: 20 });

    expect(result.html).toContain('data-sniptale-static-annotation="true"');
    expect(result.html).toContain('Prepared annotation');
    expect(result.html).not.toContain('<script');
    expect(result.html).not.toContain('onclick=');
    expect(result.html).not.toContain('javascript:alert');
    expect(result.html).not.toContain('formaction=');
    expect(result.html).not.toContain('prepared-csrf-secret');
    expect(result.html).not.toContain('prepared-password');
    expect(result.html).not.toContain('4111111111111111');
    expect(result.html).not.toContain('tracker.example');
    expect(result.html).not.toContain('data:text/html');
    expect(result.html).not.toContain('srcdoc=');
    expect(result.html).toContain('var(--snapshot-color)');
    expect(result.html).not.toContain('expression');
    expect(result.html).toContain('color: blue');
    expect(result.document.querySelector('meta[http-equiv="refresh"]')).toBeNull();
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: PreparedSnapshotWarningKind.SanitizerDrop }),
      ])
    );
  });

  it('retains inline SVG CSS masks until the asset capture stage can sanitize them', async () => {
    const mask =
      'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M1%201h8v8z%22%2F%3E%3C%2Fsvg%3E';
    document.head.innerHTML = `<style>.icon { mask-image: url("${mask}"); background: #222; }</style>`;
    document.body.innerHTML = '<span class="icon"></span>';

    const result = await buildPreparedSnapshotDocument({
      iframeTimeoutMs: 20,
      preserveAssetUrls: true,
    });

    expect(result.html).toContain('mask-image: url("data:image/svg+xml');
    expect(result.html).not.toContain('mask-image: ;');
  });

  it('freezes defined custom-element CSS state in the serialized document', async () => {
    const elementName = `snapshot-defined-${crypto.randomUUID()}`;
    customElements.define(elementName, class extends HTMLElement {});
    document.head.innerHTML = `<style>${elementName}:defined { display: block; }</style>`;
    document.body.innerHTML = [
      `<${elementName} data-sniptale-custom-element-undefined>Defined content</${elementName}>`,
      '<button data-sniptale-custom-element-undefined>Native control</button>',
    ].join('');

    const result = await buildPreparedSnapshotDocument({ iframeTimeoutMs: 20 });

    expect(result.html).toContain(`<${elementName}>Defined content</${elementName}>`);
    expect(result.html).toContain(
      `${elementName}:not([data-sniptale-custom-element-undefined]) {display: block;}`
    );
    expect(result.html).not.toContain('<button data-sniptale-custom-element-undefined');
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
  registerRuntimeHostSnapshotTests();
  registerScrollStateSnapshotTests();
  registerSanitizerSnapshotTests();
  registerResponsiveAssetSnapshotTests();
});
