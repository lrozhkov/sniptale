import { translate } from '../../../../platform/i18n';
import { ProductSelect } from '@sniptale/ui/product-form-controls';
import type { ViewportPreset } from '../../../../contracts/settings';
import { getViewportPresetDisplayName } from '../../../../features/viewport-presets/display-name';
import { formatViewportPresetDimensions } from '../../../../features/viewport-presets/format';
import { settingsMetaLabelClassName } from '../../../section-surface';

export function DefaultViewportField(props: {
  defaultViewportPresetId: string | null;
  isLoading: boolean;
  onChange: (id: string | null) => Promise<void>;
  viewportPresets: ViewportPreset[];
}) {
  return (
    <div className="mb-6 grid items-end gap-3 md:grid-cols-[minmax(0,1fr)_minmax(240px,320px)]">
      <div>
        <label className={`block ${settingsMetaLabelClassName}`}>
          {translate('viewportPresets.section.defaultLabel')}
        </label>
        <p className="mt-1 text-xs text-[var(--sniptale-color-text-dim)]">
          {translate('viewportPresets.section.defaultHint')}
        </p>
      </div>
      <ProductSelect
        value={props.defaultViewportPresetId ?? ''}
        onChange={(value) => props.onChange(value || null)}
        disabled={props.isLoading}
        options={[
          { value: '', label: translate('viewportPresets.section.nativeOption') },
          ...props.viewportPresets
            .filter((preset) => preset.enabled)
            .map((preset) => ({
              value: preset.id,
              label: `${getViewportPresetDisplayName(preset)} (${formatViewportPresetDimensions(
                preset.width,
                preset.height
              )})`,
            })),
        ]}
      />
    </div>
  );
}
