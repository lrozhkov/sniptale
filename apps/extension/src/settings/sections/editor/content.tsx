import { translate } from '../../../platform/i18n';
import {
  settingsPanelClassName,
  settingsSectionClassName,
  SettingsSectionHeader,
} from '../../section-surface';
import { getEditorColorCountLabel, getEditorPresetCountLabel } from './families';
import { PaletteRow, PaletteScopeSwitch, PresetRow, PresetScopeSwitch } from './rows';
import type { EditorSectionState } from './types';

function PresetsPanel(props: { state: EditorSectionState }) {
  return (
    <section className={`${settingsPanelClassName} space-y-4`}>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
            {translate('settings.editor.toolPresetsTitle')}
          </h2>
          <span className="text-xs text-[var(--sniptale-color-text-dim)]">
            {props.state.currentPresets.length}{' '}
            {getEditorPresetCountLabel(props.state.currentPresets.length)}
          </span>
        </div>
        <p className="text-xs leading-5 text-[var(--sniptale-color-text-dim)]">
          {translate('settings.editor.toolPresetsDescription')}
        </p>
      </div>
      <PresetScopeSwitch state={props.state} />
      <div className="space-y-2">
        {props.state.currentPresets.map((preset) => (
          <PresetRow key={preset.id} preset={preset} state={props.state} />
        ))}
      </div>
      <p className="text-xs leading-5 text-[var(--sniptale-color-text-dim)]">
        {translate('settings.editor.createInEditorHint')}
      </p>
    </section>
  );
}

function PalettePanel(props: { state: EditorSectionState }) {
  return (
    <section className={`${settingsPanelClassName} space-y-4`}>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
            {translate('settings.editor.paletteTitle')}
          </h2>
          <span className="text-xs text-[var(--sniptale-color-text-dim)]">
            {props.state.paletteColors.length}{' '}
            {getEditorColorCountLabel(props.state.paletteColors.length)}
          </span>
        </div>
        <p className="text-xs leading-5 text-[var(--sniptale-color-text-dim)]">
          {translate('settings.editor.paletteDescription')}
        </p>
      </div>
      <PaletteScopeSwitch state={props.state} />
      <div className="space-y-2">
        {props.state.paletteColors.map((color, index) => (
          <PaletteRow
            key={`${props.state.paletteKey}-${index}-${color}`}
            color={color}
            index={index}
            state={props.state}
          />
        ))}
      </div>
    </section>
  );
}

export function EditorSectionContent({ state }: { state: EditorSectionState }) {
  return (
    <div className={settingsSectionClassName}>
      <SettingsSectionHeader
        kicker={translate('settings.navigation.editor')}
        description={translate('settings.editor.subtitle')}
      />
      <PresetsPanel state={state} />
      <PalettePanel state={state} />
    </div>
  );
}
