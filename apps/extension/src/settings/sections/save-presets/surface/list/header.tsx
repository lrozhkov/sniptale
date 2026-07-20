import { translate } from '../../../../../platform/i18n';
import type { SavePreset } from '../../../../../contracts/settings';

export function PresetsListHeader(props: { presetCountLabel: string; presets: SavePreset[] }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <span className="text-xs font-bold uppercase tracking-wider text-[var(--sniptale-color-text-dim)]">
        {translate('savePresets.section.folderPresetsLabel')}
      </span>
      <span className="text-xs text-[var(--sniptale-color-text-dim)]">
        {props.presets.length} {props.presetCountLabel}
      </span>
    </div>
  );
}
