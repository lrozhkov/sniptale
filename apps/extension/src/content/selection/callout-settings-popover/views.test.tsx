// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  CalloutAppearanceSection,
  CalloutDeleteButton,
  CalloutTypographySection,
  parseCalloutConnectorMarker,
} from './views';
import { CalloutSettingsPopoverContent } from './body';
import { createDefaultCalloutSettings } from '../callout/model';

const settings = createDefaultCalloutSettings();

describe('CalloutAppearanceSection', () => {
  it('narrows connector markers at the DOM boundary', () => {
    expect(parseCalloutConnectorMarker('diamond')).toBe('diamond');
    expect(parseCalloutConnectorMarker('unexpected-marker')).toBeNull();
  });

  it('renders the canonical comment settings menu title', () => {
    const markup = renderToStaticMarkup(
      <CalloutSettingsPopoverContent
        handleDelete={vi.fn()}
        handleSettingChange={vi.fn()}
        localSettings={settings}
        onApplyPreset={vi.fn()}
        onEditPreset={vi.fn()}
        onSavePreset={vi.fn()}
        onTogglePreset={vi.fn()}
        presets={[]}
        presetError={null}
      />
    );

    expect(markup).toContain('sniptale-toolbar-menu-title');
    expect(markup).toContain('Настройки комментария');
  });

  it('renders inside the shared content popover section contract', () => {
    const markup = renderToStaticMarkup(
      <CalloutAppearanceSection onChange={vi.fn()} settings={settings} />
    );

    expect(markup).toContain('sniptale-content-popover-section');
    expect(markup).toContain('content.callout-settings.appearance-section');
    expect(markup).toContain('shared.ui.color-selector');
  });

  it('keeps the destructive footer action on the shared popover danger button seam', () => {
    const markup = renderToStaticMarkup(<CalloutDeleteButton onDelete={vi.fn()} />);

    expect(markup).toContain('Выключить');
    expect(markup).toContain('sniptale-glass-destructive');
  });

  it('stacks typography ranges compactly without redundant scale labels', () => {
    const markup = renderToStaticMarkup(
      <CalloutTypographySection onChange={vi.fn()} settings={settings} />
    );

    expect(markup.match(/sniptale-content-popover-range-field/g)).toHaveLength(2);
    expect(markup).not.toContain('sniptale-glass-range-meta');
  });
});
