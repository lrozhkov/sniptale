// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CalloutAppearanceSection, CalloutDeleteButton, CalloutTypographySection } from './views';
import { CalloutSettingsPopoverContent } from './body';

describe('CalloutAppearanceSection', () => {
  it('renders the canonical comment settings menu title', () => {
    const markup = renderToStaticMarkup(
      <CalloutSettingsPopoverContent
        handleDelete={vi.fn()}
        handleSettingChange={vi.fn()}
        isTextOnly={false}
        localSettings={{
          anchor: 'top-center',
          bgColor: '#1f2937',
          enabled: true,
          fontFamily: 'sans',
          fontSize: 16,
          fontWeight: 'normal',
          htmlContent: 'Comment',
          maxWidth: 300,
          side: 'auto',
          tailSize: 12,
          textColor: '#ffffff',
          variant: 'bubble',
        }}
        variantOptions={[{ value: 'bubble', label: 'Bubble' }]}
      />
    );

    expect(markup).toContain('sniptale-toolbar-menu-title');
    expect(markup).toContain('Настройки комментария');
  });

  it('renders inside the shared content popover section contract', () => {
    const markup = renderToStaticMarkup(
      <CalloutAppearanceSection
        bgColor="#1f2937"
        isTextOnly={false}
        onBackgroundChange={vi.fn()}
        onTextColorChange={vi.fn()}
        onVariantChange={vi.fn()}
        textColor="#ffffff"
        variant="bubble"
        variantOptions={[
          { value: 'bubble', label: 'Bubble' },
          { value: 'rect', label: 'Rect' },
        ]}
      />
    );

    expect(markup).toContain('sniptale-content-popover-section');
    expect(markup).toContain('content.callout-settings.appearance-section');
    expect(markup).toContain('Bubble');
    expect(markup).toContain('sniptale-glass-color-control');
  });

  it('keeps the destructive footer action on the shared popover danger button seam', () => {
    const markup = renderToStaticMarkup(<CalloutDeleteButton onDelete={vi.fn()} />);

    expect(markup).toContain('Выключить');
    expect(markup).toContain('sniptale-glass-destructive');
  });

  it('stacks typography ranges compactly without redundant scale labels', () => {
    const markup = renderToStaticMarkup(
      <CalloutTypographySection
        fontFamily="sans"
        fontSize={16}
        fontWeight="normal"
        isTextOnly={false}
        maxWidth={300}
        onFontFamilyChange={vi.fn()}
        onFontSizeChange={vi.fn()}
        onFontWeightToggle={vi.fn()}
        onMaxWidthChange={vi.fn()}
        onTailSizeChange={vi.fn()}
        tailSize={12}
      />
    );

    expect(markup).toContain('sniptale-content-popover-range-grid');
    expect(markup.match(/sniptale-content-popover-range-field/g)).toHaveLength(3);
    expect(markup).not.toContain('sniptale-glass-range-meta');
  });
});
