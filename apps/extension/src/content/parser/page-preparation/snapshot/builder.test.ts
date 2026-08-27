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
    expect(result.html).not.toContain('Runtime frame trigger');
    expect(result.html).not.toContain('Runtime trigger bridge');
    expect(result.html).not.toContain('Runtime callout handle');
    expect(result.html).not.toContain('Runtime callout settings');
    expect(result.html).not.toContain('Runtime step badge controls');
    expect(result.html).not.toContain('Runtime free-frame draft');
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
