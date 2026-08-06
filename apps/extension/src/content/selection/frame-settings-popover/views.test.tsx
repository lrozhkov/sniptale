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

function renderContent(
  effectMode: EffectMode,
  decorationVisible = true,
  compact = false,
  customized = false
) {
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
      handleManualBorderChange={vi.fn()}
      handleEditPreset={vi.fn()}
      handleSelectPreset={vi.fn()}
      handleTogglePresetEnabled={vi.fn()}
      headerContext="element"
      localBlurSettings={{ amount: 12, blurType: 'distortion', showBorder: decorationVisible }}
      localBorderSettings={{
        ...createBorderPreset('preset-1', 'Default'),
        ...(customized ? {} : { sourcePresetId: 'preset-1', sourcePresetName: 'Default' }),
      }}
      localFocusSettings={{ opacity: 0.65, showBorder: decorationVisible }}
      onClose={vi.fn()}
      onShowPresets={vi.fn()}
      pendingPresetIds={new Set()}
      {...(customized ? {} : { selectedPresetId: 'preset-1' })}
      manual={{
        cssDraft: '',
        cssError: null,
        isSaving: false,
        onCssDraftChange: vi.fn(),
        save: vi.fn().mockResolvedValue(true),
      }}
    />
  );
}

function expectNoFrameStyleSectionHeading(markup: string) {
  expect(markup).not.toContain(
    `sniptale-content-popover-section-label">${translate(
      'content.overlayControls.frameStyleLabel'
    )}</label>`
  );
}

describe('FrameSettingsPopoverContent', () => {
  it('keeps one short canonical menu heading without duplicate section headings', () => {
    const markup = renderContent('border');

    expect(markup.match(/sniptale-toolbar-menu-title/g)).toHaveLength(1);
    expect(markup).toContain(translate('content.interactiveFrame.effectBorder'));
    expect(markup).toContain(translate('content.overlayControls.frameStyleSwitchToManual'));
    expect(markup).toContain('sniptale-settings-popover-close');
    expectNoFrameStyleSectionHeading(markup);
    expect(markup).toContain('shared.ui.content-popover-section');
    expect(markup).toContain('sniptale-content-popover-section');
    expect(markup).toContain('Default');
  });

  it('exposes quiet edit and visibility actions without a duplicate add action', () => {
    const markup = renderContent('border');

    expect(markup).toContain('sniptale-frame-style-section');
    expect(markup).toContain('sniptale-glass-preset-list--scroll');
    expect(markup).toContain('sniptale-frame-style-preset-actions');
    expect(markup).toContain(translate('content.overlayControls.configureFrameStyle'));
    expect(markup).toContain(translate('content.overlayControls.hideFrameStyle'));
    expect(markup).not.toContain(translate('content.overlayControls.addFrameStyle'));
    expect(markup).not.toContain('sniptale-frame-style-add');
  });

  it('opens directly in manual mode for customized frame styling', () => {
    const markup = renderContent('border', true, false, true);

    expect(markup).toContain('data-ui="shared.border-style-inspector"');
    expect(markup).toContain('data-ui="shared.highlighter-manual-inspector-surface"');
    expect(markup).not.toContain('sniptale-glass-preset-list--scroll');
  });

  it.each(['blur', 'focus'] as const)(
    'shares the always-visible frame template section with %s',
    (effectMode) => {
      const markup = renderContent(effectMode, true);

      expect(markup.match(/sniptale-toolbar-menu-title/g)).toHaveLength(1);
      expect(markup).toContain(
        translate(
          effectMode === 'blur'
            ? 'content.interactiveFrame.effectBlur'
            : 'content.interactiveFrame.effectFocus'
        )
      );
      expectNoFrameStyleSectionHeading(markup);
      expect(markup).toContain('sniptale-frame-style-section');
      expect(markup).toContain('Default');
      expect(markup).toContain('Secondary');
      expect(markup).not.toContain('sniptale-frame-style-add');
    }
  );

  it('keeps the mode selector and templates available in compact toolbar menus', () => {
    const expandedMarkup = renderContent('blur', true, false);
    const compactMarkup = renderContent('blur', true, true);

    for (const markup of [expandedMarkup, compactMarkup]) {
      expect(markup).toContain(translate('content.interactiveFrame.effectBorder'));
      expect(markup).toContain(translate('content.interactiveFrame.effectBlur'));
      expect(markup).toContain(translate('content.interactiveFrame.effectFocus'));
      expect(markup).toContain('Default');
    }
  });

  it.each(['blur', 'focus'] as const)(
    'keeps the %s effect controls and templates visible regardless of legacy decoration state',
    (effectMode) => {
      const markup = renderContent(effectMode, false);

      expect(markup).not.toContain(translate('content.overlayControls.frameStyleLabel'));
      expect(markup).toContain(translate('content.overlayControls.showBorderTitle'));
      expect(markup).toContain('sniptale-glass-switch');
      expect(markup).not.toContain('sniptale-glass-switch--on');
      expect(markup).toContain('Default');
      expect(markup).toContain('Secondary');
      expect(markup).not.toContain('sniptale-frame-style-add');
      expect(markup).toContain('shared.ui.compact-inspector.numeric-row');
    }
  );

  it('renders blur and focus controls inside the shared section contract', () => {
    const blurMarkup = renderContent('blur');
    const focusMarkup = renderContent('focus');

    expect(blurMarkup).toContain('shared.ui.content-popover-section');
    expect(blurMarkup).toContain('shared.ui.compact-inspector.numeric-row');
    expect(blurMarkup).toContain(translate('content.overlayControls.blurTypeLabel'));
    expect(blurMarkup).toContain(translate('content.overlayControls.blurTypeDistortion'));
    expect(blurMarkup).toContain(translate('content.overlayControls.showBorderTitle'));
    expect(blurMarkup).toContain('sniptale-glass-switch--on');
    expect(blurMarkup).toContain('select');
    expect(blurMarkup).toContain('--sniptale-range-fill-ratio:45.83333333333333%');
    expect(focusMarkup).toContain('shared.ui.content-popover-section');
    expect(focusMarkup).toContain('shared.ui.compact-inspector.numeric-row');
    expect(focusMarkup).toContain('type="range"');
    expect(focusMarkup).toContain('value="65"');
    expect(focusMarkup).toContain(translate('content.overlayControls.showBorderTitle'));
    expect(focusMarkup).toContain('sniptale-glass-switch--on');
    expect(focusMarkup).toContain('--sniptale-range-fill-ratio:61.111111111111114%');
    expect(blurMarkup.match(/sniptale-toolbar-menu-title/g)).toHaveLength(1);
    expect(focusMarkup.match(/sniptale-toolbar-menu-title/g)).toHaveLength(1);
    expect(blurMarkup).not.toContain('sniptale-glass-range-meta');
    expect(focusMarkup).not.toContain('sniptale-glass-range-meta');
  });

  it('places mode-specific controls before the template list', () => {
    const blurMarkup = renderContent('blur');
    const focusMarkup = renderContent('focus');

    expect(
      blurMarkup.indexOf(translate('content.overlayControls.blurStrengthLabelPrefix'))
    ).toBeLessThan(blurMarkup.indexOf(translate('content.overlayControls.blurTypeLabel')));
    expect(blurMarkup.indexOf(translate('content.overlayControls.blurTypeLabel'))).toBeLessThan(
      blurMarkup.indexOf('Default')
    );
    expect(
      focusMarkup.indexOf(translate('content.overlayControls.focusDimmingLabelPrefix'))
    ).toBeLessThan(focusMarkup.indexOf('Default'));
  });
});
