// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

const iframeUtils = vi.hoisted(() => ({
  resolveIframeEventElement: vi.fn(),
  resolveIframePointTarget: vi.fn(),
}));

vi.mock('../../../platform/frame', () => iframeUtils);

import { CONTENT_ROOT_ID } from '@sniptale/ui/branding';
import {
  initializeContentUiRoots,
  PASSIVE_CONTENT_CHROME,
  registerContentOwnedPassiveChrome,
} from '../../../platform/dom-host';
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

function forgePassiveContentChromeProjection<T extends Element>(element: T): T {
  Object.entries(PASSIVE_CONTENT_CHROME).forEach(([name, value]) => {
    element.setAttribute(name, value);
  });
  return element;
}

function registerPassiveContentChrome<T extends Element>(element: T): T {
  registerContentOwnedPassiveChrome(element);
  return element;
}

function mountOwnedElement<T extends Element>(element: T): { element: T; host: HTMLDivElement } {
  const host = document.createElement('div');
  host.id = CONTENT_ROOT_ID;
  document.body.append(host);
  const shadowRoot = host.attachShadow({ mode: 'open' });
  initializeContentUiRoots(shadowRoot);
  shadowRoot.append(element);
  return { element, host };
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

  it.each(['frame', 'annotation'])('passes through owned passive %s chrome', (kind) => {
    const frameChrome = registerPassiveContentChrome(document.createElement('div'));
    frameChrome.className = `sniptale-${kind}-chrome`;
    mountOwnedElement(frameChrome);
    const pageTarget =
      kind === 'annotation'
        ? document.createElementNS('http://www.w3.org/2000/svg', 'rect')
        : document.createElement('button');
    document.body.append(pageTarget);
    const event = createPointEvent(frameChrome);

    mockElementsFromPoint([frameChrome, pageTarget]);
    iframeUtils.resolveIframeEventElement.mockReturnValue(frameChrome);

    expect(
      resolvePagePreparationElement(event, undefined, { passThroughPassiveChrome: true })
    ).toBe(pageTarget);
  });

  it.each([
    ['inspector', 'sniptale-page-style-inspector-control'],
    ['toolbar', 'sniptale-toolbar-control'],
    ['resize handle', 'sniptale-resize-handle'],
    ['interactive popover', 'sniptale-frame-popover'],
  ])('keeps owned %s controls interactive', (_kind, className) => {
    const inspectorButton = forgePassiveContentChromeProjection(document.createElement('button'));
    inspectorButton.className = className;
    mountOwnedElement(inspectorButton);
    const pageTarget = document.createElement('div');
    document.body.append(pageTarget);
    const event = createPointEvent(inspectorButton);

    mockElementsFromPoint([inspectorButton, pageTarget]);
    iframeUtils.resolveIframeEventElement.mockReturnValue(inspectorButton);

    expect(
      resolvePagePreparationElement(event, undefined, { passThroughPassiveChrome: true })
    ).toBe(inspectorButton);
  });

  it('passes through a registered marker note without trusting a page marker lookalike', () => {
    const markerNote = registerPassiveContentChrome(document.createElement('span'));
    markerNote.className = 'sniptale-annotation-marker-note';
    markerNote.setAttribute('role', 'note');
    mountOwnedElement(markerNote);
    const pageTarget = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    document.body.append(pageTarget);
    const markerEvent = createPointEvent(markerNote);
    mockElementsFromPoint([markerNote, pageTarget]);
    iframeUtils.resolveIframeEventElement.mockReturnValueOnce(markerNote);

    expect(
      resolvePagePreparationElement(markerEvent, undefined, { passThroughPassiveChrome: true })
    ).toBe(pageTarget);

    const pageLookalike = forgePassiveContentChromeProjection(document.createElement('span'));
    pageLookalike.className = markerNote.className;
    pageLookalike.setAttribute('role', 'note');
    document.body.append(pageLookalike);
    const lookalikeEvent = createPointEvent(pageLookalike);
    mockElementsFromPoint([pageLookalike, pageTarget]);
    iframeUtils.resolveIframeEventElement.mockReturnValueOnce(pageLookalike);

    expect(
      resolvePagePreparationElement(lookalikeEvent, undefined, { passThroughPassiveChrome: true })
    ).toBe(pageLookalike);
  });

  it('does not inherit pass-through from a passive ancestor', () => {
    const passiveChrome = registerPassiveContentChrome(document.createElement('div'));
    const nestedControl = forgePassiveContentChromeProjection(document.createElement('button'));
    passiveChrome.append(nestedControl);
    mountOwnedElement(passiveChrome);
    const pageTarget = document.createElement('div');
    document.body.append(pageTarget);
    const event = createPointEvent(nestedControl);
    mockElementsFromPoint([nestedControl, passiveChrome, pageTarget]);
    iframeUtils.resolveIframeEventElement.mockReturnValue(nestedControl);

    expect(
      resolvePagePreparationElement(event, undefined, { passThroughPassiveChrome: true })
    ).toBe(nestedControl);
  });

  it('never trusts passive classes or attributes on page-owned lookalikes', () => {
    const classLookalike = document.createElement('div');
    classLookalike.className = 'sniptale-interactive-frame';
    const attributeLookalike = forgePassiveContentChromeProjection(document.createElement('div'));
    document.body.append(classLookalike, attributeLookalike);
    const pageBehind = document.createElement('button');
    document.body.append(pageBehind);

    for (const lookalike of [classLookalike, attributeLookalike]) {
      const event = createPointEvent(lookalike);
      mockElementsFromPoint([lookalike, pageBehind]);
      iframeUtils.resolveIframeEventElement.mockReturnValueOnce(lookalike);
      expect(
        resolvePagePreparationElement(event, undefined, { passThroughPassiveChrome: true })
      ).toBe(lookalike);
    }
  });

  it('fails closed for passive chrome in a retired former content host', () => {
    const passiveChrome = registerPassiveContentChrome(document.createElement('div'));
    const { host } = mountOwnedElement(passiveChrome);
    const pageTarget = document.createElement('button');
    document.body.append(pageTarget);
    host.remove();
    document.body.append(host);
    const event = createPointEvent(passiveChrome);
    mockElementsFromPoint([passiveChrome, pageTarget]);
    iframeUtils.resolveIframeEventElement.mockReturnValue(passiveChrome);

    expect(
      resolvePagePreparationElement(event, undefined, { passThroughPassiveChrome: true })
    ).toBe(passiveChrome);
  });

  it('resolves passive chrome through same-origin iframe internals and stops at cross-origin iframe', () => {
    const passiveChrome = registerPassiveContentChrome(document.createElement('div'));
    mountOwnedElement(passiveChrome);
    const iframe = document.createElement('iframe');
    document.body.append(iframe);
    const innerTarget = iframe.contentDocument!.createElementNS(
      'http://www.w3.org/2000/svg',
      'text'
    );
    const event = createPointEvent(passiveChrome);
    mockElementsFromPoint([passiveChrome, iframe]);
    iframeUtils.resolveIframeEventElement.mockReturnValue(passiveChrome);
    iframeUtils.resolveIframePointTarget
      .mockReturnValueOnce(innerTarget)
      .mockReturnValueOnce(iframe);

    expect(
      resolvePagePreparationElement(event, undefined, { passThroughPassiveChrome: true })
    ).toBe(innerTarget);
    expect(
      resolvePagePreparationElement(event, undefined, { passThroughPassiveChrome: true })
    ).toBe(iframe);
    expect(iframeUtils.resolveIframePointTarget).toHaveBeenCalledTimes(2);
  });
}

describe('page preparation target resolution', () => {
  registerStableTargetTests();
  registerBackdropBypassTest();
  registerOwnedContentSkipTest();
  registerUniversalElementTests();
});
