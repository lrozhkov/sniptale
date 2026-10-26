// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_BORDER_PRESET } from '../../../features/highlighter/style/defaults';
import {
  browserAnnotationSession,
  createBrowserAnnotationTargetEvidence,
} from '../../parser/page-preparation/annotations';
import {
  pagePreparationHistory,
  type PagePreparationHistoryBridge,
} from '../../parser/page-preparation/history';
import { createQuickEditTextReplacementTarget, startQuickEditTextPicker } from './text-rewrite';
import { createTextMarkerController } from './text-marker';
import { initializeContentUiRoots, appendToContentOverlayRoot } from '../../platform/dom-host';

const trusted = vi.hoisted(() => new WeakSet<Event>());
vi.mock('../../platform/trusted-events', async (original) => ({
  ...(await original<typeof import('../../platform/trusted-events')>()),
  isTrustedMouseEvent: (event: Event) => event.isTrusted || trusted.has(event),
  isTrustedKeyboardEvent: (event: Event) => event.isTrusted || trusted.has(event),
}));
const bridge: PagePreparationHistoryBridge = {
  captureSnapshot: () => ({
    annotations: browserAnnotationSession.captureSnapshot(),
    frameSession: {
      frames: [],
      globalEffectMode: 'border',
      globalStepBadgeSettings: { autoMode: true },
      sessionBorderPreset: DEFAULT_BORDER_PRESET,
      sessionBlurSettings: { amount: 8, blurType: 'gaussian', showBorder: false },
      sessionCalloutStyle: null,
      sessionFocusSettings: { opacity: 0.5, showBorder: false },
      sessionStepBadgeTemplate: null,
      stepBadgeOrder: [],
    },
  }),
  applySnapshot: (snapshot) => browserAnnotationSession.applySnapshot(snapshot.annotations),
};
let target: HTMLParagraphElement;
let registry: Map<string, object>;
let markers: ReturnType<typeof createTextMarkerController> | undefined;
let picker: ReturnType<typeof startQuickEditTextPicker> | undefined;
beforeEach(() => {
  document.body.replaceChildren();
  browserAnnotationSession.resetForDocument();
  pagePreparationHistory.clear();
  pagePreparationHistory.registerBridge(bridge);
  registry = new Map();
  vi.stubGlobal('CSS', { highlights: registry });
  vi.stubGlobal(
    'Highlight',
    class {
      priority = 0;
      constructor(public range: Range) {}
    }
  );
  const rect = DOMRect.fromRect({ width: 200, height: 30 });
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(() =>
    Object.assign([rect], { item: (index: number) => (index === 0 ? rect : null) })
  );
  target = document.createElement('p');
  const strong = document.createElement('strong');
  strong.textContent = 'Original';
  target.append(strong, document.createTextNode(' words'));
  document.body.append(target);
});
afterEach(() => {
  picker?.dispose();
  picker = undefined;
  markers?.dispose();
  markers = undefined;
  pagePreparationHistory.clear();
  pagePreparationHistory.unregisterBridge(bridge);
  browserAnnotationSession.resetForDocument();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function capture() {
  const result = createQuickEditTextReplacementTarget(target, { x: 20, y: 30 });
  if (!result) throw new Error('Target fixture was refused');
  return result;
}
it('applies literal text with Undo/Redo and restores inline DOM, comments and markers', async () => {
  markers = createTextMarkerController({
    annotations: browserAnnotationSession,
    history: pagePreparationHistory,
  });
  const range = document.createRange();
  range.selectNodeContents(target.querySelector('strong')!);
  expect(markers.add(range, '#000000')).toBe(true);
  browserAnnotationSession.setComment({
    target,
    evidence: createBrowserAnnotationTargetEvidence(target),
    comment: 'Keep this comment',
  });
  const captured = capture();
  expect(captured.apply('<b>Literal response</b>')).toBe(true);
  expect(target.querySelector('b')).toBeNull();
  expect(target.textContent).toBe('<b>Literal response</b>');
  await Promise.resolve();
  expect(registry.size).toBe(0);
  expect(captured.apply('Duplicate result')).toBe(false);
  pagePreparationHistory.undo('page-editing');
  await Promise.resolve();
  expect(target.querySelector('strong')?.textContent).toBe('Original');
  expect(target.textContent).toBe('Original words');
  expect(registry.size).toBe(1);
  expect(browserAnnotationSession.captureSnapshot().domRecords[0]?.comment).toBe(
    'Keep this comment'
  );
  pagePreparationHistory.redo('page-editing');
  expect(target.textContent).toBe('<b>Literal response</b>');
});
it('refuses changed text, changed inline markup and detached elements', () => {
  const text = capture();
  target.textContent = 'Page changed';
  expect(text.isCurrent()).toBe(false);
  expect(text.apply('Late AI result')).toBe(false);
  const markup = capture();
  const span = document.createElement('span');
  span.textContent = target.textContent;
  target.replaceChildren(span);
  expect(markup.apply('Late AI result')).toBe(false);
  const detached = capture();
  target.remove();
  expect(detached.apply('Late AI result')).toBe(false);
  expect(createQuickEditTextReplacementTarget(target, { x: 0, y: 0 })).toBeNull();
  expect(pagePreparationHistory.getState().canUndo).toBe(false);
});
it('preserves source when history refuses admission or loses its commit and permits retry', () => {
  const original = target.innerHTML;
  const captured = capture();
  vi.spyOn(pagePreparationHistory, 'beginTransaction').mockReturnValueOnce(false);
  expect(() => captured.apply('Refused')).toThrow();
  expect(target.innerHTML).toBe(original);
  expect(captured.isCurrent()).toBe(true);
  vi.spyOn(pagePreparationHistory, 'commitTransaction').mockReturnValueOnce(false);
  expect(() => captured.apply('Lost commit')).toThrow();
  expect(target.innerHTML).toBe(original);
  expect(browserAnnotationSession.captureSnapshot().domRecords).toEqual([]);
  expect(captured.isCurrent()).toBe(true);
  expect(captured.apply('Explicit retry')).toBe(true);
});
it('accepts an unchanged response without adding a history entry', () => {
  const captured = capture();
  expect(captured.apply(captured.text)).toBe(true);
  expect(pagePreparationHistory.getState().canUndo).toBe(false);
  expect(target.querySelector('strong')).not.toBeNull();
});
it('admits a trusted text click before document handlers and releases its listeners', () => {
  const selected = vi.fn();
  const finish = vi.fn();
  const pageHandler = vi.fn();
  document.addEventListener('click', pageHandler);
  picker = startQuickEditTextPicker({ onSelect: selected, onFinish: finish });
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  expect(selected).not.toHaveBeenCalled();
  const click = new MouseEvent('click', { bubbles: true, cancelable: true });
  trusted.add(click);
  target.querySelector('strong')!.dispatchEvent(click);
  expect(selected).toHaveBeenCalledOnce();
  expect(selected.mock.calls[0]?.[0].element).toBe(target);
  expect(click.defaultPrevented).toBe(true);
  expect(pageHandler).not.toHaveBeenCalled();
  picker.setSelectedTarget(target);
  const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  trusted.add(escape);
  target.dispatchEvent(escape);
  expect(finish).toHaveBeenCalledOnce();
  picker.dispose();
  picker = undefined;
  target.click();
  expect(pageHandler).toHaveBeenCalledOnce();
  document.removeEventListener('click', pageHandler);
});
it('excludes editable controls and extension UI from page text selection', () => {
  const selected = vi.fn();
  const input = document.createElement('input');
  document.body.append(input);
  const owner = document.createElement('div');
  document.body.append(owner);
  initializeContentUiRoots(owner.attachShadow({ mode: 'open' }));
  const owned = document.createElement('button');
  owned.textContent = 'Owned text';
  appendToContentOverlayRoot(owned);
  picker = startQuickEditTextPicker({ onSelect: selected, onFinish: vi.fn() });
  for (const element of [input, owned]) {
    const click = new MouseEvent('click', { bubbles: true, composed: true, cancelable: true });
    trusted.add(click);
    element.dispatchEvent(click);
  }
  expect(selected).not.toHaveBeenCalled();
});

it('refuses a source whose owning iframe was removed while the request was pending', () => {
  const frame = document.createElement('iframe');
  document.body.append(frame);
  const inner = frame.contentDocument;
  if (!inner) throw new Error('Iframe document is unavailable');
  const paragraph = inner.createElement('p');
  paragraph.textContent = 'Frame source';
  inner.body.append(paragraph);
  const captured = createQuickEditTextReplacementTarget(paragraph, { x: 20, y: 30 });
  expect(captured).not.toBeNull();
  frame.remove();
  expect(captured?.isCurrent()).toBe(false);
  expect(captured?.apply('Late frame response')).toBe(false);
  expect(paragraph.textContent).toBe('Frame source');
});
