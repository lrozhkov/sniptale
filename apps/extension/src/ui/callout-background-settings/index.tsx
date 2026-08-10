import type { CalloutVisualStyle } from '@sniptale/runtime-contracts/highlighter/callout';
import { useSurfaceStylePresetCatalog } from '../../composition/surface-style-preset-resources/use-surface-style-preset-catalog';
import { getCalloutSurfaceStyle } from '../../features/highlighter/surface-style/operations';
import { translate } from '../../platform/i18n';
import { CalloutBackgroundSettingsView } from './view';

export function CalloutBackgroundSettings(props: {
  disabled?: boolean;
  onChange: (style: CalloutVisualStyle) => void;
  onOpenChange?: (open: boolean) => void;
  style: CalloutVisualStyle;
}) {
  const resources = useSurfaceStylePresetCatalog();
  const value = getCalloutSurfaceStyle(props.style);
  if (!value) return <div role="alert">{translate('content.callout.surfaceStyle.cssInvalid')}</div>;
  return (
    <CalloutBackgroundSettingsView
      actions={resources.actions}
      {...(props.disabled === undefined ? {} : { disabled: props.disabled })}
      onChange={props.onChange}
      {...(props.onOpenChange ? { onOpenChange: props.onOpenChange } : {})}
      presets={resources.presets}
      style={props.style}
      unsafeForWrite={resources.catalog === null || resources.catalog.unsafeForWrite}
      value={value}
    />
  );
}
