// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { FrameSettingsPopoverSurfaceShell } from './surface-shell';

describe('FrameSettingsPopoverSurfaceShell', () => {
  it('applies the shared content popover shell class and theme metadata', () => {
    const markup = renderToStaticMarkup(
      <FrameSettingsPopoverSurfaceShell
        dataFrameId="frame-1"
        effectMode="blur"
        getPopoverStyle={() => ({ top: 24, left: 16, position: 'fixed' })}
        globalSettings={{
          borderPresets: [],
          defaultBorderPresetId: 'preset-1',
          defaultEffectMode: 'border',
          defaultBlurSettings: { amount: 12, blurType: 'gaussian', showBorder: false },
          defaultFocusSettings: { opacity: 0.5, showBorder: false },
        }}
        handleBlurChange={vi.fn()}
        handleBlurShowBorderChange={vi.fn()}
        handleBlurTypeChange={vi.fn()}
        handleFocusChange={vi.fn()}
        handleFocusShowBorderChange={vi.fn()}
        handleSelectPreset={vi.fn()}
        localBlurSettings={{ amount: 12, blurType: 'gaussian', showBorder: false }}
        localFocusSettings={{ opacity: 0.5, showBorder: false }}
        popoverRef={{ current: null }}
        portalTheme="dark"
        selectedPresetId=""
      />
    );

    expect(markup).toContain(
      'sniptale-frame-settings-popover sniptale-glass-popover sniptale-content-popover'
    );
    expect(markup).toContain('data-theme="dark"');
    expect(markup).toContain('sniptale-content-popover-body');
  });
});
