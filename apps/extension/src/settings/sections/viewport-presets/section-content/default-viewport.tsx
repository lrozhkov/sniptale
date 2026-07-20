import { translate } from '../../../../platform/i18n';
import { ProductSelect } from '@sniptale/ui/product-form-controls';
import type { ViewportPreset } from '../../../../contracts/settings';
import { settingsMetaLabelClassName } from '../../../section-surface';
import { settingsCardClassName } from '../../../section-surface/panel-controls';

export function DefaultViewportField(props: {
  defaultViewportId: string;
  isLoading: boolean;
  onChange: (id: string) => Promise<void>;
  viewportPresets: ViewportPreset[];
}) {
  return (
    <div className={`${settingsCardClassName} mb-8`}>
      <label className={`mb-2 block ${settingsMetaLabelClassName}`}>
        {translate('viewportPresets.section.defaultLabel')}
      </label>
      <ProductSelect
        value={props.defaultViewportId}
        onChange={props.onChange}
        disabled={props.isLoading}
        options={[
          { value: 'native', label: translate('viewportPresets.section.nativeOption') },
          ...props.viewportPresets.map((preset) => ({
            value: preset.id,
            label: `${preset.label} (${preset.width}×${preset.height})`,
          })),
        ]}
      />
      <p className="mt-1.5 text-xs text-[var(--sniptale-color-text-dim)]">
        {translate('viewportPresets.section.defaultHint')}
      </p>
    </div>
  );
}
