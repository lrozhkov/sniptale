// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createSystemStepBadgePresetCatalog } from '../../../features/highlighter/step-badge-presets/catalog';
import { StepBadgePresetEditor } from './index';

it('edits the automatic numbering type without exposing a concrete badge value', async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const preset = createSystemStepBadgePresetCatalog()[0]!;

  await act(async () =>
    root.render(
      <StepBadgePresetEditor
        isOpen
        isSaving={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
        preset={preset}
      />
    )
  );

  expect(document.body.textContent).toContain('123');
  expect(document.body.textContent).toContain('АБВ');
  expect(document.querySelector('input[aria-label="Значение"]')).toBeNull();
  expect(document.querySelector('[data-field-label="Значение"]')).toBeNull();

  await act(async () =>
    [...document.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === 'АБВ')
      ?.click()
  );
  expect(document.body.textContent).toContain('Кириллица');
  expect(document.body.textContent).toContain('Latin');

  await act(async () =>
    document.querySelector<HTMLButtonElement>('button[aria-label="Позиция и смещение"]')?.click()
  );
  expect(
    document.querySelector('[data-ui="shared.step-badge-preset-editor.inspector"]')
  ).not.toBeNull();
  expect(document.querySelector('.grid-cols-2')).not.toBeNull();

  await act(async () => root.unmount());
  host.remove();
});

it('exposes an editable concrete value when automatic numbering is disabled in a preset', async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const source = createSystemStepBadgePresetCatalog()[0]!;
  const preset = {
    ...source,
    settings: { ...source.settings, auto: false, value: '7' },
  };
  const onSave = vi.fn();

  await act(async () =>
    root.render(
      <StepBadgePresetEditor
        isOpen
        isSaving={false}
        onClose={vi.fn()}
        onSave={onSave}
        preset={preset}
      />
    )
  );

  const valueInput = document.querySelector<HTMLInputElement>('input[aria-label="Значение"]');
  expect(valueInput?.value).toBe('7');
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    valueSetter?.call(valueInput, '9');
    valueInput?.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const save = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === 'Сохранить'
  );
  await act(async () => save?.click());
  expect(onSave.mock.calls[0]?.[0].settings.value).toBe('9');

  await act(async () => root.unmount());
  host.remove();
});

it('starts a new preset with empty tag metadata', async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const preset = createSystemStepBadgePresetCatalog()[0]!;
  await act(async () =>
    root.render(
      <StepBadgePresetEditor
        isOpen
        isNew
        isSaving={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
        preset={preset}
      />
    )
  );
  expect(document.body.textContent).toContain('Сохранить');
  await act(async () => root.unmount());
  host.remove();
});
