// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

const iframeUtils = vi.hoisted(() => ({
  resolveIframeEventElement: vi.fn(),
  resolveIframePointTarget: vi.fn(),
}));

vi.mock('../../../platform/frame', () => iframeUtils);

import { CONTENT_ROOT_ID } from '@sniptale/ui/branding';
import { initializeContentUiRoots } from '../../../platform/dom-host';
import { resolvePagePreparationElement, resolvePagePreparationTarget } from '.';

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  document.body.replaceChildren();
});

function createPointEvent(target: Element): MouseEvent {
  const event = new MouseEvent('click', {
    clientX: 20,
    clientY: 30,
  });
  Object.defineProperty(event, 'target', {
    configurable: true,
    value: target,
  });
  return event;
}

function mockElementsFromPoint(elements: Element[]): void {
  Object.defineProperty(document, 'elementsFromPoint', {
    configurable: true,
    value: vi.fn(() => elements),
  });
}

function registerStableTargetTests(): void {
  it('returns ordinary and dialog targets without backdrop bypass', () => {
    const ordinaryTarget = document.createElement('button');
    const dialog = document.createElement('div');
    dialog.className = 'gwt-DialogBox';
    const dialogButton = document.createElement('button');
    dialog.append(dialogButton);

    iframeUtils.resolveIframeEventElement.mockReturnValueOnce(ordinaryTarget);
    expect(resolvePagePreparationTarget(createPointEvent(ordinaryTarget))).toBe(ordinaryTarget);

    iframeUtils.resolveIframeEventElement.mockReturnValueOnce(dialogButton);
    expect(resolvePagePreparationTarget(createPointEvent(dialogButton))).toBe(dialogButton);
  });
}

function registerBackdropBypassTest(): void {
  it('resolves Naumen modal backdrop to the first underlying page element', () => {
    const backdrop = document.createElement('div');
    backdrop.className = 'b-lightbox-form__darkening';
    const dialog = document.createElement('div');
    dialog.className = 'gwt-DialogBox';
    const pageTarget = document.createElement('span');
    const event = createPointEvent(backdrop);

    mockElementsFromPoint([backdrop, dialog, pageTarget, document.body]);
    iframeUtils.resolveIframeEventElement.mockReturnValue(backdrop);

    expect(resolvePagePreparationTarget(event)).toBe(pageTarget);
  });
}

function registerOwnedContentSkipTest(): void {
  it('does not resolve backdrop clicks into Sniptale-owned shadow content', () => {
    const host = document.createElement('div');
    host.id = CONTENT_ROOT_ID;
    document.body.append(host);
    const shadowRoot = host.attachShadow({ mode: 'open' });
    initializeContentUiRoots(shadowRoot);
    const ownedButton = document.createElement('button');
    shadowRoot.append(ownedButton);
    const backdrop = document.createElement('div');
    backdrop.className = 'b-lightbox-form__darkening';
    const pageTarget = document.createElement('span');
    const event = createPointEvent(backdrop);

    mockElementsFromPoint([backdrop, ownedButton, pageTarget]);
    iframeUtils.resolveIframeEventElement.mockReturnValue(backdrop);

    expect(resolvePagePreparationTarget(event)).toBe(pageTarget);
  });
}

function registerUniversalElementTests(): void {
  it('returns SVG targets through the universal element contract', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    svg.append(circle);
    document.body.append(svg);
    const event = createPointEvent(svg);
    iframeUtils.resolveIframeEventElement.mockReturnValue(circle);

    expect(resolvePagePreparationElement(event)).toBe(circle);
    expect(resolvePagePreparationTarget(event)).toBeNull();
  });

  it('passes through owned frame chrome to the underlying page element', () => {
    const host = document.createElement('div');
    host.id = CONTENT_ROOT_ID;
    document.body.append(host);
    const shadowRoot = host.attachShadow({ mode: 'open' });
    initializeContentUiRoots(shadowRoot);
    const frameChrome = document.createElement('div');
    frameChrome.className = 'sniptale-interactive-frame';
    shadowRoot.append(frameChrome);
    const pageTarget = document.createElement('button');
    document.body.append(pageTarget);
    const event = createPointEvent(frameChrome);

    mockElementsFromPoint([frameChrome, pageTarget]);
    iframeUtils.resolveIframeEventElement.mockReturnValue(frameChrome);

    expect(resolvePagePreparationElement(event, undefined, { passThroughFrameChrome: true })).toBe(
      pageTarget
    );
  });

  it('keeps owned inspector controls selected when frame pass-through is enabled', () => {
    const host = document.createElement('div');
    host.id = CONTENT_ROOT_ID;
    document.body.append(host);
    const shadowRoot = host.attachShadow({ mode: 'open' });
    initializeContentUiRoots(shadowRoot);
    const inspectorButton = document.createElement('button');
    inspectorButton.className = 'sniptale-page-style-inspector-control';
    shadowRoot.append(inspectorButton);
    const pageTarget = document.createElement('div');
    document.body.append(pageTarget);
    const event = createPointEvent(inspectorButton);

    mockElementsFromPoint([inspectorButton, pageTarget]);
    iframeUtils.resolveIframeEventElement.mockReturnValue(inspectorButton);

    expect(resolvePagePreparationElement(event, undefined, { passThroughFrameChrome: true })).toBe(
      inspectorButton
    );
  });
}

describe('page preparation target resolution', () => {
  registerStableTargetTests();
  registerBackdropBypassTest();
  registerOwnedContentSkipTest();
  registerUniversalElementTests();
});
