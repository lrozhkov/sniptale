// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CalloutDeleteButton, CalloutPresetSection } from './views';
import { CalloutManualSettings } from '../../../ui/highlighter-preset-editor/callout/inspector';
import { parseCalloutConnectorMarker } from '../../../ui/highlighter-preset-editor/callout/inspector-effects';
import { CalloutSettingsPopoverContent, createCalloutAnchorPlacement } from './body';
import { createDefaultCalloutSettings } from '../callout/model';
import { createSystemCalloutPresetCatalog } from '../../../features/highlighter/callout-presets/catalog';

const settings = createDefaultCalloutSettings();

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
        headerDrag={{
          isDragging: false,
          onPointerDown: vi.fn(),
          onPointerMove: vi.fn(),
          onPointerUp: vi.fn(),
        }}
        handleSettingChange={vi.fn()}
        localSettings={settings}
        onApplyPreset={vi.fn()}
        onCustomizePreset={vi.fn()}
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

    expect(markup).toContain('Настройки комментария');
    expect(markup).toContain('Пресет');
    expect(markup).toContain('Вручную');
    expect(markup).toContain('data-callout-settings-mode-switch="true"');
    expect(markup.match(/aria-pressed=/g)).toHaveLength(2);
    expect(markup).not.toContain('Сохранить как пресет');
    expect(markup).not.toContain('Название пресета');
    expect(markup.match(/data-callout-anchor=/g)).toHaveLength(8);
    expect(markup.indexOf('content.callout-settings.position-row')).toBeLessThan(
      markup.indexOf('content.callout-settings.mode-section')
    );
    expect(markup).toContain('aria-label="По центру слева"');
    expect(markup.indexOf('data-callout-anchor="middle-left"')).toBeLessThan(
      markup.indexOf('data-callout-anchor="top-left"')
    );
    expect(markup.indexOf('data-callout-anchor="middle-right"')).toBeGreaterThan(
      markup.indexOf('data-callout-anchor="bottom-right"')
    );
    expect(markup).toContain('justify-content:center');
  });

  it('uses Design Review navigation and visible labels for manual color controls', () => {
    const markup = renderToStaticMarkup(
      <CalloutManualSettings onChange={vi.fn()} settings={settings} />
    );

    expect(markup).toContain('aria-label="Параметры комментария"');
    expect(markup.match(/aria-pressed=/g)).toHaveLength(8);
    expect(markup).toContain('data-field-label="Текст"');
    expect(markup).toContain('shared.ui.color-selector');
    expect(markup).toContain('aria-label="Курсив"');
    expect(markup).toContain('aria-label="Подчёркнутый"');
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

    expect(markup.match(/aria-pressed=/g)).toHaveLength(9);
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

  it('keeps the destructive footer action on the shared popover danger button seam', () => {
    const markup = renderToStaticMarkup(<CalloutDeleteButton onDelete={vi.fn()} />);

    expect(markup).toContain('Выключить');
    expect(markup).toContain('sniptale-glass-destructive');
  });
});
