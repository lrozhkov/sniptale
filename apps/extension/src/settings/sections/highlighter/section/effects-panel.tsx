import { PenTool } from 'lucide-react';

import { translate } from '../../../../platform/i18n';
import { HighlighterBlurControls } from './blur-controls';
import { settingsCardClassName, SettingsSwitch } from '../../../section-surface/panel-controls';
import { SettingsRangeField, settingsToggleRowClassName } from '../../../section-surface';
import { useRangeDraftValue } from './range-draft';
import type { HighlighterSectionContentProps } from './types';

const highlighterSettingsCardClassName = [settingsCardClassName, 'p-4'].join(' ');

function BlurSettingsPanel({ settings, state }: HighlighterSectionContentProps) {
  return (
    <div className={`mb-8 ${highlighterSettingsCardClassName}`}>
      <h3 className="mb-4 flex items-center gap-2 text-sm font-medium text-[var(--sniptale-color-text-primary)]">
        <PenTool size={14} className="text-[var(--sniptale-color-success)]" />
        {translate('highlighter.section.blurTitle')}
      </h3>
      <HighlighterBlurControls settings={settings} state={state} />
    </div>
  );
}

function FocusSettingsPanel({ settings, state }: HighlighterSectionContentProps) {
  const [focusOpacityDraft, setFocusOpacityDraft] = useRangeDraftValue(
    settings.defaultFocusSettings.opacity * 100
  );

  return (
    <div className={highlighterSettingsCardClassName}>
      <h3 className="mb-4 flex items-center gap-2 text-sm font-medium text-[var(--sniptale-color-text-primary)]">
        <PenTool size={14} className="text-[var(--sniptale-color-info)]" />
        {translate('highlighter.section.focusTitle')}
      </h3>
      <div className="space-y-4">
        <SettingsRangeField
          type="range"
          min="10"
          max="100"
          value={focusOpacityDraft}
          onChange={(event) => setFocusOpacityDraft(parseInt(event.target.value))}
          onValueCommit={(value) =>
            state.handleUpdateFocusSettings({
              ...settings.defaultFocusSettings,
              opacity: value / 100,
            })
          }
          label={translate('highlighter.section.focusOpacityLabel')}
          displayValue={Math.round(focusOpacityDraft)}
          displaySuffix="%"
          hint={translate('highlighter.section.focusOpacityHint')}
        />

        <div className={settingsToggleRowClassName}>
          <span className="text-xs text-[var(--sniptale-color-text-secondary)]">
            {translate('highlighter.section.showBorderLabel')}
          </span>
          <SettingsSwitch
            checked={settings.defaultFocusSettings.showBorder ?? false}
            onClick={() =>
              state.handleUpdateFocusSettings({
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

export function HighlighterEffectsPanel(props: HighlighterSectionContentProps) {
  return (
    <>
      <BlurSettingsPanel {...props} />
      <FocusSettingsPanel {...props} />
    </>
  );
}
