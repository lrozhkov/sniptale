import { act } from 'react';

import { clickBodyElement, getBodyHarnessContainer } from './body.test-support.harness';

export function readTokenCounter() {
  return (
    getBodyHarnessContainer()?.querySelector('.sniptale-ai-modal-token-text')?.textContent ?? ''
  );
}

export async function expandBodyDataPanel() {
  await clickBodyElement('.sniptale-spoiler-header');
}

export async function toggleBodyJsonPreview() {
  await clickBodyElement('.sniptale-toggle-btn');
}

export function readBodyJsonPreview() {
  return getBodyHarnessContainer()?.querySelector('.sniptale-json-preview')?.textContent ?? '';
}

export async function toggleBodyCheckboxAt(index: number) {
  const checkboxes = Array.from(
    getBodyHarnessContainer()?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]') ?? []
  );
  const checkbox = checkboxes.at(index);

  await act(async () => {
    checkbox?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

export async function unsetBodyModel() {
  await clickBodyElement('#clear-model');
}

export async function selectFirstBodyModel() {
  await clickBodyElement('[data-ui="ai-model-selector.trigger"]');
}

export async function dispatchBodyTextareaSubmitShortcut() {
  await act(async () => {
    getBodyHarnessContainer()
      ?.querySelector('textarea')
      ?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ctrlKey: true, key: 'Enter' }));
  });
}

export async function dispatchBodyModalEscape() {
  await act(async () => {
    getBodyHarnessContainer()
      ?.querySelector<HTMLElement>('[data-ui="ai-modal.product-modal"]')
      ?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
  });
}
