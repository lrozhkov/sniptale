import type { CalloutVisualStyle } from '@sniptale/runtime-contracts/highlighter/callout';
import { applySurfaceStyleToCallout } from '../../features/highlighter/surface-style/operations';
import { surfaceCssOverridesPaint } from '../../features/highlighter/surface-style/surface-css';
import { translate } from '../../platform/i18n';
import { SurfaceStyleSelector, type SurfaceStyleSelectorProps } from '../surface-style-selector';

export function CalloutBackgroundSettingsView(props: {
  actions: SurfaceStyleSelectorProps['actions'] & { onReset: () => Promise<boolean> };
  disabled?: boolean;
  manageStyles: boolean;
  onChange: (style: CalloutVisualStyle) => void;
  onOpenChange?: (open: boolean) => void;
  presets: SurfaceStyleSelectorProps['presets'];
  style: CalloutVisualStyle;
  unsafeForWrite: boolean;
  value: SurfaceStyleSelectorProps['value'];
}) {
  return (
    <div className="grid gap-2" data-ui="shared.ui.callout-background-settings">
      <label className="text-xs">{translate('content.callout.surfaceStyle.title')}</label>
      <SurfaceStyleSelector
        actions={props.actions}
        disabled={props.disabled || props.unsafeForWrite}
        presentation={props.manageStyles ? 'management' : 'selection'}
        presets={props.presets}
        value={props.value}
        onChange={(surface) => {
          const next = applySurfaceStyleToCallout(props.style, surface);
          props.onChange({
            ...next,
            colorBindings: { ...next.colorBindings, surfaceBackground: 'custom' },
          });
        }}
        {...(props.onOpenChange ? { onOpenChange: props.onOpenChange } : {})}
      />
      {props.manageStyles && surfaceCssOverridesPaint(props.value.surfaceCss) ? (
        <div role="status">{translate('content.callout.surfaceStyle.cssOverrideWarning')}</div>
      ) : null}
      {props.manageStyles && props.unsafeForWrite ? (
        <button type="button" onClick={() => void props.actions.onReset()}>
          {translate('content.callout.surfaceStyle.reset')}
        </button>
      ) : null}
    </div>
  );
}
