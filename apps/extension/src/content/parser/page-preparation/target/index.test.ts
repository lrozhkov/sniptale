// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

const iframeUtils = vi.hoisted(() => ({
  resolveIframeEventTarget: vi.fn(),
}));

vi.mock('../../../platform/frame', () => iframeUtils);

import { CONTENT_ROOT_ID } from '@sniptale/ui/branding';
import { resolvePagePreparationTarget } from '.';

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  document.body.replaceChildren();
});

function createPointEvent(target: HTMLElement): MouseEvent {
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

    iframeUtils.resolveIframeEventTarget.mockReturnValueOnce(ordinaryTarget);
    expect(resolvePagePreparationTarget(createPointEvent(ordinaryTarget))).toBe(ordinaryTarget);

    iframeUtils.resolveIframeEventTarget.mockReturnValueOnce(dialogButton);
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
    iframeUtils.resolveIframeEventTarget.mockReturnValue(backdrop);

    expect(resolvePagePreparationTarget(event)).toBe(pageTarget);
  });
}

function registerOwnedContentSkipTest(): void {
  it('does not resolve backdrop clicks into Sniptale-owned shadow content', () => {
    const host = document.createElement('div');
    host.id = CONTENT_ROOT_ID;
    document.body.append(host);
    const shadowRoot = host.attachShadow({ mode: 'open' });
    const ownedButton = document.createElement('button');
    shadowRoot.append(ownedButton);
    const backdrop = document.createElement('div');
    backdrop.className = 'b-lightbox-form__darkening';
    const pageTarget = document.createElement('span');
    const event = createPointEvent(backdrop);

    mockElementsFromPoint([backdrop, ownedButton, pageTarget]);
    iframeUtils.resolveIframeEventTarget.mockReturnValue(backdrop);

    expect(resolvePagePreparationTarget(event)).toBe(pageTarget);
  });
}

describe('page preparation target resolution', () => {
  registerStableTargetTests();
  registerBackdropBypassTest();
  registerOwnedContentSkipTest();
});
