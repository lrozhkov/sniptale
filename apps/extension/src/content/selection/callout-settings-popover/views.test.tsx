// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CalloutPositionSection, CalloutPresetSection } from './views';
import { CalloutManualSettings } from '../../../ui/highlighter-preset-editor/callout/inspector';
import { parseCalloutConnectorMarker } from '../../../ui/highlighter-preset-editor/callout/inspector-effects';
import { CalloutSettingsPopoverContent, createCalloutAnchorPlacement } from './body';
import { createDefaultCalloutSettings } from '../callout/model';
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
        onCustomizePreset={vi.fn()}
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
    expect(markup).toContain('Настроить');
    expect(markup).toContain('sniptale-settings-popover-destructive-action');
    expect(markup).toContain('sniptale-settings-popover-close');
    expect(markup).not.toContain('data-callout-settings-mode-switch');
    expect(markup).not.toContain('Сохранить как пресет');
    expect(markup).not.toContain('Название пресета');
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
        onCustomizePreset={vi.fn()}
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
    expect(markup).toContain('Шаблоны');
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
        onCustomizePreset={vi.fn()}
        onTogglePreset={vi.fn()}
        pendingPresetIds={new Set()}
        presets={createSystemCalloutPresetCatalog()}
      />
    );

    expect(markup).toContain('relative flex flex-shrink-0');
    expect(markup).toContain('h-9 w-16');
    expect(markup).toContain('sniptale-callout-preset-list');
    expect(markup).toContain('sniptale-glass-preset-item--active');
    expect(markup).toContain('Настроить стиль');
    expect(markup).toContain('Скрыть из списка');
  });
});
