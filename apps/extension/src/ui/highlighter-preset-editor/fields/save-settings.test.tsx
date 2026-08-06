// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { BorderPreset } from '../../../features/highlighter/contracts';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));

vi.mock('../../compact-inspector-controls', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../compact-inspector-controls')>()),
  CompactSelect: (props: {
    'aria-label': string;
    disabled: boolean;
    onChange: (value: string) => void;
    onOpenChange?: (open: boolean) => void;
    options: Array<{ label: string; value: string }>;
    placeholder?: string;
    value: string;
  }) => (
    <>
      <select
        aria-label={props['aria-label']}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.currentTarget.value)}
        onFocus={() => props.onOpenChange?.(true)}
        value={props.value}
      >
        {props.placeholder ? <option value="">{props.placeholder}</option> : null}
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </>
  ),
}));

import { BorderManualSaveSettings } from './save-settings';

const preset = (id: string): BorderPreset => ({
  id,
  name: id,
  order: 0,
  width: 2,
  color: '#ff0000',
  style: 'solid',
  radius: 4,
  padding: { top: 1, right: 1, bottom: 1, left: 1 },
  shadow: 0,
  opacity: 100,
  strokeOpacity: 100,
  fillColor: '#000000',
  fillOpacity: 0,
  inheritCustomCss: false,
  customCss: '',
});

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

function setInputValue(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function getButton(label: string) {
  const button = Array.from(container.querySelectorAll('button')).find(
    (candidate) => candidate.textContent === label
  );
  if (!button) throw new Error(`Missing button: ${label}`);
  return button;
}

it('creates a named preset and reports successful completion', async () => {
  const onSave = vi.fn().mockResolvedValue(true);
  act(() => {
    root.render(
      <BorderManualSaveSettings isSaving={false} onSave={onSave} presets={[preset('a')]} />
    );
  });
  const nameInput = container.querySelector<HTMLInputElement>(
    'input[aria-label="content.overlayControls.frameStylePresetName"]'
  );
  act(() => setInputValue(nameInput as HTMLInputElement, 'New preset'));

  await act(async () => getButton('content.overlayControls.frameStyleCreate').click());

  expect(onSave).toHaveBeenCalledWith({ name: 'New preset' });
  expect(container.querySelector('[role="status"]')?.textContent).toBe(
    'content.overlayControls.frameStyleCreated'
  );
});

it('updates the selected preset and preserves controls on rejected saves', async () => {
  const first = preset('first');
  const second = preset('second');
  const onSave = vi.fn().mockResolvedValue(false);
  act(() => {
    root.render(
      <BorderManualSaveSettings isSaving={false} onSave={onSave} presets={[first, second]} />
    );
  });
  const select = container.querySelector<HTMLSelectElement>(
    'select[aria-label="content.overlayControls.frameStyleOverwrite"]'
  );
  const overwriteButton = getButton('content.overlayControls.frameStyleOverwriteAction');
  expect(select?.value).toBe('');
  expect(overwriteButton.disabled).toBe(true);
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(
      select,
      second.id
    );
    select?.dispatchEvent(new Event('change', { bubbles: true }));
  });

  expect(overwriteButton.disabled).toBe(false);
  await act(async () => overwriteButton.click());

  expect(onSave).toHaveBeenCalledWith({ overwrite: second });
  expect(container.querySelector('[role="status"]')).toBeNull();
});

it('forwards floating interaction ownership and disables the shared form', () => {
  const onFloatingInteractionChange = vi.fn();
  act(() => {
    root.render(
      <BorderManualSaveSettings
        disabled={false}
        isSaving={false}
        onFloatingInteractionChange={onFloatingInteractionChange}
        onSave={vi.fn().mockResolvedValue(true)}
        presets={[preset('a')]}
      />
    );
  });

  act(() =>
    container
      .querySelector<HTMLSelectElement>(
        'select[aria-label="content.overlayControls.frameStyleOverwrite"]'
      )
      ?.focus()
  );
  expect(onFloatingInteractionChange).toHaveBeenCalledWith(true);

  act(() => {
    root.render(
      <BorderManualSaveSettings
        disabled
        isSaving={false}
        onSave={vi.fn().mockResolvedValue(true)}
        presets={[preset('a')]}
      />
    );
  });
  expect(
    container.querySelector<HTMLInputElement>(
      'input[aria-label="content.overlayControls.frameStylePresetName"]'
    )?.disabled
  ).toBe(true);
});
