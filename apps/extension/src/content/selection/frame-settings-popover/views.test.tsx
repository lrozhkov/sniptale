// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { EffectMode } from '../../../features/highlighter/contracts';
import { FrameSettingsPopoverContent } from './views';

function createBorderPreset(id: string, name: string) {
  return {
    id,
    name,
    order: 0,
    color: '#ff7a1a',
    width: 2,
    style: 'solid' as const,
    radius: 6,
    opacity: 100,
    shadow: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    customCss: '',
    fillColor: '#00000000',
    fillOpacity: 0,
    inheritCustomCss: false,
    strokeOpacity: 100,
  };
}

function renderContent(effectMode: EffectMode) {
  return renderToStaticMarkup(
    <FrameSettingsPopoverContent
      effectMode={effectMode}
      globalSettings={{
        borderPresets: [createBorderPreset('preset-1', 'Default')],
        defaultBorderPresetId: 'preset-1',
        defaultEffectMode: 'border',
        defaultBlurSettings: { amount: 12, blurType: 'distortion', showBorder: true },
        defaultFocusSettings: { opacity: 0.65, showBorder: true },
      }}
      handleBlurChange={vi.fn()}
      handleBlurShowBorderChange={vi.fn()}
      handleBlurTypeChange={vi.fn()}
      handleFocusChange={vi.fn()}
      handleFocusShowBorderChange={vi.fn()}
      handleSelectPreset={vi.fn()}
      localBlurSettings={{ amount: 12, blurType: 'distortion', showBorder: true }}
      localFocusSettings={{ opacity: 0.65, showBorder: true }}
      selectedPresetId="preset-1"
    />
  );
}

describe('FrameSettingsPopoverContent', () => {
  it('uses the shared content popover section contract for border mode', () => {
    const markup = renderContent('border');

    expect(markup).toContain('shared.ui.content-popover-section');
    expect(markup).toContain('sniptale-content-popover-section');
    expect(markup).toContain('Default');
  });

  it('renders blur and focus controls inside the shared section contract', () => {
    const blurMarkup = renderContent('blur');
    const focusMarkup = renderContent('focus');

    expect(blurMarkup).toContain('shared.ui.content-popover-section');
    expect(blurMarkup).toContain('class="sniptale-glass-range"');
    expect(blurMarkup).toContain('sniptale-glass-switch');
    expect(blurMarkup).toContain('--sniptale-range-fill-ratio:45.8%');
    expect(blurMarkup).not.toContain('sniptale-glass-switch" style="--sniptale-range-fill-ratio');
    expect(focusMarkup).toContain('shared.ui.content-popover-section');
    expect(focusMarkup).toContain('class="sniptale-glass-range"');
    expect(focusMarkup).toContain('type="range"');
    expect(focusMarkup).toContain('65%');
    expect(focusMarkup).toContain('--sniptale-range-fill-ratio:61.1%');
  });
});
