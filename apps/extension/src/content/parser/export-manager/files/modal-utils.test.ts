// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeModal, EXPORT_SELECTORS, waitForElement } from './modal-utils';

afterEach(() => {
  while (document.body.firstChild) {
    document.body.firstChild.remove();
  }
});

describe('export-manager file modal utils', () => {
  it('waits for a visible modal element', async () => {
    const modal = document.createElement('div');
    modal.className = 'popupContent';
    Object.defineProperty(modal, 'offsetWidth', { configurable: true, value: 10 });
    Object.defineProperty(modal, 'offsetHeight', { configurable: true, value: 10 });
    document.body.appendChild(modal);

    const result = await waitForElement(EXPORT_SELECTORS.modal, 50);

    expect(result).toBe(modal);
  });

  it('clicks the close button when a modal close control is present', async () => {
    const closeButton = document.createElement('button');
    closeButton.className = 'closeButton';
    const clickSpy = vi.spyOn(closeButton, 'click');
    document.body.appendChild(closeButton);

    await closeModal();

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('falls back to the escape key when no close button exists', async () => {
    const keydownHandler = vi.fn();
    document.addEventListener('keydown', keydownHandler);

    await closeModal();

    expect(keydownHandler).toHaveBeenCalledTimes(1);
    const event = keydownHandler.mock.calls[0]?.[0] as KeyboardEvent;
    expect(event.key).toBe('Escape');
  });
});
