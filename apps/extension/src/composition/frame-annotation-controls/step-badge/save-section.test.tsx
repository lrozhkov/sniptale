// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createSystemStepBadgePresetCatalog,
  DEFAULT_STEP_BADGE_TEMPLATE,
} from '../../../features/highlighter/step-badge-presets/catalog';
import { StepBadgeSaveSection } from './save-section';

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it('reports successful create and overwrite operations and keeps rejected operations local', async () => {
  const preset = createSystemStepBadgePresetCatalog()[0]!;
  const onCreate = vi
    .fn()
    .mockResolvedValueOnce({ outcome: 'rejected' })
    .mockResolvedValueOnce({ id: 'created-step', outcome: 'applied' });
  const onUpdate = vi
    .fn()
    .mockResolvedValueOnce({ outcome: 'rejected' })
    .mockResolvedValueOnce({ outcome: 'applied' });
  const onCreated = vi.fn();

  await act(async () =>
    root.render(
      <StepBadgeSaveSection
        embedded
        onCreate={onCreate}
        onCreated={onCreated}
        onUpdate={onUpdate}
        presets={[preset]}
        settings={DEFAULT_STEP_BADGE_TEMPLATE}
      />
    )
  );

  const input = host.querySelector<HTMLInputElement>('input')!;
  const createButton = [...host.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
    button.textContent?.includes('Создать')
  )!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  const setName = async (name: string) =>
    act(async () => {
      setter?.call(input, name);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

  await setName('Rejected');
  await act(async () => createButton.click());
  expect(onCreated).not.toHaveBeenCalled();
  await setName('Created');
  await act(async () => createButton.click());
  expect(onCreated).toHaveBeenCalledWith('created-step');

  const select = host.querySelector<HTMLButtonElement>(
    '[data-ui="shared.ui.compact-select"] button'
  )!;
  await act(async () => select.click());
  const option = document.querySelector<HTMLButtonElement>('[role="option"]')!;
  await act(async () => option.click());
  const overwrite = [...host.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
    button.textContent?.includes('Обновить шаблон')
  )!;
  await act(async () => overwrite.click());
  expect(onCreated).toHaveBeenCalledTimes(1);
  await act(async () => overwrite.click());
  expect(onCreated).toHaveBeenLastCalledWith(preset.id);
});
