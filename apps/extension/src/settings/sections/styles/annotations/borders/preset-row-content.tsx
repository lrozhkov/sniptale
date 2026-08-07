import { translate } from '../../../../../platform/i18n';
import { getHighlighterPresetPreviewStyle } from './helpers';
import type { HighlighterSectionContentProps } from './types';
import { getBorderPresetDisplayName } from '../../../../../features/highlighter/presets/display-name';
import { useAppLocale } from '../../../../../platform/i18n';

type BorderPresetItem = HighlighterSectionContentProps['settings']['borderPresets'][number];

export function HighlighterPresetRowContent({ preset }: { preset: BorderPresetItem }) {
  const locale = useAppLocale();
  const styleLabel =
    preset.style === 'solid'
      ? translate('highlighter.editor.styleSolid')
      : preset.style === 'dashed'
        ? translate('highlighter.editor.styleDashed')
        : translate('highlighter.editor.styleDotted');

  return (
    <>
      <div
        className={[
          'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[10px] border',
          'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_84%,transparent)]',
          'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_76%,transparent)]',
        ].join(' ')}
        style={getHighlighterPresetPreviewStyle(preset)}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[var(--sniptale-color-text-primary)]">
            {getBorderPresetDisplayName(preset, locale)}
          </span>
        </div>
        <div className="mt-0.5 text-xs text-[var(--sniptale-color-text-dim)]">
          {preset.width}
          {translate('highlighter.section.unitPxSuffix')}, {styleLabel}, {preset.radius}
          {translate('highlighter.section.unitPxSuffix')}{' '}
          {translate('highlighter.section.radiusSuffix')}
        </div>
      </div>
    </>
  );
}
