// @vitest-environment jsdom

import { InspectorLayout } from '../../compact-inspector-controls/layout';
import { CommandPressScope } from '@sniptale/ui/control-language/press';
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
  const nameInput = document.querySelector<HTMLInputElement>('input[maxlength="64"]');
  expect(nameInput?.parentElement?.querySelector('.sniptale-field-clear')).toBeNull();
  const tagAssignment = document.querySelector(
    '[data-ui="shared.annotation-template-tag-assignment"]'
  );
  expect(nameInput?.compareDocumentPosition(tagAssignment as Node)).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING
  );

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

it('clears the migrated preset name without committing or changing the preview', async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const onSave = vi.fn();
  const preset = createSystemStepBadgePresetCatalog()[0]!;
  try {
    await act(async () =>
      root.render(
        <CommandPressScope value={true}>
          <InspectorLayout>
            <StepBadgePresetEditor
              isOpen
              isSaving={false}
              onClose={vi.fn()}
              onSave={onSave}
              preset={preset}
            />
          </InspectorLayout>
        </CommandPressScope>
      )
    );
    const input = document.querySelector<HTMLInputElement>('input[maxlength="64"]')!;
    const preview = input
      .closest('[class*="grid-cols-"]')
      ?.querySelector(':scope > span[aria-hidden="true"]');
    expect(preview).not.toBeNull();
    const before = preview!.outerHTML;
    const clear = input.parentElement!.querySelector<HTMLButtonElement>('.sniptale-field-clear')!;
    expect(clear).not.toBeNull();
    await act(async () => clear.click());
    expect(input.value).toBe('');
    expect(document.activeElement).toBe(input);
    expect(input.maxLength).toBe(64);
    expect(preview!.outerHTML).toBe(before);
    expect(onSave).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
