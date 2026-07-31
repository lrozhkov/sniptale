// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  initializeContentUiRoots,
  queryContentUiElement,
  registerContentOwnedPassiveChrome,
} from '../../platform/dom-host';
import {
  FLOATING_INTERACTION_OWNED_BY_ATTRIBUTE,
  FLOATING_INTERACTION_OWNER_ID_ATTRIBUTE,
} from '@sniptale/ui/floating-interactions/ownership';

vi.mock('../../platform/trusted-events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/trusted-events')>()),
  isTrustedKeyboardEvent: vi.fn(() => true),
  isTrustedMouseEvent: vi.fn(() => true),
}));

import { startDesignReviewPicker, type DesignReviewPickerRuntime } from './picker';
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

function expectFrameSummary(tagName: string): void {
  expect(queryContentUiElement('.sniptale-design-review-frame-summary')?.textContent).toMatch(
    new RegExp(`^${tagName}`)
  );
}

let pickerRuntime: DesignReviewPickerRuntime | null = null;

function startPicker(
  overrides: Partial<Parameters<typeof startDesignReviewPicker>[0]> = {}
): DesignReviewPickerRuntime {
  pickerRuntime = startDesignReviewPicker({
    onDisableRequested: vi.fn(),
    onInspectorDismissRequested: vi.fn(() => true),
    onSelection: vi.fn(),
    ...overrides,
  });
  return pickerRuntime;
}

beforeEach(() => {
  document.body.replaceChildren();
  inaccessibleIframeMocks.onSelect = null;
});

afterEach(() => {
  pickerRuntime?.dispose();
  pickerRuntime = null;
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
  startPicker({ onSelection });

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

it('keeps the preview frame pinned to the selected element while its inspector is open', () => {
  const contentHost = document.createElement('div');
  document.body.append(contentHost);
  initializeContentUiRoots(contentHost.attachShadow({ mode: 'open' }));
  const selected = makeVisible(document.createElement('button'));
  const hovered = makeVisible(document.createElement('article'));
  document.body.append(selected, hovered);
  startPicker();

  selected.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: 24,
      clientY: 36,
      composed: true,
    })
  );
  hovered.dispatchEvent(
    new MouseEvent('mousemove', {
      bubbles: true,
      clientX: 24,
      clientY: 36,
      composed: true,
    })
  );

  expectFrameSummary('button');
});

it('dismisses the inspector on a page click, consumes that click, and resumes hover preview', () => {
  const contentHost = document.createElement('div');
  document.body.append(contentHost);
  initializeContentUiRoots(contentHost.attachShadow({ mode: 'open' }));
  const selected = makeVisible(document.createElement('button'));
  const outside = makeVisible(document.createElement('article'));
  const nextHover = makeVisible(document.createElement('section'));
  document.body.append(selected, outside, nextHover);
  const onInspectorDismissRequested = vi.fn(() => true);
  const onSelection = vi.fn();
  startPicker({ onInspectorDismissRequested, onSelection });
  selected.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  const outsideClick = new MouseEvent('click', { bubbles: true, cancelable: true });
  outside.dispatchEvent(outsideClick);

  expect(onInspectorDismissRequested).toHaveBeenCalledOnce();
  expect(onSelection).toHaveBeenCalledOnce();
  expect(outsideClick.defaultPrevented).toBe(true);
  expectFrameSummary('article');

  nextHover.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
  expectFrameSummary('section');
});

it('keeps the inspector and pinned frame when automatic comment save rejects dismissal', () => {
  const contentHost = document.createElement('div');
  document.body.append(contentHost);
  initializeContentUiRoots(contentHost.attachShadow({ mode: 'open' }));
  const selected = makeVisible(document.createElement('button'));
  const outside = makeVisible(document.createElement('article'));
  document.body.append(selected, outside);
  const onInspectorDismissRequested = vi.fn(() => false);
  startPicker({ onInspectorDismissRequested });
  selected.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  const outsideClick = new MouseEvent('click', { bubbles: true, cancelable: true });
  outside.dispatchEvent(outsideClick);
  outside.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));

  expect(onInspectorDismissRequested).toHaveBeenCalledOnce();
  expect(outsideClick.defaultPrevented).toBe(true);
  expectFrameSummary('button');
});

it('keeps inspector interactions inside the popover without requesting dismissal', () => {
  const contentHost = document.createElement('div');
  const contentRoot = contentHost.attachShadow({ mode: 'open' });
  initializeContentUiRoots(contentRoot);
  document.body.append(contentHost);
  const popover = document.createElement('aside');
  popover.dataset['ui'] = 'content.design-review.popover';
  const control = document.createElement('button');
  popover.append(control);
  const outsideControl = document.createElement('button');
  contentRoot.append(popover, outsideControl);
  const selected = makeVisible(document.createElement('button'));
  document.body.append(selected);
  const onInspectorDismissRequested = vi.fn(() => true);
  startPicker({ onInspectorDismissRequested });
  selected.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  control.dispatchEvent(
    new MouseEvent('click', { bubbles: true, cancelable: true, composed: true })
  );

  expect(onInspectorDismissRequested).not.toHaveBeenCalled();

  const outsideClick = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  outsideControl.dispatchEvent(outsideClick);

  expect(onInspectorDismissRequested).toHaveBeenCalledOnce();
  expect(outsideClick.defaultPrevented).toBe(false);
});

it('keeps feedback and marker clicks inside the Design Review dismissal boundary', () => {
  const contentHost = document.createElement('div');
  const contentRoot = contentHost.attachShadow({ mode: 'open' });
  initializeContentUiRoots(contentRoot);
  document.body.append(contentHost);
  const feedbackPanel = document.createElement('aside');
  feedbackPanel.dataset['ui'] = 'content.design-review.feedback-panel';
  const feedbackItem = document.createElement('button');
  feedbackPanel.append(feedbackItem);
  const marker = document.createElement('div');
  marker.dataset['ui'] = 'content.annotation-marker';
  const markerButton = document.createElement('button');
  marker.append(markerButton);
  contentRoot.append(feedbackPanel, marker);
  const selected = makeVisible(document.createElement('button'));
  document.body.append(selected);
  const onInspectorDismissRequested = vi.fn(() => true);
  const runtime = startPicker({ onInspectorDismissRequested });

  for (const trigger of [feedbackItem, markerButton]) {
    expect(runtime.selectElement(selected)).toBe(true);
    trigger.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, composed: true })
    );
  }

  expect(onInspectorDismissRequested).not.toHaveBeenCalled();
});

it('keeps portaled settings controls owned by the inspector inside its dismissal boundary', () => {
  const contentHost = document.createElement('div');
  const contentRoot = contentHost.attachShadow({ mode: 'open' });
  initializeContentUiRoots(contentRoot);
  document.body.append(contentHost);
  const popover = document.createElement('aside');
  popover.dataset['ui'] = 'content.design-review.popover';
  const owner = document.createElement('div');
  owner.setAttribute(FLOATING_INTERACTION_OWNER_ID_ATTRIBUTE, 'review-color');
  popover.append(owner);
  const portaledControl = document.createElement('button');
  portaledControl.setAttribute(FLOATING_INTERACTION_OWNED_BY_ATTRIBUTE, 'review-color');
  contentRoot.append(popover, portaledControl);
  const selected = makeVisible(document.createElement('button'));
  document.body.append(selected);
  const onInspectorDismissRequested = vi.fn(() => true);
  startPicker({ onInspectorDismissRequested });
  selected.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  portaledControl.dispatchEvent(
    new MouseEvent('click', { bubbles: true, cancelable: true, composed: true })
  );

  expect(onInspectorDismissRequested).not.toHaveBeenCalled();
});

it('selects the visible label proxy for an opacity-hidden checkbox menu trigger', () => {
  const input = makeVisible(document.createElement('input'));
  input.type = 'checkbox';
  input.id = 'p-lang-btn-checkbox';
  input.setAttribute('role', 'button');
  input.style.opacity = '0';
  const label = makeVisible(document.createElement('label'));
  label.htmlFor = input.id;
  label.textContent = '152 languages';
  document.body.append(input, label);
  const onSelection = vi.fn();
  startPicker({ onSelection });

  input.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: 24,
      clientY: 36,
      composed: true,
    })
  );

  expect(onSelection).toHaveBeenCalledOnce();
  expect(onSelection.mock.calls[0]?.[0].snapshot.element).toBe(label);
});

it('opens the exact live DOM element near its trailing-edge marker', () => {
  const target = makeVisible(document.createElement('button'));
  document.body.append(target);
  const onSelection = vi.fn();
  const runtime = startPicker({ onSelection });

  expect(runtime.selectElement(target)).toBe(true);
  expect(onSelection).toHaveBeenCalledWith(
    expect.objectContaining({
      anchor: { x: 92, y: 54 },
      snapshot: expect.objectContaining({ element: target }),
    })
  );
});

it('selects a closed shadow host instead of its inaccessible descendant', () => {
  const host = makeVisible(document.createElement('article'));
  const root = host.attachShadow({ mode: 'closed' });
  const target = makeVisible(document.createElement('button'));
  root.append(target);
  document.body.append(host);
  const onSelection = vi.fn();
  startPicker({ onSelection });

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
  startPicker({ onSelection });

  control.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      composed: true,
    })
  );

  expect(onSelection).not.toHaveBeenCalled();
});

it('defers Escape to the highest open Design Review layer before disabling the mode', () => {
  const contentHost = document.createElement('div');
  const contentRoot = contentHost.attachShadow({ mode: 'open' });
  initializeContentUiRoots(contentRoot);
  const panel = document.createElement('aside');
  panel.dataset['ui'] = 'content.design-review.feedback-panel';
  contentRoot.append(panel);
  document.body.append(contentHost);
  const onDisableRequested = vi.fn();
  startPicker({ onDisableRequested });

  document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
  expect(onDisableRequested).not.toHaveBeenCalled();

  panel.remove();
  const actionMenu = document.createElement('div');
  actionMenu.dataset['ui'] = 'content.design-review.action-menu';
  contentRoot.append(actionMenu);
  document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
  expect(onDisableRequested).not.toHaveBeenCalled();

  actionMenu.remove();
  document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
  expect(onDisableRequested).toHaveBeenCalledOnce();
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
  startPicker({ onSelection });

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
  const runtime = startPicker();

  expect(queryContentUiElement('.sniptale-design-review-frame')).not.toBeNull();
  expect(document.getElementById('sniptale-design-review-cursor-style')).not.toBeNull();

  runtime.dispose();
  pickerRuntime = null;
  expect(queryContentUiElement('.sniptale-design-review-frame')).toBeNull();
  expect(document.getElementById('sniptale-design-review-cursor-style')).toBeNull();
});

it('selects the exact element from an accessible same-origin iframe', () => {
  const iframe = makeVisible(document.createElement('iframe'));
  document.body.append(iframe);
  const target = makeVisible(
    iframe.contentDocument!.createElementNS('http://www.w3.org/2000/svg', 'rect')
  );
  iframe.contentDocument!.body.append(target);
  const onSelection = vi.fn();
  startPicker({ onSelection });

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
  startPicker({ onSelection });

  inaccessibleIframeMocks.onSelect?.(innerIframe);

  expect(onSelection).toHaveBeenCalledOnce();
  expect(onSelection.mock.calls[0]?.[0]).toMatchObject({
    anchor: { x: 302, y: 272 },
    snapshot: { element: innerIframe },
  });
});

it('restores inaccessible iframe preview after dismissal and keeps the pin when dismissal fails', () => {
  const contentHost = document.createElement('div');
  document.body.append(contentHost);
  initializeContentUiRoots(contentHost.attachShadow({ mode: 'open' }));
  const selected = makeVisible(document.createElement('button'));
  const iframe = makeVisible(document.createElement('iframe'));
  document.body.append(selected, iframe);
  const onInspectorDismissRequested = vi.fn(() => false);
  const onSelection = vi.fn();
  startPicker({ onInspectorDismissRequested, onSelection });
  selected.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  inaccessibleIframeMocks.onSelect?.(iframe);

  expect(onInspectorDismissRequested).toHaveBeenCalledOnce();
  expect(onSelection).toHaveBeenCalledOnce();
  expectFrameSummary('button');

  onInspectorDismissRequested.mockReturnValue(true);
  inaccessibleIframeMocks.onSelect?.(iframe);

  expect(onInspectorDismissRequested).toHaveBeenCalledTimes(2);
  expect(onSelection).toHaveBeenCalledOnce();
  expectFrameSummary('iframe');
});
