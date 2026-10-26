// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { initializeContentUiRoots, queryContentUiElement } from '../../platform/dom-host';
import {
  FLOATING_INTERACTION_OWNED_BY_ATTRIBUTE,
  FLOATING_INTERACTION_OWNER_ID_ATTRIBUTE,
} from '@sniptale/ui/floating-interactions/ownership';

vi.mock('../../platform/trusted-events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/trusted-events')>()),
  isTrustedKeyboardEvent: vi.fn(() => true),
  isTrustedMouseEvent: vi.fn(() => true),
  isTrustedPointerEvent: vi.fn(() => true),
}));

import { startDesignReviewPicker, type DesignReviewPickerRuntime } from './picker';

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
  expect(
    queryContentUiElement('.sniptale-design-review-frame-summary')?.textContent?.startsWith(tagName)
  ).toBe(true);
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
});

afterEach(() => {
  pickerRuntime?.dispose();
  pickerRuntime = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it('replaces the selected page target in one click for an independent tool', () => {
  const first = makeVisible(document.createElement('p'));
  const second = makeVisible(document.createElement('button'));
  document.body.append(first, second);
  const onSelection = vi.fn();
  const onInspectorDismissRequested = vi.fn(() => true);
  const picker = startPicker({
    onSelection,
    onInspectorDismissRequested,
    replaceSelectionOnClick: () => true,
  });
  picker.selectElement(first);
  second.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  expect(onSelection).toHaveBeenLastCalledWith(
    expect.objectContaining({ snapshot: expect.objectContaining({ element: second }) }),
    'page'
  );
  expect(onInspectorDismissRequested).not.toHaveBeenCalled();
});

it('leaves Escape from an inspector select menu to that floating layer', () => {
  const contentHost = document.createElement('div');
  const contentRoot = contentHost.attachShadow({ mode: 'open' });
  initializeContentUiRoots(contentRoot);
  document.body.append(contentHost);
  const panel = document.createElement('aside');
  panel.dataset['ui'] = 'content.design-review.tool-panel';
  const owner = document.createElement('div');
  owner.setAttribute(FLOATING_INTERACTION_OWNER_ID_ATTRIBUTE, 'review-weight');
  panel.append(owner);
  const menu = makeVisible(document.createElement('div'));
  menu.setAttribute(FLOATING_INTERACTION_OWNED_BY_ATTRIBUTE, 'review-weight');
  contentRoot.append(panel, menu);
  const selected = makeVisible(document.createElement('button'));
  document.body.append(selected);
  const dismiss = vi.fn(() => true);
  startPicker({ onInspectorDismissRequested: dismiss }).selectElement(selected);
  const escape = new KeyboardEvent('keydown', {
    key: 'Escape',
    bubbles: true,
    composed: true,
    cancelable: true,
  });
  menu.dispatchEvent(escape);
  expect(dismiss).not.toHaveBeenCalled();
  expect(escape.defaultPrevented).toBe(false);
});

it('keeps its previous selected frame when the mode rejects a target', () => {
  const host = document.createElement('div');
  document.body.append(host);
  initializeContentUiRoots(host.attachShadow({ mode: 'open' }));
  const first = makeVisible(document.createElement('button')),
    second = makeVisible(document.createElement('p'));
  document.body.append(first, second);
  const onSelection = vi.fn(() => true);
  const picker = startPicker({ onSelection, replaceSelectionOnClick: () => true });
  picker.selectElement(first);
  onSelection.mockReturnValue(false);
  second.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  expectFrameSummary('button');
  expect(picker.selectElement(second, 'finding')).toBe(false);
  expectFrameSummary('button');
});

it('dismisses Check without a selected object before disabling review mode', () => {
  const onDisableRequested = vi.fn();
  const onInspectorDismissRequested = vi.fn(() => true);
  let open = true;
  startPicker({ onDisableRequested, onInspectorDismissRequested, hasInspector: () => open });
  document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
  expect(onInspectorDismissRequested).toHaveBeenCalledOnce();
  expect(onDisableRequested).not.toHaveBeenCalled();
  open = false;
  document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
  expect(onDisableRequested).toHaveBeenCalledOnce();
});

it('keeps selection A while previewing B and clears the candidate on exit and retarget', () => {
  const host = document.createElement('div');
  document.body.append(host);
  initializeContentUiRoots(host.attachShadow({ mode: 'open' }));
  const first = makeVisible(document.createElement('button'));
  const second = makeVisible(document.createElement('p'));
  document.body.append(first, second);
  const onSelection = vi.fn();
  const picker = startPicker({ onSelection, replaceSelectionOnClick: () => true });
  picker.selectElement(first);
  second.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
  const selected = queryContentUiElement<HTMLElement>(
    '.sniptale-design-review-frame[data-state="selected"]'
  );
  const candidate = queryContentUiElement<HTMLElement>('.sniptale-design-review-candidate-frame');
  expect(selected?.textContent).toContain('button');
  expect(candidate?.textContent).toContain('p');
  expect(candidate?.style.display).toBe('block');
  expect(candidate?.style.border).toBe('1px solid rgb(0, 0, 0)');
  expect(onSelection).toHaveBeenCalledOnce();
  document.dispatchEvent(new MouseEvent('mouseleave'));
  expect(candidate?.style.display).toBe('none');
  second.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
  second.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  expect(selected?.textContent).toContain('p');
  expect(candidate?.style.display).toBe('none');
  picker.dismissSelection();
  expect(selected?.style.display).toBe('none');
  expect(candidate?.style.display).toBe('none');
  picker.dispose();
  pickerRuntime = null;
  expect(candidate?.isConnected).toBe(false);
});

it('clears the candidate during inspector interaction, suppression, and editing', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = host.attachShadow({ mode: 'open' });
  initializeContentUiRoots(root);
  const panel = document.createElement('aside');
  panel.dataset['ui'] = 'content.design-review.tool-panel';
  root.append(panel);
  const first = makeVisible(document.createElement('button'));
  const second = makeVisible(document.createElement('p'));
  document.body.append(first, second);
  let suppressed = false;
  const picker = startPicker({ isFrameSuppressed: () => suppressed });
  picker.selectElement(first);
  const hover = () => second.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
  hover();
  const candidate = queryContentUiElement<HTMLElement>('.sniptale-design-review-candidate-frame');
  panel.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, composed: true }));
  expect(candidate?.style.display).toBe('none');
  hover();
  suppressed = true;
  picker.refreshFrame();
  expect(candidate?.style.display).toBe('none');
  suppressed = false;
  picker.refreshFrame();
  expect(candidate?.style.display).toBe('block');
  picker.setTextEditing(true);
  expect(candidate?.style.display).toBe('none');
  picker.setTextEditing(false);
  expect(candidate?.style.display).toBe('none');
  hover();
  second.remove();
  picker.refreshFrame();
  expect(candidate?.style.display).toBe('none');
});
