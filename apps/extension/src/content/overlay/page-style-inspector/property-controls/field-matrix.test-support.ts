import { act } from 'react';

export const TEXT_FIELD_PROPERTIES = [
  'color',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'letter-spacing',
  'line-height',
  'text-align',
  'text-decoration',
] as const;

export const FRAME_FIELD_PROPERTIES = [
  'height',
  'margin-bottom',
  'margin-left',
  'margin-right',
  'margin-top',
  'padding-bottom',
  'padding-left',
  'padding-right',
  'padding-top',
  'width',
] as const;

export const APPEARANCE_FIELD_PROPERTIES = [
  'background-color',
  'background-image',
  'border-bottom-color',
  'border-bottom-left-radius',
  'border-bottom-right-radius',
  'border-bottom-style',
  'border-bottom-width',
  'border-left-color',
  'border-left-style',
  'border-left-width',
  'border-right-color',
  'border-right-style',
  'border-right-width',
  'border-top-color',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-top-style',
  'border-top-width',
  'box-shadow',
] as const;

export const IMAGE_FIELD_PROPERTIES = ['object-fit', 'object-position'] as const;

export function inputValue(label: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!input) {
    throw new Error(`Expected input: ${label}`);
  }
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

export async function clickButton(label: string) {
  const button = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!button) {
    throw new Error(`Expected button: ${label}`);
  }
  await act(async () => {
    button.click();
  });
}

export async function pickColor(label: string, color: string) {
  await clickButton(label);
  await clickButton(`${label}: ${color}`);
}

export async function pickOption(label: string, optionTitle: string) {
  await clickButton(label);
  const option = document.querySelector<HTMLButtonElement>(
    `button[role="option"][title="${optionTitle}"]`
  );
  if (!option) {
    throw new Error(`Expected option: ${optionTitle}`);
  }
  await act(async () => {
    option.click();
  });
}

function getSideField(label: string): HTMLElement {
  const field = document.querySelector<HTMLElement>(`[data-side-field-label="${label}"]`);
  if (!field) {
    throw new Error(`Expected side field: ${label}`);
  }
  return field;
}

export async function linkSideField(label: string) {
  const field = getSideField(label);
  const button = field.querySelector<HTMLButtonElement>('button[aria-label="Связать стороны"]');
  if (!button) {
    throw new Error(`Expected link button: ${label}`);
  }
  await act(async () => {
    button.click();
  });
}

export async function inputLinkedSideValue(label: string, value: string) {
  await linkSideField(label);
  const input = getSideField(label).querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!input) {
    throw new Error(`Expected linked side input: ${label}`);
  }
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

export async function pickLinkedSideOption(label: string, optionTitle: string) {
  await linkSideField(label);
  const trigger = getSideField(label).querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`
  );
  if (!trigger) {
    throw new Error(`Expected linked side select: ${label}`);
  }
  await act(async () => {
    trigger.click();
  });
  const option = document.querySelector<HTMLButtonElement>(
    `button[role="option"][title="${optionTitle}"]`
  );
  if (!option) {
    throw new Error(`Expected option: ${optionTitle}`);
  }
  await act(async () => {
    option.click();
  });
}
