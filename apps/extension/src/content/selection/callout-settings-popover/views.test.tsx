// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CalloutAppearanceSection, CalloutDeleteButton } from './views';

describe('CalloutAppearanceSection', () => {
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
});
