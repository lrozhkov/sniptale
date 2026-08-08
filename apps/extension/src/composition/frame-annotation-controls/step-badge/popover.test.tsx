// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { StepBadgePreset } from '@sniptale/runtime-contracts/highlighter/step-badge';
import { createDefaultFrameStepBadge } from '../../../features/highlighter/frame-annotation/defaults';
import { createSystemStepBadgePresetCatalog } from '../../../features/highlighter/step-badge-presets/catalog';

const controller = vi.hoisted(() => ({
  catalog: {
    create: vi.fn(async () => ({ id: 'created', outcome: 'applied' })),
    error: null,
    pending: new Set<string>(),
    presets: [],
    refresh: vi.fn(),
    reset: vi.fn(),
    toggle: vi.fn(),
    update: vi.fn(async () => ({ outcome: 'applied' })),
    value: null,
    visiblePresets: [] as StepBadgePreset[],
  },
  editor: {
    close: vi.fn(),
    isOpen: false,
    isSaving: false,
    open: vi.fn(),
    reset: vi.fn(),
    save: vi.fn(),
  },
}));

vi.mock('./preset-controller', () => ({
  useStepBadgePresetPopoverController: () => controller,
}));

import { FutureStepBadgeSettingsPopover } from './popover';

afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it('projects optional template-source and reorder controls through the future popover', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const portal = document.createElement('div');
  const anchor = document.createElement('button');
  document.body.append(host, portal, anchor);
  const root = createRoot(host);
  const onSourceChange = vi.fn();
  const onReorder = vi.fn();
  const preset = createSystemStepBadgePresetCatalog()[0]!;
  controller.catalog.visiblePresets = [preset];

  act(() =>
    root.render(
      <FutureStepBadgeSettingsPopover
        anchorEl={anchor}
        frameVisuals={{ borderColor: '#f97316', borderWidth: 2 }}
        headerContext="element"
        isOpen
        onChange={vi.fn()}
        onClose={vi.fn()}
        onDisable={vi.fn()}
        onReorder={onReorder}
        portalTarget={portal}
        settings={{ ...createDefaultFrameStepBadge(), auto: false, sourcePresetId: preset.id }}
        templateSourceControl={{ onChange: onSourceChange, value: 'frame-default' }}
      />
    )
  );

  const source = portal.querySelector<HTMLButtonElement>('.sniptale-settings-popover-mode-action');
  act(() => source?.click());
  expect(onSourceChange).toHaveBeenCalledWith('forced');
  expect(
    portal.querySelector('[data-ui="content.toolbar.future-step-badge-popover"]')
  ).not.toBeNull();
  act(() => portal.querySelector<HTMLButtonElement>('button[aria-label="Создать копию"]')?.click());

  act(() => root.unmount());
  controller.catalog.visiblePresets = [];
});

it('applies the locale alphabet when future automatic numbering switches to letters', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const portal = document.createElement('div');
  const anchor = document.createElement('button');
  document.body.append(host, portal, anchor);
  const root = createRoot(host);
  const onChange = vi.fn();

  act(() =>
    root.render(
      <FutureStepBadgeSettingsPopover
        anchorEl={anchor}
        frameVisuals={{ borderColor: '#f97316', borderWidth: 2 }}
        isOpen
        onChange={onChange}
        onClose={vi.fn()}
        onDisable={vi.fn()}
        portalTarget={portal}
        settings={{ ...createDefaultFrameStepBadge(), auto: true, type: 'number' }}
      />
    )
  );

  const letters = [...portal.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === 'АБВ'
  );
  act(() => letters?.click());
  expect(onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({ alphabet: 'cyrillic', type: 'letter' })
  );
  const latin = [...portal.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === 'Latin'
  );
  act(() => latin?.click());
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ alphabet: 'latin' }));
  const numbers = [...portal.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === '123'
  );
  act(() => numbers?.click());
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'number' }));

  act(() => portal.querySelector<HTMLButtonElement>('.sniptale-glass-switch')?.click());
  const valueInput = portal.querySelector<HTMLInputElement>('input[aria-label="Значение"]');
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  act(() => {
    valueSetter?.call(valueInput, '7');
    valueInput?.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ value: '7' }));

  act(() =>
    portal.querySelector<HTMLButtonElement>('button[aria-label="Позиция и смещение"]')?.click()
  );
  act(() => portal.querySelector<HTMLButtonElement>('button[title="top-right"]')?.click());
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ anchor: 'top-right' }));
  act(() => portal.querySelector<HTMLButtonElement>('button[title="Сместить вправо"]')?.click());
  expect(onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({ offsetDirections: ['right'] })
  );

  act(() => root.unmount());
});

it('keeps the closed future settings surface detached when no portal target is provided', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  act(() =>
    root.render(
      <FutureStepBadgeSettingsPopover
        anchorEl={null}
        frameVisuals={{ borderColor: '#f97316', borderWidth: 2 }}
        isOpen={false}
        onChange={vi.fn()}
        onClose={vi.fn()}
        onDisable={vi.fn()}
        settings={createDefaultFrameStepBadge()}
      />
    )
  );

  expect(
    document.querySelector('[data-ui="content.toolbar.future-step-badge-popover"]')
  ).toBeNull();
  act(() => root.unmount());
});
