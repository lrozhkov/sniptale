// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  CalloutPositionSection,
  CalloutPresetSection,
} from '../../../composition/frame-annotation-controls/callout/views';
import { CalloutManualSettings } from '../../../ui/highlighter-preset-editor/callout/inspector';
import { parseCalloutConnectorMarker } from '../../../ui/highlighter-preset-editor/callout/inspector-effects';
import {
  CalloutSettingsPopoverContent,
  createCalloutAnchorPlacement,
} from '../../../composition/frame-annotation-controls/callout/body';
import { createDefaultCalloutSettings } from '../../../features/highlighter/frame-annotation/callout/model';
import { createSystemCalloutPresetCatalog } from '../../../features/highlighter/callout-presets/catalog';

const settings = createDefaultCalloutSettings(undefined, 'system-callout-bubble');

describe('callout settings views', () => {
  it('narrows connector markers at the DOM boundary', () => {
    expect(parseCalloutConnectorMarker('diamond')).toBe('diamond');
    expect(parseCalloutConnectorMarker('unexpected-marker')).toBeNull();
  });

  it('maps each compact anchor choice to its outward side', () => {
    expect(createCalloutAnchorPlacement('top-left')).toEqual({ anchor: 'top-left', side: 'top' });
    expect(createCalloutAnchorPlacement('middle-right')).toEqual({
      anchor: 'middle-right',
      side: 'right',
    });
    expect(createCalloutAnchorPlacement('bottom-center')).toEqual({
      anchor: 'bottom-center',
      side: 'bottom',
    });
  });

  it('offers creating a copy from every template, including the inactive ones', () => {
    const presets = createSystemCalloutPresetCatalog().slice(0, 2);
    const markup = renderToStaticMarkup(
      <CalloutPresetSection
        activePresetId={presets[0]!.id}
        error={null}
        onApplyPreset={vi.fn()}
        onForkPreset={vi.fn()}
        onTogglePreset={vi.fn()}
        pendingPresetIds={new Set()}
        presets={presets}
      />
    );

    expect(markup.match(/data-template-fork-source=/g)).toHaveLength(2);
    expect(markup).toContain(`data-template-fork-source="${presets[1]!.id}"`);
  });

  it('renders the two editing modes without preset persistence controls', () => {
    const markup = renderToStaticMarkup(
      <CalloutSettingsPopoverContent
        handleDelete={vi.fn()}
        headerContext="element"
        headerDrag={{
          isDragging: false,
          onPointerDown: vi.fn(),
          onPointerMove: vi.fn(),
          onPointerUp: vi.fn(),
          position: { left: 0, top: 0 },
        }}
        handleSettingChange={vi.fn()}
        localSettings={settings}
        onApplyPreset={vi.fn()}
        onForkPreset={vi.fn()}
        onShowPresets={vi.fn()}
        onTogglePreset={vi.fn()}
        pendingPresetIds={new Set()}
        presets={[]}
        presetError={null}
        saveSection={{
          error: null,
          isSaving: false,
          onCreate: vi.fn().mockResolvedValue(true),
          onOverwrite: vi.fn().mockResolvedValue(true),
          presets: [],
        }}
        onClose={vi.fn()}
      />
    );

    expect(markup).toContain('Комментарии');
    expect(markup).not.toContain('Создать копию');
    expect(markup).toContain('sniptale-settings-popover-destructive-action');
    expect(markup).toContain('sniptale-settings-popover-close');
    expect(markup).not.toContain('data-callout-settings-mode-switch');
    expect(markup).not.toContain('Сохранить как шаблон');
    expect(markup).not.toContain('Название шаблона');
    expect(markup).not.toContain('data-callout-anchor=');
  });

  it('opens directly in manual mode for a customized callout', () => {
    const markup = renderToStaticMarkup(
      <CalloutSettingsPopoverContent
        handleDelete={vi.fn()}
        headerContext="element"
        handleSettingChange={vi.fn()}
        localSettings={createDefaultCalloutSettings()}
        onApplyPreset={vi.fn()}
        onForkPreset={vi.fn()}
        onShowPresets={vi.fn()}
        onTogglePreset={vi.fn()}
        pendingPresetIds={new Set()}
        presets={createSystemCalloutPresetCatalog()}
        presetError={null}
        saveSection={{
          error: null,
          isSaving: false,
          onCreate: vi.fn().mockResolvedValue(true),
          onOverwrite: vi.fn().mockResolvedValue(true),
          presets: [],
        }}
        onClose={vi.fn()}
      />
    );

    expect(markup).toContain('aria-label="Параметры комментария"');
    expect(markup).toContain('Назад к шаблонам');
    expect(markup).toContain('Не сохранено');
    expect(markup).toContain('data-ui="shared.categorized-inspector.section-status"');
    expect(markup).not.toContain('sniptale-settings-popover-status');
    expect(markup).toContain('data-ui="shared.highlighter-manual-inspector-surface"');
    expect(markup).toContain('data-ui="shared.categorized-inspector.section-heading"');
    expect(markup).toContain('>Текст</span>');
    expect(markup).not.toContain('sniptale-callout-preset-list');
  });

  it('uses Design Review navigation and visible labels for manual color controls', () => {
    const markup = renderToStaticMarkup(
      <CalloutManualSettings onChange={vi.fn()} settings={settings} />
    );

    expect(markup).toContain('aria-label="Параметры комментария"');
    expect(markup.match(/aria-pressed=/g)).toHaveLength(9);
    expect(markup).toContain('data-field-label="Цвет текста"');
    expect(markup).toContain('shared.ui.color-selector');
    expect(markup).toContain('aria-label="Курсив"');
    expect(markup).toContain('aria-label="Подчёркнутый"');
  });

  it('renders position as a square category only in manual settings', () => {
    const markup = renderToStaticMarkup(
      <CalloutManualSettings
        onChange={vi.fn()}
        positionSection={<CalloutPositionSection embedded anchor="top-left" onChange={vi.fn()} />}
        settings={settings}
      />
    );
    const gridMarkup = renderToStaticMarkup(
      <CalloutPositionSection embedded anchor="top-left" onChange={vi.fn()} />
    );

    expect(markup).toContain('aria-label="Позиция"');
    expect(gridMarkup).toContain('data-position-layout="square"');
    expect(gridMarkup.match(/data-callout-anchor=/g)).toHaveLength(8);
    expect(gridMarkup).toContain('grid-template-columns:repeat(3, 28px)');
  });

  it('adds saving as the last manual section only when persistence actions are provided', () => {
    const presets = createSystemCalloutPresetCatalog();
    const markup = renderToStaticMarkup(
      <CalloutManualSettings
        onChange={vi.fn()}
        saveSection={{
          error: null,
          isSaving: false,
          onCreate: vi.fn().mockResolvedValue(true),
          onOverwrite: vi.fn().mockResolvedValue(true),
          presets,
        }}
        settings={settings}
      />
    );

    expect(markup.match(/aria-pressed=/g)).toHaveLength(10);
    expect(markup).toContain('aria-label="Сохранение"');
    expect(markup.lastIndexOf('aria-label="Сохранение"')).toBeGreaterThan(
      markup.lastIndexOf('aria-label="Стили"')
    );
  });

  it('renders preset previews with hover customization and hide actions', () => {
    const markup = renderToStaticMarkup(
      <CalloutPresetSection
        activePresetId="system-callout-bubble"
        error={null}
        onApplyPreset={vi.fn()}
        onForkPreset={vi.fn()}
        onTogglePreset={vi.fn()}
        pendingPresetIds={new Set()}
        presets={createSystemCalloutPresetCatalog()}
      />
    );

    expect(markup).toContain('relative flex flex-shrink-0');
    expect(markup).toContain('h-9 w-16');
    expect(markup).toContain('sniptale-callout-preset-list');
    expect(markup).toContain('sniptale-glass-preset-item--active');
    expect(markup).toContain('Создать копию');
    expect(markup).toContain('Скрыть из списка');
  });
});

describe('callout settings shared interactions', () => {
  it('dispatches apply, fork, reset, and visibility actions from shared preset rows', () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const presets = createSystemCalloutPresetCatalog()
      .slice(0, 2)
      .map((preset, index) => ({
        ...preset,
        customized: index === 0,
        enabled: index === 1 ? false : true,
      }));
    const onApplyPreset = vi.fn();
    const onForkPreset = vi.fn();
    const onResetPreset = vi.fn();
    const onTogglePreset = vi.fn();

    act(() =>
      root.render(
        <CalloutPresetSection
          activePresetId={presets[0]!.id}
          error="catalog failed"
          onApplyPreset={onApplyPreset}
          onForkPreset={onForkPreset}
          onResetPreset={onResetPreset}
          onTogglePreset={onTogglePreset}
          pendingPresetIds={new Set()}
          presets={presets}
        />
      )
    );
    const rows = [...host.querySelectorAll<HTMLElement>('.sniptale-callout-preset-row')];
    act(() => {
      rows[0]?.querySelector<HTMLButtonElement>('.sniptale-glass-preset-item')?.click();
      rows[0]
        ?.querySelectorAll<HTMLButtonElement>('.sniptale-callout-preset-action')
        .forEach((button) => button.click());
      rows[1]
        ?.querySelectorAll<HTMLButtonElement>('.sniptale-callout-preset-action')
        .forEach((button) => button.click());
    });

    expect(onApplyPreset).toHaveBeenCalledWith(presets[0]);
    expect(onForkPreset).toHaveBeenCalledTimes(2);
    expect(onForkPreset).toHaveBeenCalledWith(presets[0]);
    expect(onForkPreset).toHaveBeenCalledWith(presets[1]);
    expect(onResetPreset).toHaveBeenCalledWith(presets[0]);
    expect(onTogglePreset).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('catalog failed');
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  it('switches between shared preset and manual modes and commits position changes', () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const presets = createSystemCalloutPresetCatalog().slice(0, 2);
    const onApplyPreset = vi.fn();
    const onClose = vi.fn();
    const handleSettingChange = vi.fn();
    act(() =>
      root.render(
        <CalloutSettingsPopoverContent
          handleDelete={vi.fn()}
          handleSettingChange={handleSettingChange}
          headerContext="element"
          localSettings={createDefaultCalloutSettings(undefined, presets[0]!.id)}
          onApplyPreset={onApplyPreset}
          onClose={onClose}
          onForkPreset={vi.fn()}
          onShowPresets={vi.fn()}
          onTogglePreset={vi.fn()}
          pendingPresetIds={new Set()}
          presetError={null}
          presets={presets}
          saveSection={{
            error: null,
            isSaving: false,
            onCreate: vi.fn().mockResolvedValue(true),
            onOverwrite: vi.fn().mockResolvedValue(true),
            presets,
          }}
        />
      )
    );
    const rows = [...host.querySelectorAll<HTMLElement>('.sniptale-callout-preset-row')];
    act(() => {
      rows[0]?.querySelector<HTMLButtonElement>('.sniptale-glass-preset-item')?.click();
      rows[1]?.querySelector<HTMLButtonElement>('.sniptale-glass-preset-item')?.click();
    });
    act(() => host.querySelector<HTMLButtonElement>('button[title="Создать копию"]')?.click());
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Позиция"]')?.click());
    act(() => {
      [...host.querySelectorAll<HTMLElement>('[data-callout-anchor]')].at(-1)?.click();
    });
    expect(onClose).toHaveBeenCalled();
    expect(onApplyPreset).toHaveBeenCalled();
    expect(handleSettingChange).toHaveBeenCalledWith({ placement: expect.any(Object) });
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });
});
