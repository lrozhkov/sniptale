// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createSystemStepBadgePresetCatalog,
  createStepBadgeSettingsFromTemplate,
} from '../../../features/highlighter/step-badge-presets/catalog';
import { translate } from '../../../platform/i18n';
import { StepBadgePopoverContent } from './body';

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

it('forks the active template, guards unsaved return, and opens saving only on request', async () => {
  const preset = createSystemStepBadgePresetCatalog()[0]!;
  const settings = createStepBadgeSettingsFromTemplate(preset.settings, preset.id);
  const onForkPreset = vi.fn();
  const onShowPresets = vi.fn();
  const onTemplateCreated = vi.fn();

  act(() =>
    root.render(
      <StepBadgePopoverContent
        frameId="frame-1"
        frameVisuals={{ borderColor: '#f97316', borderWidth: 2 }}
        headerContext="element"
        isAuto
        localStepBadgeSettings={settings}
        onAlphabetChange={vi.fn()}
        onAnchorChange={vi.fn()}
        onApplyPreset={vi.fn()}
        onAutoModeChange={vi.fn()}
        onClose={vi.fn()}
        onCreatePreset={vi.fn(async () => ({ id: 'saved', outcome: 'applied' }))}
        onDisable={vi.fn()}
        onForkPreset={onForkPreset}
        onOffsetToggle={vi.fn()}
        onResetPreset={vi.fn()}
        onSettingsChange={vi.fn()}
        onShowPresets={onShowPresets}
        onTogglePreset={vi.fn()}
        onTemplateCreated={onTemplateCreated}
        onTypeChange={vi.fn()}
        onUpdatePreset={vi.fn(async () => ({ outcome: 'applied' }))}
        onValueChange={vi.fn()}
        pendingPresetIds={new Set()}
        presetError={null}
        presets={[preset]}
        templateSettings={preset.settings}
      />
    )
  );

  const fork = host.querySelector<HTMLButtonElement>(
    `button[aria-label="${translate('content.templateFork.fork')}"]`
  )!;
  act(() => fork.click());
  expect(onForkPreset).toHaveBeenCalledWith(preset);
  expect(host.querySelector('[data-ui="content.step-badge.manual-section"]')).not.toBeNull();
  expect(host.querySelector('[aria-pressed="true"]')?.getAttribute('aria-label')).toBe(
    translate('content.stepBadge.numberingSection')
  );

  const back = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === translate('content.templateFork.backToTemplates')
  )!;
  act(() => back.click());
  expect(host.querySelector('[data-ui="content.template-fork.return-guard"]')).not.toBeNull();
  const save = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === translate('content.templateFork.goToSave')
  )!;
  act(() => save.click());
  expect(host.querySelector('[aria-pressed="true"]')?.getAttribute('aria-label')).toBe(
    translate('content.stepBadge.saveSection')
  );
  const input = host.querySelector<HTMLInputElement>('input')!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  act(() => {
    setter?.call(input, 'Saved badge');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const create = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === translate('content.stepBadge.createTemplate')
  )!;
  await act(async () => create.click());
  expect(onTemplateCreated).toHaveBeenCalledWith('saved');
  expect(onShowPresets).toHaveBeenCalledOnce();
});

it('uses the fallback fork handler and supports the optional template source control', () => {
  const preset = createSystemStepBadgePresetCatalog()[0]!;
  const settings = createStepBadgeSettingsFromTemplate(preset.settings, preset.id);
  const onSettingsChange = vi.fn();
  const sourceChange = vi.fn();
  act(() =>
    root.render(
      <StepBadgePopoverContent
        frameId="frame-2"
        frameVisuals={{ borderColor: '#f97316', borderWidth: 2 }}
        headerContext="toolbar"
        isAuto
        localStepBadgeSettings={settings}
        onAlphabetChange={vi.fn()}
        onAnchorChange={vi.fn()}
        onApplyPreset={vi.fn()}
        onAutoModeChange={vi.fn()}
        onClose={vi.fn()}
        onCreatePreset={vi.fn(async () => ({ outcome: 'applied' }))}
        onDisable={vi.fn()}
        onOffsetToggle={vi.fn()}
        onResetPreset={vi.fn()}
        onSettingsChange={onSettingsChange}
        onShowPresets={vi.fn()}
        onTogglePreset={vi.fn()}
        onTypeChange={vi.fn()}
        onUpdatePreset={vi.fn(async () => ({ outcome: 'applied' }))}
        onValueChange={vi.fn()}
        pendingPresetIds={new Set()}
        presetError={null}
        presets={[preset]}
        templateSettings={settings}
        templateSourceControl={{ onChange: sourceChange, value: 'forced' }}
      />
    )
  );
  act(() =>
    host
      .querySelector<HTMLButtonElement>(
        `button[aria-label="${translate('content.templateFork.fork')}"]`
      )
      ?.click()
  );
  expect(onSettingsChange).toHaveBeenCalledWith({});
  act(() =>
    host
      .querySelector<HTMLButtonElement>(
        `[title="${translate('content.stepBadge.templateSourceForcedHint')}"]`
      )
      ?.click()
  );
  expect(sourceChange).toHaveBeenCalledWith('frame-default');
});
