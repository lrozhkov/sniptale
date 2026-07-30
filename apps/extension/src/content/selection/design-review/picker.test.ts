// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  initializeContentUiRoots,
  queryContentUiElement,
  registerContentOwnedPassiveChrome,
} from '../../platform/dom-host';

vi.mock('../../platform/trusted-events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/trusted-events')>()),
  isTrustedKeyboardEvent: vi.fn(() => true),
  isTrustedMouseEvent: vi.fn(() => true),
}));

import { startDesignReviewPicker } from './picker';
import { showDesignReviewFrame } from './frame';

const inaccessibleIframeMocks = vi.hoisted(() => ({
  onSelect: null as ((iframe: HTMLIFrameElement) => void) | null,
}));

vi.mock('./inaccessible-iframe', () => ({
  addInaccessibleIframeSelectionListener: vi.fn((onSelect: (iframe: HTMLIFrameElement) => void) => {
    inaccessibleIframeMocks.onSelect = onSelect;
    return () => {
      inaccessibleIframeMocks.onSelect = null;
    };
  }),
}));

function makeVisible<T extends Element>(element: T): T {
  const rect = DOMRect.fromRect({ height: 32, width: 96, x: 20, y: 30 });
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => rect,
  });
  Object.defineProperty(element, 'getClientRects', {
    configurable: true,
    value: () => ({
      0: rect,
      [Symbol.iterator]: () => [rect][Symbol.iterator](),
      item: (index: number) => (index === 0 ? rect : null),
      length: 1,
    }),
  });
  return element;
}

let cleanup: (() => void) | null = null;

beforeEach(() => {
  document.body.replaceChildren();
  inaccessibleIframeMocks.onSelect = null;
});

afterEach(() => {
  cleanup?.();
  cleanup = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it('selects the exact rendered open-shadow DOM element and claims its click', () => {
  const host = makeVisible(document.createElement('article'));
  const root = host.attachShadow({ mode: 'open' });
  const target = makeVisible(document.createElement('button'));
  root.append(target);
  document.body.append(host);
  const onSelection = vi.fn();
  cleanup = startDesignReviewPicker({ onDisableRequested: vi.fn(), onSelection });

  const event = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    clientX: 24,
    clientY: 36,
    composed: true,
  });
  target.dispatchEvent(event);

  expect(onSelection).toHaveBeenCalledOnce();
  expect(onSelection.mock.calls[0]?.[0].snapshot.element).toBe(target);
  expect(event.defaultPrevented).toBe(true);
});

it('selects a closed shadow host instead of its inaccessible descendant', () => {
  const host = makeVisible(document.createElement('article'));
  const root = host.attachShadow({ mode: 'closed' });
  const target = makeVisible(document.createElement('button'));
  root.append(target);
  document.body.append(host);
  const onSelection = vi.fn();
  cleanup = startDesignReviewPicker({ onDisableRequested: vi.fn(), onSelection });

  target.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: 24,
      clientY: 36,
      composed: true,
    })
  );

  expect(onSelection).toHaveBeenCalledOnce();
  expect(onSelection.mock.calls[0]?.[0].snapshot.element).toBe(host);
});

it('ignores extension-owned controls instead of annotating the review UI', () => {
  const contentHost = document.createElement('div');
  const contentRoot = contentHost.attachShadow({ mode: 'open' });
  initializeContentUiRoots(contentRoot);
  const control = makeVisible(document.createElement('button'));
  contentRoot.append(control);
  document.body.append(contentHost);
  const onSelection = vi.fn();
  cleanup = startDesignReviewPicker({ onDisableRequested: vi.fn(), onSelection });

  control.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      composed: true,
    })
  );

  expect(onSelection).not.toHaveBeenCalled();
});

it('fails closed on a registered annotation marker instead of selecting the page below it', () => {
  const pageTarget = makeVisible(document.createElement('main'));
  document.body.append(pageTarget);
  const contentHost = document.createElement('div');
  const contentRoot = contentHost.attachShadow({ mode: 'open' });
  initializeContentUiRoots(contentRoot);
  const marker = makeVisible(document.createElement('span'));
  marker.className = 'sniptale-annotation-marker-note';
  const unregisterMarker = registerContentOwnedPassiveChrome(marker);
  contentRoot.append(marker);
  document.body.append(contentHost);
  Object.defineProperty(document, 'elementsFromPoint', {
    configurable: true,
    value: vi.fn(() => [marker, pageTarget]),
  });
  const onSelection = vi.fn();
  cleanup = startDesignReviewPicker({ onDisableRequested: vi.fn(), onSelection });

  marker.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: 24,
      clientY: 36,
      composed: true,
    })
  );

  expect(onSelection).not.toHaveBeenCalled();
  unregisterMarker();
});

it('removes the picker frame node on teardown', () => {
  const contentHost = document.createElement('div');
  document.body.append(contentHost);
  initializeContentUiRoots(contentHost.attachShadow({ mode: 'open' }));
  const target = makeVisible(document.createElement('button'));
  document.body.append(target);
  showDesignReviewFrame(target);
  cleanup = startDesignReviewPicker({ onDisableRequested: vi.fn(), onSelection: vi.fn() });

  expect(queryContentUiElement('.sniptale-design-review-frame')).not.toBeNull();

  cleanup();
  cleanup = null;
  expect(queryContentUiElement('.sniptale-design-review-frame')).toBeNull();
});

it('selects the exact element from an accessible same-origin iframe', () => {
  const iframe = makeVisible(document.createElement('iframe'));
  document.body.append(iframe);
  const target = makeVisible(
    iframe.contentDocument!.createElementNS('http://www.w3.org/2000/svg', 'rect')
  );
  iframe.contentDocument!.body.append(target);
  const onSelection = vi.fn();
  cleanup = startDesignReviewPicker({ onDisableRequested: vi.fn(), onSelection });

  target.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: 8,
      clientY: 10,
    })
  );

  expect(onSelection).toHaveBeenCalledOnce();
  expect(onSelection.mock.calls[0]?.[0].snapshot.element).toBe(target);
});

it('anchors an inaccessible iframe through nested rendered scale in the top viewport', () => {
  const outerIframe = document.createElement('iframe');
  document.body.append(outerIframe);
  const innerIframe = outerIframe.contentDocument!.createElement('iframe');
  outerIframe.contentDocument!.body.append(innerIframe);
  Object.defineProperties(outerIframe, {
    clientLeft: { configurable: true, value: 3 },
    clientTop: { configurable: true, value: 4 },
    offsetHeight: { configurable: true, value: 120 },
    offsetWidth: { configurable: true, value: 160 },
  });
  Object.defineProperties(innerIframe, {
    offsetHeight: { configurable: true, value: 25 },
    offsetWidth: { configurable: true, value: 50 },
  });
  Object.defineProperty(outerIframe, 'getBoundingClientRect', {
    configurable: true,
    value: () => DOMRect.fromRect({ height: 240, width: 320, x: 100, y: 200 }),
  });
  Object.defineProperty(innerIframe, 'getBoundingClientRect', {
    configurable: true,
    value: () => DOMRect.fromRect({ height: 50, width: 100, x: 10, y: 20 }),
  });
  Object.defineProperty(innerIframe, 'getClientRects', {
    configurable: true,
    value: () => ({
      0: innerIframe.getBoundingClientRect(),
      [Symbol.iterator]: () => [innerIframe.getBoundingClientRect()][Symbol.iterator](),
      item: (index: number) => (index === 0 ? innerIframe.getBoundingClientRect() : null),
      length: 1,
    }),
  });
  const onSelection = vi.fn();
  cleanup = startDesignReviewPicker({ onDisableRequested: vi.fn(), onSelection });

  inaccessibleIframeMocks.onSelect?.(innerIframe);

  expect(onSelection).toHaveBeenCalledOnce();
  expect(onSelection.mock.calls[0]?.[0]).toMatchObject({
    anchor: { x: 150, y: 272 },
    snapshot: { element: innerIframe },
  });
});
