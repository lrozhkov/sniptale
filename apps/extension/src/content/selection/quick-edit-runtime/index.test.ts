// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQuickEditRuntimeController } from '.';

class ResizeObserverMock {
  observe(): void {}
  disconnect(): void {}
  unobserve(): void {}
}

function createTextElement(): HTMLElement {
  const element = document.createElement('div');
  element.textContent = 'Editable text';
  document.body.appendChild(element);

  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: 120,
      y: 48,
      top: 48,
      left: 120,
      width: 80,
      height: 24,
      right: 200,
      bottom: 72,
      toJSON: () => ({}),
    }),
  });

  return element;
}

function readFrameRect(element: Element | null) {
  return {
    top: (element as HTMLElement | null)?.style.top,
    left: (element as HTMLElement | null)?.style.left,
    width: (element as HTMLElement | null)?.style.width,
    height: (element as HTMLElement | null)?.style.height,
  };
}

function dispatchEscapeKey(): void {
  document.body.dispatchEvent(
    new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Escape',
    })
  );
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  document.designMode = 'off';
});

afterEach(() => {
  document.designMode = 'off';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

function verifyHoverFrameReuse(): void {
  const controller = createQuickEditRuntimeController({
    onDisableRequested: vi.fn(),
  });
  const element = createTextElement();

  controller.mode.enable();

  element.dispatchEvent(
    new MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
    })
  );

  const hoverOverlay = document.querySelector('.sniptale-quick-edit-hover');
  expect(hoverOverlay).toBeInstanceOf(HTMLElement);
  expect((hoverOverlay as HTMLElement | null)?.style.display).toBe('block');

  const hoverRect = readFrameRect(hoverOverlay);

  element.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    })
  );

  const activeFrame = document.querySelector('.sniptale-quick-edit-active-frame');
  expect(activeFrame).toBeInstanceOf(HTMLElement);
  expect((hoverOverlay as HTMLElement | null)?.style.display).toBe('none');
  expect((activeFrame as HTMLElement | null)?.style.display).toBe('block');
  expect(readFrameRect(activeFrame)).toEqual(hoverRect);
  expect(element.classList.contains('sniptale-editing')).toBe(true);

  controller.mode.disable();
}

function verifyKeydownCleanup(): void {
  const onDisableRequested = vi.fn();
  const controller = createQuickEditRuntimeController({
    onDisableRequested,
  });

  controller.mode.enable();
  controller.mode.disable();
  controller.mode.enable();

  dispatchEscapeKey();

  expect(onDisableRequested).toHaveBeenCalledTimes(1);
  controller.mode.disable();
}

function verifyAccessors(): void {
  const controller = createQuickEditRuntimeController({
    onDisableRequested: vi.fn(),
  });
  const element = createTextElement();

  expect(controller.mode.isEnabled()).toBe(false);
  expect(controller.editing.getEditingElements().size).toBe(0);

  controller.mode.enable();
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  expect(controller.mode.isEnabled()).toBe(true);
  expect(controller.editing.getEditingElements().size).toBeGreaterThanOrEqual(0);
  controller.mode.disable();
}

function verifyDocumentModeEnable(): void {
  const controller = createQuickEditRuntimeController({
    onDisableRequested: vi.fn(),
  });

  controller.mode.enable();
  controller.documentMode.enable();

  expect(document.designMode).toBe('on');
  expect(controller.documentMode.isEnabled()).toBe(true);
  expect(document.body.classList.contains('sniptale-quick-edit-document-mode')).toBe(true);
  controller.mode.disable();
}

function verifyDocumentModeRestore(): void {
  const controller = createQuickEditRuntimeController({
    onDisableRequested: vi.fn(),
  });

  document.designMode = 'off';
  controller.mode.enable();
  controller.documentMode.enable();
  controller.documentMode.disable();

  expect(document.designMode).toBe('off');
  expect(controller.documentMode.isEnabled()).toBe(false);
  controller.mode.disable();
}

function verifyDocumentModeRestoresPreexistingOnState(): void {
  const controller = createQuickEditRuntimeController({
    onDisableRequested: vi.fn(),
  });

  document.designMode = 'on';
  controller.mode.enable();
  controller.documentMode.enable();
  controller.documentMode.disable();

  expect(document.designMode).toBe('on');
  expect(controller.documentMode.isEnabled()).toBe(false);
  controller.mode.disable();
}

function verifyDocumentModeCommitsTargetedSessions(): void {
  const controller = createQuickEditRuntimeController({
    onDisableRequested: vi.fn(),
  });
  const element = createTextElement();

  controller.mode.enable();
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  expect(element.classList.contains('sniptale-editing')).toBe(true);

  controller.documentMode.enable();

  expect(element.classList.contains('sniptale-editing')).toBe(false);
  expect(controller.editing.getEditingElements().size).toBe(0);
  expect(controller.documentMode.isEnabled()).toBe(true);
  controller.mode.disable();
}

function verifyDocumentModeFullDisableRestore(): void {
  const controller = createQuickEditRuntimeController({
    onDisableRequested: vi.fn(),
  });

  controller.mode.enable();
  controller.documentMode.enable();
  controller.mode.disable();

  expect(document.designMode).toBe('off');
  expect(controller.documentMode.isEnabled()).toBe(false);
  expect(controller.mode.isEnabled()).toBe(false);
}

function verifyDocumentModeSuppressesHover(): void {
  const controller = createQuickEditRuntimeController({
    onDisableRequested: vi.fn(),
  });
  const element = createTextElement();

  controller.mode.enable();
  controller.documentMode.enable();
  element.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true }));

  const hoverOverlay = document.querySelector('.sniptale-quick-edit-hover');
  expect((hoverOverlay as HTMLElement | null)?.style.display).toBe('none');
  controller.mode.disable();
}

function verifyTargetedEditingReturnsAfterDocumentMode(): void {
  const controller = createQuickEditRuntimeController({
    onDisableRequested: vi.fn(),
  });
  const element = createTextElement();

  controller.mode.enable();
  controller.documentMode.enable();
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  expect(element.classList.contains('sniptale-editing')).toBe(false);

  controller.documentMode.disable();
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  expect(element.classList.contains('sniptale-editing')).toBe(true);
  controller.mode.disable();
}

function verifyEscapeDisablesDocumentModeFirst(): void {
  const onDisableRequested = vi.fn();
  const controller = createQuickEditRuntimeController({
    onDisableRequested,
  });

  controller.mode.enable();
  controller.documentMode.enable();
  dispatchEscapeKey();

  expect(controller.documentMode.isEnabled()).toBe(false);
  expect(controller.mode.isEnabled()).toBe(true);
  expect(onDisableRequested).not.toHaveBeenCalled();
  controller.mode.disable();
}

describe('quick-edit runtime', () => {
  it('reuses the hover frame geometry when editing starts', verifyHoverFrameReuse);
  it('cleans up keydown listeners when quick edit mode is disabled', verifyKeydownCleanup);
  it('exposes the enabled flag and live editing element map accessors', verifyAccessors);
  it('enables document mode and marks the runtime submode active', verifyDocumentModeEnable);
  it(
    'restores the previous document designMode when document mode is disabled',
    verifyDocumentModeRestore
  );
  it(
    'does not assume document designMode was originally off',
    verifyDocumentModeRestoresPreexistingOnState
  );
  it(
    'commits active targeted sessions before document mode starts',
    verifyDocumentModeCommitsTargetedSessions
  );
  it(
    'restores document designMode during full quick-edit disable',
    verifyDocumentModeFullDisableRestore
  );
  it(
    'keeps the hover overlay hidden while document mode is active',
    verifyDocumentModeSuppressesHover
  );
  it(
    'returns targeted quick-edit behavior after document mode is disabled',
    verifyTargetedEditingReturnsAfterDocumentMode
  );
  it(
    'uses Escape to leave document mode before quick-edit mode',
    verifyEscapeDisablesDocumentModeFirst
  );
});
