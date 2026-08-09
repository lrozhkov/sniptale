import type { CalloutVisualStyle } from '@sniptale/runtime-contracts/highlighter/callout';
import { applySurfaceStyleToCallout } from '../../features/highlighter/surface-style/operations';
import { surfaceCssOverridesPaint } from '../../features/highlighter/surface-style/surface-css';
import { translate } from '../../platform/i18n';
import { SurfaceStyleSelector, type SurfaceStyleSelectorProps } from '../surface-style-selector';

export function CalloutBackgroundSettingsView(props: {
  actions: SurfaceStyleSelectorProps['actions'] & { onReset: () => Promise<boolean> };
  disabled?: boolean;
  onChange: (style: CalloutVisualStyle) => void;
  onOpenChange?: (open: boolean) => void;
  presets: SurfaceStyleSelectorProps['presets'];
  style: CalloutVisualStyle;
  unsafeForWrite: boolean;
  value: SurfaceStyleSelectorProps['value'];
}) {
  const source = props.style.colorBindings.surfaceBackground;
  const sources = ['custom', 'frame-border', 'frame-fill'] as const;
  const nextSource = sources[(sources.indexOf(source) + 1) % sources.length] ?? 'custom';
  return (
    <div className="grid gap-2" data-ui="shared.ui.callout-background-settings">
      <label className="text-xs">{translate('content.callout.surfaceStyle.title')}</label>
      <button
        type="button"
        data-color-source={source}
        onClick={() =>
          props.onChange({
            ...props.style,
            colorBindings: { ...props.style.colorBindings, surfaceBackground: nextSource },
          })
        }
      >
        {translate(`content.callout.colorSource.${source}`)}
      </button>
      <SurfaceStyleSelector
        actions={props.actions}
        disabled={props.disabled || source !== 'custom' || props.unsafeForWrite}
        presets={props.presets}
        value={props.value}
        onChange={(surface) => props.onChange(applySurfaceStyleToCallout(props.style, surface))}
        {...(props.onOpenChange ? { onOpenChange: props.onOpenChange } : {})}
      />
      {surfaceCssOverridesPaint(props.value.surfaceCss) ? (
        <div role="status">{translate('content.callout.surfaceStyle.cssOverrideWarning')}</div>
      ) : null}
      {props.unsafeForWrite ? (
        <button type="button" onClick={() => void props.actions.onReset()}>
          {translate('content.callout.surfaceStyle.reset')}
        </button>
      ) : null}
    </div>
  );
}
