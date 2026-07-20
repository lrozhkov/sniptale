import { translate } from '../../../../../platform/i18n';
import type { SavePreset } from '../../../../../contracts/settings';

export function PresetRowContent(props: { preset: SavePreset }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="truncate text-sm font-medium text-[var(--sniptale-color-text-primary)]">
        {props.preset.name}
      </div>
      <div className="flex items-center gap-1 truncate font-mono text-xs text-[var(--sniptale-color-text-dim)]">
        <span className="text-[var(--sniptale-color-text-dim)]">
          {translate('savePresets.editor.downloadsPrefix')}
        </span>
        <span>{props.preset.path || '…'}</span>
        <span className="text-[var(--sniptale-color-text-dim)]">
          {translate('savePresets.editor.downloadsSuffix')}
        </span>
      </div>
    </div>
  );
}
