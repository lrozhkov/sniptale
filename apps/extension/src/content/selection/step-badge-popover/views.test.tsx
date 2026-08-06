// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addStepBadgeReorderListener } from '../../platform/page-context/frame-events';
import { StepBadgePopoverContent } from './body';
import { DEFAULT_STEP_BADGE_TEMPLATE } from '../../../features/highlighter/step-badge-presets/catalog';
import { createSystemStepBadgePresetCatalog } from '../../../features/highlighter/step-badge-presets/catalog';
import { StepBadgeAutoSection, StepBadgeValueSection } from './views';

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
        onConfigurePreset={vi.fn()}
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
    expect(markup).toContain('Шаблоны');
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
  it('opens the persistent preset editor without applying the preset or entering manual mode', () => {
    const preset = createSystemStepBadgePresetCatalog()[0]!;
    const onApplyPreset = vi.fn();
    const onConfigurePreset = vi.fn();
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
          onConfigurePreset={onConfigurePreset}
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

    expect(onConfigurePreset).toHaveBeenCalledWith(preset);
    expect(onApplyPreset).not.toHaveBeenCalled();
    expect(container?.querySelector('nav')).toBeNull();
  });
}

describe('StepBadgeValueSection', () => {
  registerStepBadgeReorderTest();
  registerStepBadgeAutoSectionTest();
  registerStepBadgeDisableActionTest();
  registerStepBadgeConfigurePresetTest();
});
