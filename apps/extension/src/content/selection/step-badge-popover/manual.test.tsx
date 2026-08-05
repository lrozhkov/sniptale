// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import {
  createStepBadgeSettingsFromTemplate,
  DEFAULT_STEP_BADGE_TEMPLATE,
} from '../../../features/highlighter/step-badge-presets/catalog';
import { StepBadgeManualSettings } from './manual';

it('organizes manual numbering settings by category and cycles color sources beside the picker', async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const settings = createStepBadgeSettingsFromTemplate(DEFAULT_STEP_BADGE_TEMPLATE);
  const onSettingsChange = vi.fn();

  await act(async () => {
    root.render(
      <StepBadgeManualSettings
        frameId="frame-1"
        frameVisuals={{ borderColor: '#f97316', borderWidth: 4 }}
        isAuto
        onAlphabetChange={vi.fn()}
        onAnchorChange={vi.fn()}
        onAutoModeChange={vi.fn()}
        onCreatePreset={vi.fn(async () => ({ outcome: 'applied' }))}
        onOffsetToggle={vi.fn()}
        onSettingsChange={onSettingsChange}
        onTypeChange={vi.fn()}
        onUpdatePreset={vi.fn(async () => ({ outcome: 'applied' }))}
        onValueChange={vi.fn()}
        presets={[]}
        settings={settings}
        templateSettings={DEFAULT_STEP_BADGE_TEMPLATE}
      />
    );
  });

  expect(host.querySelectorAll('nav button')).toHaveLength(6);
  expect(
    host.querySelector('[data-ui="shared.highlighter-manual-inspector-surface"]')
  ).not.toBeNull();
  expect(host.querySelector('button[aria-label="Нумерация"]')?.getAttribute('aria-pressed')).toBe(
    'true'
  );
  expect(host.querySelector('[data-field-label="Значение"]')).toBeNull();

  await act(async () =>
    host.querySelector<HTMLButtonElement>('button[aria-label="Цвета"]')?.click()
  );
  const backgroundSource = host.querySelector<HTMLButtonElement>(
    '[data-step-badge-color-role="background"]'
  );
  expect(backgroundSource).not.toBeNull();
  expect(backgroundSource?.previousElementSibling?.tagName).toBe('FIELDSET');
  await act(async () => backgroundSource?.click());
  expect(onSettingsChange).toHaveBeenCalledWith(
    expect.objectContaining({
      style: expect.objectContaining({ backgroundColorSource: 'frame-fill' }),
    })
  );

  await act(async () =>
    host.querySelector<HTMLButtonElement>('button[aria-label="Стили"]')?.click()
  );
  expect(
    host.querySelector('textarea[aria-label]') ?? host.querySelector('textarea')
  ).not.toBeNull();

  await act(async () =>
    host.querySelector<HTMLButtonElement>('button[aria-label="Сохранение"]')?.click()
  );
  expect(host.textContent).toContain('Сохранить как новый шаблон');
  expect(host.textContent).toContain('Обновить выбранный шаблон');
  const nameInput = host.querySelector<HTMLInputElement>('input[aria-label="Название шаблона"]');
  expect(nameInput?.className).toContain('cursor-text');
  expect(nameInput?.getAttribute('type')).toBe('text');
  expect(nameInput?.style.cursor).toBe('text');
  expect(nameInput?.placeholder).toBe('Название шаблона');
  await act(async () => nameInput?.focus());
  expect(nameInput?.placeholder).toBe('');

  await act(async () => root.unmount());
  host.remove();
});

it('shows the concrete value on every surface only when automatic numbering is off', async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const settings = createStepBadgeSettingsFromTemplate(DEFAULT_STEP_BADGE_TEMPLATE);
  const commonProps = {
    frameId: 'future-frame-step-badge',
    frameVisuals: { borderColor: '#f97316', borderWidth: 4 },
    isAuto: true,
    onAlphabetChange: vi.fn(),
    onAnchorChange: vi.fn(),
    onAutoModeChange: vi.fn(),
    onCreatePreset: vi.fn(async () => ({ outcome: 'applied' })),
    onOffsetToggle: vi.fn(),
    onSettingsChange: vi.fn(),
    onTypeChange: vi.fn(),
    onUpdatePreset: vi.fn(async () => ({ outcome: 'applied' })),
    onValueChange: vi.fn(),
    presets: [],
    settings,
    templateSettings: DEFAULT_STEP_BADGE_TEMPLATE,
  };

  await act(async () => root.render(<StepBadgeManualSettings {...commonProps} />));
  expect(host.querySelector('[data-field-label="Значение"]')).toBeNull();

  await act(async () =>
    root.render(
      <StepBadgeManualSettings
        {...commonProps}
        isAuto={false}
        settings={{ ...settings, auto: false, value: '7' }}
      />
    )
  );
  expect(host.querySelector('[data-field-label="Значение"]')).not.toBeNull();
  expect(host.querySelector<HTMLInputElement>('input[aria-label="Значение"]')?.value).toBe('7');

  await act(async () => root.unmount());
  host.remove();
});
