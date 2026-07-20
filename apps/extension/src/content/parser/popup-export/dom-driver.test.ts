// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';
import {
  closeFilePreviewPopup,
  delay,
  FILE_PREVIEW_POPUP_SELECTORS,
  resolveVisibleFilePreviewPopup,
  waitForVisibleElement,
} from './dom-driver';
import { resolveFilePreviewUrlFromTrigger } from './preview-url';

let originalWindowDescriptor: PropertyDescriptor | undefined;

function createVisiblePopup(downloadUrl?: string, previewUrl?: string): HTMLElement {
  const popup = document.createElement('div');
  popup.id = 'gwt-debug-filePreview';
  popup.className = 'popupContent';
  Object.defineProperty(popup, 'offsetWidth', { configurable: true, value: 120 });
  Object.defineProperty(popup, 'offsetHeight', { configurable: true, value: 40 });

  const closeButton = document.createElement('button');
  closeButton.id = 'gwt-debug-closeButton';
  popup.append(closeButton);

  if (downloadUrl) {
    const wrapper = document.createElement('div');
    wrapper.className = 'downloadButton';
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.setAttribute('download', '');
    wrapper.append(link);
    popup.append(wrapper);
  }

  if (previewUrl) {
    const image = document.createElement('img');
    image.id = 'gwt-debug-imagePreview';
    image.src = previewUrl;
    popup.append(image);
  }

  return popup;
}

afterEach(() => {
  if (originalWindowDescriptor) {
    Object.defineProperty(globalThis, 'window', originalWindowDescriptor);
    originalWindowDescriptor = undefined;
  }
  vi.useRealTimers();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function removeAmbientWindow(): void {
  originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Reflect.deleteProperty(globalThis, 'window');
}

it('waits for a visible file-preview element', async () => {
  const popup = createVisiblePopup();
  document.body.append(popup);

  await expect(waitForVisibleElement(FILE_PREVIEW_POPUP_SELECTORS.modal, 50)).resolves.toBe(popup);
});

it('resolves visible file-preview popup state from current DOM', () => {
  const popup = createVisiblePopup('https://example.com/download?uuid=file$42');
  document.body.append(popup);

  expect(resolveVisibleFilePreviewPopup()).toEqual({
    popup,
    resolvedUrl: 'https://example.com/download?uuid=file$42',
  });
});

it('prefers the visible popup when stale hidden popup nodes remain in the DOM', () => {
  const hiddenPopup = createVisiblePopup('https://example.com/download?uuid=stale');
  hiddenPopup.style.display = 'none';
  const visiblePopup = createVisiblePopup('https://example.com/download?uuid=fresh');
  document.body.append(hiddenPopup, visiblePopup);

  expect(resolveVisibleFilePreviewPopup()).toEqual({
    popup: visiblePopup,
    resolvedUrl: 'https://example.com/download?uuid=fresh',
  });
});

it('closes the popup through its explicit close button when present', async () => {
  const popup = createVisiblePopup();
  const closeButton = popup.querySelector('#gwt-debug-closeButton') as HTMLButtonElement;
  const clickSpy = vi.spyOn(closeButton, 'click');
  document.body.append(popup);

  await closeFilePreviewPopup();

  expect(clickSpy).toHaveBeenCalledTimes(1);
});

it('falls back to Escape when no close button exists', async () => {
  const keydownHandler = vi.fn();
  document.addEventListener('keydown', keydownHandler);

  await closeFilePreviewPopup();

  expect(keydownHandler).toHaveBeenCalledTimes(1);
  expect((keydownHandler.mock.calls[0]?.[0] as KeyboardEvent).key).toBe('Escape');
});

it('falls back to Escape when the close button is blocked by the click guard', async () => {
  const popup = createVisiblePopup();
  const closeButton = popup.querySelector('#gwt-debug-closeButton') as HTMLButtonElement;
  closeButton.setAttribute('aria-disabled', 'true');
  document.body.append(popup);

  const keydownHandler = vi.fn();
  document.addEventListener('keydown', keydownHandler);

  await closeFilePreviewPopup();

  expect(keydownHandler).toHaveBeenCalledTimes(1);
  expect((keydownHandler.mock.calls[0]?.[0] as KeyboardEvent).key).toBe('Escape');
});

it('resolves a preview url after clicking the trigger', async () => {
  const trigger = document.createElement('img');
  document.body.append(trigger);
  const clickSpy = vi.spyOn(trigger, 'click').mockImplementation(() => {
    document.body.append(createVisiblePopup('https://example.com/download?uuid=file$55'));
  });

  await expect(
    resolveFilePreviewUrlFromTrigger({
      trigger,
      fallbackUrl: './download?uuid=file$55',
    })
  ).resolves.toBe('https://example.com/download?uuid=file$55');

  expect(clickSpy).toHaveBeenCalledTimes(1);
});

it('falls back when no popup appears before timeout', async () => {
  vi.useFakeTimers();
  const trigger = document.createElement('img');
  document.body.append(trigger);
  const promise = resolveFilePreviewUrlFromTrigger({
    trigger,
    fallbackUrl: './download?uuid=file$88',
    timeoutMs: 50,
  });

  await vi.advanceTimersByTimeAsync(50);

  await expect(promise).resolves.toBe('./download?uuid=file$88');
});

it('returns the fallback immediately when the trigger is blocked by the click guard', async () => {
  const trigger = document.createElement('img');

  await expect(
    resolveFilePreviewUrlFromTrigger({
      trigger,
      fallbackUrl: './download?uuid=file$99',
      timeoutMs: 5000,
    })
  ).resolves.toBe('./download?uuid=file$99');
});

it('keeps delay as an explicit async popup-driver utility', async () => {
  vi.useFakeTimers();
  const promise = delay(25);
  await vi.advanceTimersByTimeAsync(25);
  await expect(promise).resolves.toBeUndefined();
});

it('uses document-scoped timers for explicit snapshot documents without ambient window', async () => {
  const snapshotDocument = document.implementation.createHTMLDocument('Saved snapshot');
  removeAmbientWindow();

  await expect(
    waitForVisibleElement(FILE_PREVIEW_POPUP_SELECTORS.modal, 1, snapshotDocument)
  ).resolves.toBeNull();
  await expect(closeFilePreviewPopup(snapshotDocument)).resolves.toBeUndefined();
  await expect(delay(1, snapshotDocument)).resolves.toBeUndefined();
});

it('resolves preview fallback from explicit snapshot documents without ambient window', async () => {
  const snapshotDocument = document.implementation.createHTMLDocument('Saved snapshot');
  const trigger = snapshotDocument.createElement('img');
  snapshotDocument.body.append(trigger);
  removeAmbientWindow();

  await expect(
    resolveFilePreviewUrlFromTrigger({
      fallbackUrl: './download?uuid=file$100',
      targetDocument: snapshotDocument,
      timeoutMs: 1,
      trigger,
    })
  ).resolves.toBe('./download?uuid=file$100');
});
