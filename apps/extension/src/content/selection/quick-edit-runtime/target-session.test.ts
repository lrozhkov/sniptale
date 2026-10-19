// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { pagePreparationHistory } from '../../parser/page-preparation/history';
import { browserAnnotationSession } from '../../parser/page-preparation/annotations';
import { canEditQuickEditTarget, createQuickEditTargetSession } from './target-session';

const policy = vi.hoisted(() => ({ trusted: true, shield: vi.fn() }));
vi.mock('../../platform/trusted-events', () => ({
  isTrustedMouseEvent: () => policy.trusted,
  isTrustedKeyboardEvent: () => policy.trusted,
  isTrustedPointerEvent: () => policy.trusted,
}));
vi.mock('../locker', () => ({ setNavigationInputShieldSuspended: policy.shield }));

class TestResizeObserver {
  observe(): void {}
  disconnect(): void {}
}

let active: ReturnType<typeof createQuickEditTargetSession> | undefined;
beforeEach(() => {
  policy.trusted = true;
  policy.shield.mockClear();
  vi.stubGlobal('ResizeObserver', TestResizeObserver);
  vi.spyOn(pagePreparationHistory, 'beginTransaction').mockReturnValue(true);
  vi.spyOn(pagePreparationHistory, 'commitTransaction').mockReturnValue(true);
  vi.spyOn(pagePreparationHistory, 'cancelTransaction');
});
afterEach(() => {
  active?.dispose();
  active = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  browserAnnotationSession.resetForDocument();
  document.body.replaceChildren();
});

function start(target?: HTMLElement) {
  const element = target ?? document.createElement('p');
  element.textContent = 'Original';
  if (!element.isConnected) document.body.append(element);
  const onFinish = vi.fn();
  const onError = vi.fn();
  active = createQuickEditTargetSession({ target: element, onFinish, onError });
  return { element, onFinish, onError };
}

it('mounts focus suppression only for managed text and restores source presentation on completion', () => {
  const target = document.createElement('p');
  target.style.cssText = 'outline: 3px solid red; box-shadow: 0 0 2px blue;';
  const sourceStyle = target.getAttribute('style');
  const { element } = start(target);
  const style = document.getElementById('sniptale-quick-edit-target-style');
  expect(style?.textContent).toContain('.sniptale-editing:focus');
  expect(style?.textContent).toContain('outline: none !important');
  expect(style?.textContent).toContain('box-shadow: none !important');
  expect(style?.textContent).not.toContain('body');
  expect(element.getAttribute('style')).toBe(sourceStyle);
  active?.finish();
  expect(document.getElementById('sniptale-quick-edit-target-style')).toBeNull();
  expect(element.getAttribute('style')).toBe(sourceStyle);
});

it('releases temporary styling after activation fails', () => {
  const target = document.createElement('p');
  target.textContent = 'Original';
  document.body.append(target);
  vi.spyOn(target, 'focus').mockImplementation(() => {
    throw new Error('Focus failed');
  });
  expect(() =>
    createQuickEditTargetSession({ target, onFinish: vi.fn(), onError: vi.fn() })
  ).toThrow('Focus failed');
  expect(document.getElementById('sniptale-quick-edit-target-style')).toBeNull();
  expect(target.classList.contains('sniptale-editing')).toBe(false);
  expect(policy.shield).toHaveBeenLastCalledWith(false);
});

it.each(['Enter', 'Escape'])('commits %s once and releases target and input shield', (key) => {
  const { element, onFinish, onError } = start();
  element.textContent = 'Changed';
  element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  active?.dispose();
  expect(element.textContent).toBe('Changed');
  expect(element.classList.contains('sniptale-editing')).toBe(false);
  expect(element.contentEditable).not.toBe('true');
  expect(pagePreparationHistory.commitTransaction).toHaveBeenCalledOnce();
  expect(onFinish).toHaveBeenCalledOnce();
  expect(onError).not.toHaveBeenCalled();
  expect(policy.shield.mock.calls).toEqual([[true], [false]]);
  expect(document.querySelector('.sniptale-quick-edit-blocking-overlay')).toBeNull();
});

it('claims outside completion without activating the page or starting another text edit', () => {
  const { element, onFinish } = start();
  const outside = document.createElement('button');
  outside.textContent = 'Other';
  document.body.append(outside);
  const pageClick = vi.fn();
  outside.addEventListener('click', pageClick);
  outside.addEventListener('pointerdown', pageClick);
  const pointer = new MouseEvent('pointerdown', { bubbles: true, cancelable: true });
  outside.dispatchEvent(pointer);
  expect(pointer.defaultPrevented).toBe(true);
  const click = new MouseEvent('click', { bubbles: true, cancelable: true });
  outside.dispatchEvent(click);
  expect(click.defaultPrevented).toBe(true);
  expect(pageClick).not.toHaveBeenCalled();
  expect(onFinish).toHaveBeenCalledOnce();
  expect(outside.contentEditable).not.toBe('true');
  expect(element.classList.contains('sniptale-editing')).toBe(false);
});

it('ignores untrusted completion and retains multiline and composing input', () => {
  const { element, onFinish } = start();
  policy.trusted = false;
  element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  policy.trusted = true;
  for (const options of [
    { isComposing: true },
    { keyCode: 229 },
    { shiftKey: true },
    { ctrlKey: true },
  ]) {
    element.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, ...options })
    );
  }
  expect(onFinish).not.toHaveBeenCalled();
  expect(element.contentEditable).toBe('true');
});

it('restores the original link after completion', () => {
  const link = document.createElement('a');
  link.href = 'https://example.com/path';
  const { element } = start(link);
  expect(element.hasAttribute('href')).toBe(false);
  active?.finish();
  expect(link.href).toBe('https://example.com/path');
});

it('commits an actual same-origin iframe target on Enter', () => {
  const iframe = document.createElement('iframe');
  document.body.append(iframe);
  const innerDocument = iframe.contentDocument;
  if (!innerDocument) throw new Error('Expected accessible iframe document');
  const paragraph = innerDocument.createElement('p');
  innerDocument.body.append(paragraph);
  const { element, onFinish } = start(paragraph);
  element.textContent = 'Frame edit';
  element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  expect(onFinish).toHaveBeenCalledOnce();
  expect(element.textContent).toBe('Frame edit');
  expect(element.classList.contains('sniptale-editing')).toBe(false);
});

it('accepts an isolated-world HTML wrapper when the owning window exposes another constructor', () => {
  const paragraph = document.createElement('p');
  paragraph.textContent = 'Editable wrapper';
  const iframe = document.createElement('iframe');
  document.body.append(paragraph, iframe);
  const frameDocument = iframe.contentDocument;
  if (!frameDocument) throw new Error('Expected accessible iframe document');
  const otherView = frameDocument.defaultView;
  vi.spyOn(document, 'defaultView', 'get').mockReturnValue(otherView);
  expect(canEditQuickEditTarget(paragraph)).toBe(true);
});

it('settles and releases resources when the target is removed', async () => {
  const { element, onFinish } = start();
  element.remove();
  await Promise.resolve();
  expect(onFinish).toHaveBeenCalledOnce();
  expect(pagePreparationHistory.cancelTransaction).toHaveBeenCalled();
  expect(pagePreparationHistory.commitTransaction).not.toHaveBeenCalled();
  expect(policy.shield).toHaveBeenLastCalledWith(false);
  expect(document.getElementById('sniptale-quick-edit-target-style')).toBeNull();
});

it('reports commit refusal and finishes without leaving an open interaction', () => {
  const { element, onError, onFinish } = start();
  vi.mocked(pagePreparationHistory.commitTransaction).mockReturnValue(false);
  element.textContent = 'Changed';
  active?.finish();
  expect(onError).toHaveBeenCalledOnce();
  expect(onFinish).toHaveBeenCalledOnce();
  expect(policy.shield).toHaveBeenLastCalledWith(false);
  expect(element.classList.contains('sniptale-editing')).toBe(false);
  expect(document.getElementById('sniptale-quick-edit-target-style')).toBeNull();
});

it('refuses unsupported, detached, already editable and broad container targets', () => {
  const target = document.createElement('input');
  document.body.append(target);
  expect(canEditQuickEditTarget(target)).toBe(false);
  expect(() =>
    createQuickEditTargetSession({ target, onFinish: vi.fn(), onError: vi.fn() })
  ).toThrow('not editable');
  const paragraph = document.createElement('p');
  paragraph.textContent = 'Detached';
  expect(canEditQuickEditTarget(paragraph)).toBe(false);
  const container = document.createElement('div');
  container.append(paragraph);
  document.body.append(container);
  expect(canEditQuickEditTarget(container)).toBe(false);
  Object.defineProperty(paragraph, 'isContentEditable', { value: true });
  expect(canEditQuickEditTarget(paragraph)).toBe(false);
});
