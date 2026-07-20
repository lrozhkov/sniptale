// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CONTENT_APP_CONTAINER_ID,
  CONTENT_OVERLAY_ROOT_ID,
  CONTENT_ROOT_ID,
} from '@sniptale/ui/branding';
import { resolveAiPickInteractionTarget } from './runtime';

function mockElementsFromPoint(elements: Element[]) {
  Object.defineProperty(document, 'elementsFromPoint', {
    configurable: true,
    value: vi.fn(() => elements),
  });
}

function createIframeTargetWithInnerNode() {
  const iframe = document.createElement('iframe');
  document.body.appendChild(iframe);
  const iframeDoc = iframe.contentDocument;
  const iframeWindow = iframe.contentWindow;
  if (!iframeDoc || !iframeWindow) {
    throw new Error('Expected iframe document');
  }

  Object.defineProperty(iframeWindow, 'frameElement', {
    configurable: true,
    value: iframe,
  });

  const innerTarget = iframeDoc.createElement('div');
  innerTarget.textContent = 'Inner field';
  iframeDoc.body.appendChild(innerTarget);
  Object.defineProperty(iframeDoc, 'elementFromPoint', {
    configurable: true,
    value: vi.fn(() => innerTarget),
  });

  return { iframe, innerTarget };
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('ai-pick interaction target resolution', () => {
  it('pierces interactive frame overlays and resolves the underlying page target', () => {
    const overlay = document.createElement('div');
    overlay.className = 'sniptale-blocking-overlay';
    const underlying = document.createElement('div');
    underlying.dataset['testid'] = 'page-target';
    document.body.append(overlay, underlying);

    mockElementsFromPoint([overlay, underlying]);

    const event = {
      clientX: 120,
      clientY: 80,
      composedPath: () => [overlay],
      target: overlay,
    } as unknown as MouseEvent;

    expect(resolveAiPickInteractionTarget(event)).toBe(underlying);
  });

  it('keeps real extension controls as the interaction target', () => {
    const toolbarButton = document.createElement('button');
    toolbarButton.className = 'sniptale-btn';
    const underlying = document.createElement('div');
    document.body.append(toolbarButton, underlying);

    mockElementsFromPoint([toolbarButton, underlying]);

    const event = {
      clientX: 120,
      clientY: 80,
      composedPath: () => [toolbarButton],
      target: toolbarButton,
    } as unknown as MouseEvent;

    expect(resolveAiPickInteractionTarget(event)).toBe(toolbarButton);
  });
});

describe('ai-pick iframe target resolution', () => {
  it('resolves inner iframe nodes instead of treating the iframe as a single blob', () => {
    const { iframe, innerTarget } = createIframeTargetWithInnerNode();

    const event = {
      clientX: 20,
      clientY: 12,
      target: iframe,
      composedPath: () => [iframe],
    } as unknown as MouseEvent;

    expect(resolveAiPickInteractionTarget(event)).toBe(innerTarget);
  });
});

describe('ai-pick shadow-host overlay passthrough', () => {
  it('resolves retargeted shadow-host clicks through frame overlays to the page target', () => {
    const host = document.createElement('div');
    host.id = CONTENT_ROOT_ID;
    const shadowRoot = host.attachShadow({ mode: 'open' });
    const overlay = document.createElement('div');
    overlay.className = 'sniptale-blocking-overlay';
    shadowRoot.appendChild(overlay);
    const underlying = document.createElement('div');
    document.body.append(host, underlying);

    mockElementsFromPoint([host, underlying]);
    Object.defineProperty(shadowRoot, 'elementsFromPoint', {
      configurable: true,
      value: vi.fn(() => [overlay]),
    });

    const event = {
      clientX: 40,
      clientY: 40,
      composedPath: () => [host],
      target: host,
    } as unknown as MouseEvent;

    expect(resolveAiPickInteractionTarget(event)).toBe(underlying);
  });
});

describe('ai-pick shadow-host frame root passthrough', () => {
  it('pierces frame root scaffolding wrappers to the page target', () => {
    const host = document.createElement('div');
    host.id = CONTENT_ROOT_ID;
    const shadowRoot = host.attachShadow({ mode: 'open' });
    const frameRoot = document.createElement('div');
    frameRoot.id = 'frame-container-test-frame';
    shadowRoot.appendChild(frameRoot);
    const underlying = document.createElement('div');
    document.body.append(host, underlying);

    mockElementsFromPoint([host, underlying]);
    Object.defineProperty(shadowRoot, 'elementsFromPoint', {
      configurable: true,
      value: vi.fn(() => [frameRoot]),
    });

    const event = {
      clientX: 40,
      clientY: 40,
      composedPath: () => [host],
      target: host,
    } as unknown as MouseEvent;

    expect(resolveAiPickInteractionTarget(event)).toBe(underlying);
  });
});

describe('ai-pick shadow-host scaffold passthrough', () => {
  it('pierces content runtime scaffold roots to the page target', () => {
    const host = document.createElement('div');
    host.id = CONTENT_ROOT_ID;
    const shadowRoot = host.attachShadow({ mode: 'open' });
    const appRoot = document.createElement('div');
    appRoot.id = CONTENT_APP_CONTAINER_ID;
    const overlayRoot = document.createElement('div');
    overlayRoot.id = CONTENT_OVERLAY_ROOT_ID;
    shadowRoot.append(appRoot, overlayRoot);
    const underlying = document.createElement('div');
    document.body.append(host, underlying);

    mockElementsFromPoint([host, underlying]);
    Object.defineProperty(shadowRoot, 'elementsFromPoint', {
      configurable: true,
      value: vi.fn(() => [overlayRoot, appRoot]),
    });

    const event = {
      clientX: 40,
      clientY: 40,
      composedPath: () => [host],
      target: host,
    } as unknown as MouseEvent;

    expect(resolveAiPickInteractionTarget(event)).toBe(underlying);
  });
});

describe('ai-pick shadow-host toolbar passthrough', () => {
  it('keeps retargeted shadow-host clicks on toolbar controls inside extension UI', () => {
    const host = document.createElement('div');
    host.id = CONTENT_ROOT_ID;
    const shadowRoot = host.attachShadow({ mode: 'open' });
    const toolbarButton = document.createElement('button');
    toolbarButton.className = 'sniptale-btn';
    shadowRoot.appendChild(toolbarButton);
    const underlying = document.createElement('div');
    document.body.append(host, underlying);

    mockElementsFromPoint([host, underlying]);
    Object.defineProperty(shadowRoot, 'elementsFromPoint', {
      configurable: true,
      value: vi.fn(() => [toolbarButton]),
    });

    const event = {
      clientX: 40,
      clientY: 40,
      composedPath: () => [host],
      target: host,
    } as unknown as MouseEvent;

    expect(resolveAiPickInteractionTarget(event)).toBe(toolbarButton);
  });
});
