import { PenTool } from 'lucide-react';

import { translate } from '../../../../../platform/i18n';
import { HighlighterBlurControls } from './blur-controls';
import { settingsCardClassName, SettingsSwitch } from '../../../../section-surface/panel-controls';
import { SettingsRangeField, settingsToggleRowClassName } from '../../../../section-surface';
import { useRangeDraftValue } from './range-draft';
import type { HighlighterEffectsProps } from './types';

const highlighterSettingsCardClassName = [settingsCardClassName, 'p-0'].join(' ');

function BlurSettingsPanel({ effects, settings }: HighlighterEffectsProps) {
  return (
    <div className={`mb-3 ${highlighterSettingsCardClassName}`}>
      <h3
        className={[
          'mb-2 flex items-center gap-2 text-[14px] leading-5 font-semibold',
          'text-[var(--sniptale-color-text-primary)]',
        ].join(' ')}
      >
        <PenTool size={16} aria-hidden="true" />
        {translate('highlighter.section.blurTitle')}
      </h3>
      <HighlighterBlurControls effects={effects} settings={settings} />
    </div>
  );
}

function FocusSettingsPanel({ effects, settings }: HighlighterEffectsProps) {
  const [focusOpacityDraft, setFocusOpacityDraft] = useRangeDraftValue(
    settings.defaultFocusSettings.opacity * 100
  );
  const [focusBlurDraft, setFocusBlurDraft] = useRangeDraftValue(
    settings.defaultFocusSettings.blurAmount ?? 0
  );

  return (
    <div className={highlighterSettingsCardClassName}>
      <h3
        className={[
          'mb-2 flex items-center gap-2 text-[14px] leading-5 font-semibold',
          'text-[var(--sniptale-color-text-primary)]',
        ].join(' ')}
      >
        <PenTool size={16} aria-hidden="true" />
        {translate('highlighter.section.focusTitle')}
      </h3>
      <div className="space-y-3">
        <SettingsRangeField
          type="range"
          min="0"
          max="100"
          value={focusOpacityDraft}
          onChange={(event) => setFocusOpacityDraft(parseInt(event.target.value))}
          onValueCommit={(value) =>
            effects.handleUpdateFocusSettings({
              ...settings.defaultFocusSettings,
              opacity: value / 100,
            })
          }
          label={translate('highlighter.section.focusOpacityLabel')}
          displayValue={Math.round(focusOpacityDraft)}
          displaySuffix="%"
          hint={translate('highlighter.section.focusOpacityHint')}
        />

        <SettingsRangeField
          type="range"
          min="0"
          max="25"
          value={focusBlurDraft}
          onChange={(event) => setFocusBlurDraft(parseInt(event.target.value))}
          onValueCommit={(value) =>
            effects.handleUpdateFocusSettings({
              ...settings.defaultFocusSettings,
              blurAmount: value,
            })
          }
          label={translate('highlighter.section.focusBlurLabel')}
          displayValue={Math.round(focusBlurDraft)}
          displaySuffix="px"
          hint={translate('highlighter.section.focusBlurHint')}
        />

        <div className={settingsToggleRowClassName}>
          <span className="text-[13px] leading-[18px] font-medium text-[var(--sniptale-color-text-secondary)]">
            {translate('highlighter.section.showBorderLabel')}
          </span>
          <SettingsSwitch
            checked={settings.defaultFocusSettings.showBorder ?? false}
            onClick={() =>
              effects.handleUpdateFocusSettings({
                ...settings.defaultFocusSettings,
                showBorder: !(settings.defaultFocusSettings.showBorder ?? false),
              })
            }
          />
        </div>
      </div>
    </div>
  );
}

export function HighlighterEffectsPanel(props: HighlighterEffectsProps) {
  return (
    <>
      <BlurSettingsPanel {...props} />
      <FocusSettingsPanel {...props} />
    </>
  );
}
