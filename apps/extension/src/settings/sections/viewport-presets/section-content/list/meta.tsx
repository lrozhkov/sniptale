import { translate, useAppLocale } from '../../../../../platform/i18n';
import type { ViewportPreset } from '../../../../../contracts/settings';
import { getViewportPresetDisplayName } from '../../../../../features/viewport-presets/display-name';
import { formatViewportPresetDimensions } from '../../../../../features/viewport-presets/format';

export function PresetRowMeta(props: { preset: ViewportPreset }) {
  const locale = useAppLocale();
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--sniptale-color-text-primary)]">
        {getViewportPresetDisplayName(props.preset, locale)}
      </span>
      <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--sniptale-color-text-dim)]">
        {formatViewportPresetDimensions(props.preset.width, props.preset.height, locale)}
      </span>
      {!props.preset.enabled ? (
        <span className="shrink-0 text-[11px] text-[var(--sniptale-color-text-muted)]">
          {translate('viewportPresets.messages.presetDisabled')}
        </span>
      ) : null}
    </div>
  );
}
