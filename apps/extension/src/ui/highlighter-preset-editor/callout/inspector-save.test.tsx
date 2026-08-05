// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createSystemCalloutPresetCatalog } from '../../../features/highlighter/callout-presets/catalog';
import { CalloutSaveSettings } from './inspector-save';

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

it('creates a named preset and overwrites the selected preset', async () => {
  const presets = createSystemCalloutPresetCatalog().slice(0, 2);
  const onCreate = vi.fn().mockResolvedValue(true);
  const onOverwrite = vi.fn().mockResolvedValue(true);
  await act(async () =>
    root.render(
      <CalloutSaveSettings
        error={null}
        isSaving={false}
        onCreate={onCreate}
        onOverwrite={onOverwrite}
        presets={presets}
      />
    )
  );

  const input = document.querySelector<HTMLInputElement>(
    'input[aria-label="content.callout.newPresetName"]'
  );
  expect(input?.className).toContain('cursor-text');
  expect(input?.style.cursor).toBe('text');
  expect(input?.placeholder).toBe('content.callout.newPresetName');
  await act(async () => input?.focus());
  expect(input?.placeholder).toBe('');
  await act(async () => input?.blur());
  expect(input?.placeholder).toBe('content.callout.newPresetName');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(input, 'My preset');
    input?.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const createButton = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === 'content.callout.createPresetAction'
  );
  await act(async () => createButton?.click());

  const overwriteButton = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === 'content.callout.overwritePresetAction'
  );
  await act(async () => overwriteButton?.click());

  expect(onCreate).toHaveBeenCalledWith('My preset');
  expect(onOverwrite).toHaveBeenCalledWith(presets[0]?.id);
  expect(document.querySelector('[role="status"]')?.textContent).toBe(
    'content.callout.presetOverwritten'
  );
});
