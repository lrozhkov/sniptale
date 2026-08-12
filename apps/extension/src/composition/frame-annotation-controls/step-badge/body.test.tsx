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

it('forks any template in one click, guards unsaved return, and opens saving only on request', async () => {
  const catalog = createSystemStepBadgePresetCatalog();
  const preset = catalog[0]!;
  const inactivePreset = catalog[1]!;
  const settings = createStepBadgeSettingsFromTemplate(preset.settings, preset.id);
  const onForkPreset = vi.fn();
  const onApplyToFuture = vi.fn();
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
        onApplyToFuture={onApplyToFuture}
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
        presets={[preset, inactivePreset]}
        templateSettings={preset.settings}
      />
    )
  );

  const fork = host.querySelector<HTMLButtonElement>(
    `button[data-template-fork-source="${inactivePreset.id}"]`
  )!;
  act(() => fork.click());
  expect(onForkPreset).toHaveBeenCalledWith(inactivePreset);
  expect(host.querySelector('[data-ui="content.step-badge.manual-section"]')).not.toBeNull();
  const temporaryStatus = host.querySelector(
    '[data-ui="shared.categorized-inspector.section-status"]'
  );
  expect(temporaryStatus?.textContent).toBe(translate('content.templateFork.temporaryStatus'));
  expect(temporaryStatus?.closest('nav')).not.toBeNull();
  expect(host.querySelector('.sniptale-settings-popover-header')?.contains(temporaryStatus)).toBe(
    false
  );
  expect(host.querySelector('[aria-pressed="true"]')?.getAttribute('aria-label')).toBe(
    translate('content.stepBadge.numberingSection')
  );
  expect(
    host.querySelector('.sniptale-settings-popover-header [data-settings-action="apply-to-future"]')
  ).toBeNull();

  const saveSection = host.querySelector<HTMLButtonElement>(
    `button[aria-label="${translate('content.stepBadge.saveSection')}"]`
  )!;
  act(() => saveSection.click());

  const applyToFuture = host.querySelector<HTMLButtonElement>(
    '[data-settings-action="apply-to-future"]'
  )!;
  expect(
    applyToFuture.closest('[data-ui="shared.highlighter-template-save-settings"]')
  ).not.toBeNull();
  act(() => applyToFuture.click());
  expect(onApplyToFuture).not.toHaveBeenCalled();
  expect(
    host.querySelector('[data-ui="content.template-fork.apply-to-future-guard"]')
  ).not.toBeNull();
  const confirmApply = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === translate('content.templateFork.applyToFutureConfirm')
  )!;
  act(() => confirmApply.click());
  expect(onApplyToFuture).toHaveBeenCalledOnce();

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
