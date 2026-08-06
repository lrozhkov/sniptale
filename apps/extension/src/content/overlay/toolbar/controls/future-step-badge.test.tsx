// @vitest-environment jsdom
import { act } from 'react';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { DEFAULT_BORDER_PRESET } from '../../../../features/highlighter/style/defaults';
import {
  createStepBadgeSettingsFromTemplate,
  DEFAULT_STEP_BADGE_TEMPLATE,
} from '../../../../features/highlighter/step-badge-presets/catalog';
import type { StepBadgePreset } from '@sniptale/runtime-contracts/highlighter/step-badge';
import { useToolbarMenuState } from '../state/menu';
import type { ToolbarFutureFrameStepBadgeActions, ToolbarFutureFrameStyle } from '../types';
import { FutureStepBadgeControl } from './future-step-badge-control';

const presetMocks = vi.hoisted(() => ({ visiblePresets: [] as StepBadgePreset[] }));

vi.mock('../../../selection/step-badge-popover/preset-controller', () => ({
  useStepBadgePresetPopoverController: () => ({
    catalog: {
      create: vi.fn(),
      error: null,
      pending: new Set(),
      presets: presetMocks.visiblePresets,
      reset: vi.fn(),
      toggle: vi.fn(),
      update: vi.fn(),
      value: null,
      visiblePresets: presetMocks.visiblePresets,
    },
    editor: {
      close: vi.fn(),
      isOpen: false,
      isSaving: false,
      open: vi.fn(),
      reset: vi.fn(),
      save: vi.fn(),
    },
  }),
}));

function Harness(props: ToolbarFutureFrameStepBadgeActions) {
  const menu = useToolbarMenuState();
  const [style, setStyle] = React.useState<ToolbarFutureFrameStyle>({
    blurSettings: { amount: 8, blurType: 'gaussian' as const, showBorder: true },
    borderSettings: DEFAULT_BORDER_PRESET,
    effectMode: 'border' as const,
    focusSettings: { opacity: 0.5, showBorder: false },
  });
  return <FutureStepBadgeControl actions={props} menu={menu} setStyle={setStyle} style={style} />;
}

it('enables future numbering on the first click and opens its menu', async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const settings = createStepBadgeSettingsFromTemplate(DEFAULT_STEP_BADGE_TEMPLATE);
  const enable: ToolbarFutureFrameStepBadgeActions['enable'] = vi.fn(() => settings);
  const set: ToolbarFutureFrameStepBadgeActions['set'] = vi.fn();
  await act(async () => root.render(<Harness enable={enable} set={set} />));
  const button = host.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.future-frame-step-badge"]'
  )!;
  await act(async () => button.click());
  expect(enable).toHaveBeenCalledOnce();
  expect(set).toHaveBeenCalledWith(settings);
  expect(button.getAttribute('aria-pressed')).toBe('true');
  const popover = document.querySelector('[data-ui="content.toolbar.future-step-badge-popover"]');
  expect(popover).not.toBeNull();
  expect(popover?.querySelector('[data-field-label="Значение"]')).toBeNull();
  expect(popover?.classList.contains('sniptale-main-toolbar-popover')).toBe(true);
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  expect(
    document.querySelector('[data-ui="content.toolbar.future-step-badge-popover"]')
  ).toBeNull();
  expect(document.activeElement).toBe(button);
  await act(async () => root.unmount());
  host.remove();
});

it('keeps the toolbar popover open while selecting a template to overwrite', async () => {
  vi.useFakeTimers();
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const settings = createStepBadgeSettingsFromTemplate(DEFAULT_STEP_BADGE_TEMPLATE);
  const enable: ToolbarFutureFrameStepBadgeActions['enable'] = vi.fn(() => settings);
  const set: ToolbarFutureFrameStepBadgeActions['set'] = vi.fn();
  presetMocks.visiblePresets = [
    {
      id: 'test-template',
      name: 'Тестовый шаблон',
      order: 0,
      settings: DEFAULT_STEP_BADGE_TEMPLATE,
    },
  ];

  try {
    await act(async () => root.render(<Harness enable={enable} set={set} />));
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[data-ui="content.toolbar.future-frame-step-badge"]')
        ?.click()
    );
    await act(async () =>
      document.querySelector<HTMLButtonElement>('button[aria-label="Сохранение"]')?.click()
    );
    await act(async () => vi.advanceTimersByTimeAsync(301));
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>(
          '[data-ui="shared.highlighter-template-save-settings"] button[aria-haspopup="listbox"]'
        )
        ?.click()
    );
    const option = document.querySelector<HTMLButtonElement>('[role="option"]');
    expect(option).not.toBeNull();
    await act(async () => {
      option?.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
      option?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      option?.click();
    });

    expect(
      document.querySelector('[data-ui="content.toolbar.future-step-badge-popover"]')
    ).not.toBeNull();
  } finally {
    presetMocks.visiblePresets = [];
    await act(async () => root.unmount());
    host.remove();
    vi.useRealTimers();
  }
});

it('lets the toolbar trigger close the menu after outside dismissal activates', async () => {
  vi.useFakeTimers();
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const settings = createStepBadgeSettingsFromTemplate(DEFAULT_STEP_BADGE_TEMPLATE);
  const enable: ToolbarFutureFrameStepBadgeActions['enable'] = vi.fn(() => settings);
  const set: ToolbarFutureFrameStepBadgeActions['set'] = vi.fn();

  try {
    await act(async () => root.render(<Harness enable={enable} set={set} />));
    const button = host.querySelector<HTMLButtonElement>(
      '[data-ui="content.toolbar.future-frame-step-badge"]'
    )!;
    await act(async () => button.click());
    await act(async () => vi.advanceTimersByTimeAsync(151));
    await act(async () => {
      button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      button.click();
    });

    expect(
      document.querySelector('[data-ui="content.toolbar.future-step-badge-popover"]')
    ).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.useRealTimers();
  }
});
