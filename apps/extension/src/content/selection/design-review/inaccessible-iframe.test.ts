// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const frameMocks = vi.hoisted(() => ({
  isIframeAccessible: vi.fn(),
}));
const trustedEventMocks = vi.hoisted(() => ({
  hasActiveUserActivation: vi.fn(),
  isTrustedDomEvent: vi.fn(),
}));

vi.mock('../../platform/frame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/frame')>()),
  isIframeAccessible: frameMocks.isIframeAccessible,
}));
vi.mock('../../platform/trusted-events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/trusted-events')>()),
  hasActiveUserActivation: trustedEventMocks.hasActiveUserActivation,
  isTrustedDomEvent: trustedEventMocks.isTrustedDomEvent,
}));

import { addInaccessibleIframeSelectionListener } from './inaccessible-iframe';

beforeEach(() => {
  vi.useFakeTimers();
  frameMocks.isIframeAccessible.mockReturnValue(false);
  trustedEventMocks.hasActiveUserActivation.mockReturnValue(true);
  trustedEventMocks.isTrustedDomEvent.mockReturnValue(true);
  document.body.replaceChildren();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  document.body.replaceChildren();
});

it('selects the exact focused inaccessible iframe after a trusted window blur', () => {
  const iframe = document.createElement('iframe');
  document.body.append(iframe);
  iframe.focus();
  const onSelect = vi.fn();
  const cleanup = addInaccessibleIframeSelectionListener(onSelect);

  iframe.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
  window.dispatchEvent(new Event('blur'));
  vi.runAllTimers();
  window.dispatchEvent(new Event('blur'));
  vi.runAllTimers();

  expect(onSelect).toHaveBeenCalledOnce();
  expect(onSelect).toHaveBeenCalledWith(iframe);
  cleanup();
});

it('ignores synthetic focus transitions and accessible iframe documents', () => {
  const iframe = document.createElement('iframe');
  document.body.append(iframe);
  iframe.focus();
  const onSelect = vi.fn();
  const cleanup = addInaccessibleIframeSelectionListener(onSelect);

  trustedEventMocks.isTrustedDomEvent.mockReturnValue(false);
  iframe.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
  window.dispatchEvent(new Event('blur'));
  vi.runAllTimers();
  trustedEventMocks.isTrustedDomEvent.mockReturnValue(true);
  frameMocks.isIframeAccessible.mockReturnValue(true);
  iframe.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
  window.dispatchEvent(new Event('blur'));
  vi.runAllTimers();

  expect(onSelect).not.toHaveBeenCalled();
  cleanup();
});

it('retains trusted hover intent until a delayed activated focus transfer', () => {
  const iframe = document.createElement('iframe');
  document.body.append(iframe);
  const onSelect = vi.fn();
  const cleanup = addInaccessibleIframeSelectionListener(onSelect);

  iframe.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
  vi.advanceTimersByTime(10_000);
  iframe.focus();
  window.dispatchEvent(new Event('blur'));
  vi.runAllTimers();

  expect(onSelect).toHaveBeenCalledOnce();
  expect(onSelect).toHaveBeenCalledWith(iframe);
  cleanup();
});

it('clears iframe hover intent when the pointer leaves before focus transfer', () => {
  const iframe = document.createElement('iframe');
  document.body.append(iframe);
  const onSelect = vi.fn();
  const cleanup = addInaccessibleIframeSelectionListener(onSelect);

  iframe.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
  iframe.dispatchEvent(new MouseEvent('pointerout', { bubbles: true }));
  iframe.focus();
  window.dispatchEvent(new Event('blur'));
  vi.runAllTimers();

  expect(onSelect).not.toHaveBeenCalled();
  cleanup();
});

it('rejects an activated intent when a different iframe becomes focused', () => {
  const intended = document.createElement('iframe');
  const focused = document.createElement('iframe');
  document.body.append(intended, focused);
  const onSelect = vi.fn();
  const cleanup = addInaccessibleIframeSelectionListener(onSelect);

  intended.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
  focused.focus();
  window.dispatchEvent(new Event('blur'));
  vi.runAllTimers();

  expect(onSelect).not.toHaveBeenCalled();
  cleanup();
});

it('rejects a nested iframe intent when blur comes from a different parent window', () => {
  const parentIframe = document.createElement('iframe');
  document.body.append(parentIframe);
  const parentDocument = parentIframe.contentDocument!;
  const inaccessibleChild = parentDocument.createElement('iframe');
  parentDocument.body.append(inaccessibleChild);
  frameMocks.isIframeAccessible.mockImplementation(
    (candidate: HTMLIFrameElement) => candidate !== inaccessibleChild
  );
  const onSelect = vi.fn();
  const cleanup = addInaccessibleIframeSelectionListener(onSelect);

  inaccessibleChild.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
  inaccessibleChild.focus();
  window.dispatchEvent(new Event('blur'));
  vi.runAllTimers();

  expect(onSelect).not.toHaveBeenCalled();
  cleanup();
});

it('uses the stable root timer owner when a nested parent becomes unusable', () => {
  const parentIframe = document.createElement('iframe');
  document.body.append(parentIframe);
  const parentDocument = parentIframe.contentDocument!;
  const parentWindow = parentIframe.contentWindow!;
  const inaccessibleChild = parentDocument.createElement('iframe');
  parentDocument.body.append(inaccessibleChild);
  frameMocks.isIframeAccessible.mockImplementation(
    (candidate: HTMLIFrameElement) => candidate !== inaccessibleChild
  );
  const onSelect = vi.fn();
  const cleanup = addInaccessibleIframeSelectionListener(onSelect);

  inaccessibleChild.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
  const nestedClearTimeout = vi.spyOn(parentWindow, 'clearTimeout').mockImplementation(() => {
    throw new DOMException('Window is no longer accessible', 'SecurityError');
  });

  expect(cleanup).not.toThrow();
  expect(nestedClearTimeout).not.toHaveBeenCalled();
  vi.runAllTimers();
  expect(onSelect).not.toHaveBeenCalled();
});

it('cancels pending selection when the inspector listener is removed', () => {
  const iframe = document.createElement('iframe');
  document.body.append(iframe);
  iframe.focus();
  const onSelect = vi.fn();
  const cleanup = addInaccessibleIframeSelectionListener(onSelect);

  iframe.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
  window.dispatchEvent(new Event('blur'));
  cleanup();
  vi.runAllTimers();

  expect(onSelect).not.toHaveBeenCalled();
});

it('selects an inaccessible iframe from its accessible same-origin parent window', () => {
  const parentIframe = document.createElement('iframe');
  document.body.append(parentIframe);
  const parentDocument = parentIframe.contentDocument;
  const parentWindow = parentIframe.contentWindow;
  expect(parentDocument).not.toBeNull();
  expect(parentWindow).not.toBeNull();
  const inaccessibleChild = parentDocument!.createElement('iframe');
  parentDocument!.body.append(inaccessibleChild);
  frameMocks.isIframeAccessible.mockImplementation(
    (candidate: HTMLIFrameElement) => candidate !== inaccessibleChild
  );
  const onSelect = vi.fn();
  const cleanup = addInaccessibleIframeSelectionListener(onSelect);

  inaccessibleChild.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
  inaccessibleChild.focus();
  expect(parentDocument!.activeElement).toBe(inaccessibleChild);
  parentWindow!.dispatchEvent(new Event('blur'));
  vi.runAllTimers();

  expect(onSelect).toHaveBeenCalledOnce();
  expect(onSelect).toHaveBeenCalledWith(inaccessibleChild);
  cleanup();
});

it('rejects trusted programmatic focus without an activated pointer intent', () => {
  const iframe = document.createElement('iframe');
  document.body.append(iframe);
  iframe.focus();
  const onSelect = vi.fn();
  const cleanup = addInaccessibleIframeSelectionListener(onSelect);

  window.dispatchEvent(new Event('blur'));
  vi.runAllTimers();

  expect(onSelect).not.toHaveBeenCalled();
  cleanup();
});

it('rejects a trusted hover intent without fresh activation at focus transfer', () => {
  const iframe = document.createElement('iframe');
  document.body.append(iframe);
  iframe.focus();
  const onSelect = vi.fn();
  const cleanup = addInaccessibleIframeSelectionListener(onSelect);

  iframe.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
  trustedEventMocks.hasActiveUserActivation.mockReturnValue(false);
  window.dispatchEvent(new Event('blur'));
  vi.runAllTimers();

  expect(onSelect).not.toHaveBeenCalled();
  cleanup();
});
