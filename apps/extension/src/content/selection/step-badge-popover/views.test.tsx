// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addStepBadgeReorderListener } from '../../platform/page-context/frame-events';
import { StepBadgePopoverContent } from '../../../composition/frame-annotation-controls/step-badge/body';
import { DEFAULT_STEP_BADGE_TEMPLATE } from '../../../features/highlighter/step-badge-presets/catalog';
import { createSystemStepBadgePresetCatalog } from '../../../features/highlighter/step-badge-presets/catalog';
import { StepBadgeAutoSection, StepBadgePositionSection, StepBadgeValueSection } from './views';
import { StepBadgePresetSection } from '../../../composition/frame-annotation-controls/step-badge/preset-list';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderHarness() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(
      <StepBadgeValueSection frameId="frame-1" isAuto onValueChange={vi.fn()} value="A" />
    );
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

function registerStepBadgeReorderTest(): void {
  it('dispatches reorder events through the shared event seam', () => {
    const listener = vi.fn();
    const cleanup = addStepBadgeReorderListener(listener);

    renderHarness();

    act(() => {
      container
        ?.querySelector<HTMLButtonElement>('button')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(listener).toHaveBeenCalledWith({ direction: 'up', frameId: 'frame-1' });

    cleanup();
  });
}

function registerStepBadgeAutoSectionTest(): void {
  it('uses the shared content popover section contract for auto mode', () => {
    const markup = renderToStaticMarkup(
      <StepBadgeAutoSection
        isAuto
        settings={{ enabled: true, type: 'letter', alphabet: 'latin', value: 'A' }}
        onAlphabetChange={vi.fn()}
        onAutoModeChange={vi.fn()}
        onTypeChange={vi.fn()}
      />
    );

    expect(markup).toContain('sniptale-content-popover-section');
    expect(markup).toContain('content.step-badge.auto-section');
    expect(markup).toContain('sniptale-glass-switch');
  });
}

function registerStepBadgeDisableActionTest(): void {
  it('keeps the disable action on the shared popover danger button seam', () => {
    const markup = renderToStaticMarkup(
      <StepBadgePopoverContent
        frameId="frame-1"
        headerContext="element"
        isAuto={false}
        localStepBadgeSettings={{ enabled: true, type: 'number', value: '1' }}
        onAlphabetChange={vi.fn()}
        onAnchorChange={vi.fn()}
        onAutoModeChange={vi.fn()}
        onDisable={vi.fn()}
        onClose={vi.fn()}
        onOffsetToggle={vi.fn()}
        onApplyPreset={vi.fn()}
        onForkPreset={vi.fn()}
        onCreatePreset={vi.fn(async () => ({ outcome: 'applied' }))}
        onResetPreset={vi.fn()}
        onShowPresets={vi.fn()}
        onSettingsChange={vi.fn()}
        onTogglePreset={vi.fn()}
        onTypeChange={vi.fn()}
        onUpdatePreset={vi.fn(async () => ({ outcome: 'applied' }))}
        onValueChange={vi.fn()}
        pendingPresetIds={new Set()}
        presetError={null}
        presets={[]}
        templateSettings={DEFAULT_STEP_BADGE_TEMPLATE}
        frameVisuals={{ borderColor: '#f97316', borderWidth: 4 }}
      />
    );

    expect(markup).toContain('sniptale-toolbar-menu-title');
    expect(markup).toContain('Нумерация');
    expect(markup).toContain('Назад к шаблонам');
    expect(markup).toContain('Не сохранено');
    expect(markup).toContain('sniptale-settings-popover-close');
    expect(markup).not.toContain('sniptale-glass-range-meta');
    expect(markup).toContain('data-ui="content.step-badge.manual-section"');
    expect(markup).toContain('data-ui="shared.categorized-inspector.section-heading"');
    expect(markup).toContain('>Нумерация</span>');
    expect(markup).not.toContain('sniptale-glass-preset-list');
    expect(markup).toContain('Выключить');
    expect(markup).toContain('sniptale-settings-popover-destructive-action');
  });
}

function registerStepBadgeConfigurePresetTest(): void {
  it('forks the selected preset into the inline temporary editing mode', () => {
    const preset = createSystemStepBadgePresetCatalog()[0]!;
    const onApplyPreset = vi.fn();
    const onForkPreset = vi.fn();
    act(() => {
      if (!container) {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
      }
      root?.render(
        <StepBadgePopoverContent
          frameId="frame-1"
          frameVisuals={{ borderColor: '#f97316', borderWidth: 4 }}
          headerContext="element"
          isAuto
          localStepBadgeSettings={{
            enabled: true,
            sourcePresetId: preset.id,
            type: 'number',
            value: '1',
          }}
          onAlphabetChange={vi.fn()}
          onAnchorChange={vi.fn()}
          onApplyPreset={onApplyPreset}
          onAutoModeChange={vi.fn()}
          onClose={vi.fn()}
          onForkPreset={onForkPreset}
          onCreatePreset={vi.fn(async () => ({ outcome: 'applied' }))}
          onDisable={vi.fn()}
          onOffsetToggle={vi.fn()}
          onResetPreset={vi.fn()}
          onShowPresets={vi.fn()}
          onSettingsChange={vi.fn()}
          onTogglePreset={vi.fn()}
          onTypeChange={vi.fn()}
          onUpdatePreset={vi.fn(async () => ({ outcome: 'applied' }))}
          onValueChange={vi.fn()}
          pendingPresetIds={new Set()}
          presetError={null}
          presets={[preset]}
          templateSettings={DEFAULT_STEP_BADGE_TEMPLATE}
        />
      );
    });

    act(() =>
      container?.querySelector<HTMLButtonElement>('.sniptale-callout-preset-action')?.click()
    );

    expect(onForkPreset).toHaveBeenCalledWith(preset);
    expect(onApplyPreset).not.toHaveBeenCalled();
    expect(container?.querySelector('nav')).not.toBeNull();
  });
}

function registerStepBadgeSharedViewActionsTest(): void {
  it('dispatches shared preset, position, value, and mode actions', () => {
    const presets = createSystemStepBadgePresetCatalog()
      .slice(0, 2)
      .map((preset, index) => ({
        ...preset,
        customized: index === 0,
        enabled: index === 1 ? false : true,
      }));
    const onApply = vi.fn();
    const onFork = vi.fn();
    const onReset = vi.fn();
    const onToggle = vi.fn();
    const onValueChange = vi.fn();
    const onAutoModeChange = vi.fn();
    const onAnchorChange = vi.fn();
    const onOffsetToggle = vi.fn();
    if (!container) {
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
    }
    act(() =>
      root?.render(
        <>
          <StepBadgePresetSection
            activePresetId={presets[0]!.id}
            error="catalog failed"
            onApply={onApply}
            onFork={onFork}
            onReset={onReset}
            onToggle={onToggle}
            pending={new Set()}
            presets={presets}
          />
          <StepBadgePositionSection
            onAnchorChange={onAnchorChange}
            onOffsetToggle={onOffsetToggle}
            selectedAnchor="top-left"
            selectedOffsets={[]}
          />
          <StepBadgeAutoSection
            embedded
            isAuto={false}
            onAlphabetChange={vi.fn()}
            onAutoModeChange={onAutoModeChange}
            onTypeChange={vi.fn()}
            settings={{ enabled: true, type: 'number', value: '1' }}
          />
          <StepBadgeValueSection
            embedded
            frameId="frame-1"
            isAuto={false}
            onValueChange={onValueChange}
            value="1"
          />
        </>
      )
    );
    const rows = [...container.querySelectorAll<HTMLElement>('.sniptale-callout-preset-row')];
    const valueInput = container.querySelector<HTMLInputElement>('.sniptale-step-badge-input');
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    act(() => {
      rows[0]?.querySelector<HTMLButtonElement>('.sniptale-glass-preset-item')?.click();
      rows.forEach((row) =>
        row
          .querySelectorAll<HTMLButtonElement>('.sniptale-callout-preset-action')
          .forEach((button) => button.click())
      );
      container?.querySelector<HTMLButtonElement>('[data-step-badge-anchor="top-center"]')?.click();
      container?.querySelector<HTMLButtonElement>('[data-offset-direction="up"]')?.click();
      container?.querySelector<HTMLButtonElement>('.sniptale-glass-switch')?.click();
      valueSetter?.call(valueInput, '22');
      valueInput?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(onApply).toHaveBeenCalledWith(presets[0]);
    expect(onFork).toHaveBeenCalledOnce();
    expect(onFork).toHaveBeenCalledWith(presets[0]);
    expect(onReset).toHaveBeenCalledWith(presets[0]);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onAutoModeChange).toHaveBeenCalledWith(true);
    expect(onValueChange).toHaveBeenCalledWith('22');
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('catalog failed');
  });
}

describe('StepBadgeValueSection', () => {
  registerStepBadgeReorderTest();
  registerStepBadgeAutoSectionTest();
  registerStepBadgeDisableActionTest();
  registerStepBadgeConfigurePresetTest();
  registerStepBadgeSharedViewActionsTest();
});
