// @vitest-environment jsdom

import { CommandPressScope } from '@sniptale/ui/control-language/press';
import { InspectorLayout } from '../../../ui/compact-inspector-controls/layout';
import { StepBadgeAutoSection, StepBadgeValueSection } from './views';

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
        `[title="${translate('content.stepBadge.templateSourceFrameHint')}"]`
      )
      ?.click()
  );
  expect(sourceChange).toHaveBeenCalledWith('frame-default');
});

for (const scoped of [false, true]) {
  it(`preserves numbering choices and native reorder admission with inspector scope ${scoped}`, () => {
    const preset = createSystemStepBadgePresetCatalog()[0]!;
    const settings = {
      ...createStepBadgeSettingsFromTemplate(preset.settings),
      type: 'letter' as const,
    };
    const onAuto = vi.fn();
    const onAlphabet = vi.fn();
    const onReorder = vi.fn();
    const content = (
      <>
        <StepBadgeAutoSection
          embedded
          isAuto
          settings={settings}
          onAlphabetChange={onAlphabet}
          onAutoModeChange={onAuto}
          onTypeChange={vi.fn()}
        />
        <StepBadgeValueSection
          embedded
          frameId="frame-numbered"
          isAuto
          value="A"
          onValueChange={vi.fn()}
          onReorder={onReorder}
        />
      </>
    );
    act(() =>
      root.render(
        scoped ? (
          <CommandPressScope value={true}>
            <InspectorLayout>{content}</InspectorLayout>
          </CommandPressScope>
        ) : (
          content
        )
      )
    );
    const toggle = host.querySelector<HTMLButtonElement>('.sniptale-glass-switch')!;
    act(() => toggle.click());
    expect(onAuto).toHaveBeenCalledWith(false);
    const alphabet = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === translate('content.stepBadge.alphabetLatin')
    );
    expect(host.querySelector<HTMLInputElement>('input')?.disabled).toBe(true);
    const reorder = host.querySelector<HTMLButtonElement>(
      `button[title="${translate('content.stepBadge.moveUp')}"]`
    )!;
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    act(() => reorder.dispatchEvent(down));
    expect(down.defaultPrevented).toBe(true);
    act(() => reorder.click());
    expect(onReorder).toHaveBeenCalledWith('up', 'frame-numbered');
    expect(alphabet).toBeDefined();
    act(() => alphabet!.click());
    expect(onAlphabet).toHaveBeenCalledWith('latin');
    expect(host.querySelector('.sniptale-field-clear')).toBeNull();
  });
}

it('clears only the editable manual value through its native input owner', () => {
  const onChange = vi.fn();
  act(() =>
    root.render(
      <CommandPressScope value={true}>
        <InspectorLayout>
          <StepBadgeValueSection
            embedded
            frameId="frame-manual"
            isAuto={false}
            value="AB"
            onValueChange={onChange}
          />
        </InspectorLayout>
      </CommandPressScope>
    )
  );
  const input = host.querySelector<HTMLInputElement>('input')!;
  expect(input.maxLength).toBe(2);
  const clear = host.querySelector<HTMLButtonElement>('.sniptale-field-clear')!;
  expect(clear.type).toBe('button');
  act(() => clear.click());
  expect(onChange).toHaveBeenCalledWith('');
  expect(document.activeElement).toBe(input);
});
