// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createSystemStepBadgePresetCatalog } from '../../../features/highlighter/step-badge-presets/catalog';
import { StepBadgeSaveSection } from './save-section';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => key,
  useAppLocale: () => 'ru',
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('uses the shared compact template form and preserves numbering settings on save', async () => {
  const presets = createSystemStepBadgePresetCatalog().slice(0, 2);
  const settings = presets[0]!.settings;
  const onCreate = vi.fn().mockResolvedValue({ outcome: 'applied' });
  const onUpdate = vi.fn().mockResolvedValue({ outcome: 'applied' });

  await act(async () =>
    root.render(
      <StepBadgeSaveSection
        embedded
        onCreate={onCreate}
        onUpdate={onUpdate}
        presets={presets}
        settings={settings}
      />
    )
  );

  expect(
    document.querySelector('[data-ui="shared.highlighter-template-save-settings"]')
  ).not.toBeNull();
  const input = document.querySelector<HTMLInputElement>(
    'input[aria-label="content.stepBadge.templateName"]'
  );
  expect(input?.className).toContain('sniptale-input-compact');
  expect(
    [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'content.stepBadge.overwriteTemplate'
    )?.disabled
  ).toBe(true);
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    valueSetter?.call(input, 'Numbering template');
    input?.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const createButton = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === 'content.stepBadge.createTemplate'
  );
  await act(async () => createButton?.click());

  expect(onCreate).toHaveBeenCalledWith('Numbering template', settings);
});
