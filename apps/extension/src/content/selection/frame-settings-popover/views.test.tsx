// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { EffectMode } from '../../../features/highlighter/contracts';
import { translate } from '../../../platform/i18n';
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

function renderContent(effectMode: EffectMode, decorationVisible = true, compact = false) {
  return renderToStaticMarkup(
    <FrameSettingsPopoverContent
      compact={compact}
      effectMode={effectMode}
      globalSettings={{
        borderPresets: [
          createBorderPreset('preset-1', 'Default'),
          createBorderPreset('preset-2', 'Secondary'),
        ],
        defaultBorderPresetId: 'preset-1',
        defaultEffectMode: 'border',
        systemPresetCatalogRevision: 1,
        defaultBlurSettings: {
          amount: 12,
          blurType: 'distortion',
          showBorder: decorationVisible,
        },
        defaultFocusSettings: { opacity: 0.65, showBorder: decorationVisible },
      }}
      handleBlurChange={vi.fn()}
      handleBlurShowBorderChange={vi.fn()}
      handleBlurTypeChange={vi.fn()}
      handleFocusChange={vi.fn()}
      handleFocusShowBorderChange={vi.fn()}
      handleAddPreset={vi.fn()}
      handleEditPreset={vi.fn()}
      handleSelectPreset={vi.fn()}
      handleTogglePresetEnabled={vi.fn()}
      localBlurSettings={{ amount: 12, blurType: 'distortion', showBorder: decorationVisible }}
      localFocusSettings={{ opacity: 0.65, showBorder: decorationVisible }}
      pendingPresetIds={new Set()}
      selectedPresetId="preset-1"
    />
  );
}

describe('FrameSettingsPopoverContent', () => {
  it('uses the shared content popover section contract for border mode', () => {
    const markup = renderContent('border');

    expect(markup).toContain('sniptale-toolbar-menu-title');
    expect(markup).toContain(translate('content.interactiveFrame.effectBorder'));
    expect(markup).toContain('shared.ui.content-popover-section');
    expect(markup).toContain('sniptale-content-popover-section');
    expect(markup).toContain('Default');
  });

  it('exposes quiet edit and visibility actions plus a trailing add action', () => {
    const markup = renderContent('border');

    expect(markup).toContain('sniptale-frame-style-section');
    expect(markup).toContain('sniptale-glass-preset-list--scroll');
    expect(markup).toContain('sniptale-frame-style-preset-actions');
    expect(markup).toContain(translate('content.overlayControls.configureFrameStyle'));
    expect(markup).toContain(translate('content.overlayControls.hideFrameStyle'));
    expect(markup).toContain(translate('content.overlayControls.addFrameStyle'));
    expect(markup).toContain('sniptale-frame-style-add');
  });

  it.each(['blur', 'focus'] as const)(
    'shares the frame-and-fill preset section with %s when decoration is enabled',
    (effectMode) => {
      const markup = renderContent(effectMode, true);

      expect(markup).toContain(translate('content.overlayControls.frameStyleLabel'));
      expect(markup).toContain(translate('content.overlayControls.showBorderTitle'));
      expect(markup).toContain('sniptale-frame-style-section');
      expect(markup).toContain('sniptale-glass-switch--on');
      expect(markup).toContain('Default');
      expect(markup).toContain('Secondary');
      expect(markup).toContain('sniptale-frame-style-add');
    }
  );

  it('hides the frame-and-fill hint only for compact toolbar menus', () => {
    const expandedMarkup = renderContent('blur', true, false);
    const compactMarkup = renderContent('blur', true, true);

    expect(expandedMarkup).toContain(translate('content.overlayControls.showBorderHint'));
    expect(compactMarkup).not.toContain(translate('content.overlayControls.showBorderHint'));
    expect(compactMarkup).toContain(translate('content.overlayControls.showBorderTitle'));
    expect(compactMarkup).toContain('sniptale-glass-switch');
  });

  it.each(['blur', 'focus'] as const)(
    'keeps the %s effect controls visible while hidden decoration collapses its presets',
    (effectMode) => {
      const markup = renderContent(effectMode, false);

      expect(markup).toContain(translate('content.overlayControls.frameStyleLabel'));
      expect(markup).toContain(translate('content.overlayControls.showBorderTitle'));
      expect(markup).toContain('sniptale-glass-switch');
      expect(markup).not.toContain('sniptale-glass-switch--on');
      expect(markup).not.toContain('Default');
      expect(markup).not.toContain('Secondary');
      expect(markup).not.toContain('sniptale-frame-style-add');
      expect(markup).toContain('class="sniptale-glass-range"');
    }
  );

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
    expect(blurMarkup).toContain(translate('content.interactiveFrame.effectBlur'));
    expect(focusMarkup).toContain(translate('content.interactiveFrame.effectFocus'));
    expect(blurMarkup).not.toContain('sniptale-glass-range-meta');
    expect(focusMarkup).not.toContain('sniptale-glass-range-meta');
  });
});
