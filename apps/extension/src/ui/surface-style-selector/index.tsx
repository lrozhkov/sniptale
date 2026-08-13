import { FLOATING_INTERACTION_OWNER_ID_ATTRIBUTE } from '@sniptale/ui/floating-interactions/ownership';
import { translate } from '../../platform/i18n';
import { useSurfaceStyleSelectorController } from './controller';
import { SurfaceStyleManagementPanel } from './management-panel';
import { SurfaceStyleSelectionPanel } from './selection-panel';
import type { SurfaceStyleSelectorProps } from './types';
import { SurfaceStyleTrigger } from './trigger';

export type { SurfaceStyleSelectorActions, SurfaceStyleSelectorProps } from './types';

export function SurfaceStyleSelector(props: SurfaceStyleSelectorProps) {
  const controller = useSurfaceStyleSelectorController(props);
  const management = props.presentation !== 'selection';

  return (
    <div
      ref={controller.refs.root}
      {...{ [FLOATING_INTERACTION_OWNER_ID_ATTRIBUTE]: 'surface-style-selector' }}
      className="min-w-0"
      data-ui="shared.ui.surface-style-selector"
    >
      <SurfaceStyleTrigger
        activeName={
          controller.state.active?.name ?? translate('content.callout.surfaceStyle.custom')
        }
        buttonRef={controller.refs.trigger}
        disabled={props.disabled}
        onClick={() => controller.actions.notifyOpen(!controller.state.open)}
        open={controller.state.open}
        value={props.value}
      />
      {controller.state.open ? (
        <div
          className={[
            'mt-2 grid max-w-full gap-3 rounded-[14px] border p-3',
            'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_58%,transparent)]',
            'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_98%,transparent)]',
            'shadow-[0_16px_36px_color-mix(in_srgb,var(--sniptale-color-shadow-strong)_16%,transparent)]',
          ].join(' ')}
          role="dialog"
          aria-label={translate('content.callout.surfaceStyle.title')}
        >
          {management ? (
            <SurfaceStyleManagementPanel controller={controller} selector={props} />
          ) : (
            <SurfaceStyleSelectionPanel controller={controller} selector={props} />
          )}
        </div>
      ) : null}
    </div>
  );
}
